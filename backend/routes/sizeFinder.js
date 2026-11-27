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
  STORE_TYPE_CATALOG, MEASURE_TYPES, publicMeasure, sanitizeMeasureChart, sanitizeMeasure, recommendByMeasure,
  BABY, sanitizeBabyChart, sanitizeBabyAnswers, recommendBaby,
} = require('../utils/sizeFinder');

// What the admin needs besides the settings: the search words and each measure type's words/ranges.
const ADMIN_META = {
  storeTypes: STORE_TYPE_CATALOG,
  measureTypes: Object.fromEntries(Object.keys(MEASURE_TYPES).map((t) => [t, publicMeasure(t)])),
  babyType: BABY,
};

const router = express.Router();

router.get('/:shopDomain/config', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const doc = await SizeFinderConfig.findOne({ shopDomain: req.store.shopDomain }).lean();
    return res.json({ settings: withDefaults(doc), ...ADMIN_META });
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
    return res.json({ settings: withDefaults(doc), ...ADMIN_META });
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
  // Shoes / rings / bangles: { storeType, chart: [{ size, value }], value }.
  // Baby: { storeType: 'baby', chart: [{ size, maxLength, maxWeight, maxAge }], answers }.
  const type = req.body && req.body.storeType;
  if (type === 'baby') {
    const answers = sanitizeBabyAnswers(req.body.answers);
    if (!answers) return res.status(400).json({ error: 'The baby’s details are out of range' });
    let rows;
    try {
      rows = sanitizeBabyChart(req.body.chart);
    } catch (err) {
      if (err.isValidation) return res.status(400).json({ error: err.message, field: err.field });
      return res.status(500).json({ error: 'Could not work out a size' });
    }
    if (!rows.length) return res.status(400).json({ error: 'This size chart is empty' });
    const r = recommendBaby(rows, answers);
    return res.json({ size: r.size, outOfRange: r.outOfRange, reasons: r.reasons });
  }
  if (MEASURE_TYPES[type]) {
    const value = sanitizeMeasure(req.body.value, type);
    if (value == null) return res.status(400).json({ error: 'The measurement is out of range' });
    let rows;
    try {
      rows = sanitizeMeasureChart(req.body.chart, type);
    } catch (err) {
      if (err.isValidation) return res.status(400).json({ error: err.message, field: err.field });
      return res.status(500).json({ error: 'Could not work out a size' });
    }
    if (!rows.length) return res.status(400).json({ error: 'This size chart is empty' });
    const r = recommendByMeasure(rows, value, type);
    return res.json({ size: r.size, outOfRange: r.outOfRange, reasons: r.reasons });
  }
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
