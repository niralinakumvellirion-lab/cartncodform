'use strict';

/**
 * "Pay online and save" offer on the COD form.
 * A visitor who chooses to pay online gets a one-time Shopify discount code (single use, 24 h, only for
 * this product) and is sent to Shopify checkout with it applied. Orders that use a code are counted from
 * orders/create; codes that expire unused are deleted from Shopify by the poller.
 */
const crypto = require('crypto');
const Store = require('../models/Store');
const PrepaidOffer = require('../models/PrepaidOffer');
const PrepaidCode = require('../models/PrepaidCode');
const DiscountConfig = require('../models/DiscountConfig');
const { PLANS, tierOf, monthStart } = require('./plans');
const { pickTier, discountedUnitPrice } = require('./quantityTiers');
const { shopifyGraphQL } = require('./shopifyGraphQL');

const DEFAULTS = Object.freeze({
  enabled: false,
  discountType: 'percent',
  value: 5,
  maxDiscount: 100,
  minOrder: 0,
  heading: 'Pay online and save',
  buttonText: 'Pay online',
  accentColor: '#4F46E5',
});
const FIELDS = Object.keys(DEFAULTS);
const TEXT_MAX = { heading: 60, buttonText: 30 };
const PERCENT_MAX = 50;
const MONEY_MAX = 100000;
const CODE_TTL_MS = 24 * 60 * 60 * 1000;
// Unused codes are deleted this long after they expire (an order placed just before expiry may still be
// on its way through orders/create).
const CLEANUP_GRACE_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------

function cleanText(v) {
  return String(v == null ? '' : v).replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Validate admin input. Every field is required (the admin always sends the full form).
 * -> { ok: true, settings } | { ok: false, error }
 */
function sanitizeSettings(input) {
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (typeof b.enabled !== 'boolean') return { ok: false, error: 'Choose whether the offer is on or off.' };
  if (!['percent', 'fixed'].includes(b.discountType)) return { ok: false, error: 'Choose a discount type.' };

  const value = Number(b.value);
  if (b.discountType === 'percent') {
    if (!Number.isInteger(value) || value < 1 || value > PERCENT_MAX) {
      return { ok: false, error: `The discount must be a whole number from 1 to ${PERCENT_MAX}%.` };
    }
  } else if (!Number.isFinite(value) || value < 1 || value > MONEY_MAX) {
    return { ok: false, error: 'The discount amount must be at least ₹1.' };
  }
  const maxDiscount = Number(b.maxDiscount);
  if (!Number.isFinite(maxDiscount) || maxDiscount < 0 || maxDiscount > MONEY_MAX) {
    return { ok: false, error: 'The maximum discount must be ₹0 (no limit) or more.' };
  }
  const minOrder = Number(b.minOrder);
  if (!Number.isFinite(minOrder) || minOrder < 0 || minOrder > MONEY_MAX * 10) {
    return { ok: false, error: 'The minimum order must be ₹0 or more.' };
  }
  const heading = cleanText(b.heading);
  const buttonText = cleanText(b.buttonText);
  if (!heading || heading.length > TEXT_MAX.heading) return { ok: false, error: `The heading must be 1 to ${TEXT_MAX.heading} characters.` };
  if (!buttonText || buttonText.length > TEXT_MAX.buttonText) return { ok: false, error: `The button text must be 1 to ${TEXT_MAX.buttonText} characters.` };
  const accentColor = String(b.accentColor || '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) return { ok: false, error: 'The colour must look like #4F46E5.' };

  return {
    ok: true,
    settings: {
      enabled: b.enabled,
      discountType: b.discountType,
      value: round2(value),
      maxDiscount: round2(maxDiscount),
      minOrder: round2(minOrder),
      heading,
      buttonText,
      accentColor: accentColor.toUpperCase(),
    },
  };
}

function publicSettings(doc) {
  const out = { ...DEFAULTS };
  if (doc) for (const k of FIELDS) if (doc[k] !== undefined && doc[k] !== null) out[k] = doc[k];
  return out;
}

async function getSettings(shopDomain) {
  return publicSettings(await PrepaidOffer.findOne({ shopDomain }).lean());
}

async function saveSettings(shopDomain, settings) {
  await PrepaidOffer.updateOne({ shopDomain }, { $set: { ...settings, updatedAt: new Date() } }, { upsert: true });
  return getSettings(shopDomain);
}

/** The offer is part of Starter and above (utils/plans.js). */
function offerAllowed(store) {
  return PLANS[tierOf(store)].prepaidOffer === true;
}

// ---------------------------------------------------------------------------------------------------------
// Amount
// ---------------------------------------------------------------------------------------------------------

// Two decimals, rounded DOWN so the discount never exceeds what the settings allow.
function round2(n) {
  return Math.floor(Number(n) * 100 + 1e-6) / 100;
}

/**
 * Discount for an order subtotal (after quantity-tier discounts). 0 = not eligible: below the minimum
 * order, or the discount would cover the whole order.
 */
function computeDiscount(settings, subtotal) {
  const s = Number(subtotal);
  if (!Number.isFinite(s) || s <= 0) return 0;
  if (s < Number(settings.minOrder || 0)) return 0;
  let amount = settings.discountType === 'fixed'
    ? Number(settings.value)
    : (s * Number(settings.value)) / 100;
  if (settings.discountType === 'percent' && Number(settings.maxDiscount) > 0) {
    amount = Math.min(amount, Number(settings.maxDiscount));
  }
  amount = round2(amount);
  if (!(amount >= 1) || amount >= s) return 0;
  return amount;
}

/** Order subtotal the way the COD order computes it: quantity-tier price when a tier applies. */
function subtotalFor(price, quantity, quantityTiers) {
  const p = Number(price);
  const q = Math.max(1, Math.floor(Number(quantity) || 1));
  if (!Number.isFinite(p) || p <= 0) return 0;
  const qt = quantityTiers;
  if (qt && qt.enabled && Array.isArray(qt.tiers) && qt.tiers.length) {
    const tier = pickTier(qt.tiers, q);
    if (tier) return Math.round(discountedUnitPrice(p, tier.percent) * q * 100) / 100;
  }
  return Math.round(p * q * 100) / 100;
}

// ---------------------------------------------------------------------------------------------------------
// Rate limits (in memory, per server): one visitor cannot mint codes in a loop, and no shop gets flooded.
// ---------------------------------------------------------------------------------------------------------

const VISITOR_LIMIT = 5;
const VISITOR_WINDOW_MS = 10 * 60 * 1000;
const SHOP_LIMIT = 120;
const SHOP_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map();

function allow(key, limit, windowMs, now) {
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

function rateCheck(shopDomain, visitor, now = Date.now()) {
  if (hits.size > 5000) hits.clear();
  if (!allow(`v|${shopDomain}|${visitor || 'unknown'}`, VISITOR_LIMIT, VISITOR_WINDOW_MS, now)) return false;
  return allow(`s|${shopDomain}`, SHOP_LIMIT, SHOP_WINDOW_MS, now);
}

function _resetRateLimits() {
  hits.clear();
}

// ---------------------------------------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------------------------------------

const VARIANT_QUERY = `query PrepaidVariant($id: ID!) {
  productVariant(id: $id) { id price availableForSale product { id handle } }
}`;
const PRODUCT_QUERY = `query PrepaidProduct($id: ID!) {
  product(id: $id) { id handle variants(first: 50) { nodes { id price availableForSale } } }
}`;
const CREATE_MUTATION = `mutation PrepaidCode($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}`;
const DELETE_MUTATION = `mutation PrepaidCodeDelete($id: ID!) {
  discountCodeDelete(id: $id) { deletedCodeDiscountId userErrors { field message } }
}`;

const UNAVAILABLE = 'Paying online is not available right now. Please use Cash on Delivery.';
const fail = (status, error) => ({ status, body: { ok: false, error } });
const numericId = (gid) => String(gid || '').split('/').pop();

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `PAYNOW-${out}`;
}

/** The product, its variant (when known) and the price to work from. */
async function resolveProduct(shop, token, productId, variantId) {
  const productGid = `gid://shopify/Product/${productId}`;
  if (variantId) {
    const data = await shopifyGraphQL(shop, token, VARIANT_QUERY, { id: `gid://shopify/ProductVariant/${variantId}` });
    const v = data && data.productVariant;
    if (!v || !v.product || v.product.id !== productGid) return null;
    return { productGid, handle: v.product.handle, variantId: numericId(v.id), price: Number(v.price) };
  }
  const data = await shopifyGraphQL(shop, token, PRODUCT_QUERY, { id: productGid });
  const p = data && data.product;
  const nodes = (p && p.variants && p.variants.nodes) || [];
  if (!p || !nodes.length) return null;
  if (nodes.length === 1) {
    return { productGid, handle: p.handle, variantId: numericId(nodes[0].id), price: Number(nodes[0].price) };
  }
  // Several options and the link did not say which: work from the cheapest one on sale, so the saving
  // shown is never more than the customer gets, and let them pick the option on the product page.
  const onSale = nodes.filter((n) => n.availableForSale);
  const prices = (onSale.length ? onSale : nodes).map((n) => Number(n.price)).filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) return null;
  return { productGid, handle: p.handle, variantId: null, price: Math.min(...prices) };
}

/**
 * Make a one-time code for this visitor and return where to send them.
 * -> { status, body: { ok, url, amount, code } | { ok: false, error } }
 */
async function createPrepaidCheckout({ shop, productId, variantId, quantity, visitor }) {
  const shopDomain = String(shop || '').trim().toLowerCase();
  const pid = String(productId || '').trim();
  const vid = variantId == null || variantId === '' ? '' : String(variantId).trim();
  const qty = Number(quantity);
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shopDomain)) return fail(400, 'Missing shop');
  if (!/^\d{1,20}$/.test(pid)) return fail(400, 'Missing product');
  if (vid && !/^\d{1,20}$/.test(vid)) return fail(400, 'Invalid product option');
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return fail(400, 'Invalid quantity');

  const store = await Store.findOne({ shopDomain });
  if (!store || store.subscriptionStatus === 'uninstalled' || store.suspended) return fail(404, UNAVAILABLE);
  if (!offerAllowed(store)) return fail(403, UNAVAILABLE);
  const settings = await getSettings(shopDomain);
  if (!settings.enabled) return fail(403, UNAVAILABLE);
  if (!rateCheck(shopDomain, visitor)) return fail(429, 'Too many tries. Please wait a few minutes.');

  const { refreshAccessTokenIfNeeded } = require('./shopify');
  let token;
  let product;
  try {
    token = await refreshAccessTokenIfNeeded(store);
    if (!token) throw new Error('no usable access token');
    product = await resolveProduct(shopDomain, token, pid, vid);
  } catch (err) {
    console.error('[prepaid] product lookup failed:', err.message);
    return fail(502, UNAVAILABLE);
  }
  if (!product || !(product.price > 0)) return fail(400, 'This product cannot be paid online here.');

  const cfg = await DiscountConfig.findOne({ shopDomain }).select('quantityTiers').lean();
  const subtotal = subtotalFor(product.price, qty, cfg && cfg.quantityTiers);
  const amount = computeDiscount(settings, subtotal);
  if (!amount) return fail(400, 'This order does not qualify for the online payment offer.');

  const code = newCode();
  const startsAt = new Date(Date.now() - 60 * 1000);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const basicCodeDiscount = {
    title: `Prepaid offer ${code}`,
    code,
    startsAt: startsAt.toISOString(),
    endsAt: expiresAt.toISOString(),
    usageLimit: 1,
    appliesOncePerCustomer: true,
    context: { all: 'ALL' },
    // Quantity-tier discounts still apply (the COD form showed that price); order discounts do not stack.
    combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: true },
    customerGets: {
      value: { discountAmount: { amount: amount.toFixed(2), appliesOnEachItem: false } },
      items: { products: { productsToAdd: [product.productGid] } },
    },
  };
  if (Number(settings.minOrder) > 0) {
    basicCodeDiscount.minimumRequirement = { subtotal: { greaterThanOrEqualToSubtotal: Number(settings.minOrder).toFixed(2) } };
  }

  let discountId;
  try {
    const data = await shopifyGraphQL(shopDomain, token, CREATE_MUTATION, { basicCodeDiscount });
    const result = data && data.discountCodeBasicCreate;
    const errs = (result && result.userErrors) || [];
    if (errs.length) throw new Error(errs.map((e) => e.message).join('; ').slice(0, 300));
    discountId = result && result.codeDiscountNode && result.codeDiscountNode.id;
    if (!discountId) throw new Error('no discount id returned');
  } catch (err) {
    console.error('[prepaid] discount code not created:', err.message);
    return fail(502, UNAVAILABLE);
  }

  await PrepaidCode.create({
    shopDomain, code, discountId, amount, productId: pid, variantId: product.variantId, quantity: qty, expiresAt,
  });

  const url = product.variantId
    ? `/cart/${product.variantId}:${qty}?discount=${encodeURIComponent(code)}`
    : `/discount/${encodeURIComponent(code)}?redirect=${encodeURIComponent(`/products/${product.handle}`)}`;
  return { status: 200, body: { ok: true, url, amount, code } };
}

// ---------------------------------------------------------------------------------------------------------
// Orders and clean-up
// ---------------------------------------------------------------------------------------------------------

/** True when the order was placed with Cash on Delivery at Shopify checkout. */
function paidByCod(order) {
  const names = Array.isArray(order && order.payment_gateway_names) ? order.payment_gateway_names : [];
  return names.some((n) => /cash on delivery|\bcod\b/i.test(String(n || '')));
}

/** orders/create: mark the prepaid codes used in this order. Never throws. -> number of codes marked */
async function recordPrepaidUse(shopDomain, order) {
  try {
    const codes = (Array.isArray(order && order.discount_codes) ? order.discount_codes : [])
      .map((d) => String((d && d.code) || '').trim().toUpperCase())
      .filter((c) => c.startsWith('PAYNOW-'));
    if (!shopDomain || !codes.length) return 0;
    const total = Number(order.current_total_price || order.total_price);
    const res = await PrepaidCode.updateMany(
      { shopDomain, code: { $in: codes }, usedAt: null },
      {
        $set: {
          usedAt: new Date(),
          orderId: order.id != null ? String(order.id) : null,
          orderTotal: Number.isFinite(total) ? total : null,
          paidOnline: !paidByCod(order),
        },
      }
    );
    return res.modifiedCount || 0;
  } catch (err) {
    console.error('[prepaid] order record error:', err.message);
    return 0;
  }
}

/** Poller: delete unused codes from Shopify after they expire, so the merchant's Discounts list stays clean. */
async function cleanupExpiredPrepaidCodes({ limit = 10, now = new Date() } = {}) {
  const due = await PrepaidCode.find({
    usedAt: null,
    deletedAt: null,
    expiresAt: { $lt: new Date(now.getTime() - CLEANUP_GRACE_MS) },
  }).limit(limit).lean();
  if (!due.length) return { deleted: 0, failed: 0 };
  const { refreshAccessTokenIfNeeded } = require('./shopify');
  const tokens = new Map();
  let deleted = 0;
  let failed = 0;
  for (const c of due) {
    try {
      if (!tokens.has(c.shopDomain)) {
        const store = await Store.findOne({ shopDomain: c.shopDomain });
        tokens.set(c.shopDomain, store && store.subscriptionStatus !== 'uninstalled' ? await refreshAccessTokenIfNeeded(store) : null);
      }
      const token = tokens.get(c.shopDomain);
      if (token) {
        const data = await shopifyGraphQL(c.shopDomain, token, DELETE_MUTATION, { id: c.discountId });
        const errs = (data && data.discountCodeDelete && data.discountCodeDelete.userErrors) || [];
        // A code the merchant already removed by hand reports an error: nothing left to do either way.
        if (errs.length) console.warn('[prepaid] code delete:', errs[0].message);
      }
      deleted++;
    } catch (err) {
      failed++;
      console.warn('[prepaid] code delete failed:', err.message);
    }
    // Marked either way: one attempt per code, so a store that cannot be reached is not retried forever.
    await PrepaidCode.updateOne({ _id: c._id }, { deletedAt: now });
  }
  return { deleted, failed };
}

/** This month's numbers for the admin. */
async function prepaidStats(shopDomain, now = new Date()) {
  const rows = await PrepaidCode.find({ shopDomain, createdAt: { $gte: monthStart(now) } })
    .select('amount usedAt paidOnline orderTotal').lean();
  const used = rows.filter((r) => r.usedAt);
  const online = used.filter((r) => r.paidOnline === true);
  const sum = (list, f) => Math.round(list.reduce((t, r) => t + (Number(r[f]) || 0), 0) * 100) / 100;
  return {
    offersTaken: rows.length,
    prepaidOrders: online.length,
    usedWithCod: used.length - online.length,
    discountGiven: sum(used, 'amount'),
    prepaidRevenue: sum(online, 'orderTotal'),
  };
}

module.exports = {
  DEFAULTS,
  CODE_TTL_MS,
  sanitizeSettings,
  publicSettings,
  getSettings,
  saveSettings,
  offerAllowed,
  computeDiscount,
  subtotalFor,
  rateCheck,
  _resetRateLimits,
  createPrepaidCheckout,
  paidByCod,
  recordPrepaidUse,
  cleanupExpiredPrepaidCodes,
  prepaidStats,
};
