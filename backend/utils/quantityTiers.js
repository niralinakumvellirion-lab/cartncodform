'use strict';

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_ACCENT = '#4F46E5';

/**
 * Validates and normalises a raw tiers array from user input.
 * Throws a descriptive Error on any violation — callers convert to 400.
 * Rules: 1–4 tiers; minQty integer 2–99 strictly ascending;
 *        percent integer 1–80 strictly ascending; badge ≤ 20 chars.
 */
function sanitizeTiers(raw) {
  if (!Array.isArray(raw)) throw new Error('tiers must be an array');
  if (raw.length < 1 || raw.length > 4) throw new Error('1–4 tiers required');

  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    const minQty = Number(t.minQty);
    const percent = Number(t.percent);
    const badge = String(t.badge == null ? '' : t.badge);
    const subtitle = String(t.subtitle == null ? '' : t.subtitle).trim();

    if (!Number.isInteger(minQty) || minQty < 2 || minQty > 99)
      throw new Error(`tiers[${i}].minQty must be an integer between 2 and 99`);
    if (!Number.isInteger(percent) || percent < 1 || percent > 80)
      throw new Error(`tiers[${i}].percent must be an integer between 1 and 80`);
    if (i > 0) {
      if (minQty <= out[i - 1].minQty)
        throw new Error('tiers[].minQty must be strictly ascending');
      if (percent <= out[i - 1].percent)
        throw new Error('tiers[].percent must be strictly ascending');
    }

    out.push({ minQty, percent, badge: badge.slice(0, 20), subtitle: subtitle.slice(0, 40) });
  }
  return out;
}

/**
 * Returns the highest tier whose minQty <= qty, or null.
 * Tiers are assumed sorted ascending by minQty (sanitizeTiers guarantees this).
 */
function pickTier(tiers, qty) {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 1) return null;
  let best = null;
  for (const tier of tiers) {
    if (tier.minQty <= qty) best = tier;
  }
  return best;
}

/**
 * Discounted unit price: price * (1 - percent/100), rounded half-up to 2 dp.
 * Uses the same rounding rule everywhere so COD and function stay in sync.
 */
function discountedUnitPrice(price, percent) {
  const raw = price * (1 - percent / 100);
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

/**
 * Validates an accentColor string; returns the value or the default.
 */
function sanitizeAccentColor(val) {
  return COLOR_RE.test(String(val || '')) ? String(val) : DEFAULT_ACCENT;
}

const LAYOUTS = ['cards', 'list', 'rows'];

function normalizeLayout(val) {
  return LAYOUTS.includes(val) ? val : 'cards';
}

/**
 * Display-only extras for the storefront widget. Picks only known keys that are present,
 * so a PATCH can send any subset. Text is trimmed and capped at 40 chars; flags must be booleans.
 * Returns { key: value } using the plain field names (topLabel, footerNote, showCompareAt, ...).
 */
function sanitizeTierDisplay(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of ['topLabel', 'footerNote']) {
    if (typeof raw[k] === 'string') out[k] = raw[k].trim().slice(0, 40);
  }
  for (const k of ['showCompareAt', 'showTotal', 'showSingle']) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  return out;
}

/**
 * Storefront-safe copy of the tier display settings (used by the app proxy).
 * Missing fields fall back to the model defaults.
 */
function publicTierDisplay(qt) {
  const q = qt || {};
  return {
    layout: normalizeLayout(q.layout),
    topLabel: String(q.topLabel || '').slice(0, 40),
    footerNote: String(q.footerNote || '').slice(0, 40),
    showCompareAt: q.showCompareAt !== false,
    showTotal: q.showTotal !== false,
    showSingle: q.showSingle === true,
  };
}

function publicTiers(tiers) {
  return Array.isArray(tiers)
    ? tiers.map((t) => ({
      minQty: t.minQty,
      percent: t.percent,
      badge: String(t.badge || ''),
      subtitle: String(t.subtitle || '').slice(0, 40),
    }))
    : [];
}

module.exports = {
  sanitizeTiers, pickTier, discountedUnitPrice, sanitizeAccentColor, DEFAULT_ACCENT,
  LAYOUTS, normalizeLayout, sanitizeTierDisplay, publicTierDisplay, publicTiers,
};
