'use strict';

/**
 * "Back in stock" — storefront side, through the App Proxy:
 *   GET  /apps/cartncodform/restock/config      public settings (box words, colour, channels)
 *   POST /apps/cartncodform/restock/subscribe   { productId, variantId, productTitle, variantTitle,
 *                                                 productHandle, imageUrl, channel, email|pushToken|phone,
 *                                                 sessionId } → { ok }
 * The App Proxy signature is hard-enforced; `shop` and `logged_in_customer_id` come from the signed query.
 * Emails, phone numbers and push tokens are stored on the request only, and never logged.
 */

const express = require('express');
const RestockConfig = require('../models/RestockConfig');
const RestockRequest = require('../models/RestockRequest');
const { verifyProxySignature } = require('../utils/shopify');
const { publicSettings, withDefaults, sanitizeSubscribe, expiresAt } = require('../utils/restock');

const router = express.Router();

const hits = new Map();
function allow(key, max = 10, windowMs = 60 * 1000) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now);
  hits.set(key, list);
  return true;
}
allow.reset = () => hits.clear();

// Waiting requests one shop may hold at once (stops a script from filling the table).
const MAX_WAITING_PER_SHOP = 50000;

function guard(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (!verifyProxySignature(req.query)) {
    console.warn('[restock-proxy] invalid or missing App Proxy signature - rejecting');
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
    const doc = await RestockConfig.findOne({ shopDomain: req.shop }).lean();
    return res.json({ ok: true, settings: publicSettings(doc) });
  } catch (err) {
    console.error('[restock-proxy] config error:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not load' });
  }
});

router.post('/subscribe', guard, async (req, res) => {
  if (!allow(`${req.shop}|${req.ip}`)) {
    return res.status(429).json({ ok: false, error: 'Too many tries. Wait a minute and try again.' });
  }
  let clean;
  try {
    clean = sanitizeSubscribe(req.body);
  } catch (err) {
    if (err.isValidation) return res.status(400).json({ ok: false, error: err.message, field: err.field });
    return res.status(400).json({ ok: false, error: 'Could not save. Try again.' });
  }
  try {
    const settings = withDefaults(await RestockConfig.findOne({ shopDomain: req.shop }).lean());
    if (!settings.enabled) return res.status(404).json({ ok: false, error: 'Back in stock alerts are off' });
    if (!settings.channels[clean.channel]) {
      return res.status(400).json({ ok: false, error: 'This way of notifying is turned off', field: 'channel' });
    }

    const base = { shopDomain: req.shop, variantId: clean.variantId, channel: clean.channel, status: 'waiting' };
    const sameKey = clean.channel === 'email' ? { email: clean.email }
      : clean.channel === 'whatsapp' ? { phone: clean.phone } : { pushToken: clean.pushToken };
    if (await RestockRequest.exists({ ...base, ...sameKey })) {
      return res.json({ ok: true, already: true });
    }
    if (await RestockRequest.countDocuments({ shopDomain: req.shop, status: 'waiting' }) >= MAX_WAITING_PER_SHOP) {
      return res.status(429).json({ ok: false, error: 'Could not save right now. Try again later.' });
    }

    // Link to the shopper's profile (unsubscribe link, "already bought" check, dashboards).
    const ids = {};
    if (req.loggedInCustomerId) ids.customerId = req.loggedInCustomerId;
    if (clean.email) ids.email = clean.email;
    if (clean.phone) ids.phone = clean.phone;
    if (clean.sessionId) ids.sessionId = clean.sessionId;
    let profileId = null;
    if (Object.keys(ids).length) {
      const { upsertProfile } = require('../services/profileService');
      const profile = await upsertProfile(req.shop, ids, {}).catch(() => null);
      profileId = (profile && profile._id) || null;
    }

    try {
      await RestockRequest.create({
        ...clean,
        shopDomain: req.shop,
        customerId: req.loggedInCustomerId,
        profileId,
        status: 'waiting',
        expiresAt: expiresAt(),
      });
    } catch (err) {
      if (err && err.code === 11000) return res.json({ ok: true, already: true }); // double tap
      throw err;
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[restock-proxy] subscribe error:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not save. Try again.' });
  }
});

router._limiter = allow;
module.exports = router;
