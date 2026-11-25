'use strict';

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_ACCENT = '#4F46E5';

// How a tier discounts the bundle: 'percent' off each item (default, the original behaviour) or a
// flat 'amount' off the whole bundle (e.g. Buy 2, save ₹200). One type per tier set.
const DISCOUNT_TYPES = ['percent', 'amount'];
const MAX_AMOUNT = 1000000;

function normalizeDiscountType(val) {
  return DISCOUNT_TYPES.includes(val) ? val : 'percent';
}

/**
 * Validates and normalises a raw tiers array from user input.
 * Throws a descriptive Error on any violation — callers convert to 400.
 * Rules: 1–4 tiers; minQty integer 2–99 strictly ascending; badge ≤ 20 chars; subtitle ≤ 40.
 *   type 'percent': percent integer 1–80 strictly ascending.
 *   type 'amount':  amount 1–1,000,000 (2 dp) strictly ascending; percent stored as 0.
 */
function sanitizeTiers(raw, discountType = 'percent') {
  if (!Array.isArray(raw)) throw new Error('tiers must be an array');
  if (raw.length < 1 || raw.length > 4) throw new Error('1–4 tiers required');
  const type = normalizeDiscountType(discountType);

  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    const minQty = Number(t.minQty);
    const badge = String(t.badge == null ? '' : t.badge);
    const subtitle = String(t.subtitle == null ? '' : t.subtitle).trim();

    if (!Number.isInteger(minQty) || minQty < 2 || minQty > 99)
      throw new Error(`tiers[${i}].minQty must be an integer between 2 and 99`);
    if (i > 0 && minQty <= out[i - 1].minQty)
      throw new Error('tiers[].minQty must be strictly ascending');

    let tier;
    if (type === 'amount') {
      const amount = Math.round(Number(t.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount < 1 || amount > MAX_AMOUNT)
        throw new Error(`tiers[${i}].amount must be between 1 and ${MAX_AMOUNT}`);
      if (i > 0 && amount <= out[i - 1].amount)
        throw new Error('tiers[].amount must be strictly ascending');
      tier = { minQty, percent: 0, amount, badge: badge.slice(0, 20), subtitle: subtitle.slice(0, 40) };
    } else {
      const percent = Number(t.percent);
      if (!Number.isInteger(percent) || percent < 1 || percent > 80)
        throw new Error(`tiers[${i}].percent must be an integer between 1 and 80`);
      if (i > 0 && percent <= out[i - 1].percent)
        throw new Error('tiers[].percent must be strictly ascending');
      tier = { minQty, percent, badge: badge.slice(0, 20), subtitle: subtitle.slice(0, 40) };
    }
    // Perks are optional and only stored when on, so plain tiers keep their original shape.
    if (t.freeShipping === true) tier.freeShipping = true;
    const gift = sanitizeGift(t.gift, i);
    if (gift) tier.gift = gift;
    out.push(tier);
  }
  return out;
}

const VARIANT_GID_RE = /^gid:\/\/shopify\/ProductVariant\/(\d{1,20})$/;

/**
 * Free-gift perk: { variantId: 'gid://shopify/ProductVariant/<n>', title ≤60, image https ≤500 }.
 * null / undefined / false = no gift. Anything else malformed throws (→ 400).
 */
function sanitizeGift(raw, i) {
  if (raw == null || raw === false) return null;
  if (typeof raw !== 'object') throw new Error(`tiers[${i}].gift must be an object`);
  const variantId = String(raw.variantId || '').trim();
  if (!VARIANT_GID_RE.test(variantId))
    throw new Error(`tiers[${i}].gift.variantId must be a Shopify product variant ID`);
  const title = String(raw.title == null ? '' : raw.title).trim().slice(0, 60);
  const img = String(raw.image == null ? '' : raw.image).trim();
  const image = /^https:\/\/[^\s"'<>]{1,490}$/.test(img) ? img : '';
  return { variantId, title: title || 'Free gift', image };
}

/** Numeric variant id from a gid ("gid://shopify/ProductVariant/123" → "123"), or ''. */
function variantNumericId(gid) {
  const m = VARIANT_GID_RE.exec(String(gid || ''));
  return m ? m[1] : '';
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
 * Price of `qty` items under `tier` (2 dp). The single rule every copy follows
 * (checkout function, COD page, widget, admin preview):
 *   'amount'  → max(0, price × qty − amount)        (flat off the bundle)
 *   'percent' → discountedUnitPrice(price, %) × qty (rounded per item, as before)
 *   no tier   → price × qty
 */
function tierTotal(price, qty, tier, discountType) {
  const p = Number(price) || 0;
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  const full = Math.round(p * q * 100) / 100;
  if (!tier) return full;
  if (normalizeDiscountType(discountType) === 'amount') {
    return Math.max(0, Math.round((full - (Number(tier.amount) || 0)) * 100) / 100);
  }
  return Math.round(discountedUnitPrice(p, tier.percent) * q * 100) / 100;
}

/** Money saved on `qty` items under `tier` (2 dp, never negative). */
function tierSaving(price, qty, tier, discountType) {
  const p = Number(price) || 0;
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  const full = Math.round(p * q * 100) / 100;
  return Math.max(0, Math.round((full - tierTotal(p, q, tier, discountType)) * 100) / 100);
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
  for (const k of ['showCompareAt', 'showTotal', 'showSingle', 'variantPicker']) {
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
    discountType: normalizeDiscountType(q.discountType),
    topLabel: String(q.topLabel || '').slice(0, 40),
    footerNote: String(q.footerNote || '').slice(0, 40),
    showCompareAt: q.showCompareAt !== false,
    showTotal: q.showTotal !== false,
    showSingle: q.showSingle === true,
    variantPicker: q.variantPicker === true,
  };
}

/**
 * Rewards for buying `qty`: rewards carry upward, so a reward set on "Buy 3+" also applies at 4, 5...
 *   freeShipping: any tier with minQty <= qty has it
 *   gift:         the gift of the highest tier (minQty <= qty) that has one, else null
 * Same rule in the checkout Function, the widget, the admin preview and the COD page.
 */
function perksFor(tiers, qty) {
  const out = { freeShipping: false, gift: null };
  if (!Array.isArray(tiers)) return out;
  const q = Number(qty);
  for (const t of tiers) {
    if (!t || !(t.minQty <= q)) continue;
    if (t.freeShipping === true) out.freeShipping = true;
    if (t.gift && t.gift.variantId) out.gift = t.gift;
  }
  return out;
}

/**
 * Which other discounts the tier discount may combine with (Shopify's "Combinations").
 * Missing / non-true values are false, so existing stores keep "combine with nothing".
 * Shopify only combines two discounts when BOTH allow it.
 */
const COMBINE_KEYS = ['productDiscounts', 'orderDiscounts', 'shippingDiscounts'];
function sanitizeCombinesWith(raw) {
  const out = {};
  for (const k of COMBINE_KEYS) out[k] = !!(raw && raw[k] === true);
  return out;
}

/** True when any tier gives free shipping (the Shopify discount then needs the SHIPPING class). */
function hasFreeShipping(tiers) {
  return Array.isArray(tiers) && tiers.some((t) => t && t.freeShipping === true);
}

function publicTiers(tiers) {
  return Array.isArray(tiers)
    ? tiers.map((t) => {
      const out = {
        minQty: t.minQty,
        percent: t.percent,
        badge: String(t.badge || ''),
        subtitle: String(t.subtitle || '').slice(0, 40),
      };
      if (Number(t.amount) > 0) out.amount = Number(t.amount);
      if (t.freeShipping === true) out.freeShipping = true;
      const vid = t.gift && variantNumericId(t.gift.variantId);
      if (vid) {
        // The storefront adds the gift to the cart by its numeric variant id.
        out.gift = { variantId: vid, title: String(t.gift.title || 'Free gift').slice(0, 60), image: String(t.gift.image || '') };
      }
      return out;
    })
    : [];
}

module.exports = {
  sanitizeTiers, pickTier, discountedUnitPrice, sanitizeAccentColor, DEFAULT_ACCENT,
  LAYOUTS, normalizeLayout, sanitizeTierDisplay, publicTierDisplay, publicTiers,
  DISCOUNT_TYPES, normalizeDiscountType, tierTotal, tierSaving,
  sanitizeGift, variantNumericId, hasFreeShipping, perksFor, sanitizeCombinesWith, COMBINE_KEYS,
};
