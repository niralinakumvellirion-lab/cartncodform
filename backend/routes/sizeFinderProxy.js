'use strict';

/**
 * "Find my size" — storefront side, through the App Proxy:
 *   GET  /apps/cartncodform/size-finder/config      public settings + charts
 *   POST /apps/cartncodform/size-finder/recommend   { gender, heightCm, weightKg, shape, fit,
 *                                                     remember?, sessionId? } → { size, reasons }
 * The App Proxy signature is hard-enforced; `shop` and `logged_in_customer_id` come from the signed
 * query. Height and weight are used for the calculation only — never stored, never logged.
 * With remember=true the size, gender and fit go on the shopper's Profile (customer id and/or
 * the storefront session id), for later "back in your size" messages.
 */

const express = require('express');
const SizeFinderConfig = require('../models/SizeFinderConfig');
const { verifyProxySignature } = require('../utils/shopify');
const {
  publicSettings, withDefaults, sanitizeAnswers, estimateBody, recommendSize,
  MEASURE_TYPES, sanitizeMeasure, recommendByMeasure, sanitizeBabyAnswers, recommendBaby,
} = require('../utils/sizeFinder');

const router = express.Router();

// Small in-memory limiter per shop + IP (per process; stops casual hammering).
const hits = new Map();
function allow(key, max = 30, windowMs = 60 * 1000) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now);
  hits.set(key, list);
  return true;
}
allow.reset = () => hits.clear();

const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;

function guard(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (!verifyProxySignature(req.query)) {
    console.warn('[size-finder-proxy] invalid or missing App Proxy signature - rejecting');
    return res.status(403).json({ ok: false, error: 'Invalid signature' });
  }
  const shop = String(req.query.shop || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return res.status(400).json({ ok: false, error: 'Bad shop' });
  }
  req.shop = shop;
  req.loggedInCustomerId = /^\d{1,20}$/.test(String(req.query.logged_in_customer_id || ''))
    ? String(req.query.logged_in_customer_id)
    : null;
  return next();
}

router.get('/config', guard, async (req, res) => {
  try {
    const doc = await SizeFinderConfig.findOne({ shopDomain: req.shop }).lean();
    return res.json({ ok: true, settings: publicSettings(doc) });
  } catch (err) {
    console.error('[size-finder-proxy] config error:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not load' });
  }
});

router.post('/recommend', guard, async (req, res) => {
  if (!allow(`${req.shop}|${req.ip}`)) {
    return res.status(429).json({ ok: false, error: 'Too many tries. Wait a minute and try again.' });
  }
  try {
    const doc = await SizeFinderConfig.findOne({ shopDomain: req.shop }).lean();
    const settings = withDefaults(doc);
    if (!settings.enabled) return res.status(404).json({ ok: false, error: 'Size finder is off' });
    const measured = !!MEASURE_TYPES[settings.storeType] || settings.storeType === 'baby';
    let answers = null;
    let result;
    if (settings.storeType === 'baby') {
      // Baby's length + weight, or age: used for the calculation only.
      const baby = sanitizeBabyAnswers(req.body);
      if (!baby) return res.status(400).json({ ok: false, error: 'Check your baby’s details and try again.' });
      if (!settings.babyChart.length) return res.status(400).json({ ok: false, error: 'No size chart yet' });
      result = recommendBaby(settings.babyChart, baby);
    } else if (measured) {
      // Shoes / rings / bangles: one measurement, used for the calculation only.
      const value = sanitizeMeasure(req.body, settings.storeType);
      if (value == null) return res.status(400).json({ ok: false, error: 'Check your measurement and try again.' });
      const rows = settings.measureCharts[settings.storeType];
      if (!rows || !rows.length) return res.status(400).json({ ok: false, error: 'No size chart yet' });
      result = recommendByMeasure(rows, value, settings.storeType);
    } else {
      answers = sanitizeAnswers(req.body);
      if (!answers) return res.status(400).json({ ok: false, error: 'Check your height and weight and try again.' });
      const chart = settings.charts[answers.gender];
      if (!chart || !chart.length) {
        return res.status(400).json({ ok: false, error: 'No size chart for this choice' });
      }
      result = recommendSize(chart, estimateBody(answers), answers.fit);
    }

    let saved = false;
    if (req.body && req.body.remember === true) {
      const ids = {};
      if (req.loggedInCustomerId) ids.customerId = req.loggedInCustomerId;
      const sid = String((req.body && req.body.sessionId) || '');
      if (SESSION_RE.test(sid)) ids.sessionId = sid;
      if (Object.keys(ids).length) {
        const { upsertProfile } = require('../services/profileService');
        const profile = await upsertProfile(req.shop, ids, {
          'sizeProfile.size': result.size,
          'sizeProfile.gender': answers ? answers.gender : null,
          'sizeProfile.fit': answers ? answers.fit : null,
          'sizeProfile.kind': measured ? settings.storeType : 'clothing',
          'sizeProfile.updatedAt': new Date(),
        });
        saved = !!profile;
      }
    }

    return res.json({ ok: true, size: result.size, outOfRange: result.outOfRange, reasons: result.reasons, saved });
  } catch (err) {
    console.error('[size-finder-proxy] recommend error:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not work out a size. Try again.' });
  }
});

router._limiter = allow;
module.exports = router;
