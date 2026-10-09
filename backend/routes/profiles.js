const express = require('express');
const router = express.Router();

const Profile = require('../models/Profile');
const Signal = require('../models/Signal');
const SignalConfig = require('../models/SignalConfig');
const StorefrontEvent = require('../models/StorefrontEvent');
const Store = require('../models/Store');
const ScheduledJob = require('../models/ScheduledJob');
const ShopWeights = require('../models/ShopWeights');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { computeWeeklyStats, computeInsights } = require('../services/analyticsService');
const { generateWeeklyNarrative, generateInsights } = require('../services/aiService');
const { computeWeights } = require('../services/weightsService');

const SIGNAL_TYPES = [
  'cart_abandon', 'checkout_abandon', 'browse_abandon',
  'high_intent', 'price_hesitation', 'price_drop', 'back_in_stock',
  'post_purchase_d3', 'lapsing', 'winback', 'email_capture', 'cod_to_prepaid',
];

/**
 * GET /api/profiles/:shopDomain/signals
 * Query: type (optional), limit (default 20, max 100)
 * -> { signals: [...] }  strongest first
 */
router.get('/:shopDomain/signals', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const filter = { shopDomain: shop };
    if (req.query.type) filter.type = req.query.type;

    const signals = await Signal.find(filter)
      .sort({ strength: -1 })
      .limit(limit)
      .populate('profileId', 'identifiers stage');

    return res.json({ signals });
  } catch (err) {
    console.error('[profiles] GET signals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

/**
 * GET /api/profiles/:shopDomain/messages
 * Query: limit (default 50, max 200), page (default 0)
 * Sent/skipped/failed/cancelled ScheduledJobs, newest first.
 * -> { messages, total }
 * NOTE: ScheduledJob has no `updatedAt` field — sorted by `sentAt` then
 * `createdAt`; those + `updatedAt` are all selected so the client can fall back.
 */
router.get('/:shopDomain/messages', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 0) page = 0;

    const filter = {
      shopDomain: shop,
      // A specific ?status= narrows to exactly that value (the Dashboard
      // drill-down asks for 'sent' only, matching the Push Sent/Emails
      // Sent KPI's own count) — default stays the existing broad set so
      // a plain visit to this screen is unchanged.
      status: req.query.status || { $in: ['sent', 'skipped', 'failed', 'cancelled'] },
    };
    if (req.query.channel === 'push' || req.query.channel === 'email') {
      filter.channel = req.query.channel;
    }
    // sentAt range — only applied when actually requested. Doing this
    // unconditionally would silently drop every skipped/failed/cancelled
    // row from the DEFAULT (no date filter) view too, since those never
    // get a sentAt at all; scoping it to "only when from/to given" keeps
    // a plain visit to this screen exactly as it was.
    if (req.query.from || req.query.to) {
      filter.sentAt = {};
      if (req.query.from) filter.sentAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.sentAt.$lte = new Date(req.query.to);
    }

    const [messages, total] = await Promise.all([
      ScheduledJob.find(filter)
        .sort({ sentAt: -1, createdAt: -1 })
        .skip(page * limit)
        .limit(limit)
        .select(
          'profileId signalType channel payload status outcome runAt reason cartToken sentAt createdAt updatedAt'
        )
        .populate('profileId', 'identifiers stage'),
      ScheduledJob.countDocuments(filter),
    ]);

    return res.json({ messages, total });
  } catch (err) {
    console.error('[profiles] GET messages error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Escape user input before it goes into a $regex so a stray "(" or "*"
// can't throw or trigger catastrophic backtracking.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/profiles/:shopDomain/profiles
 * Query:
 *   limit  (default 50, max 200)
 *   page   (default 0)
 *   filter (optional) — has_cart | bought_once | repeat_buyer | going_quiet
 *                       | email_captured | push_subscribed
 *   signal (optional) — any value from SIGNAL_TYPES; when present, restricts
 *                       results to profiles that have an active Signal of that
 *                       type. Additive with filter. Powers the Dashboard's
 *                       "Do This Next" drill-down.
 *   from, to (optional, ISO) — only meaningful combined with filter=
 *                       email_captured (channels.email.capturedAt) or
 *                       filter=push_subscribed (channels.push.subscribedAt);
 *                       a no-op for every other filter value
 *   search (optional) — case-insensitive substring match on email / phone
 * -> { profiles, total }  (most recently active first; total honours filter+search)
 */
router.get('/:shopDomain/profiles', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 0) page = 0;

    const query = { shopDomain: shop };

    const rangeFrom = req.query.from ? new Date(req.query.from) : null;
    const rangeTo = req.query.to ? new Date(req.query.to) : null;

    const filter = req.query.filter;
    if (filter === 'has_cart') {
      query['identifiers.cartTokens.0'] = { $exists: true };
      query['orders.count'] = 0;
    } else if (filter === 'bought_once') {
      query['orders.count'] = 1;
    } else if (filter === 'repeat_buyer') {
      query['orders.count'] = { $gte: 2 };
    } else if (filter === 'going_quiet') {
      const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
      query['lastSeenAt'] = { $lt: twentyOneDaysAgo };
    } else if (filter === 'email_captured') {
      query['channels.email.capturedAt'] = (rangeFrom || rangeTo)
        ? { $exists: true, ...(rangeFrom ? { $gte: rangeFrom } : {}), ...(rangeTo ? { $lte: rangeTo } : {}) }
        : { $exists: true };
    } else if (filter === 'push_subscribed') {
      query['channels.push.subscribed'] = true;
      if (rangeFrom || rangeTo) {
        query['channels.push.subscribedAt'] = {};
        if (rangeFrom) query['channels.push.subscribedAt'].$gte = rangeFrom;
        if (rangeTo) query['channels.push.subscribedAt'].$lte = rangeTo;
      }
    } else if (filter === 'whatsapp_captured') {
      query['channels.whatsapp.consentedAt'] = { $exists: true, $ne: null };
      query['channels.whatsapp.optedOutAt'] = null;
    }

    const signalType = typeof req.query.signal === 'string' ? req.query.signal.trim() : '';
    if (signalType) {
      if (!SIGNAL_TYPES.includes(signalType)) {
        return res.status(400).json({ error: 'Unknown signal type' });
      }
      const signalDocs = await Signal.find({ shopDomain: shop, type: signalType })
        .select('profileId')
        .lean();
      const profileIds = signalDocs.map((s) => s.profileId).filter(Boolean);
      query._id = { $in: profileIds };
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
      const rx = escapeRegex(search);
      query.$or = [
        { 'identifiers.emails': { $regex: rx, $options: 'i' } },
        { 'identifiers.phones': { $regex: rx, $options: 'i' } },
      ];
    }

    const [profiles, total] = await Promise.all([
      Profile.find(query)
        .sort({ updatedAt: -1 })
        .skip(page * limit)
        .limit(limit)
        .select('identifiers stage orders channels lastSeenAt updatedAt messages interests')
        .lean(),
      Profile.countDocuments(query),
    ]);

    const profilesOut = profiles.map((p) => {
      const wa = p.channels && p.channels.whatsapp;
      const optedOut = !!(wa && wa.optedOutAt);
      const hasWhatsappReachable = !optedOut && !!(
        (wa && wa.consentedAt) ||
        (wa && wa.phone) ||
        (p.identifiers && p.identifiers.phones && p.identifiers.phones.length > 0)
      );
      return { ...p, hasWhatsappReachable };
    });
    return res.json({ profiles: profilesOut, total });
  } catch (err) {
    console.error('[profiles] GET profiles error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

/**
 * GET /api/profiles/:shopDomain/profiles/:profileId
 * -> { profile, signals }  (the profile + its active signals)
 */
router.get('/:shopDomain/profiles/:profileId', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();

    const profile = await Profile.findOne({
      _id: req.params.profileId,
      shopDomain: shop,
    });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const signals = await Signal.find({ shopDomain: shop, profileId: profile._id })
      .sort({ strength: -1 });

    const wa = profile.channels && profile.channels.whatsapp;
    const optedOut = !!(wa && wa.optedOutAt);
    const hasWhatsappReachable = !optedOut && !!(
      (wa && wa.consentedAt) ||
      (wa && wa.phone) ||
      (profile.identifiers && profile.identifiers.phones && profile.identifiers.phones.length > 0)
    );

    return res.json({ profile, signals, hasWhatsappReachable });
  } catch (err) {
    console.error('[profiles] GET profile error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * GET /api/profiles/:shopDomain/signal-configs
 * -> { configs: [...] }  (rows that exist; a missing type means the default
 *    enabled=true / no override / maxSteps=1)
 */
router.get('/:shopDomain/signal-configs', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const configs = await SignalConfig.find({ shopDomain: shop });
    return res.json({ configs });
  } catch (err) {
    console.error('[profiles] GET signal-configs error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch signal configs' });
  }
});

/**
 * PATCH /api/profiles/:shopDomain/signal-configs/:signalType
 * Body: { enabled?, channelOverride?, maxSteps? }
 * Upserts the config for one signal type.
 */
router.patch('/:shopDomain/signal-configs/:signalType', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { signalType } = req.params;

    if (!SIGNAL_TYPES.includes(signalType)) {
      return res.status(400).json({ error: `Unknown signal type: ${signalType}` });
    }

    const set = { updatedAt: new Date() };
    if (typeof req.body.enabled === 'boolean') set.enabled = req.body.enabled;
    if (req.body.channelOverride === 'push' || req.body.channelOverride === 'email' || req.body.channelOverride === null) {
      set.channelOverride = req.body.channelOverride;
    }
    if (Number.isFinite(req.body.maxSteps)) set.maxSteps = req.body.maxSteps;

    const config = await SignalConfig.findOneAndUpdate(
      { shopDomain: shop, signalType },
      { $set: set, $setOnInsert: { shopDomain: shop, signalType } },
      { upsert: true, new: true }
    );

    return res.json({ config });
  } catch (err) {
    console.error('[profiles] PATCH signal-config error:', err.message);
    return res.status(500).json({ error: 'Failed to update signal config' });
  }
});

/**
 * GET /api/profiles/:shopDomain/optin-stats
 * Push soft-prompt performance over the last 30 days.
 * -> { shown, accepted, rate }   (rate = accepted / shown, 2dp, 0 when shown=0)
 */
router.get('/:shopDomain/optin-stats', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [shown, accepted] = await Promise.all([
      StorefrontEvent.countDocuments({
        shopDomain: shop,
        type: 'push_prompt_shown',
        ts: { $gte: since },
      }),
      StorefrontEvent.countDocuments({
        shopDomain: shop,
        type: 'push_prompt_accepted',
        'meta.granted': true,
        ts: { $gte: since },
      }),
    ]);

    const rate = shown > 0 ? Math.round((accepted / shown) * 100) / 100 : 0;

    return res.json({ shown, accepted, rate });
  } catch (err) {
    console.error('[profiles] GET optin-stats error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch opt-in stats' });
  }
});

/**
 * GET /api/profiles/:shopDomain/push-stats
 * -> rolling 7-day push delivery health for the shop.
 */
router.get('/:shopDomain/push-stats', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const store = await Store.findOne({ shopDomain: shop }, 'pushStats');
    const ps = (store && store.pushStats) || {};
    return res.json({
      deliveredLast7d: ps.deliveredLast7d || 0,
      attemptedLast7d: ps.attemptedLast7d || 0,
      rateLast7d: ps.rateLast7d || 0,
      lastComputedAt: ps.lastComputedAt || null,
    });
  } catch (err) {
    console.error('[profiles] GET push-stats error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch push stats' });
  }
});

/**
 * GET /api/profiles/:shopDomain/today-stats?from=&to=
 * Powers the Today screen's notification-stats row. Defaults to the last
 * 7 days when from/to are omitted.
 * -> { pushSent, emailsSent, popupsShown, emailsCaptured, pushSubscribers }
 */
router.get('/:shopDomain/today-stats', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const from = new Date(req.query.from || Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(req.query.to || Date.now());

    const [pushSent, emailsSent, popupsShown, emailsCaptured, pushSubscribers] =
      await Promise.all([
        // Push sent in range — sentAt (set at the moment ScheduledJob is
        // claimed/sent, server.js processScheduledJobs()) rather than
        // updatedAt, which can be nudged forward later by an unrelated
        // outcome/clickedAt update and would then misattribute the send
        // to the wrong date range.
        ScheduledJob.countDocuments({
          shopDomain: shop,
          channel: 'push',
          status: 'sent',
          sentAt: { $gte: from, $lte: to },
        }),
        // Emails sent in range (from Profile.messages)
        Profile.aggregate([
          { $match: { shopDomain: shop } },
          { $unwind: '$messages' },
          { $match: {
            'messages.channel': 'email',
            'messages.sentAt': { $gte: from, $lte: to },
          } },
          { $count: 'total' },
        ]).then((r) => r[0]?.total || 0),
        // Popups shown in range
        StorefrontEvent.countDocuments({
          shopDomain: shop,
          type: 'push_prompt_shown',
          ts: { $gte: from, $lte: to },
        }),
        // Emails captured in range
        Profile.countDocuments({
          shopDomain: shop,
          'channels.email.capturedAt': { $gte: from, $lte: to },
        }),
        // Push subscribers who opted in during the range — was previously
        // an all-time count (channels.push.subscribed: true, no date
        // bound at all), which meant this tile silently ignored the
        // Today/Yesterday/7d/30d filter it sits in. channels.push.
        // subscribedAt is set alongside .subscribed at opt-in time (see
        // services/profileService.js's upsertProfile), so this now
        // answers "subscribed within the selected range" like every
        // other tile in this response, not "subscribed ever".
        Profile.countDocuments({
          shopDomain: shop,
          'channels.push.subscribed': true,
          'channels.push.subscribedAt': { $gte: from, $lte: to },
        }),
      ]);

    return res.json({
      pushSent,
      emailsSent,
      popupsShown,
      emailsCaptured,
      pushSubscribers,
    });
  } catch (err) {
    console.error('[profiles] GET today-stats error:', err.message);
    return res.status(500).json({ error: 'Failed to load stats' });
  }
});

/**
 * GET /api/profiles/:shopDomain/new-subscribers
 * Customers who subscribed to push in the last 24h and haven't received
 * any notification yet. Powers the Today screen's new-subscriber alert.
 * -> { count, subscribers: [{ profileId, email, subscribedAt, lastSeenAt }] }
 */
router.get('/:shopDomain/new-subscribers', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find profiles that subscribed to push in last 24h
    // and have no sent jobs yet (messages array empty or
    // no push message in last 24h)
    const profiles = await Profile.find({
      shopDomain: shop,
      'channels.push.subscribed': true,
      'channels.push.subscribedAt': { $gte: since },
    })
      .select('identifiers channels.push channels.email lastSeenAt messages')
      .sort({ 'channels.push.subscribedAt': -1 })
      .limit(50)
      .lean();

    // Filter out profiles that already received a notification
    const newProfiles = profiles.filter(p => {
      const recentMsg = (p.messages || []).find(m =>
        m.sentAt && m.sentAt > since
      );
      return !recentMsg;
    });

    return res.json({
      count: newProfiles.length,
      subscribers: newProfiles.map(p => ({
        profileId: p._id,
        email: p.channels?.email?.address ||
               p.identifiers?.emails?.[0] || null,
        subscribedAt: p.channels?.push?.subscribedAt,
        lastSeenAt: p.lastSeenAt,
      })),
    });
  } catch (err) {
    console.error('[profiles] new-subscribers error:', err.message);
    return res.status(500).json({ error: 'Failed to load' });
  }
});

/**
 * GET /api/profiles/:shopDomain/popups-shown?from=&to=&page=&limit=
 * Powers the Dashboard's Popups Shown drill-down panel — paginated
 * StorefrontEvent rows of type 'push_prompt_shown' in the given range.
 * customerId is returned exactly as stored and ONLY when the event
 * already carries one (a logged-in visit) — no Profile lookup/join is
 * done to resolve an email for an anonymous one; most rows will have no
 * identity at all, since this event fires before any opt-in.
 * subscribed is tagged via ONE extra query for push_prompt_accepted events
 * matching the page's sessionIds or customerIds — never per-row (no N+1).
 * -> { events: [{ ts, path, customerId, subscribed }], total, page, limit }
 */
router.get('/:shopDomain/popups-shown', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 0) page = 0;

    const query = { shopDomain: shop, type: 'push_prompt_shown' };
    if (req.query.from || req.query.to) {
      query.ts = {};
      if (req.query.from) query.ts.$gte = new Date(req.query.from);
      if (req.query.to) query.ts.$lte = new Date(req.query.to);
    }

    const [rows, total] = await Promise.all([
      StorefrontEvent.find(query)
        .sort({ ts: -1 })
        .skip(page * limit)
        .limit(limit)
        .select('ts path customerId sessionId')
        .lean(),
      StorefrontEvent.countDocuments(query),
    ]);

    // ONE extra query — never per-row — to find accepted events that match
    // any sessionId or customerId on this page.
    const sessionIds = rows.map((r) => r.sessionId).filter(Boolean);
    const customerIds = rows.map((r) => r.customerId).filter(Boolean);
    const subscribedSessions = new Set();
    const subscribedCustomers = new Set();

    if (sessionIds.length || customerIds.length) {
      const acceptedFilter = { shopDomain: shop, type: 'push_prompt_accepted' };
      if (sessionIds.length && customerIds.length) {
        acceptedFilter.$or = [
          { sessionId: { $in: sessionIds } },
          { customerId: { $in: customerIds } },
        ];
      } else if (sessionIds.length) {
        acceptedFilter.sessionId = { $in: sessionIds };
      } else {
        acceptedFilter.customerId = { $in: customerIds };
      }
      const accepted = await StorefrontEvent.find(acceptedFilter)
        .select('sessionId customerId')
        .lean();
      for (const a of accepted) {
        if (a.sessionId) subscribedSessions.add(a.sessionId);
        if (a.customerId) subscribedCustomers.add(a.customerId);
      }
    }

    // Compute subscribedTotal / unknownTotal across ALL matching events (not
    // just this page). Three steps: collect all session/customer IDs from
    // every shown event in the range via aggregate; cross-reference with
    // accepted events to get the subscribed set; then countDocuments shown
    // events whose ID is in that set.
    let subscribedTotal = 0;
    const idAgg = await StorefrontEvent.aggregate([
      { $match: query },
      { $group: { _id: null, sids: { $addToSet: '$sessionId' }, cids: { $addToSet: '$customerId' } } },
    ]);
    const allSids = (idAgg[0]?.sids || []).filter(Boolean);
    const allCids = (idAgg[0]?.cids || []).filter(Boolean);

    if (allSids.length || allCids.length) {
      const accFilter = { shopDomain: shop, type: 'push_prompt_accepted' };
      if (allSids.length && allCids.length) {
        accFilter.$or = [{ sessionId: { $in: allSids } }, { customerId: { $in: allCids } }];
      } else if (allSids.length) {
        accFilter.sessionId = { $in: allSids };
      } else {
        accFilter.customerId = { $in: allCids };
      }
      const accAgg = await StorefrontEvent.aggregate([
        { $match: accFilter },
        { $group: { _id: null, sids: { $addToSet: '$sessionId' }, cids: { $addToSet: '$customerId' } } },
      ]);
      const subSids = new Set((accAgg[0]?.sids || []).filter(Boolean));
      const subCids = new Set((accAgg[0]?.cids || []).filter(Boolean));

      if (subSids.size || subCids.size) {
        const subFilter = { ...query };
        const subOr = [];
        if (subSids.size) subOr.push({ sessionId: { $in: [...subSids] } });
        if (subCids.size) subOr.push({ customerId: { $in: [...subCids] } });
        subFilter.$or = subOr;
        subscribedTotal = await StorefrontEvent.countDocuments(subFilter);
      }
    }

    return res.json({
      events: rows.map((r) => ({
        ts: r.ts,
        path: r.path || null,
        customerId: r.customerId || null,
        subscribed: !!(
          (r.sessionId && subscribedSessions.has(r.sessionId)) ||
          (r.customerId && subscribedCustomers.has(r.customerId))
        ),
      })),
      total,
      page,
      limit,
      subscribedTotal,
      unknownTotal: total - subscribedTotal,
    });
  } catch (err) {
    console.error('[profiles] popups-shown error:', err.message);
    return res.status(500).json({ error: 'Failed to load' });
  }
});

/**
 * GET /api/profiles/:shopDomain/weekly-narrative
 * -> { narrative, insights: [string], stats }
 * The full computation is cached in-process for 1 hour per shop so an admin
 * page load does not re-run aggregations + LLM calls every time.
 */
const narrativeCache = new Map(); // shopDomain -> { at: ms, data }
const NARRATIVE_TTL = 60 * 60 * 1000;

router.get('/:shopDomain/weekly-narrative', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();

    const cached = narrativeCache.get(shop);
    if (cached && Date.now() - cached.at < NARRATIVE_TTL) {
      return res.json(cached.data);
    }

    const stats = await computeWeeklyStats(shop);
    const rawInsights = await computeInsights(shop);
    const [narrative, insights] = await Promise.all([
      generateWeeklyNarrative(shop, stats),
      generateInsights(shop, rawInsights),
    ]);

    const data = { narrative, insights, stats };
    narrativeCache.set(shop, { at: Date.now(), data });
    return res.json(data);
  } catch (err) {
    console.error('[profiles] GET weekly-narrative error:', err.message);
    return res.status(500).json({ error: 'Failed to build weekly narrative' });
  }
});

/**
 * GET /api/profiles/:shopDomain/settings   -> { voice, caps, quietHours, timezone }
 */
router.get('/:shopDomain/settings', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const store = await Store.findOne(
      { shopDomain: shop },
      'voice caps quietHours timezone shopName logoUrl primaryColor'
    );
    if (!store) return res.status(404).json({ error: 'Store not found' });
    return res.json({
      voice: store.voice || {},
      caps: store.caps || {},
      quietHours: store.quietHours || {},
      timezone: store.timezone || 'Asia/Kolkata',
      shopName: store.shopName || null,
      logoUrl: store.logoUrl || null,
      primaryColor: store.primaryColor || null,
    });
  } catch (err) {
    console.error('[profiles] GET settings error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PATCH /api/profiles/:shopDomain/settings
 * Body: { voice?, caps?, quietHours?, timezone? }
 * Dot-notation merge (partial update; nested keys are not replaced wholesale).
 */
router.patch('/:shopDomain/settings', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const set = {};

    const merge = (prefix, obj) => {
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) set[`${prefix}.${k}`] = v;
      }
    };
    merge('voice', req.body.voice);
    merge('caps', req.body.caps);

    // quietHours.start/end must be an integer hour 0-23 when present — a bad
    // value (e.g. 99, -1, "late") used to save as-is and get silently
    // replaced by the default (22/8) wherever it's read (utils/timezone.js),
    // with the merchant never told their input didn't take effect. A missing
    // object, or a missing side, is still valid — the existing default applies.
    const qh = req.body.quietHours;
    if (qh && typeof qh === 'object') {
      for (const side of ['start', 'end']) {
        if (!Object.prototype.hasOwnProperty.call(qh, side)) continue;
        const v = qh[side];
        if (!Number.isInteger(v) || v < 0 || v > 23) {
          return res.status(400).json({
            error: `quietHours.${side} must be an integer between 0 and 23 (got ${JSON.stringify(v)})`,
          });
        }
      }
      merge('quietHours', qh);
    }
    // timezone must be a real IANA zone name when present — same "reject,
    // don't silently default" pattern as quietHours above. An unrecognised
    // string used to save as-is and get silently replaced by the Kolkata
    // default everywhere it's read (utils/timezone.js's resolveTz), with the
    // merchant never told. Intl throws RangeError on an unknown zone.
    if (typeof req.body.timezone === 'string' && req.body.timezone) {
      const tz = req.body.timezone;
      try {
        // eslint-disable-next-line no-new
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
      } catch {
        return res.status(400).json({
          error: `timezone must be a valid IANA zone name (got ${JSON.stringify(tz)})`,
        });
      }
      set.timezone = tz;
    }

    if (Object.keys(set).length === 0) {
      return res.status(400).json({ error: 'No settings provided' });
    }

    // findOneAndUpdate (default new:false) hands back the PRE-update doc in
    // the same round trip, so a real timezone change can be detected below
    // without a second query.
    const before = await Store.findOneAndUpdate({ shopDomain: shop }, { $set: set });

    // A voice change invalidates the cached narrative for this shop.
    narrativeCache.delete(shop);

    // ShopWeights.hourRates is bucketed by store-local hour (utils/timezone.js
    // hourInTz) — a timezone change makes every existing bucket mean a
    // different wall-clock hour than the one computeRunAt will read it as
    // (same mismatch shape as the earlier UTC-bucketing bug). Only recompute
    // when the value actually changed, not just because the field was
    // present in the payload (e.g. re-saving the same zone). Fire-and-forget:
    // must never block or fail the save response.
    if (set.timezone && before && before.timezone !== set.timezone) {
      const fromTz = before.timezone || '(unset)';
      computeWeights(shop)
        .then(() => console.log(
          `[settings] recomputed weights for ${shop} after timezone change: ${fromTz} -> ${set.timezone}`
        ))
        .catch((err) => console.error(
          `[settings] weights recompute failed for ${shop} after timezone change:`, err.message
        ));
    }

    return res.json({ updated: true });
  } catch (err) {
    console.error('[profiles] PATCH settings error:', err.message);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /api/profiles/:shopDomain/popup   -> { popup }
 * Storefront soft-prompt appearance config (popup-customizer).
 */
const POPUP_FIELDS = [
  'position', 'theme', 'accentColor', 'bgColor', 'textColor', 'fontFamily',
  'borderRadius', 'imageUrl', 'imagePosition', 'allowText', 'denyText',
  'customTitle', 'showBranding',
  // popup-redesign fields:
  'layout', 'headline', 'subtext', 'brandName', 'textAlign', 'ctaStyle',
  'overlayOpacity', 'showOverlay',
];
// popup-style: styleId/styleFields (and mobileStyleOverride, desktop-only)
// are handled explicitly below rather than through the generic loop above —
// styleId needs real validation (Model.updateOne() does not run Mongoose's
// schema-level enum validator unless {runValidators:true} is passed, which
// this route doesn't use), and styleFields needs sanitizing, not a blind
// pass-through.
const { sanitizeStyleFields, isValidStyleId, normalizeStyleId, normalizeLayout } = require('../utils/popupStyles');

router.get('/:shopDomain/popup', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const store = await Store.findOne({ shopDomain: shop }, 'popup mobilePopup');
    if (!store) return res.status(404).json({ error: 'Store not found' });
    return res.json({
      popup: store.popup || {},
      mobilePopup: store.mobilePopup || {},
    });
  } catch (err) {
    console.error('[profiles] GET popup error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch popup config' });
  }
});

/**
 * PATCH /api/profiles/:shopDomain/popup
 * Body: any subset of popup fields. Dot-notation $set on popup.* keys.
 */
router.patch('/:shopDomain/popup', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const set = {};
    for (const key of POPUP_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        set[`popup.${key}`] = key === 'layout' ? normalizeLayout(req.body[key]) : req.body[key];
      }
    }

    // popup-style (desktop): styleId is validated against the real id
    // list; an invalid/unknown id is silently ignored (dropped from this
    // save) rather than failing the whole request, same permissive
    // pattern the rest of this route already uses for a bad field.
    if (Object.prototype.hasOwnProperty.call(req.body, 'styleId')) {
      const sid = normalizeStyleId(req.body.styleId);
      if (isValidStyleId(sid)) set['popup.styleId'] = sid;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'styleFields')) {
      set['popup.styleFields'] = sanitizeStyleFields(req.body.styleFields);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'mobileStyleOverride')) {
      set['popup.mobileStyleOverride'] = !!req.body.mobileStyleOverride;
    }

    // popup-responsive: merge mobilePopup fields individually, same as the
    // desktop popup.* fields above — a wholesale `set.mobilePopup = req.body
    // .mobilePopup` here would replace the WHOLE subdocument, silently
    // wiping any field (imageUrl included) the caller didn't happen to send.
    // Reuses POPUP_FIELDS rather than a separate mobile-only list: the
    // frontend customizer edits both configs through the same form fields
    // ("popup-responsive: ... same fields, different state" —
    // frontend/app/admin/screens/Settings.jsx), so the two must stay in
    // sync or a field editable on the mobile tab could silently fail to
    // save.
    if (req.body.mobilePopup && typeof req.body.mobilePopup === 'object') {
      for (const key of POPUP_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(req.body.mobilePopup, key)) {
          set[`mobilePopup.${key}`] = key === 'layout'
            ? normalizeLayout(req.body.mobilePopup[key])
            : req.body.mobilePopup[key];
        }
      }
      if (Object.prototype.hasOwnProperty.call(req.body.mobilePopup, 'styleId')) {
        const msid = normalizeStyleId(req.body.mobilePopup.styleId);
        if (isValidStyleId(msid)) {
          set['mobilePopup.styleId'] = msid;
        }
      }
      if (Object.prototype.hasOwnProperty.call(req.body.mobilePopup, 'styleFields')) {
        set['mobilePopup.styleFields'] = sanitizeStyleFields(req.body.mobilePopup.styleFields);
      }
    }

    if (Object.keys(set).length === 0) {
      return res.status(400).json({ error: 'No popup fields provided' });
    }

    await Store.updateOne({ shopDomain: shop }, { $set: set });
    return res.json({ updated: true });
  } catch (err) {
    console.error('[profiles] PATCH popup error:', err.message);
    return res.status(500).json({ error: 'Failed to update popup config' });
  }
});

/**
 * GET /api/profiles/:shopDomain/weights
 * The shop's learned Brain weights (Phase H). null until the first nightly
 * compute has run.
 * -> { weights }
 */
router.get('/:shopDomain/weights', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const weights = await ShopWeights.findOne({ shopDomain: shop });
    return res.json({ weights: weights || null });
  } catch (err) {
    console.error('[profiles] GET weights error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch weights' });
  }
});

module.exports = router;
