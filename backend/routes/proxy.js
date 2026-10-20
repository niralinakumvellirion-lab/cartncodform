const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const CodOrder = require('../models/CodOrder');
const Store = require('../models/Store');
const DiscountConfig = require('../models/DiscountConfig');
const { sendNewCodOrderEmail } = require('../utils/email');
const { sendPushToStore } = require('../utils/pushNotification');
const { verifyProxySignature } = require('../utils/shopify');
const { generateDiscount, defaultConfig } = require('./discounts');

/**
 * Escape a string for safe interpolation into HTML text / attribute context.
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// verifyProxySignature now lives in utils/shopify.js (shared with routes/discounts.js).

// Serve Firebase SW via App Proxy
// URL: https://cartncod-form.myshopify.com/apps/cartncodform/sw.js
router.get('/sw.js', (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /sw.js — allowing for now (soft enforcement)');
    // return res.status(403).send('Invalid signature'); // uncomment once confirmed safe
  }

  const swPath = path.join(__dirname, '../public/cartncodform-sw.js');

  if (!fs.existsSync(swPath)) {
    return res.status(404).send('Service worker not found');
  }

  const swContent = fs.readFileSync(swPath, 'utf8');

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  console.log('[proxy] Served SW, headers set for root scope');
  res.send(swContent);
});

// Health check
router.get('/health', (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /health — rejecting');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  res.json({ success: true, service: 'ShopiReachBoost AI Proxy' });
});

// ---------------------------------------------------------------------------
// popup-customizer: the storefront push prompt fetches its appearance config
// from here (same origin as the store, via the App Proxy).
//   https://{shop}/apps/cartncodform/popup-config?shop={shop}
// Signature is HARD-enforced, same as /cod-form.
// popup-style: styleId/styleFields (and popup.mobileStyleOverride) are
// schema fields on the same popup/mobilePopup subdocs returned below, so
// they're already included wholesale here — no change needed in this route
// itself for the storefront to read them.
// ---------------------------------------------------------------------------
router.get('/popup-config', async (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /popup-config — rejecting');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  try {
    const shop = String(req.query.shop || '').trim().toLowerCase();
    const store = await Store.findOne({ shopDomain: shop }).select('popup mobilePopup');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      popup: (store && store.popup) || {},
      mobilePopup: (store && store.mobilePopup) || {},
    });
  } catch (err) {
    console.error('[proxy] GET /popup-config error:', err.message);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ popup: {}, mobilePopup: {} });
  }
});

// ---------------------------------------------------------------------------
// discount-feature: the storefront popup fetches which subscribe actions earn
// a discount (enabled flags + %), plus the offer headline.
//   https://{shop}/apps/cartncodform/discount-config?shop={shop}
// Public — the App Proxy signature is the auth (hard-enforced).
// ---------------------------------------------------------------------------
router.get('/discount-config', async (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /discount-config — rejecting');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  try {
    const shop = String(req.query.shop || '').trim().toLowerCase();
    const doc = (await DiscountConfig.findOne({ shopDomain: shop }).lean()) || defaultConfig(shop);

    const slim = (r) => ({
      enabled: !!(r && r.enabled),
      percentage: (r && r.percentage) || 0,
      offerText: String((r && r.offerText) || '').trim().slice(0, 120),
    });
    // phone / both are retired: never let a stale DB value switch them on.
    const off = (r) => ({ enabled: false, percentage: (r && r.percentage) || 0 });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      pushDiscount: slim(doc.pushDiscount),
      emailDiscount: slim(doc.emailDiscount),
      phoneDiscount: off(doc.phoneDiscount),
      bothDiscount: off(doc.bothDiscount),
      offerHeadline: doc.offerHeadline || 'Get a discount on your first order!',
      whatsappCapture: { enabled: !!(doc.whatsappCapture && doc.whatsappCapture.enabled) },
      birthdayCapture: {
        popup: { enabled: !!(doc.birthdayCapture && doc.birthdayCapture.popup && doc.birthdayCapture.popup.enabled) },
        banner: (function() {
          var bc = (doc.birthdayCapture && doc.birthdayCapture.banner) || {};
          var rawBg = String(bc.bgColor || '');
          return {
            enabled: !!bc.enabled,
            text: String(bc.text || '').slice(0, 120),
            buttonText: String(bc.buttonText || 'Get my gift').slice(0, 40),
            dismissDays: Math.max(1, Math.min(30, Number(bc.dismissDays || 7))),
            bgColor: /^#[0-9A-Fa-f]{6}$/.test(rawBg) ? rawBg : '#3730A3',
            textColor: ['auto', 'white', 'dark'].includes(bc.textColor) ? bc.textColor : 'auto',
            highlight: bc.highlight !== false,
          };
        }()),
        postOrder: { enabled: !!(doc.birthdayCapture && doc.birthdayCapture.postOrder && doc.birthdayCapture.postOrder.enabled) },
      },
      birthdayDiscount: {
        enabled: !!(doc.birthdayDiscount && doc.birthdayDiscount.enabled),
        percentage: (doc.birthdayDiscount && doc.birthdayDiscount.percentage) || 15,
        offerText: String((doc.birthdayDiscount && doc.birthdayDiscount.offerText) || '').trim().slice(0, 120),
        consentText: String((doc.birthdayDiscount && doc.birthdayDiscount.consentText) || "We'll use your birthday only to send you a birthday offer.").slice(0, 200),
      },
      quantityTiers: (function () {
        const qt = doc.quantityTiers || {};
        return {
          enabled: !!qt.enabled,
          heading: String(qt.heading || 'Buy more, save more').slice(0, 60),
          accentColor: /^#[0-9A-Fa-f]{6}$/.test(String(qt.accentColor || '')) ? qt.accentColor : '#4F46E5',
          layout: qt.layout === 'list' ? 'list' : 'cards',
          tiers: Array.isArray(qt.tiers)
            ? qt.tiers.map((t) => ({ minQty: t.minQty, percent: t.percent, badge: String(t.badge || '') }))
            : [],
        };
      }()),
    });
  } catch (err) {
    console.error('[proxy] GET /discount-config error:', err.message);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      pushDiscount: { enabled: false, percentage: 0 },
      emailDiscount: { enabled: false, percentage: 0 },
      phoneDiscount: { enabled: false, percentage: 0 },
      bothDiscount: { enabled: false, percentage: 0 },
      offerHeadline: 'Get a discount on your first order!',
      whatsappCapture: { enabled: false },
      birthdayCapture: {
        popup: { enabled: false },
        banner: { enabled: false, text: '', buttonText: 'Get my gift', dismissDays: 7, bgColor: '#3730A3', textColor: 'auto', highlight: true },
        postOrder: { enabled: false },
      },
      birthdayDiscount: { enabled: false, percentage: 15, offerText: '', consentText: "We'll use your birthday only to send you a birthday offer." },
      quantityTiers: { enabled: false, tiers: [], heading: 'Buy more, save more', accentColor: '#4F46E5', layout: 'cards' },
    });
  }
});

// ---------------------------------------------------------------------------
// discount-feature: the popup's Allow handler POSTs here after a successful
// subscribe to mint a Shopify discount code.
//   https://{shop}/apps/cartncodform/generate-discount?shop={shop}
// Body: { action, email?, phone?, sessionId }
// Public — App Proxy signature hard-enforced.
// ---------------------------------------------------------------------------
router.post('/generate-discount', async (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /generate-discount — rejecting');
    return res.status(403).json({ code: null, error: 'Invalid signature' });
  }

  // Phone / both discounts are retired — only push, email, and whatsapp pass.
  // Rejected before any config lookup or Shopify call.
  const action = String((req.body && req.body.action) || '').trim();
  if (action !== 'push' && action !== 'email' && action !== 'whatsapp') {
    return res.status(400).json({ error: 'Unsupported discount action' });
  }

  try {
    const shop = String(req.query.shop || req.body.shop || '').trim().toLowerCase();
    const ip = (req.headers && req.headers['x-forwarded-for'])
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
      : (req.socket && req.socket.remoteAddress) || '';
    const sessionId = (req.body && req.body.sessionId) ? String(req.body.sessionId).trim() : '';
    const result = await generateDiscount(shop, req.body || {}, { ip, sessionId });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    // Always echo the shop domain so the storefront can build /discount/<code>
    // redirect URLs client-side (result.shop wins when generateDiscount set it).
    return res.json({ shop, ...result });
  } catch (err) {
    console.error('[proxy] POST /generate-discount error:', err.message);
    return res.status(500).json({ code: null, error: 'Failed to generate discount' });
  }
});

// ---------------------------------------------------------------------------
// Birthday capture — storefront popup POSTs here after the visitor submits
// their birthday in the optional second step.
//   https://{shop}/apps/cartncodform/birthday?shop={shop}
// Body: { month: 1-12, day: 1-31, sessionId }
// Public — App Proxy signature hard-enforced.
// ---------------------------------------------------------------------------
const _bdayRateMap = {};
const _BDAY_RATE_WINDOW = 60 * 1000;
const _BDAY_RATE_LIMIT = 5;
function _bdayRateCheck(ip, shop, sessionId) {
  const key = (ip || '') + '|' + (shop || '') + '|' + (sessionId || '');
  const now = Date.now();
  if (!_bdayRateMap[key]) _bdayRateMap[key] = [];
  _bdayRateMap[key] = _bdayRateMap[key].filter((t) => now - t < _BDAY_RATE_WINDOW);
  if (_bdayRateMap[key].length >= _BDAY_RATE_LIMIT) return false;
  _bdayRateMap[key].push(now);
  return true;
}

// Days-in-month (Feb 29 allowed for leap-year birthdays).
const _BDAY_MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function _isValidBirthday(month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  return day <= _BDAY_MAX_DAY[month - 1];
}

const _BDAY_SOURCES = ['popup', 'banner', 'post_order', 'thank_you'];

router.post('/birthday', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /birthday — rejecting');
    return res.status(403).json({ ok: false, error: 'Invalid signature' });
  }
  try {
    const shop = String(req.query.shop || (req.body && req.body.shop) || '').trim().toLowerCase();
    const ip = req.headers && req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
      : (req.socket && req.socket.remoteAddress) || '';
    const sessionId = req.body && req.body.sessionId ? String(req.body.sessionId).trim() : '';
    const phone     = req.body && req.body.phone     ? String(req.body.phone).trim()     : '';

    if (!_bdayRateCheck(ip, shop, sessionId || phone)) {
      return res.status(429).json({ ok: false, error: 'Too many requests' });
    }

    // Whitelist source; anything unknown maps to 'popup'.
    const rawSource = req.body && req.body.source ? String(req.body.source) : '';
    const source = _BDAY_SOURCES.includes(rawSource) ? rawSource : 'popup';

    const config = await DiscountConfig.findOne({ shopDomain: shop }).lean();
    // Gate: at least one birthday capture method must be enabled.
    const anyEnabled = !!(config &&
      ((config.birthdayCapture && config.birthdayCapture.popup && config.birthdayCapture.popup.enabled) ||
       (config.birthdayCapture && config.birthdayCapture.banner && config.birthdayCapture.banner.enabled) ||
       (config.birthdayCapture && config.birthdayCapture.postOrder && config.birthdayCapture.postOrder.enabled)));
    if (!anyEnabled) {
      return res.status(403).json({ ok: false, error: 'Birthday capture not enabled' });
    }

    const month = parseInt(req.body && req.body.month, 10);
    const day = parseInt(req.body && req.body.day, 10);
    if (!_isValidBirthday(month, day)) {
      return res.status(400).json({ ok: false, error: 'Invalid birthday' });
    }

    const { upsertProfile } = require('../services/profileService');
    upsertProfile(
      shop,
      { phone: phone || null, sessionId: sessionId || null },
      {
        'birthday.month': month,
        'birthday.day': day,
        'birthday.capturedAt': new Date(),
        'birthday.source': source,
        lastSeenAt: new Date(),
      }
    ).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    console.error('[proxy] POST /birthday error:', err.message);
    return res.status(500).json({ ok: false, error: 'Failed to save birthday' });
  }
});

// ---------------------------------------------------------------------------
// COD order form — served from the merchant's own storefront domain via the
// App Proxy:  https://{shop}/apps/cartncodform/cod-form?productName=..&price=..
// Customer-facing HTML, so the App Proxy signature is HARD-enforced here.
// ---------------------------------------------------------------------------
router.get('/cod-form', async (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /cod-form — rejecting');
    return res.status(403).send('Invalid signature');
  }

  const shop = String(req.query.shop || '').trim().toLowerCase();
  const productName = String(req.query.productName || '');
  const price = String(req.query.price || '');
  const productId = String(req.query.productId || '');
  const quantityParam = Math.max(1, parseInt(req.query.quantity || '1', 10) || 1);

  const priceNum = Number(price);
  const priceLabel = price && !Number.isNaN(priceNum) ? priceNum.toFixed(2) : '—';

  // Load discount config — birthday flags + quantity tiers. Single query, both features.
  let postOrderEnabled = false;
  let birthdayPct = 15;
  let consentText = "We'll use your birthday only to send you a birthday offer.";
  let qtBoot = { enabled: false, tiers: [], heading: 'Buy more, save more', accentColor: '#4F46E5', layout: 'cards' };
  try {
    const cfg = await DiscountConfig.findOne({ shopDomain: shop }).lean();
    if (cfg) {
      postOrderEnabled = !!(cfg.birthdayCapture && cfg.birthdayCapture.postOrder && cfg.birthdayCapture.postOrder.enabled);
      birthdayPct = (cfg.birthdayDiscount && cfg.birthdayDiscount.percentage) || 15;
      consentText = String((cfg.birthdayDiscount && cfg.birthdayDiscount.consentText) || consentText).slice(0, 200);
      const qt = cfg.quantityTiers;
      if (qt && qt.enabled && Array.isArray(qt.tiers) && qt.tiers.length > 0) {
        qtBoot = {
          enabled: true,
          tiers: qt.tiers.map((t) => ({ minQty: t.minQty, percent: t.percent, badge: String(t.badge || '') })),
          heading: String(qt.heading || 'Buy more, save more').slice(0, 60),
          accentColor: qt.accentColor || '#4F46E5',
          layout: qt.layout || 'cards',
        };
      }
    }
  } catch (_) { /* keep defaults */ }

  // Values handed to the inline script — JSON-encoded, with "<" neutralised so
  // the payload can never break out of the <script> element.
  const bootJson = JSON.stringify({
    shop, productName, price, productId,
    quantity: quantityParam,
    postOrderEnabled, birthdayPct, consentText,
    quantityTiers: qtBoot,
  }).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Cash on Delivery Order</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f4f4f5;
    color: #18181b;
    padding: 24px 16px;
  }
  .wrap { max-width: 480px; margin: 0 auto; }
  .card {
    background: #fff;
    border: 1px solid #e4e4e7;
    border-radius: 14px;
    padding: 22px;
  }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .shop { font-size: 12px; color: #a1a1aa; margin: 0 0 16px; }
  .summary {
    background: #f4f4f5;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 18px;
  }
  .summary .p-name { font-weight: 600; font-size: 14px; }
  .summary .p-price { font-size: 14px; color: #52525b; margin-top: 3px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
  label .req { color: #dc2626; }
  input, textarea {
    width: 100%;
    border: 1px solid #d4d4d8;
    border-radius: 8px;
    padding: 9px 11px;
    font-size: 14px;
    font-family: inherit;
  }
  input:focus, textarea:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 1px #4f46e5; }
  .row { display: flex; gap: 12px; }
  .row > div { flex: 1; }
  button {
    width: 100%;
    margin-top: 18px;
    border: 0;
    border-radius: 9px;
    background: #4f46e5;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    padding: 11px 16px;
  }
  button:disabled { opacity: .6; }
  .msg { margin-top: 14px; font-size: 13px; }
  .msg.err { color: #dc2626; }
  .ok {
    text-align: center;
    padding: 12px 0;
  }
  .ok .tick { font-size: 40px; }
  .ok h2 { font-size: 17px; margin: 10px 0 6px; }
  .ok p { font-size: 13px; color: #52525b; margin: 0; }
  .bday-ask { border-top: 1px solid #e4e4e7; margin-top: 16px; padding-top: 16px; }
  .bday-ask p { font-size: 13px; font-weight: 600; color: #18181b; margin: 0 0 12px; }
  .bday-consent { font-size: 11px; color: #71717a; margin-bottom: 12px; line-height: 1.4; }
  .bday-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .bday-row select { flex: 1; height: 36px; font-size: 13px; padding: 0 8px; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; color: #18181b; }
  .bday-btn { width: 100%; padding: 10px; background: #4f46e5; color: #fff; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; cursor: pointer; min-height: 44px; margin-bottom: 8px; }
  .bday-skip { width: 100%; background: none; border: none; color: #a1a1aa; font-size: 12px; cursor: pointer; padding: 8px; min-height: 44px; }
  .bday-err { font-size: 11px; color: #dc2626; margin-top: 4px; display: none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card" id="card">
    <h1>Cash on Delivery Order</h1>
    <p class="shop">${escapeHtml(shop)}</p>

    <div class="summary" id="ccf-summary">
      <div class="p-name">${escapeHtml(productName || 'Product')}</div>
      <div class="p-price" id="ccf-price-line">Price: <strong>${escapeHtml(priceLabel)}</strong></div>
    </div>

    <form id="cod-form" novalidate>
      <label>Full Name <span class="req">*</span></label>
      <input type="text" name="name" autocomplete="name" />

      <label>Phone Number <span class="req">*</span></label>
      <input type="tel" name="phone" autocomplete="tel" />

      <label for="ccf-email">Email (optional — for order updates)</label>
      <input type="email" id="ccf-email" name="email" placeholder="you@example.com" autocomplete="email" />

      <label>Full Address <span class="req">*</span></label>
      <textarea name="address" rows="3" autocomplete="street-address"></textarea>

      <div class="row">
        <div>
          <label>City</label>
          <input type="text" name="city" autocomplete="address-level2" />
        </div>
        <div>
          <label>Pincode</label>
          <input type="text" name="pincode" autocomplete="postal-code" inputmode="numeric" />
        </div>
      </div>

      <label>Quantity</label>
      <input type="number" name="quantity" min="1" value="${escapeHtml(String(quantityParam))}" inputmode="numeric" />

      <div class="msg err" id="err" style="display:none"></div>

      <button type="submit" id="submit-btn">Place COD Order</button>
    </form>
  </div>
</div>

<script>
(function () {
  var BOOT = ${bootJson};
  var form = document.getElementById('cod-form');
  var btn = document.getElementById('submit-btn');
  var errBox = document.getElementById('err');
  var card = document.getElementById('card');
  var priceLine = document.getElementById('ccf-price-line');
  var QT = BOOT.quantityTiers || {};

  function showError(text) {
    errBox.textContent = text;
    errBox.style.display = 'block';
  }

  // ── Tier discount helpers (must match backend/utils/quantityTiers.js) ──────
  function qtPickTier(tiers, qty) {
    if (!Array.isArray(tiers) || !tiers.length) return null;
    if (typeof qty !== 'number' || qty < 1) return null;
    var best = null;
    for (var i = 0; i < tiers.length; i++) {
      if (tiers[i].minQty <= qty) best = tiers[i];
    }
    return best;
  }
  function qtDiscountedUnit(price, pct) {
    var raw = price * (1 - pct / 100);
    return Math.round((raw + 1e-10) * 100) / 100;
  }
  function qtFmtRs(n) { return '\\u20b9' + n.toFixed(2); }

  function updateSummary() {
    if (!priceLine) return;
    var qtyInput = form.querySelector('input[name="quantity"]');
    var qty = qtyInput ? (Number(qtyInput.value) || 1) : 1;
    var price = Number(BOOT.price) || 0;
    var tier = QT.enabled ? qtPickTier(QT.tiers, qty) : null;
    if (tier) {
      var discUnit = qtDiscountedUnit(price, tier.percent);
      var total = Math.round(discUnit * qty * 100) / 100;
      var orig = Math.round(price * qty * 100) / 100;
      var saving = Math.round((orig - total) * 100) / 100;
      priceLine.innerHTML = '';
      var t = document.createTextNode(
        qty + ' × ' + qtFmtRs(discUnit) + ' = ' + qtFmtRs(total) +
        ' — ' + tier.percent + '% off'
      );
      priceLine.appendChild(t);
      var s = document.createElement('span');
      s.style.cssText = 'display:block;font-size:12px;color:#16a34a;margin-top:2px;';
      s.textContent = 'You save ' + qtFmtRs(saving);
      priceLine.appendChild(s);
    } else {
      priceLine.innerHTML = '';
      var label = document.createElement('span');
      label.textContent = 'Price: ';
      var strong = document.createElement('strong');
      strong.textContent = qtFmtRs(price) + (qty > 1 ? ' × ' + qty + ' = ' + qtFmtRs(price * qty) : '');
      priceLine.appendChild(label);
      priceLine.appendChild(strong);
    }
  }

  // Update summary on quantity change
  var qtyInputEl = form.querySelector('input[name="quantity"]');
  if (qtyInputEl) {
    qtyInputEl.addEventListener('input', updateSummary);
    qtyInputEl.addEventListener('change', updateSummary);
  }
  updateSummary();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.style.display = 'none';

    var data = new FormData(form);
    var name = (data.get('name') || '').trim();
    var phone = (data.get('phone') || '').trim();
    var address = (data.get('address') || '').trim();

    if (!name || !phone || !address) {
      showError('Name, phone and address are required.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    fetch('/apps/cartncodform/cod-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopDomain: BOOT.shop,
        name: name,
        phone: phone,
        address: address,
        email: (data.get('email') || '').trim(),
        city: (data.get('city') || '').trim(),
        pincode: (data.get('pincode') || '').trim(),
        quantity: Number(data.get('quantity')) || 1,
        productName: BOOT.productName,
        productPrice: Number(BOOT.price) || 0,
        productId: BOOT.productId
      })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.body.success) {
          throw new Error((result.body && result.body.error) || 'Order failed. Please try again.');
        }
        card.innerHTML = '';
        var ok = document.createElement('div');
        ok.className = 'ok';
        var tick = document.createElement('div');
        tick.className = 'tick';
        tick.textContent = '✅';
        var h2 = document.createElement('h2');
        h2.textContent = 'Order placed!';
        var p = document.createElement('p');
        p.textContent = 'We'll confirm via WhatsApp/call soon.';
        ok.appendChild(tick);
        ok.appendChild(h2);
        ok.appendChild(p);
        card.appendChild(ok);

        // Post-order birthday ask: shown on first COD order when enabled and
        // the customer has not already provided their birthday (server + localStorage).
        if (BOOT.postOrderEnabled && result.body.isFirstOrder && !result.body.hasBirthday) {
          var bdKey = 'ccf_bday_' + BOOT.shop;
          var bdSaved = false;
          try { bdSaved = !!localStorage.getItem(bdKey); } catch (e) {}
          if (!bdSaved) {
            var bdAsk = document.createElement('div');
            bdAsk.className = 'bday-ask';

            var bdP = document.createElement('p');
            bdP.textContent = 'One more thing — Share your birthday for ' + BOOT.birthdayPct + '% off on the day.';
            bdAsk.appendChild(bdP);

            var bdConsent = document.createElement('div');
            bdConsent.className = 'bday-consent';
            bdConsent.textContent = BOOT.consentText;
            bdAsk.appendChild(bdConsent);

            var bdRow = document.createElement('div');
            bdRow.className = 'bday-row';
            var MONTHS = ['Month','January','February','March','April','May','June','July','August','September','October','November','December'];
            var bdMonth = document.createElement('select');
            bdMonth.setAttribute('aria-label', 'Birthday month');
            for (var bmi = 0; bmi < MONTHS.length; bmi++) {
              var bmo = document.createElement('option');
              bmo.value = String(bmi);
              bmo.textContent = MONTHS[bmi];
              bdMonth.appendChild(bmo);
            }
            bdRow.appendChild(bdMonth);
            var bdDay = document.createElement('select');
            bdDay.setAttribute('aria-label', 'Birthday day');
            bdDay.style.width = '84px';
            var bdo0 = document.createElement('option');
            bdo0.value = '0'; bdo0.textContent = 'Day'; bdDay.appendChild(bdo0);
            for (var bdi = 1; bdi <= 31; bdi++) {
              var bdo = document.createElement('option');
              bdo.value = String(bdi); bdo.textContent = String(bdi); bdDay.appendChild(bdo);
            }
            bdRow.appendChild(bdDay);
            bdAsk.appendChild(bdRow);

            var bdBtn = document.createElement('button');
            bdBtn.type = 'button'; bdBtn.className = 'bday-btn';
            bdBtn.textContent = 'Save my birthday';
            bdAsk.appendChild(bdBtn);

            var bdSkip = document.createElement('button');
            bdSkip.type = 'button'; bdSkip.className = 'bday-skip';
            bdSkip.textContent = 'Skip';
            bdAsk.appendChild(bdSkip);

            var bdErr = document.createElement('div');
            bdErr.className = 'bday-err';
            bdAsk.appendChild(bdErr);

            card.appendChild(bdAsk);

            bdSkip.addEventListener('click', function() {
              try { bdAsk.parentNode.removeChild(bdAsk); } catch (_) {}
            });

            bdBtn.addEventListener('click', function() {
              var m = parseInt(bdMonth.value, 10);
              var d = parseInt(bdDay.value, 10);
              if (!m || !d) {
                bdErr.textContent = 'Please select a month and day.';
                bdErr.style.display = '';
                return;
              }
              bdErr.style.display = 'none';
              bdBtn.disabled = true; bdBtn.textContent = 'Saving…';
              fetch(window.location.origin + '/apps/cartncodform/birthday?shop=' + encodeURIComponent(BOOT.shop), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: m, day: d, source: 'post_order', phone: phone })
              })
                .then(function() {
                  try { localStorage.setItem(bdKey, '1'); } catch (e) {}
                  bdAsk.innerHTML = '';
                  var thanks = document.createElement('p');
                  thanks.style.cssText = 'text-align:center;font-size:13px;color:#16a34a;margin:8px 0 0;';
                  thanks.textContent = 'Birthday saved! Your offer will arrive on your birthday.';
                  bdAsk.appendChild(thanks);
                })
                .catch(function() {
                  bdBtn.disabled = false; bdBtn.textContent = 'Save my birthday';
                });
            });
          }
        }
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Place COD Order';
        showError(err.message || 'Something went wrong. Please try again.');
      });
  });
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(html);
});

// ---------------------------------------------------------------------------
// COD order submission — the /cod-form page POSTs here through the App Proxy.
// Public storefront route: no requireAuth, protected only by the App Proxy
// signature (hard-enforced).
// ---------------------------------------------------------------------------
router.post('/cod-order', async (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /cod-order — rejecting');
    return res.status(403).json({ success: false, error: 'Invalid signature' });
  }

  try {
    const shop = String(req.query.shop || req.body.shopDomain || '').trim().toLowerCase();
    const {
      name,
      phone,
      email,
      address,
      city,
      pincode,
      quantity,
      productName,
      productPrice,
    } = req.body;

    if (!shop || !name || !phone || !address) {
      return res
        .status(400)
        .json({ success: false, error: 'shop, name, phone and address are required' });
    }

    const cleanEmail = String(email || '').trim();
    const cleanQty = Math.max(1, Number(quantity) || 1);
    const cleanPrice = Number(productPrice) || 0;

    // Compute tier discount server-side from saved config — never trust client values.
    let tierDiscount = { percent: 0, amount: 0 };
    try {
      const { pickTier, discountedUnitPrice } = require('../utils/quantityTiers');
      const cfg = await DiscountConfig.findOne({ shopDomain: shop }).lean();
      const qt = cfg && cfg.quantityTiers;
      if (qt && qt.enabled && Array.isArray(qt.tiers) && qt.tiers.length > 0) {
        const tier = pickTier(qt.tiers, cleanQty);
        if (tier) {
          const discUnit = discountedUnitPrice(cleanPrice, tier.percent);
          const saving = Math.round((cleanPrice - discUnit) * cleanQty * 100) / 100;
          tierDiscount = { percent: tier.percent, amount: saving };
        }
      }
    } catch (_) {}

    const order = await CodOrder.create({
      shopDomain: shop,
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: cleanEmail,
      address: String(address).trim(),
      city: String(city || '').trim(),
      pincode: String(pincode || '').trim(),
      productName: String(productName || '').trim(),
      productPrice: cleanPrice,
      quantity: cleanQty,
      tierDiscount,
      status: 'pending',
    });

    console.log(`[proxy] New COD order for ${order.shopDomain} — orderId: ${order._id}`);

    // Phase D: link the captured email to the phone-anchored profile.
    const { upsertProfile } = require('../services/profileService');
    upsertProfile(shop, { phone: String(phone).trim(), email: cleanEmail || null }, {
      ...(cleanEmail
        ? {
            'channels.email.address': cleanEmail.toLowerCase(),
            'channels.email.source': 'cod',
            'channels.email.capturedAt': new Date(),
          }
        : {}),
      lastSeenAt: new Date(),
    }).catch((err) => console.error('[profile] cod-proxy upsert error:', err.message));

    // Notify the store owner — same fire-and-forget notifications as
    // routes/cod.js POST /order.
    const store = await Store.findOne({ shopDomain: order.shopDomain });
    const ownerEmail = (store && store.ownerEmail) || process.env.TEST_OWNER_EMAIL;
    if (ownerEmail) {
      sendNewCodOrderEmail(order, ownerEmail);
      console.log(`[proxy] New COD order email triggered for owner`);
    } else {
      console.log('[proxy] No owner email available — skipping notification');
    }

    sendPushToStore(
      order.shopDomain,
      '📦 New COD Order',
      `${order.name} placed a COD order for ${order.productName}`
    );

    // Determine if this is the customer's first COD order (for the post-order birthday ask).
    // Cancelled orders are excluded — they never materialised.
    let isFirstOrder = false;
    let hasBirthday = false;
    try {
      const rawPhone = String(phone).trim();
      const orderCount = await CodOrder.countDocuments({
        shopDomain: shop,
        phone: rawPhone,
        status: { $ne: 'cancelled' },
      });
      isFirstOrder = orderCount === 1;

      if (isFirstOrder) {
        const { normalizePhone } = require('../utils/phone');
        const Profile = require('../models/Profile');
        const e164 = normalizePhone(rawPhone, 'IN') || rawPhone;
        const bdProf = await Profile.findOne({
          shopDomain: shop,
          'identifiers.phones': { $in: [e164, rawPhone] },
          'birthday.month': { $exists: true, $ne: null },
          'birthday.day':   { $exists: true, $ne: null },
        }).select('_id').lean();
        hasBirthday = !!bdProf;
      }
    } catch (_) {}

    return res.status(201).json({ success: true, orderId: order._id, isFirstOrder, hasBirthday });
  } catch (err) {
    console.error('[proxy] POST /cod-order error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save COD order' });
  }
});

// Proxy route for storefront push subscription (avoids cross-origin CORS block)
router.post('/subscribe-customer', async (req, res) => {
  try {
    // Validate Shopify App Proxy signature
    const shop = req.query.shop || req.body.shopDomain;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop' });
    }

    // Forward to the same CustomerPushSubscription upsert logic
    const CustomerPushSubscription = require('../models/CustomerPushSubscription');

    const { token, oldToken, deviceType, cartToken, customerId, ccfSessionId, page } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    const normalizedCartToken = cartToken ? cartToken.split('?')[0].trim() || undefined : undefined;

    // Remove old token if rotated
    if (oldToken && oldToken !== token) {
      await CustomerPushSubscription.deleteOne({ token: oldToken });
      console.log(`[proxy:subscribe] Removed old token for: ${shop}`);
    }

    // Upsert new token
    const result = await CustomerPushSubscription.findOneAndUpdate(
      { token },
      {
        shopDomain: shop,
        token,
        page: page || undefined,
        deviceType: deviceType || 'unknown',
        cartToken: normalizedCartToken || undefined,
        customerId: customerId || undefined,
        ccfSessionId: ccfSessionId || undefined,
        lastActivityAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Remove any OTHER rows with the same cartToken but a different
    // FCM token — prevents same-cart multi-row accumulation. Mirrors
    // the same cleanup in routes/push.js POST /subscribe-customer.
    if (normalizedCartToken) {
      await CustomerPushSubscription.deleteMany({
        shopDomain: shop,
        cartToken: normalizedCartToken,
        token: { $ne: token }
      });
    }

    // Identity resolution — fire-and-forget, never on the critical path.
    // Mirrors the same call in routes/push.js POST /subscribe-customer.
    const { upsertProfile } = require('../services/profileService');
    upsertProfile(shop, {
      sessionId: ccfSessionId,
      cartToken: normalizedCartToken,
      pushToken: token,
    }, {
      'channels.push.subscribed': true,
      'channels.push.lastToken': token,
      'channels.push.subscribedAt': new Date(),
      lastSeenAt: new Date(),
    }).catch((err) => console.error('[profile] upsert error:', err.message));

    console.log(`[proxy:subscribe] Token saved for: ${shop}, deviceType: ${deviceType}, tokenSnippet: ${token.slice(-8)}`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[proxy:subscribe] Error:', err.message);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }
});

router.get('/festivals', function (req, res) {
  try {
    const festivals = require('../data/festivals.json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json(festivals);
  } catch (err) {
    console.error('[proxy:festivals] error:', err.message);
    return res.status(500).json({ error: 'Failed to load festivals' });
  }
});

module.exports = router;
