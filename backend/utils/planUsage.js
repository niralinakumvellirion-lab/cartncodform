'use strict';

const mongoose = require('mongoose');
const Store = require('../models/Store');
const CodOrder = require('../models/CodOrder');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const ScheduledJob = require('../models/ScheduledJob');
const { PLANS, LIMIT_KEYS, tierOf, monthStart, nextMonthStart } = require('./plans');

const STORE_FIELDS = 'shopDomain plan planTier isInternal';

const COUNTERS = {
  codOrders: (shop, now) => CodOrder.countDocuments({ shopDomain: shop, createdAt: { $gte: monthStart(now) } }),
  subscribers: (shop) => CustomerPushSubscription.countDocuments({ shopDomain: shop }),
  messages: (shop, now) => ScheduledJob.countDocuments({ shopDomain: shop, status: 'sent', sentAt: { $gte: monthStart(now) } }),
};

async function loadStore(storeOrShop) {
  if (storeOrShop && typeof storeOrShop === 'object') return storeOrShop;
  const shop = String(storeOrShop || '').trim().toLowerCase();
  if (!shop) return null;
  return Store.findOne({ shopDomain: shop }).select(STORE_FIELDS).lean();
}

/** How much of one limit is used: { used, limit }. limit null = unlimited (no count query is made). */
async function usageOf(store, key, now = new Date()) {
  const limit = PLANS[tierOf(store)].limits[key];
  if (limit === null || limit === undefined) return { used: null, limit: null };
  const used = await COUNTERS[key](store.shopDomain, now);
  return { used, limit };
}

/**
 * True when the store has used up this limit for the month. An unknown store (not installed) is treated
 * as Free. Count errors (or no database connection) fail open (false): a DB hiccup must not block a
 * customer's order.
 */
async function isAtLimit(storeOrShop, key, now = new Date()) {
  try {
    if (mongoose.connection.readyState !== 1) return false;
    const store = await loadStore(storeOrShop);
    const target = store || { shopDomain: String(storeOrShop || '').toLowerCase() };
    const { used, limit } = await usageOf(target, key, now);
    return limit !== null && used >= limit;
  } catch (err) {
    console.warn(`[plans] ${key} limit check skipped:`, err.message);
    return false;
  }
}

/**
 * Whether a push sign-up must be refused because the plan's subscriber limit is reached. A device that
 * is already subscribed, or that is replacing its own old token, is never refused.
 */
async function newSubscriberBlocked(shopDomain, token, oldToken) {
  try {
    if (mongoose.connection.readyState !== 1) return false;
    if (await CustomerPushSubscription.exists({ token })) return false;
    if (oldToken && oldToken !== token && await CustomerPushSubscription.exists({ token: oldToken, shopDomain })) return false;
    return await isAtLimit(shopDomain, 'subscribers');
  } catch (err) {
    console.warn('[plans] subscriber limit check skipped:', err.message);
    return false;
  }
}

const SUBSCRIBER_LIMIT_BODY = Object.freeze({ success: false, code: 'PLAN_LIMIT', error: 'This store is not accepting new notification sign-ups right now.' });

/** Plan, limits and usage for the admin Plans page. */
async function usageReport(store, now = new Date()) {
  const tier = tierOf(store);
  const usage = {};
  for (const key of LIMIT_KEYS) {
    usage[key] = await usageOf(store, key, now);
    if (usage[key].limit === null) {
      usage[key].used = await COUNTERS[key](store.shopDomain, now);
    }
  }
  const reached = LIMIT_KEYS.filter((k) => usage[k].limit !== null && usage[k].used >= usage[k].limit);
  return {
    tier,
    plan: PLANS[tier],
    usage,
    reached,
    resetsAt: nextMonthStart(now).toISOString(),
  };
}

/**
 * Whether AI-written copy is on for this shop's plan (Growth and Pro). Fails open when the database is not
 * connected or the lookup errors, so a send never stalls on this check.
 */
async function aiCopyAllowed(shopDomain) {
  try {
    if (mongoose.connection.readyState !== 1) return true;
    const store = await loadStore(shopDomain);
    if (!store) return true;
    return PLANS[tierOf(store)].aiCopy === true;
  } catch (err) {
    console.warn('[plans] AI plan check skipped:', err.message);
    return true;
  }
}

module.exports = { usageOf, isAtLimit, usageReport, aiCopyAllowed, newSubscriberBlocked, SUBSCRIBER_LIMIT_BODY };
