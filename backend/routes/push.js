const express = require('express');
const PushSubscription = require('../models/PushSubscription');
const { sendPushToStore } = require('../utils/pushNotification');

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

module.exports = router;
