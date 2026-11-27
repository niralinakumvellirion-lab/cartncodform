'use strict';

/**
 * "Price drop" sender — run from the 30 s poller (server.js runPollerTick).
 *
 * Per shop with waiting requests, at most every CHECK_EVERY_MS:
 *   1. skip when the feature is off, the store is suspended / uninstalled, or automation or the
 *      price_drop signal is switched off;
 *   2. read current prices from Shopify (ProductVariant.price + availableForSale, shop currency —
 *      read_products only);
 *   3. a request without a sign-up price gets the current one as its base (the browser's price is
 *      never trusted) — even in quiet hours; then, outside quiet hours, a request whose variant is
 *      buyable at ≥ minDropPercent below its base is due;
 *   4. WhatsApp: mark ready + remind the seller once (they send it by hand); push + email: send now,
 *      oldest first, at most WAVE per check, stopping at the plan's monthly message limit.
 * Sends are logged as ScheduledJob signalType 'price_drop' (dashboards, plan usage, ccf_job links).
 * Message words resolve at send time. Emails, phone numbers and tokens are never logged.
 */

const PriceDropConfig = require('../models/PriceDropConfig');
const PriceDropRequest = require('../models/PriceDropRequest');
const Store = require('../models/Store');
const AutomationConfig = require('../models/AutomationConfig');
const { withDefaults, buildMessage, isDrop, formatMoney } = require('../utils/priceDrop');
const { sizeLabel } = require('../utils/restock');
const restock = require('./restock');

const CHECK_EVERY_MS = 5 * 60 * 1000;
const WAVE = 25;
const STUCK_MS = 15 * 60 * 1000;
const MAX_VARIANTS = 250;

const PRICE_QUERY = `query PriceDropPrices($ids: [ID!]!) {
  shop { currencyCode }
  nodes(ids: $ids) { ... on ProductVariant { id price availableForSale } }
}`;

/** Current { price, available } per numeric variant id, plus the shop currency. */
async function currentPrices(shop, accessToken, variantIds, deps) {
  const prices = new Map();
  let currencyCode = null;
  for (let i = 0; i < variantIds.length; i += 100) {
    const ids = variantIds.slice(i, i + 100).map((v) => `gid://shopify/ProductVariant/${v}`);
    const data = await deps.graphQL(shop, accessToken, PRICE_QUERY, { ids });
    if (data && data.shop && data.shop.currencyCode) currencyCode = data.shop.currencyCode;
    for (const n of (data && data.nodes) || []) {
      if (!n || typeof n.id !== 'string') continue;
      const price = Number(n.price);
      if (!Number.isFinite(price)) continue;
      prices.set(n.id.split('/').pop(), { price, available: n.availableForSale === true });
    }
  }
  return { prices, currencyCode };
}

const CTX = {
  Request: PriceDropRequest,
  buildMessage,
  signalType: 'price_drop',
  reason: (r) => `Asked to hear when ${sizeLabel(r.variantTitle)} gets cheaper`,
};

async function processShop(shop, deps, now) {
  const summary = { shop, checked: 0, dropped: 0, sent: 0, failed: 0, skipped: 0, whatsappReady: 0, based: 0, reason: null };

  const cfgDoc = await PriceDropConfig.findOne({ shopDomain: shop }).lean();
  if (!cfgDoc || !cfgDoc.enabled) { summary.reason = 'off'; return summary; }
  const claimed = await PriceDropConfig.findOneAndUpdate(
    {
      shopDomain: shop,
      $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lte: new Date(now.getTime() - CHECK_EVERY_MS) } }],
    },
    { $set: { lastCheckedAt: now } },
    { new: true }
  ).lean();
  if (!claimed) { summary.reason = 'not_due'; return summary; }
  const settings = withDefaults(claimed);

  const store = await Store.findOne({ shopDomain: shop })
    .select('shopDomain accessToken timezone quietHours suspended plan planTier isInternal subscriptionStatus').lean();
  if (!store || store.suspended || !deps.hasActivePlan(store) || !store.accessToken) {
    summary.reason = 'store_inactive';
    return summary;
  }
  const auto = await AutomationConfig.findOne({ shopDomain: shop }).select('enabled enabledSignals').lean();
  if (auto && (auto.enabled === false || (auto.enabledSignals && auto.enabledSignals.price_drop === false))) {
    summary.reason = 'automation_off';
    return summary;
  }
  const variantIds = (await PriceDropRequest.distinct('variantId', { shopDomain: shop, status: 'waiting' })).slice(0, MAX_VARIANTS);
  summary.checked = variantIds.length;
  if (!variantIds.length) return summary;

  let prices;
  let currencyCode;
  try {
    ({ prices, currencyCode } = await currentPrices(shop, store.accessToken, variantIds, deps));
  } catch (err) {
    console.error('[price-drop] price check failed for', shop, '-', err.message);
    summary.reason = 'price_check_failed';
    return summary;
  }

  // New sign-ups: the price now is their base price (no alert yet).
  for (const [variantId, p] of prices) {
    const r = await PriceDropRequest.updateMany(
      { shopDomain: shop, status: 'waiting', variantId, basePrice: null },
      { $set: { basePrice: p.price, currencyCode: currencyCode || null } }
    );
    summary.based += r.modifiedCount || 0;
  }
  // Quiet hours: sign-up prices are still recorded above; alerts wait for the next check after.
  if (deps.isQuietNow(store, now)) { summary.reason = 'quiet_hours'; return summary; }

  // Which waiting requests are due: buyable, and the price fell enough below their own base.
  const waiting = await PriceDropRequest.find(
    { shopDomain: shop, status: 'waiting', basePrice: { $ne: null }, variantId: { $in: [...prices.keys()] } },
    '_id variantId basePrice channel productTitle variantTitle createdAt'
  ).sort({ createdAt: 1 }).lean();
  const dueIds = [];
  const waIds = [];
  for (const w of waiting) {
    const p = prices.get(w.variantId);
    if (!p || !p.available || !isDrop(w.basePrice, p.price, settings.minDropPercent)) continue;
    await PriceDropRequest.updateOne(
      { _id: w._id, status: 'waiting' },
      { $set: { dropPrice: p.price, currencyCode: currencyCode || null, readyAt: now } }
    );
    if (w.channel === 'whatsapp') waIds.push(w._id); else dueIds.push(w._id);
  }
  summary.dropped = dueIds.length + waIds.length;

  // WhatsApp: ready for the seller to send by hand; remind the seller once, right away.
  if (waIds.length) {
    await PriceDropRequest.updateMany({ _id: { $in: waIds }, status: 'waiting' }, { $set: { status: 'ready', sellerNotifiedAt: now } });
    summary.whatsappReady = waIds.length;
    const first = await PriceDropRequest.findById(waIds[0]).lean();
    const what = first ? `${first.productTitle || 'A product'} is now ${formatMoney(first.dropPrice, first.currencyCode)}` : 'A price dropped';
    try {
      await deps.sendOwnerPush(
        shop,
        `${waIds.length} WhatsApp price alert${waIds.length === 1 ? '' : 's'} to send`,
        `${what}. Open Price drop in the app and tap “Send on WhatsApp”.`
      );
    } catch (err) {
      console.error('[price-drop] seller reminder failed for', shop, '-', err.message);
    }
  }

  for (const id of dueIds.slice(0, WAVE)) {
    if (await deps.isAtLimit(store, 'messages')) { summary.reason = 'plan_limit'; break; }
    const mine = await PriceDropRequest.findOneAndUpdate(
      { _id: id, status: 'waiting' },
      { $set: { status: 'sending', claimedAt: now } },
      { new: true }
    ).lean();
    if (!mine) continue;
    const result = await restock.sendOne(mine, settings, deps, now, CTX);
    summary[result] += 1;
  }
  if (summary.sent || summary.failed || summary.whatsappReady) {
    console.log(`[price-drop] ${shop}: ${summary.sent} sent, ${summary.failed} failed, ${summary.whatsappReady} WhatsApp ready`);
  }
  return summary;
}

async function processPriceDrops(options = {}) {
  const deps = { ...restock.defaultDeps(), ...(options.deps || {}) };
  const now = options.now || new Date();
  await PriceDropRequest.updateMany(
    { status: { $in: ['waiting', 'ready'] }, expiresAt: { $lte: now } },
    { $set: { status: 'expired', error: 'timed_out' } }
  );
  await PriceDropRequest.updateMany(
    { status: 'sending', claimedAt: { $lte: new Date(now.getTime() - STUCK_MS) } },
    { $set: { status: 'waiting', claimedAt: null } }
  );
  const shops = await PriceDropRequest.distinct('shopDomain', { status: 'waiting' });
  const results = [];
  for (const shop of shops) {
    try {
      results.push(await processShop(shop, deps, now));
    } catch (err) {
      console.error('[price-drop] shop error', shop, '-', err.message);
    }
  }
  return results;
}

module.exports = { processPriceDrops, processShop, currentPrices, CHECK_EVERY_MS, WAVE };
