'use strict';

/**
 * "Price drop" — pure helpers: settings defaults + caps, money formatting and message building
 * ({product}, {size}, {price}, {oldPrice}, {link}). Sign-up checks are shared with Back in stock
 * (utils/restock.js sanitizeSubscribe).
 */

const restock = require('./restock');

const TEXT_DEFAULTS = {
  triggerText: 'Notify me if the price drops',
  boxTitle: 'Now {price}',
  chanceLabel: 'Your chance to be notified',
  boxText: 'We’ll tell you the moment it gets cheaper.',
  buttonText: 'Notify me',
  emailPlaceholder: 'Your email',
  whatsappPlaceholder: 'WhatsApp number',
  whatsappHint: 'Fastest · we message you the moment the price drops',
  emailHint: 'We email you when the price drops',
  partialText: 'Done! Add {next} too to reach 100%.',
  successText: 'Done! We’ll tell you when the price drops.',
  pushTitle: 'Price drop! {product} is now {price}',
  pushBody: 'Was {oldPrice}, now {price}. Grab it before the sale ends.',
  emailSubject: '{product} is now {price}',
  emailBody: 'Good news! {product} dropped from {oldPrice} to {price}. Grab it before the sale ends.',
  whatsappMessage: 'Hi! Good news — {product} is now {price} (was {oldPrice}). Get it here: {link}',
};

const TEXT_MAX = {
  triggerText: 40, boxTitle: 60, chanceLabel: 50, boxText: 90, buttonText: 30, emailPlaceholder: 40,
  whatsappPlaceholder: 40, whatsappHint: 80, emailHint: 80, partialText: 90, successText: 90,
  pushTitle: 65, pushBody: 160, emailSubject: 90, emailBody: 400, whatsappMessage: 300,
};

const DROP_STEPS = [1, 3, 5, 10, 15, 20, 25, 30, 40, 50];
const DEFAULT_DROP = 5;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validationError(message, field) {
  const e = new Error(message);
  e.isValidation = true;
  e.field = field;
  return e;
}
function str(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function cleanTexts(texts) {
  const out = {};
  if (!texts || typeof texts !== 'object') return out;
  for (const k of Object.keys(TEXT_DEFAULTS)) if (texts[k] != null) out[k] = str(texts[k], TEXT_MAX[k]);
  return out;
}
function cleanDrop(v) {
  const n = Math.round(Number(v));
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) return DEFAULT_DROP;
  return Math.min(90, Math.max(1, n));
}
function cleanPercent(v) {
  const n = Math.round(Number(v));
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) return 80;
  return Math.min(100, Math.max(0, n));
}
function cleanRadius(v) {
  const n = Math.round(Number(v));
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) return 8;
  return Math.min(24, Math.max(0, n));
}

function sanitizeSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  const accent = String(s.accentColor || '#111827').trim();
  if (!HEX_RE.test(accent)) throw validationError('Use a colour like #111827', 'accentColor');
  const ch = s.channels && typeof s.channels === 'object' ? s.channels : {};
  const channels = { push: ch.push !== false, email: ch.email !== false, whatsapp: ch.whatsapp === true };
  if (!channels.push && !channels.email && !channels.whatsapp) {
    throw validationError('Keep at least one way to notify shoppers', 'channels');
  }
  return {
    enabled: s.enabled === true,
    channels,
    minDropPercent: cleanDrop(s.minDropPercent),
    whatsappPercent: cleanPercent(s.whatsappPercent),
    accentColor: accent,
    buttonRadius: cleanRadius(s.buttonRadius),
    texts: cleanTexts(s.texts),
  };
}

function withDefaults(doc) {
  const d = doc || {};
  const ch = d.channels || {};
  return {
    enabled: d.enabled === true,
    channels: { push: ch.push !== false, email: ch.email !== false, whatsapp: ch.whatsapp === true },
    minDropPercent: cleanDrop(d.minDropPercent),
    whatsappPercent: cleanPercent(d.whatsappPercent),
    accentColor: HEX_RE.test(d.accentColor || '') ? d.accentColor : '#111827',
    buttonRadius: cleanRadius(d.buttonRadius),
    texts: { ...TEXT_DEFAULTS, ...cleanTexts(d.texts) },
  };
}

const PUBLIC_TEXTS = ['triggerText', 'boxTitle', 'chanceLabel', 'boxText', 'buttonText', 'emailPlaceholder',
  'whatsappPlaceholder', 'whatsappHint', 'emailHint', 'partialText', 'successText'];

/** What the storefront needs (no message texts, no bookkeeping). */
function publicSettings(doc) {
  const s = withDefaults(doc);
  const texts = {};
  for (const k of PUBLIC_TEXTS) texts[k] = s.texts[k] || TEXT_DEFAULTS[k];
  return {
    enabled: s.enabled,
    channels: s.channels,
    percent: { whatsapp: s.whatsappPercent, email: 100 - s.whatsappPercent },
    minDropPercent: s.minDropPercent,
    accentColor: s.accentColor,
    buttonRadius: s.buttonRadius,
    texts,
  };
}

/** ₹1,199 / ₹1,199.50 / $19.99 — shop currency, Indian grouping for INR. */
function formatMoney(amount, currencyCode) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const code = /^[A-Z]{3}$/.test(String(currencyCode || '')) ? currencyCode : 'INR';
  const whole = Math.abs(n % 1) < 0.005;
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency: code, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2,
    }).format(n);
  } catch (e) {
    return `${code} ${n.toFixed(whole ? 0 : 2)}`;
  }
}

/** True when `price` is at least minDropPercent below `basePrice`. */
function isDrop(basePrice, price, minDropPercent) {
  const b = Number(basePrice);
  const p = Number(price);
  if (!(b > 0) || !(p >= 0)) return false;
  return p <= b * (1 - cleanDrop(minDropPercent) / 100) + 1e-9;
}

function fill(template, request, link) {
  return String(template || '')
    .replace(/\{link\}/g, link || '')
    .replace(/\{product\}/g, request.productTitle || 'Your item')
    .replace(/\{size\}/g, restock.sizeLabel(request.variantTitle))
    .replace(/\{price\}/g, formatMoney(request.dropPrice, request.currencyCode))
    .replace(/\{oldPrice\}/g, formatMoney(request.basePrice, request.currencyCode));
}

/** Final message for one request (push / email / whatsapp), resolved at send time. */
function buildMessage(settings, request, shopDomain, jobId) {
  const t = { ...TEXT_DEFAULTS, ...((settings && settings.texts) || {}) };
  const pick = (k) => (t[k] && String(t[k]).trim()) || TEXT_DEFAULTS[k];
  const url = restock.productUrl(shopDomain, request, request.channel, jobId);
  if (request.channel === 'whatsapp') {
    const text = fill(pick('whatsappMessage'), request, url).slice(0, 700);
    return { text, url, waLink: restock.waLink(request.phone, text) };
  }
  if (request.channel === 'email') {
    return { subject: fill(pick('emailSubject'), request).slice(0, 150), body: fill(pick('emailBody'), request).slice(0, 600), url };
  }
  return { title: fill(pick('pushTitle'), request).slice(0, 100), body: fill(pick('pushBody'), request).slice(0, 200), url };
}

module.exports = {
  TEXT_DEFAULTS,
  TEXT_MAX,
  DROP_STEPS,
  sanitizeSettings,
  withDefaults,
  publicSettings,
  sanitizeSubscribe: restock.sanitizeSubscribe,
  expiresAt: restock.expiresAt,
  formatMoney,
  isDrop,
  buildMessage,
};
