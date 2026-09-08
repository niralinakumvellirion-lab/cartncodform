const express = require('express');
const router = express.Router();

const Profile = require('../models/Profile');
const Signal = require('../models/Signal');
const SignalConfig = require('../models/SignalConfig');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');

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

module.exports = router;
