const express = require('express');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const Store = require('../models/Store');
const { verifyWebhookHmac } = require('../utils/shopify');
const { sendAbandonedCartEmail } = require('../utils/email');
const { sendPushToStore, sendPushToCustomers } = require('../utils/pushNotification');

const router = express.Router();

/**
 * Normalise a Shopify cart / checkout payload into an AbandonedCustomer document.
 */
function mapPayloadToCustomer(shopDomain, payload) {
  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];

  const cartItems = lineItems.map((item) => ({
    title: item.title || item.name || 'Unknown item',
    quantity: item.quantity || 1,
    price: Number(item.price) || 0,
    imageUrl:
      (item.image && item.image.src) ||
      (Array.isArray(item.images) && item.images[0] && item.images[0].src) ||
      (item.featured_image && item.featured_image.url) ||
      null,
    productId: item.product_id || (item.variant && item.variant.product_id) || null,
    variantId: item.variant_id || null,
  }));

  // First cart item that has an image — used as the notification image.
  const firstImageUrl = (cartItems.find((i) => i.imageUrl) || {}).imageUrl || null;

  const cartValue =
    Number(payload.total_price) ||
    cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const customer = payload.customer || {};
  const email = payload.email || customer.email || null;
  const phone = payload.phone || customer.phone || (payload.billing_address || {}).phone || null;

  return {
    shopDomain,
    email: email || undefined,
    phone: phone || undefined,
    cartItems,
    productImageUrl: firstImageUrl || undefined,
    cartValue,
    sessionId: (payload.token || payload.cart_token || payload.id || '').toString(),
    customerId: payload.customer?.id ? String(payload.customer.id) : null,
    status: 'abandoned',
  };
}

/**
 * carts/* webhooks don't include product images in line_items. Fall back to the
 * Shopify Admin API to fetch the product's primary image.
 */
async function fetchProductImage(shop, accessToken, productId) {
  try {
    console.log('[webhook] Fetching image for productId:', productId,
      'shop:', shop,
      'hasToken:', !!accessToken);
    if (!productId || !accessToken) return null;
    const res = await fetch(
      `https://${shop}/admin/api/2025-01/products/${productId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    const data = await res.json();
    const imageUrl = data.product?.image?.src ||
                     data.product?.images?.[0]?.src ||
                     null;
    console.log(`[webhook] Product image for ${productId}:`, imageUrl ? 'found' : 'not found');
    return imageUrl;
  } catch(err) {
    console.log('[webhook] Image fetch error:', err.message);
    return null;
  }
}

/**
 * Shared handler for cart + checkout webhooks. Upserts on sessionId so repeated
 * carts/update events for the same cart don't create duplicates.
 */
async function handleWebhook(source, req, res) {
  // --- Enforce Shopify webhook HMAC verification before anything else ---
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  if (!verifyWebhookHmac(req.rawBody || '', hmacHeader)) {
    console.warn(
      `[webhook:${source}] Rejected — invalid or missing X-Shopify-Hmac-Sha256 header`
    );
    return res.status(401).json({ error: 'Unauthorized: webhook HMAC verification failed' });
  }

  try {
    const shopDomain = (req.get('X-Shopify-Shop-Domain') || req.body.shopDomain || '')
      .toString()
      .trim()
      .toLowerCase();
    const topic = req.get('X-Shopify-Topic') || source;

    console.log(`\n[webhook:${source}] Received "${topic}" from ${shopDomain || 'unknown shop'}`);
    console.log(JSON.stringify(req.body, null, 2));

    const payload = req.body;
    console.log('[webhook] Payload line_items sample:',
      JSON.stringify(payload.line_items?.[0] || payload.line_items, null, 2)
    );

    if (!shopDomain) {
      // Still acknowledge so Shopify doesn't retry forever.
      return res.status(200).json({ received: true, warning: 'no shop domain' });
    }

    const doc = mapPayloadToCustomer(shopDomain, req.body);

    console.log('[webhook] Mapped customer productImageUrl:', doc.productImageUrl);
    console.log('[webhook] Mapped customer cartItems[0]:',
      JSON.stringify(doc.cartItems?.[0], null, 2)
    );

    let savedCustomer;
    if (doc.sessionId) {
      savedCustomer = await AbandonedCustomer.findOneAndUpdate(
        { shopDomain, sessionId: doc.sessionId },
        doc,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else {
      savedCustomer = await AbandonedCustomer.create(doc);
    }

    // Fire the abandoned-cart reminder email if we have an address to send to.
    if (savedCustomer && savedCustomer.email) {
      sendAbandonedCartEmail(savedCustomer);
      console.log(`Abandoned cart email triggered for: ${savedCustomer.email}`);
    }

    // Push-notify the store owner only on new carts (not updates).
    const isNewCart = !savedCustomer.createdAt ||
      (new Date() - new Date(savedCustomer.createdAt)) < 10000;
    if (isNewCart) {
      sendPushToStore(
        shopDomain,
        '🛒 New Abandoned Cart',
        `A customer left items worth ₹${doc.cartValue} in their cart`
      );
    }

    // Resolve a product image for the customer notification. carts/* line_items
    // have no image, so fall back to the Admin API using the first productId.
    const store = await Store.findOne({ shopDomain });
    const firstItem = savedCustomer.cartItems && savedCustomer.cartItems[0];
    const productId = (firstItem && firstItem.productId)
      ? String(firstItem.productId)
      : null;

    // Always resolve the image for the CURRENT first cart item.
    // The cached productImageUrl may belong to a different product if the
    // customer updated their cart, so we re-fetch whenever the productId
    // is available. fetchProductImage returns null on error (safe).
    let productImageUrl = null;

    if (store && productId) {
      productImageUrl = await fetchProductImage(
        shopDomain,
        store.accessToken,
        productId
      );
      if (productImageUrl) {
        await AbandonedCustomer.findByIdAndUpdate(
          savedCustomer._id,
          { productImageUrl }
        );
      }
    }

    // Fallback: use whatever image is already stored if Admin API returned nothing
    if (!productImageUrl) {
      productImageUrl = savedCustomer.productImageUrl || null;
    }

    console.log('[webhook] Final productImageUrl before push:', productImageUrl);

    // Manual push only — no automatic timer.
    // Owner uses the dashboard "🔔 Push" button to send notifications.

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[webhook:${source}] error:`, err.message);
    // Acknowledge to avoid aggressive Shopify retries; error is logged for debugging.
    return res.status(200).json({ received: true, error: err.message });
  }
}

/**
 * POST /api/webhooks/cart
 * Handles carts/create and carts/update.
 */
router.post('/cart', (req, res) => handleWebhook('cart', req, res));

/**
 * POST /api/webhooks/checkout
 * Handles checkouts/create and checkouts/update.
 */
router.post('/checkout', (req, res) => handleWebhook('checkout', req, res));

// fetchProductImage stays exported — the dashboard "🔔 Push" route
// (backend/routes/push.js) still uses it to resolve per-product images.
// Attached to `router` so it survives the `module.exports = router` assignment.
router.fetchProductImage = fetchProductImage;

module.exports = router;
