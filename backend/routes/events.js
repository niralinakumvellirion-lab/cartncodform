const express = require('express');
const router = express.Router();
const StorefrontEvent = require('../models/StorefrontEvent');

/**
 * POST /api/events
 * Body: { shopDomain, sessionId?, customerId?, token?, events: [...] }
 * Each event: { type, path, pageType, meta, ts }
 * Accepts a batch of events from the storefront JS.
 * Also callable via navigator.sendBeacon (text/plain body).
 */
router.post('/', async (req, res) => {
  try {
    let body = req.body;

    // sendBeacon sends text/plain — parse it manually if needed.
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).end(); }
    }

    const { shopDomain, sessionId, customerId, token, events } = body;

    if (!shopDomain || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'shopDomain and events[] required' });
    }

    const shop = shopDomain.trim().toLowerCase();
    const docs = events.map(e => ({
      shopDomain: shop,
      sessionId:  sessionId  || undefined,
      customerId: customerId || undefined,
      token:      token      || undefined,
      type:       e.type     || 'unknown',
      path:       e.path     || undefined,
      pageType:   e.pageType || undefined,
      meta:       e.meta     || undefined,
      ts:         e.ts ? new Date(e.ts) : new Date(),
    }));

    await StorefrontEvent.insertMany(docs, { ordered: false });
    console.log(`[events] Saved ${docs.length} event(s) for ${shop}`);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[events] POST /api/events error:', err.message);
    return res.status(500).json({ error: 'Failed to save events' });
  }
});

/**
 * GET /api/events/:shopDomain/customer/:sessionId
 * Returns all events for a customer session, sorted newest first.
 */
router.get('/:shopDomain/customer/:sessionId', async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const sessionId = req.params.sessionId;

    const events = await StorefrontEvent.find({ shopDomain: shop, sessionId })
      .sort({ ts: -1 })
      .limit(200);

    return res.json(events);
  } catch (err) {
    console.error('[events] GET error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/events/:shopDomain/summary
 * Returns event counts by type for the shop (last 30 days).
 */
router.get('/:shopDomain/summary', async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const summary = await StorefrontEvent.aggregate([
      { $match: { shopDomain: shop, ts: { $gte: since } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return res.json(summary);
  } catch (err) {
    console.error('[events] summary error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

module.exports = router;
