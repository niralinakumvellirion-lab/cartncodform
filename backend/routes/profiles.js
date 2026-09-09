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
      status: { $in: ['sent', 'skipped', 'failed', 'cancelled'] },
    };

    const [messages, total] = await Promise.all([
      ScheduledJob.find(filter)
        .sort({ sentAt: -1, createdAt: -1 })
        .skip(page * limit)
        .limit(limit)
        .select(
          'profileId signalType channel payload status runAt reason cartToken sentAt createdAt updatedAt'
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

/**
 * GET /api/profiles/:shopDomain/profiles
 * Query: limit (default 50, max 200), page (default 0)
 * -> { profiles, total }  (most recently active first)
 */
router.get('/:shopDomain/profiles', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 0) page = 0;

    const [profiles, total] = await Promise.all([
      Profile.find({ shopDomain: shop })
        .sort({ updatedAt: -1 })
        .skip(page * limit)
        .limit(limit)
        .select('identifiers stage orders channels lastSeenAt updatedAt'),
      Profile.countDocuments({ shopDomain: shop }),
    ]);

    return res.json({ profiles, total });
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

    return res.json({ profile, signals });
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
    const store = await Store.findOne({ shopDomain: shop }, 'voice caps quietHours timezone');
    if (!store) return res.status(404).json({ error: 'Store not found' });
    return res.json({
      voice: store.voice || {},
      caps: store.caps || {},
      quietHours: store.quietHours || {},
      timezone: store.timezone || 'Asia/Kolkata',
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
    merge('quietHours', req.body.quietHours);
    if (typeof req.body.timezone === 'string' && req.body.timezone) {
      set.timezone = req.body.timezone;
    }

    if (Object.keys(set).length === 0) {
      return res.status(400).json({ error: 'No settings provided' });
    }

    await Store.updateOne({ shopDomain: shop }, { $set: set });

    // A voice change invalidates the cached narrative for this shop.
    narrativeCache.delete(shop);

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
  'borderRadius', 'imageUrl', 'allowText', 'denyText', 'customTitle', 'showBranding',
];

router.get('/:shopDomain/popup', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const store = await Store.findOne({ shopDomain: shop }, 'popup');
    if (!store) return res.status(404).json({ error: 'Store not found' });
    return res.json({ popup: store.popup || {} });
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
        set[`popup.${key}`] = req.body[key];
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
