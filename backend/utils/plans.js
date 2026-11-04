'use strict';

/**
 * Pricing tiers. Prices must match the plans created in the Partner Dashboard (Shopify managed pricing).
 * A limit of null means unlimited. codOrders and messages are per calendar month (UTC); subscribers is a
 * running total of push sign-ups.
 */
const PLANS = Object.freeze({
  free: Object.freeze({
    id: 'free', name: 'Free', price: 0,
    limits: Object.freeze({ codOrders: 50, subscribers: 500, messages: 500 }),
    aiCopy: false, prioritySupport: false,
  }),
  starter: Object.freeze({
    id: 'starter', name: 'Starter', price: 9.99,
    limits: Object.freeze({ codOrders: 500, subscribers: 5000, messages: 5000 }),
    aiCopy: false, prioritySupport: false,
  }),
  growth: Object.freeze({
    id: 'growth', name: 'Growth', price: 24.99,
    limits: Object.freeze({ codOrders: null, subscribers: 25000, messages: 25000 }),
    aiCopy: true, prioritySupport: false,
  }),
  pro: Object.freeze({
    id: 'pro', name: 'Pro', price: 49,
    limits: Object.freeze({ codOrders: null, subscribers: null, messages: null }),
    aiCopy: true, prioritySupport: true,
  }),
});

const TIER_ORDER = Object.freeze(['free', 'starter', 'growth', 'pro']);
const LIMIT_KEYS = Object.freeze(['codOrders', 'subscribers', 'messages']);

/**
 * Tier for a Shopify subscription, from its plan name ("Starter", "ShopiReachBoost Growth", ...).
 * A paid subscription whose name names no tier (the original single plan) keeps full access: 'pro'.
 */
function keywordTier(name) {
  const n = String(name || '').toLowerCase();
  if (/\bgrowth\b/.test(n)) return 'growth';
  if (/\bstarter\b/.test(n)) return 'starter';
  if (/\bpro\b/.test(n)) return 'pro';
  if (/\bfree\b/.test(n)) return 'free';
  return null;
}

function tierFromSubscriptionName(name) {
  return keywordTier(name) || 'pro';
}

/**
 * Tier for a Shopify App Pricing subscription: from the plan handle / description first, then from the
 * monthly price when the names say nothing ($0 = Free, an exact plan price = that plan). Anything else
 * (the original $10 plan) keeps full access: 'pro'.
 */
function tierFromSubscription({ names = [], price = null } = {}) {
  for (const name of names) {
    const t = keywordTier(name);
    if (t) return t;
  }
  const p = Number(price);
  if (price !== null && price !== undefined && price !== '' && Number.isFinite(p)) {
    const match = TIER_ORDER.find((id) => Math.abs(PLANS[id].price - p) < 0.005);
    if (match) return match;
  }
  return 'pro';
}

/** Tier a store is on now. No active subscription = Free; internal stores = Pro. */
function tierOf(store) {
  if (!store) return 'free';
  if (store.isInternal === true) return 'pro';
  if (store.plan !== 'pro') return 'free';
  return PLANS[store.planTier] ? store.planTier : 'pro';
}

/**
 * True when the merchant must pick a plan before using the app: right after an install or reinstall, until
 * they choose Free or a paid plan. Internal stores and stores on a paid plan never need to.
 */
function needsPlanChoice(store) {
  if (!store || store.isInternal === true) return false;
  if (tierOf(store) !== 'free') return false;
  if (!store.planChosenAt) return true;
  return !!store.installedAt && new Date(store.planChosenAt) < new Date(store.installedAt);
}

function planOf(store) {
  return PLANS[tierOf(store)];
}

/** Start of the current usage month (1st, 00:00 UTC) and the next reset. */
function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
function nextMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

module.exports = {
  PLANS, TIER_ORDER, LIMIT_KEYS,
  tierFromSubscriptionName, tierFromSubscription, tierOf, needsPlanChoice, planOf, monthStart, nextMonthStart,
};
