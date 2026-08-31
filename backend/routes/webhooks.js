const express = require('express');
const AbandonedCustomer = require('../models/AbandonedCustomer');
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
    productId: item.product_id || null,
    variantId: item.variant_id || null,
  }));

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
    cartValue,
    sessionId: (payload.token || payload.cart_token || payload.id || '').toString(),
    status: 'abandoned',
  };
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

    if (!shopDomain) {
      // Still acknowledge so Shopify doesn't retry forever.
      return res.status(200).json({ received: true, warning: 'no shop domain' });
    }

    const doc = mapPayloadToCustomer(shopDomain, req.body);

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

    // Push-notify the store owner about the abandoned cart.
    sendPushToStore(
      shopDomain,
      '🛒 New Abandoned Cart',
      `A customer left items worth ₹${doc.cartValue} in their cart`
    );

    // Push-notify storefront customers (theme-script subscribers) for this shop.
    sendPushToCustomers(
      shopDomain,
      'You left items in your cart! 🛒',
      `Complete your order - items worth ₹${doc.cartValue} are waiting`,
      `https://${shopDomain}`
    );

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

module.exports = router;
