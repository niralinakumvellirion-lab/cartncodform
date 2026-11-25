'use strict';

/**
 * "Find my size" — admin settings.
 *   GET /api/size-finder/:shopDomain/config   settings (defaults + Indian starter charts if never saved)
 *   PUT /api/size-finder/:shopDomain/config   save settings ({ settings })
 * Both: requireAuth + requireStoreOwner, scoped by shopDomain from the verified token.
 */

const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const SizeFinderConfig = require('../models/SizeFinderConfig');
const {
  sanitizeSettings, withDefaults, sanitizeChart, sanitizeAnswers, estimateBody, recommendSize,
} = require('../utils/sizeFinder');

const router = express.Router();

router.get('/:shopDomain/config', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const doc = await SizeFinderConfig.findOne({ shopDomain: req.store.shopDomain }).lean();
    return res.json({ settings: withDefaults(doc) });
  } catch (err) {
    console.error('[size-finder] GET config error:', err.message);
    return res.status(500).json({ error: 'Could not load the size finder settings' });
  }
});

router.put('/:shopDomain/config', requireAuth, requireStoreOwner, async (req, res) => {
  let clean;
  try {
    clean = sanitizeSettings(req.body && req.body.settings);
  } catch (err) {
    if (err.isValidation) return res.status(400).json({ error: err.message, field: err.field });
    console.error('[size-finder] PUT validation error:', err.message);
    return res.status(500).json({ error: 'Could not save the size finder settings' });
  }
  try {
    const shop = req.store.shopDomain;
    const doc = await SizeFinderConfig.findOneAndUpdate(
      { shopDomain: shop },
      { $set: { ...clean, updatedAt: new Date() }, $setOnInsert: { shopDomain: shop } },
      { upsert: true, new: true }
    ).lean();
    return res.json({ settings: withDefaults(doc) });
  } catch (err) {
    console.error('[size-finder] PUT config error:', err.message);
    return res.status(500).json({ error: 'Could not save the size finder settings' });
  }
});

/**
 * POST /api/size-finder/:shopDomain/preview — the admin's live preview.
 * Body: { chart (rows for the chosen gender, may be unsaved), answers { gender, heightCm, weightKg,
 * shape, fit } } → { size, outOfRange, reasons }. Same maths as the storefront; nothing is saved.
 */
router.post('/:shopDomain/preview', requireAuth, requireStoreOwner, (req, res) => {
  const answers = sanitizeAnswers(req.body && req.body.answers);
  if (!answers) return res.status(400).json({ error: 'Height or weight is out of range' });
  let chart;
  try {
    chart = sanitizeChart(req.body && req.body.chart, answers.gender);
  } catch (err) {
    if (err.isValidation) return res.status(400).json({ error: err.message, field: err.field });
    return res.status(500).json({ error: 'Could not work out a size' });
  }
  if (!chart.length) return res.status(400).json({ error: 'This size chart is empty' });
  const result = recommendSize(chart, estimateBody(answers), answers.fit);
  return res.json({ size: result.size, outOfRange: result.outOfRange, reasons: result.reasons });
});

module.exports = router;
