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

    out.push({ minQty, percent, badge: badge.slice(0, 20) });
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
 * Discounted unit price, rounded half-up to the cent. The one rule shared with the storefront cards
 * (ccf-tiers.js) and the discount function (extensions/quantity-tier-discount/src/run.js, which sends
 * price - this as a fixed amount per item), so the product page, the COD form and the cart always show
 * the same unit price (App Review 2.1.4). Worked in whole cents: priceCents x (100 - percent) is an exact
 * integer, so a half cent is exactly .5 (float maths made 3.30 at 25% = 2.475 come out as 2.47).
 */
function discountedUnitPrice(price, percent) {
  const priceCents = Math.round(Number(price) * 100);
  return Math.round((priceCents * (100 - percent)) / 100) / 100;
}

/**
 * Validates an accentColor string; returns the value or the default.
 */
function sanitizeAccentColor(val) {
  return COLOR_RE.test(String(val || '')) ? String(val) : DEFAULT_ACCENT;
}

module.exports = { sanitizeTiers, pickTier, discountedUnitPrice, sanitizeAccentColor, DEFAULT_ACCENT };
