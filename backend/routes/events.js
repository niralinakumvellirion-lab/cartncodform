const express = require('express');
const router = express.Router();
const StorefrontEvent = require('../models/StorefrontEvent');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');

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

    // Phase C2 — on-ingest identity resolution + signal recompute. Fire-and-
    // forget: the beacon response must not wait on this.
    {
      const { upsertProfile } = require('../services/profileService');
      const { computeSignalsForProfile } = require('../services/signalEngine');
      upsertProfile(shop, {
        sessionId: sessionId || null,
        customerId: customerId || null,
        pushToken: token || null,
      }, { lastSeenAt: new Date() })
        .then((profile) => {
          if (profile?._id) {
            computeSignalsForProfile(profile._id, shop)
              .catch((err) => console.error('[signals] events ingest error:', err.message));
          }
        })
        .catch((err) => console.error('[profile] events upsert error:', err.message));
    }

    // Phase F — a page_view from a suppressed profile lifts push suppression.
    // Fully fire-and-forget: the beacon response goes out immediately.
    if (sessionId && events.some((e) => e.type === 'page_view')) {
      const { clearPushSuppression } = require('../services/pushHygiene');
      const Profile = require('../models/Profile');
      Profile.findOne({ shopDomain: shop, 'identifiers.sessionIds': sessionId })
        .then((profile) => {
          if (profile) {
            clearPushSuppression(profile._id, shop)
              .catch((err) => console.error('[hygiene] resubscribe error:', err.message));
          }
        })
        .catch((err) => console.error('[hygiene] resubscribe lookup error:', err.message));
    }

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
router.get('/:shopDomain/customer/:sessionId', requireAuth, requireStoreOwner, async (req, res) => {
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
router.get('/:shopDomain/summary', requireAuth, requireStoreOwner, async (req, res) => {
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

/**
 * GET /api/events/:shopDomain/ccfsession/:ccfSessionId
 * Returns all events for a stable analytics session UUID, newest first.
 */
router.get('/:shopDomain/ccfsession/:ccfSessionId', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const ccfSessionId = req.params.ccfSessionId;

    const events = await StorefrontEvent.find({
      shopDomain: shop,
      sessionId: ccfSessionId  // stored as sessionId in the model
    })
      .sort({ ts: -1 })
      .limit(200);

    return res.json(events);
  } catch (err) {
    console.error('[events] GET ccfsession error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/events/:shopDomain/resolve/:cartToken
 * Given a Shopify cart token, return the ccfSessionId (stable analytics
 * session UUID) + customerId of the most recently active subscription
 * for that cart, so the dashboard can then query events by ccfSessionId.
 */
router.get('/:shopDomain/resolve/:cartToken', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const cartToken = req.params.cartToken;
    const CustomerPushSubscription = require('../models/CustomerPushSubscription');

    const sub = await CustomerPushSubscription.findOne({
      shopDomain: shop,
      cartToken: cartToken
    }).sort({ lastActivityAt: -1 });

    return res.json({
      ccfSessionId: sub?.ccfSessionId || null,
      customerId: sub?.customerId || null
    });
  } catch (err) {
    console.error('[events] GET resolve error:', err.message);
    return res.status(500).json({ error: 'Failed to resolve session' });
  }
});

/**
 * GET /api/events/:shopDomain/product-analytics
 * Deterministic storefront analytics for the Insights screen.
 *  - per-product stats over the last 30 days (top 20 by views)
 *  - store-level stats over the last 7 days
 * No PII: everything is derived from anonymous StorefrontEvent rows.
 */
router.get('/:shopDomain/product-analytics', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const pipeline = [
      {
        $match: {
          shopDomain,
          ts: { $gte: thirtyDaysAgo },
          'meta.productId': { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$meta.productId',
          productTitle: { $last: '$meta.productTitle' },
          productPrice: { $last: '$meta.productPrice' },
          views: { $sum: { $cond: [{ $eq: ['$type', 'product_view'] }, 1, 0] } },
          uniqueViewers: { $addToSet: '$sessionId' },
          addToCarts: { $sum: { $cond: [{ $eq: ['$type', 'add_to_cart'] }, 1, 0] } },
          pageExits: { $sum: { $cond: [{ $eq: ['$type', 'page_exit'] }, 1, 0] } },
          totalDwell: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'product_view'] },
                { $ifNull: ['$meta.dwellSeconds', 0] },
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          productId: '$_id',
          productTitle: 1,
          productPrice: 1,
          views: 1,
          uniqueViewers: { $size: '$uniqueViewers' },
          addToCarts: 1,
          cartRate: {
            $cond: [
              { $gt: ['$views', 0] },
              { $round: [{ $multiply: [{ $divide: ['$addToCarts', '$views'] }, 100] }, 1] },
              0,
            ],
          },
          avgDwell: {
            $cond: [
              { $gt: ['$views', 0] },
              { $round: [{ $divide: ['$totalDwell', '$views'] }, 0] },
              0,
            ],
          },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 20 },
    ];

    const products = await StorefrontEvent.aggregate(pipeline);

    const [totalViews, totalSessions, cartEvents, promptShown, promptAccepted] =
      await Promise.all([
        StorefrontEvent.countDocuments({
          shopDomain,
          ts: { $gte: sevenDaysAgo },
          type: 'product_view',
        }),
        StorefrontEvent.distinct('sessionId', {
          shopDomain,
          ts: { $gte: sevenDaysAgo },
        }),
        StorefrontEvent.countDocuments({
          shopDomain,
          ts: { $gte: sevenDaysAgo },
          type: 'add_to_cart',
        }),
        StorefrontEvent.countDocuments({
          shopDomain,
          ts: { $gte: sevenDaysAgo },
          type: 'push_prompt_shown',
        }),
        StorefrontEvent.countDocuments({
          shopDomain,
          ts: { $gte: sevenDaysAgo },
          type: 'push_prompt_accepted',
        }),
      ]);

    const sessionCount = totalSessions.length;
    const cartRate =
      sessionCount > 0 ? ((cartEvents / sessionCount) * 100).toFixed(1) : 0;
    const optinRate =
      promptShown > 0 ? ((promptAccepted / promptShown) * 100).toFixed(1) : 0;

    return res.json({
      stats: {
        productViewsThisWeek: totalViews,
        allowedNotifications: optinRate,
        addToCartRate: cartRate,
        sessionCount,
      },
      products,
    });
  } catch (err) {
    console.error('[events] product-analytics error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch product analytics' });
  }
});

module.exports = router;
