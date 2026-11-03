'use strict';

/**
 * Product reviews — merchant settings.
 *   GET /api/reviews/:shopDomain/settings   current settings (defaults if never saved)
 *   PUT /api/reviews/:shopDomain/settings   validate and save the whole settings object
 * Both: requireAuth + requireStoreOwner, scoped by shopDomain from the verified token.
 */

const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const ReviewSettings = require('../models/ReviewSettings');
const { sanitizeReviewSettings, toPublicSettings } = require('../utils/reviewSettings');

const router = express.Router();

router.get('/:shopDomain/settings', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.store.shopDomain;
    const doc = await ReviewSettings.findOne({ shopDomain: shop }).lean();
    return res.json({ settings: toPublicSettings(doc) });
  } catch (err) {
    console.error('[reviews] GET settings error:', err.message);
    return res.status(500).json({ error: 'Failed to load review settings' });
  }
});

router.put('/:shopDomain/settings', requireAuth, requireStoreOwner, async (req, res) => {
  let clean;
  try {
    clean = sanitizeReviewSettings(req.body && req.body.settings);
  } catch (err) {
    if (err.isValidation) return res.status(400).json({ error: err.message, field: err.field });
    throw err;
  }

  try {
    const shop = req.store.shopDomain;
    const doc = await ReviewSettings.findOneAndUpdate(
      { shopDomain: shop },
      { $set: { ...clean, updatedAt: new Date() }, $setOnInsert: { shopDomain: shop } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ settings: toPublicSettings(doc) });
  } catch (err) {
    console.error('[reviews] PUT settings error:', err.message);
    return res.status(500).json({ error: 'Failed to save review settings' });
  }
});

module.exports = router;
