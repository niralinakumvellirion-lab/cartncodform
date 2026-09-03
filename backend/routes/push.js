const express = require('express');
const PushSubscription = require('../models/PushSubscription');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const { sendPushToStore, sendPushToCustomers } = require('../utils/pushNotification');

const router = express.Router();

/**
 * POST /api/push/subscribe
 * Body: { shopDomain, token }
 * Upserts the FCM token for a store (token is unique).
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { shopDomain, token } = req.body;

    if (!shopDomain || !token) {
      return res.status(400).json({ error: 'shopDomain and token are required' });
    }

    await PushSubscription.findOneAndUpdate(
      { token },
      { shopDomain: shopDomain.trim().toLowerCase(), token },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`[push] Subscribed token for ${shopDomain}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[push] POST /subscribe error:', err.message);
    return res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

/**
 * POST /api/push/send
 * Body: { shopDomain, title, body }
 * Sends a notification to every token registered for the store.
 */
router.post('/send', async (req, res) => {
  try {
    const { shopDomain, title, body } = req.body;

    if (!shopDomain || !title || !body) {
      return res.status(400).json({ error: 'shopDomain, title and body are required' });
    }

    const result = await sendPushToStore(shopDomain, title, body);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    return res.json({ success: true, sent: result.sent || 0 });
  } catch (err) {
    console.error('[push] POST /send error:', err.message);
    return res.status(500).json({ error: 'Failed to send push notification' });
  }
});

/**
 * POST /api/push/subscribe-customer
 * Body: { shopDomain, token, oldToken, page }
 * Upserts a storefront-customer FCM token (from the Shopify theme script) and
 * cleans up a superseded token if one was supplied.
 */
router.post('/subscribe-customer', async (req, res) => {
  try {
    const { shopDomain, token, oldToken, page, deviceType, cartToken } = req.body;

    // Normalize cartToken — strip ?key=... suffix that /cart.js appends.
    const normalizedCartToken = cartToken
      ? cartToken.split('?')[0].trim() || null
      : null;

    if (!shopDomain || !token) {
      return res.status(400).json({ error: 'shopDomain and token required' });
    }

    const shop = shopDomain.trim().toLowerCase();

    // Remove old token if different from new token
    if (oldToken && oldToken !== token) {
      await CustomerPushSubscription.deleteOne({ token: oldToken });
      console.log(`[subscribe-customer] Removed old token for: ${shop}`);
    }

    // Upsert new token
    const result = await CustomerPushSubscription.findOneAndUpdate(
      { token },
      {
        shopDomain: shop,
        token,
        page: page || undefined,
        deviceType: deviceType || 'unknown',
        cartToken: normalizedCartToken || undefined,
        lastActivityAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Remove any OTHER rows with the same cartToken but a different
    // FCM token — prevents same-cart multi-row accumulation.
    if (normalizedCartToken) {
      await CustomerPushSubscription.deleteMany({
        shopDomain: shop,
        cartToken: normalizedCartToken,
        token: { $ne: token }
      });
    }

    console.log(`[subscribe-customer] Token saved for: ${shop}`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[subscribe-customer] Error:', err.message);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }
});
/**
 * POST /api/push/send-customer
 * Body: { shopDomain, title, body, url, imageUrl }
 * Sends a notification to every storefront customer subscribed for the shop.
 */
router.post('/send-customer', async (req, res) => {
  try {
    const { shopDomain, title, body, url, imageUrl } = req.body;

    console.log(`[send-customer] shopDomain received: ${shopDomain}`);
    console.log('[send-customer] imageUrl from request:', req.body.imageUrl || 'NONE');

    if (!shopDomain || !title || !body) {
      return res.status(400).json({ error: 'shopDomain, title and body are required' });
    }

    const result = await sendPushToCustomers(shopDomain, title, body, url, imageUrl, true, null, true);

    console.log(`[send-customer] tokens found: ${result.tokensFound ?? 0}`);
    console.log(`[send-customer] FCM result: ${JSON.stringify(result)}`);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    return res.json({ success: true, sent: result.sent || 0 });
  } catch (err) {
    console.error('[push] POST /send-customer error:', err.message);
    return res.status(500).json({ error: 'Failed to send customer push notification' });
  }
});

/**
 * POST /api/push/cart-activity
 * Body: { shopDomain, token, event, url }
 * Records storefront cart activity on the customer subscription.
 */
router.post('/cart-activity', async (req, res) => {
  try {
    const { shopDomain, token, event, url } = req.body;

    console.log(`[cart-activity] shopDomain: ${shopDomain}, event: ${event}`);

    if (!shopDomain || !token) {
      return res.status(400).json({ error: 'shopDomain and token are required' });
    }

    // Find the subscription by token and stamp its last activity.
    const sub = await CustomerPushSubscription.findOneAndUpdate(
      { token },
      {
        lastEvent: event || 'unknown',
        lastActivityUrl: url || undefined,
        lastActivityAt: new Date(),
      },
      { new: true }
    );
    if (!sub) {
      console.log('[cart-activity] no CustomerPushSubscription matched this token');
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[push] POST /cart-activity error:', err.message);
    return res.status(500).json({ error: 'Failed to record cart activity' });
  }
});

module.exports = router;
