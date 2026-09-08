const express = require('express');
const router = express.Router();

const Profile = require('../models/Profile');
const Signal = require('../models/Signal');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');

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

module.exports = router;
