const express = require('express');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const Store = require('../models/Store');
const { verifyWebhookHmac } = require('../utils/shopify');
const { sendAbandonedCartEmail } = require('../utils/email');
const { sendPushToStore, sendPushToCustomers } = require('../utils/pushNotification');
const { scheduleCartAbandonJobs, cancelJobsForOrder } = require('../utils/automationEngine');
const PushClick = require('../models/PushClick');
const StorefrontEvent = require('../models/StorefrontEvent');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');

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

    // Schedule automation jobs for cart_abandon rules, if this is a
    // cart webhook (not checkout) and we have a normalized cart token.
    if (source === 'cart' && doc.sessionId) {
      const normalizedToken = doc.sessionId.split('?')[0].trim();
      const firstItem = savedCustomer.cartItems && savedCustomer.cartItems[0];

      // Build a product URL from the first cart item, if we have a
      // resolvable handle. Shopify doesn't give us the handle directly
      // from cart webhooks, but we can link to /cart as a safe fallback
      // that at least shows the actual cart contents.
      const productUrl = `https://${shopDomain}/cart`;

      scheduleCartAbandonJobs(shopDomain, normalizedToken, savedCustomer.customerId || null, {
        cartValue: doc.cartValue,
        productImageUrl: productImageUrl,
        firstItemTitle: firstItem ? firstItem.title : null,
        productUrl: productUrl,
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[webhook:${source}] error:`, err.message);
    // Acknowledge to avoid aggressive Shopify retries; error is logged for debugging.
    return res.status(200).json({ received: true, error: err.message });
  }
}

/**
 * Handles orders/create. For v1: just logs receipt and acknowledges.
 * Cancellation of pending ScheduledJobs will be wired in a later stage
 * once ScheduledJob sender logic exists.
 */
async function handleOrderWebhook(req, res) {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  if (!verifyWebhookHmac(req.rawBody || '', hmacHeader)) {
    console.warn('[webhook:order] Rejected — invalid or missing HMAC header');
    return res.status(401).json({ error: 'Unauthorized: webhook HMAC verification failed' });
  }

  try {
    const shopDomain = (req.get('X-Shopify-Shop-Domain') || req.body.shopDomain || '')
      .toString().trim().toLowerCase();
    const order = req.body;
    const cartToken = order.cart_token || order.checkout_token || null;

    console.log(`[webhook:order] Received orders/create from ${shopDomain}, cart_token: ${cartToken || 'none'}`);

    const customerId = order.customer?.id ? String(order.customer.id) : null;
    await cancelJobsForOrder(shopDomain, cartToken, customerId);

    const isTestOrder = order.test === true;

    // Preferred: current_total_price_set.shop_money (present money set);
    // fall back to the legacy flat total_price / currency strings.
    const revenueAmount =
      order.current_total_price_set?.shop_money?.amount ||
      order.total_price ||
      null;
    const revenueCurrency =
      order.current_total_price_set?.shop_money?.currency_code ||
      order.currency ||
      null;

    // Mark the matching AbandonedCustomer as recovered + join attribution.
    if (cartToken) {
      const normalizedToken = cartToken.split('?')[0].trim();

      // 1. Clean signal — cart attribute _ccf_job re-emerges in
      //    orders/create as a note_attributes entry.
      let attributedJobId = null;
      const noteAttrs = Array.isArray(order.note_attributes) ? order.note_attributes : [];
      const jobAttr = noteAttrs.find((a) => a && a.name === '_ccf_job' && a.value);
      if (jobAttr) {
        attributedJobId = jobAttr.value;
      } else if (!isTestOrder) {
        // 2. Fallback — most recent PushClick for this cart/customer.
        const orClauses = [{ cartToken: normalizedToken }];
        if (customerId) orClauses.push({ customerId });
        const click = await PushClick.findOne({ shopDomain, $or: orClauses }).sort({ clickedAt: -1 });
        if (click) attributedJobId = click.jobId;
      }

      const updateFields = { status: 'recovered' };
      if (!isTestOrder) {
        updateFields.recoveredAt = new Date();
        updateFields.recoveredOrderId = order.id ? String(order.id) : null;
        updateFields.recoveredOrderName = order.name || null;
        updateFields.recoveredRevenue = revenueAmount != null ? Number(revenueAmount) : null;
        updateFields.recoveredCurrency = revenueCurrency;
        updateFields.attributionSource = attributedJobId ? 'push' : 'organic';
        updateFields.attributedJobId = attributedJobId;
      }

      await AbandonedCustomer.updateMany(
        { shopDomain, sessionId: normalizedToken, status: 'abandoned' },
        updateFields
      );

      console.log(
        `[webhook:order] Recovery recorded — revenue: ${revenueAmount || 'n/a'} ${revenueCurrency || ''} ` +
          `source: ${isTestOrder ? 'skipped(test)' : updateFields.attributionSource} test: ${isTestOrder}`
      );
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook:order] error:', err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
}

/**
 * GDPR: customers/data_request
 * A customer has requested their data. Shopify sends this when a
 * merchant uses the "Request customer data" feature. We must respond
 * 200 and (per Shopify docs) the merchant is expected to independently
 * fulfill the data request to the customer — but we log what we have
 * so it can be manually retrieved if needed.
 */
async function handleCustomersDataRequest(req, res) {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  if (!verifyWebhookHmac(req.rawBody || '', hmacHeader)) {
    console.warn('[gdpr] customers/data_request — invalid HMAC');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const shopDomain = (req.get('X-Shopify-Shop-Domain') || req.body.shop_domain || '')
      .toString().trim().toLowerCase();
    const customerId = req.body.customer?.id ? String(req.body.customer.id) : null;
    const customerEmail = req.body.customer?.email || null;

    console.log(`[gdpr] customers/data_request for shop ${shopDomain}, customer ${customerId || customerEmail || 'unknown'}`);

    // Log what data we hold for this customer, for manual fulfillment
    // if the merchant needs it. We do not have a customer support
    // channel to auto-deliver this, so we surface it in logs.
    if (customerId || customerEmail) {
      const query = { shopDomain };
      if (customerId) query.customerId = customerId;
      else if (customerEmail) query.email = customerEmail.toLowerCase();

      const carts = await AbandonedCustomer.find(query).lean();
      const events = await StorefrontEvent.find(
        customerId ? { shopDomain, customerId } : {}
      ).limit(100).lean();

      console.log(`[gdpr] Data on file — AbandonedCustomer rows: ${carts.length}, StorefrontEvent rows: ${events.length}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[gdpr] customers/data_request error:', err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
}

/**
 * GDPR: customers/redact
 * A customer has requested deletion (or 6 months passed with no
 * activity). Delete all data we hold that identifies this customer.
 */
async function handleCustomersRedact(req, res) {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  if (!verifyWebhookHmac(req.rawBody || '', hmacHeader)) {
    console.warn('[gdpr] customers/redact — invalid HMAC');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const shopDomain = (req.get('X-Shopify-Shop-Domain') || req.body.shop_domain || '')
      .toString().trim().toLowerCase();
    const customerId = req.body.customer?.id ? String(req.body.customer.id) : null;
    const customerEmail = req.body.customer?.email || null;

    console.log(`[gdpr] customers/redact for shop ${shopDomain}, customer ${customerId || customerEmail || 'unknown'}`);

    if (!customerId && !customerEmail) {
      console.warn('[gdpr] customers/redact — no customer identifier in payload, nothing to delete');
      return res.status(200).json({ received: true });
    }

    const orClauses = [];
    if (customerId) orClauses.push({ customerId });
    if (customerEmail) orClauses.push({ email: customerEmail.toLowerCase() });

    const cartResult = await AbandonedCustomer.deleteMany({ shopDomain, $or: orClauses });
    const eventResult = customerId
      ? await StorefrontEvent.deleteMany({ shopDomain, customerId })
      : { deletedCount: 0 };
    const subResult = customerId
      ? await CustomerPushSubscription.deleteMany({ shopDomain, customerId })
      : { deletedCount: 0 };

    console.log(`[gdpr] Redacted — carts: ${cartResult.deletedCount}, events: ${eventResult.deletedCount}, subscriptions: ${subResult.deletedCount}`);

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[gdpr] customers/redact error:', err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
}

/**
 * GDPR: shop/redact
 * Fired 48h after a shop uninstalls the app. Delete ALL data for
 * that shop across every collection.
 */
async function handleShopRedact(req, res) {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  if (!verifyWebhookHmac(req.rawBody || '', hmacHeader)) {
    console.warn('[gdpr] shop/redact — invalid HMAC');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const shopDomain = (req.get('X-Shopify-Shop-Domain') || req.body.shop_domain || '')
      .toString().trim().toLowerCase();

    if (!shopDomain) {
      console.warn('[gdpr] shop/redact — no shop domain in payload');
      return res.status(200).json({ received: true });
    }

    console.log(`[gdpr] shop/redact for ${shopDomain} — deleting all data`);

    const AutomationRule = require('../models/AutomationRule');
    const ScheduledJob = require('../models/ScheduledJob');
    const PushClick = require('../models/PushClick');
    const CodOrder = require('../models/CodOrder');
    const PushSubscription = require('../models/PushSubscription');

    const results = await Promise.all([
      AbandonedCustomer.deleteMany({ shopDomain }),
      StorefrontEvent.deleteMany({ shopDomain }),
      CustomerPushSubscription.deleteMany({ shopDomain }),
      PushSubscription.deleteMany({ shopDomain }),
      AutomationRule.deleteMany({ shopDomain }),
      ScheduledJob.deleteMany({ shopDomain }),
      PushClick.deleteMany({ shopDomain }),
      CodOrder.deleteMany({ shopDomain }),
      Store.deleteOne({ shopDomain }),
    ]);

    console.log(`[gdpr] shop/redact complete for ${shopDomain} — collections cleared: ${results.map(r => r.deletedCount ?? (r.acknowledged ? 1 : 0)).join(', ')}`);

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[gdpr] shop/redact error:', err.message);
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

/**
 * POST /api/webhooks/order
 * Handles orders/create.
 */
router.post('/order', (req, res) => handleOrderWebhook(req, res));

/**
 * GDPR mandatory compliance webhooks.
 */
router.post('/customers/data_request', (req, res) => handleCustomersDataRequest(req, res));
router.post('/customers/redact', (req, res) => handleCustomersRedact(req, res));
router.post('/shop/redact', (req, res) => handleShopRedact(req, res));

// fetchProductImage stays exported — the dashboard "🔔 Push" route
// (backend/routes/push.js) still uses it to resolve per-product images.
// Attached to `router` so it survives the `module.exports = router` assignment.
router.fetchProductImage = fetchProductImage;

module.exports = router;
