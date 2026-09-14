const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireOwner');
const AttributedEvent = require('../models/AttributedEvent');
const Profile = require('../models/Profile');

// GET /api/activity?from=&to=&eventType=
// No :shopDomain path param (see requireAuth-only precedent in
// backend/routes/push.js, send-journey/send-journey-email) — shop is taken
// from the verified session token (req.shopDomain), never from a client-
// supplied query param, so there's nothing here for a caller to spoof.
router.get('/', requireAuth, async (req, res) => {
  try {
    const shop = req.shopDomain;

    // Date range — default last 7 days
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Set to start/end of day
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const eventType = req.query.eventType || null;

    // Base query
    const baseQuery = {
      shopDomain: shop,
      ts: { $gte: from, $lte: to }
    };
    if (eventType) baseQuery.eventType = eventType;

    // Get counts per event type
    const counts = await AttributedEvent.aggregate([
      { $match: { shopDomain: shop, ts: { $gte: from, $lte: to } } },
      { $group: { _id: '$eventType', count: { $sum: 1 },
                  profiles: { $addToSet: '$profileId' } } }
    ]);

    // Format counts
    const summary = {
      revisit: 0,
      add_to_cart: 0,
      checkout_start: 0,
      purchase: 0,
    };
    counts.forEach(c => {
      if (summary[c._id] !== undefined) {
        summary[c._id] = c.count;
      }
    });

    // Get user list (with eventType filter if provided)
    const events = await AttributedEvent.find(baseQuery)
      .sort({ ts: -1 })
      .limit(200)
      .lean();

    // Enrich with profile email
    const profileIds = [...new Set(
      events.map(e => e.profileId).filter(Boolean).map(String)
    )];

    const profiles = await Profile.find({
      _id: { $in: profileIds }
    }).select('channels.email.address channels.push.subscribed').lean();

    const profileMap = {};
    profiles.forEach(p => {
      profileMap[p._id.toString()] = {
        email: p.channels?.email?.address || null,
        pushSubscribed: p.channels?.push?.subscribed || false,
      };
    });

    // Build user list
    const users = events.map(e => ({
      eventType: e.eventType,
      email: e.email || profileMap[e.profileId?.toString()]?.email || null,
      sessionId: e.sessionId,
      jobId: e.jobId,
      meta: e.meta,
      ts: e.ts,
    }));

    return res.json({
      from, to,
      summary,
      users,
      total: users.length,
    });

  } catch (err) {
    console.error('[activity] GET error:', err.message);
    return res.status(500).json({ error: 'Failed to load activity' });
  }
});

module.exports = router;
