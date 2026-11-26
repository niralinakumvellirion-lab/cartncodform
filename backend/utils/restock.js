'use strict';

/**
 * "Back in stock" — pure helpers shared by the admin route, the App Proxy route and the sender.
 * Settings defaults + caps, subscribe-body checks, and message building ({product} / {size}).
 */

const TEXT_DEFAULTS = {
  boxTitle: 'Sold out in this size',
  boxText: 'Get a message the moment it’s back.',
  buttonText: 'Notify me',
  emailPlaceholder: 'Your email',
  successText: 'Done! We’ll tell you when {size} is back.',
  pushTitle: '{product} is back in stock 🎉',
  pushBody: 'Good news! {size} is available again. Tap to grab it before it sells out.',
  emailSubject: '{product} is back in stock',
  emailBody: 'Good news! {product} ({size}) is available again. Grab it before it sells out.',
  whatsappPlaceholder: 'WhatsApp number',
  whatsappHint: 'Fastest · we message you the moment it’s back',
  emailHint: 'We email you within {time} of the restock',
  whatsappMessage: 'Hi! Good news — {product} ({size}) is back in stock. Get it here before it sells out: {link}',
};

const TEXT_MAX = {
  boxTitle: 60,
  boxText: 90,
  buttonText: 30,
  emailPlaceholder: 40,
  successText: 90,
  pushTitle: 65,
  pushBody: 160,
  emailSubject: 90,
  emailBody: 400,
  whatsappPlaceholder: 40,
  whatsappHint: 80,
  emailHint: 80,
  whatsappMessage: 300,
};

// Minutes email alerts wait after a restock (WhatsApp and push go first).
const EMAIL_DELAYS = [0, 30, 60, 120, 240, 720];
const DEFAULT_EMAIL_DELAY = 60;

const MAX_RADIUS = 24;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[A-Za-z]{2,24}$/;
const ID_RE = /^\d{1,20}$/;
const TOKEN_RE = /^[A-Za-z0-9_:\-.]{20,4096}$/;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{0,254}$/;
const E164_RE = /^\+\d{8,15}$/;

// How long a shopper waits before the request quietly expires.
const REQUEST_DAYS = 60;

function validationError(message, field) {
  const e = new Error(message);
  e.isValidation = true;
  e.field = field;
  return e;
}

function str(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function cleanRadius(v) {
  const n = Math.round(Number(v));
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) return 8;
  return Math.min(MAX_RADIUS, Math.max(0, n));
}

function cleanDelay(v) {
  const n = Number(v);
  return EMAIL_DELAYS.includes(n) ? n : DEFAULT_EMAIL_DELAY;
}

/** "1 hour", "30 minutes", "a few minutes" — for the email hint's {time}. */
function delayLabel(minutes) {
  const m = cleanDelay(minutes);
  if (m === 0) return 'a few minutes';
  if (m < 60) return `${m} minutes`;
  const h = m / 60;
  return h === 1 ? '1 hour' : `${h} hours`;
}

/** Saved texts: only known keys, trimmed and capped. An empty text falls back to the default later. */
function cleanTexts(texts) {
  const out = {};
  if (!texts || typeof texts !== 'object') return out;
  for (const k of Object.keys(TEXT_DEFAULTS)) {
    if (texts[k] != null) out[k] = str(texts[k], TEXT_MAX[k]);
  }
  return out;
}

/** Admin PUT body → clean settings. Throws a validation error for a bad colour or no channel. */
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
    emailDelayMinutes: cleanDelay(s.emailDelayMinutes),
    accentColor: accent,
    buttonRadius: cleanRadius(s.buttonRadius),
    texts: cleanTexts(s.texts),
  };
}

/** Saved doc (or null) → full settings with defaults. */
function withDefaults(doc) {
  const d = doc || {};
  const ch = d.channels || {};
  return {
    enabled: d.enabled === true,
    channels: { push: ch.push !== false, email: ch.email !== false, whatsapp: ch.whatsapp === true },
    emailDelayMinutes: cleanDelay(d.emailDelayMinutes),
    accentColor: HEX_RE.test(d.accentColor || '') ? d.accentColor : '#111827',
    buttonRadius: cleanRadius(d.buttonRadius),
    texts: { ...TEXT_DEFAULTS, ...cleanTexts(d.texts) },
  };
}

/** What the storefront needs (no message texts, no bookkeeping). */
function publicSettings(doc) {
  const s = withDefaults(doc);
  return {
    enabled: s.enabled,
    channels: s.channels,
    accentColor: s.accentColor,
    buttonRadius: s.buttonRadius,
    texts: {
      boxTitle: s.texts.boxTitle || TEXT_DEFAULTS.boxTitle,
      boxText: s.texts.boxText || TEXT_DEFAULTS.boxText,
      buttonText: s.texts.buttonText || TEXT_DEFAULTS.buttonText,
      emailPlaceholder: s.texts.emailPlaceholder || TEXT_DEFAULTS.emailPlaceholder,
      successText: s.texts.successText || TEXT_DEFAULTS.successText,
      whatsappPlaceholder: s.texts.whatsappPlaceholder || TEXT_DEFAULTS.whatsappPlaceholder,
      whatsappHint: s.texts.whatsappHint || TEXT_DEFAULTS.whatsappHint,
      emailHint: (s.texts.emailHint || TEXT_DEFAULTS.emailHint).replace(/\{time\}/g, delayLabel(s.emailDelayMinutes)),
    },
  };
}

/**
 * Storefront subscribe body → clean request fields, or throws a validation error.
 * { productId, variantId, productTitle, variantTitle, productHandle, imageUrl, channel, email|pushToken, sessionId }
 */
function sanitizeSubscribe(body) {
  const b = body && typeof body === 'object' ? body : {};
  const productId = String(b.productId || '');
  const variantId = String(b.variantId || '');
  if (!ID_RE.test(productId) || !ID_RE.test(variantId)) throw validationError('Pick a size first', 'variantId');
  const channel = ['push', 'email', 'whatsapp'].includes(b.channel) ? b.channel : null;
  if (!channel) throw validationError('Choose how to be notified', 'channel');

  const out = {
    productId,
    variantId,
    productTitle: str(b.productTitle, 200),
    variantTitle: str(b.variantTitle, 120),
    productHandle: HANDLE_RE.test(String(b.productHandle || '')) ? String(b.productHandle) : '',
    imageUrl: /^https:\/\/[^\s"'<>]{1,500}$/.test(String(b.imageUrl || '')) ? String(b.imageUrl) : '',
    channel,
    email: null,
    pushToken: null,
    phone: null,
    sessionId: SESSION_RE.test(String(b.sessionId || '')) ? String(b.sessionId) : null,
  };
  if (channel === 'email') {
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw validationError('Enter a valid email', 'email');
    out.email = email;
  } else if (channel === 'whatsapp') {
    const { normalizePhone } = require('./phone');
    const phone = normalizePhone(String(b.phone || '').replace(/[\s()-]/g, ''), 'IN');
    if (!phone || !E164_RE.test(phone)) throw validationError('Enter a valid WhatsApp number', 'phone');
    out.phone = phone;
  } else {
    const token = String(b.pushToken || '');
    if (!TOKEN_RE.test(token)) throw validationError('Allow notifications to get a push', 'pushToken');
    out.pushToken = token;
  }
  return out;
}

/** "M" / "M / Red" — or "it" for products without options ("Default Title"). */
function sizeLabel(variantTitle) {
  const t = String(variantTitle || '').trim();
  return t && t !== 'Default Title' ? t : 'it';
}

function fill(template, request, link) {
  return String(template || '')
    .replace(/\{link\}/g, link || '')
    .replace(/\{product\}/g, request.productTitle || 'Your item')
    .replace(/\{size\}/g, sizeLabel(request.variantTitle));
}

/** Product page link with the variant picked (+ attribution params). */
function productUrl(shopDomain, request, src, jobId) {
  const base = request.productHandle
    ? `https://${shopDomain}/products/${request.productHandle}`
    : `https://${shopDomain}`;
  const params = [];
  if (request.productHandle) params.push(`variant=${request.variantId}`);
  if (src) params.push(`ccf_src=${src}`);
  if (jobId) params.push(`ccf_job=${jobId}`);
  return params.length ? `${base}?${params.join('&')}` : base;
}

/** Final message for one request, resolved at send time from the saved texts. */
function buildMessage(settings, request, shopDomain, jobId) {
  const t = { ...TEXT_DEFAULTS, ...((settings && settings.texts) || {}) };
  const pick = (k) => (t[k] && String(t[k]).trim()) || TEXT_DEFAULTS[k];
  if (request.channel === 'whatsapp') {
    const url = productUrl(shopDomain, request, 'whatsapp', jobId);
    const text = fill(pick('whatsappMessage'), request, url).slice(0, 700);
    return { text, url, waLink: waLink(request.phone, text) };
  }
  if (request.channel === 'email') {
    return {
      subject: fill(pick('emailSubject'), request).slice(0, 150),
      body: fill(pick('emailBody'), request).slice(0, 600),
      url: productUrl(shopDomain, request, 'email', jobId),
    };
  }
  return {
    title: fill(pick('pushTitle'), request).slice(0, 100),
    body: fill(pick('pushBody'), request).slice(0, 200),
    url: productUrl(shopDomain, request, 'push', jobId),
  };
}

/** wa.me link that opens WhatsApp to this number with the message typed in. */
function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text || '')}`;
}

function expiresAt(now = new Date()) {
  return new Date(now.getTime() + REQUEST_DAYS * 24 * 60 * 60 * 1000);
}

module.exports = {
  TEXT_DEFAULTS,
  TEXT_MAX,
  REQUEST_DAYS,
  EMAIL_DELAYS,
  delayLabel,
  waLink,
  sanitizeSettings,
  withDefaults,
  publicSettings,
  sanitizeSubscribe,
  sizeLabel,
  fill,
  productUrl,
  buildMessage,
  expiresAt,
};
