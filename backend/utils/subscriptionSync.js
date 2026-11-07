'use strict';

const Store = require('../models/Store');
const { getActiveSubscription } = require('./billing');
const { recordSubscriptionEvent } = require('./subscriptionEvents');
const { tierFromSubscriptionName, tierOf } = require('./plans');
const { shopifyGraphQL } = require('./shopifyGraphQL');
const { isPartnerApiConfigured, getPartnerActiveSubscription } = require('./partnerApi');

// Admin pages re-confirm the plan with Shopify when the last check is older than this.
const PLAN_STALE_MS = 6 * 60 * 60 * 1000;
// The poller re-confirms paid plans this often (catches cancellations and moves to Free).
const PLAN_RECHECK_MS = 24 * 60 * 60 * 1000;

function planCheckIsStale(store, maxAgeMs = PLAN_STALE_MS, now = Date.now()) {
  if (!store || !store.planCheckedAt) return true;
  return now - new Date(store.planCheckedAt).getTime() > maxAgeMs;
}

/** The shop's GraphQL id, read once from the Admin API and kept on the Store. */
async function ensureShopGid(store, accessToken) {
  if (store.shopGid) return store.shopGid;
  const data = await shopifyGraphQL(store.shopDomain, accessToken, '{ shop { id } }');
  const gid = data && data.shop && data.shop.id;
  if (!/^gid:\/\/shopify\/Shop\/\d+$/.test(String(gid || ''))) throw new Error('Shopify returned no shop id');
  await Store.updateOne({ shopDomain: store.shopDomain }, { shopGid: gid });
  store.shopGid = gid;
  return gid;
}

/**
 * What Shopify says the shop is subscribed to.
 * 1. The Admin API (currentAppInstallation.activeSubscriptions): the app's own installation. The plan the
 *    merchant just approved shows here at once (Shopify's subscription webhook carries this same
 *    subscription id), test charges on development stores included. An ACTIVE subscription here wins.
 * 2. Only when the Admin API finds none: the Partner API. In App Review it answered "no subscription"
 *    seconds after the merchant subscribed, which moved a paying store back to Free - so its "none" alone
 *    never ends a paid plan.
 * A paid plan ends (authoritative "none") only when the Admin API answered with no subscription AND the
 * Partner API agrees; without the Partner API, "none" is not trusted (authoritative: false).
 * Throws when neither can be asked (the caller keeps the plan as it is).
 */
async function readActivePlan(store, accessToken) {
  let adminSub = null;
  let adminError = null;
  try {
    adminSub = await getActiveSubscription(store.shopDomain, accessToken);
  } catch (err) {
    adminError = err;
  }
  if (adminSub) {
    return {
      active: true, tier: tierFromSubscriptionName(adminSub.name), status: adminSub.status, id: adminSub.id,
      test: !!adminSub.test, source: 'managed_pricing', authoritative: true,
    };
  }
  if (!isPartnerApiConfigured()) {
    if (adminError) throw adminError;
    return { active: false, source: 'managed_pricing', authoritative: false };
  }
  const gid = await ensureShopGid(store, accessToken);
  const sub = await getPartnerActiveSubscription(gid);
  return sub
    ? { active: true, tier: sub.tier, status: 'ACTIVE', source: 'partner_api', authoritative: true }
    : { active: false, source: 'partner_api', authoritative: !adminError };
}

/**
 * Confirm the store's plan with Shopify and save it. A paid plan sets plan 'pro' + its tier; the $0 Free
 * plan or no subscription on a paid store moves it back to Free (only on the Partner API's word).
 * Records an event whenever the plan changes. Updates `store` in place.
 * -> { tier, changed, source }. Throws when Shopify cannot be asked (the store is left as it was).
 */
async function refreshPlan(store, accessToken) {
  if (store.isInternal === true) return { tier: 'pro', changed: false, source: 'internal' };
  const found = await readActivePlan(store, accessToken);
  const now = new Date();
  const paidTier = found.active && found.tier !== 'free' ? found.tier : null;
  const wasPaid = store.plan === 'pro';
  const update = { planCheckedAt: now };
  let changed = false;

  if (paidTier) {
    if (!wasPaid || store.planTier !== paidTier) {
      changed = true;
      Object.assign(update, { plan: 'pro', planTier: paidTier, subscriptionStatus: found.status, planUpdatedAt: now, planChosenAt: now });
      if (found.id) Object.assign(update, { subscriptionId: found.id, isTest: found.test });
      await recordSubscriptionEvent({
        shopDomain: store.shopDomain,
        eventType: 'activated',
        fromPlan: store.plan ?? null,
        toPlan: 'pro',
        shopifyStatus: found.status,
        planTier: paidTier,
        source: found.source,
        isTest: found.id ? found.test : !!store.isTest,
      });
    }
  } else if (wasPaid && found.authoritative) {
    changed = true;
    Object.assign(update, { plan: 'free', planTier: null, subscriptionStatus: 'CANCELLED', planUpdatedAt: now });
    await recordSubscriptionEvent({
      shopDomain: store.shopDomain,
      eventType: 'ended',
      fromPlan: 'pro',
      toPlan: 'free',
      shopifyStatus: 'CANCELLED',
      source: found.source,
      isTest: !!store.isTest,
    });
  }

  await Store.updateOne({ shopDomain: store.shopDomain }, update);
  Object.assign(store, update);
  if (changed) console.log(`[billing] ${store.shopDomain} plan is now ${tierOf(store)} (${found.source})`);
  return { tier: tierOf(store), changed, source: found.source };
}

/**
 * Ask Shopify whether the shop has an ACTIVE subscription (a free trial counts) and, if so, mark the
 * Store as 'pro'. Needed for apps on Shopify managed pricing: the merchant approves on Shopify's own
 * plan page and comes back without passing through our billing callback. Returns the plan tier
 * ('starter' | 'growth' | 'pro' ...) when a subscription is active, false otherwise.
 */
async function syncActiveSubscription(store, accessToken, source) {
  const sub = await getActiveSubscription(store.shopDomain, accessToken);
  if (!sub) return false;
  const planTier = tierFromSubscriptionName(sub.name);
  await Store.findOneAndUpdate(
    { shopDomain: store.shopDomain },
    {
      plan: 'pro',
      planTier,
      subscriptionId: sub.id,
      subscriptionStatus: sub.status,
      planUpdatedAt: new Date(),
      isTest: !!sub.test,
    }
  );
  await recordSubscriptionEvent({
    shopDomain: store.shopDomain,
    eventType: 'activated',
    fromPlan: store.plan ?? null,
    toPlan: 'pro',
    shopifyStatus: sub.status,
    planTier,
    source,
    isTest: !!sub.test,
  });
  return planTier;
}

/**
 * Poller: re-confirm paid plans whose last check is over a day old, so a cancellation or a move to the
 * Free plan (which Shopify no longer reports by webhook) is noticed. Partner API only (the Admin API
 * cannot end a plan). At most `limit` stores per tick; a store that fails is retried a day later.
 */
async function recheckPaidPlans({ limit = 10, now = new Date() } = {}) {
  if (!isPartnerApiConfigured()) return { checked: 0, changed: 0, failed: 0 };
  const { refreshAccessTokenIfNeeded } = require('./shopify');
  const due = await Store.find({
    plan: 'pro',
    isInternal: { $ne: true },
    subscriptionStatus: { $ne: 'uninstalled' },
    $or: [{ planCheckedAt: null }, { planCheckedAt: { $lt: new Date(now.getTime() - PLAN_RECHECK_MS) } }],
  }).limit(limit);
  let changed = 0;
  let failed = 0;
  for (const store of due) {
    try {
      const token = await refreshAccessTokenIfNeeded(store);
      if (!token) throw new Error('no usable access token');
      const r = await refreshPlan(store, token);
      if (r.changed) changed++;
    } catch (err) {
      failed++;
      console.warn(`[billing] daily plan check failed for ${store.shopDomain}:`, err.message);
      await Store.updateOne({ shopDomain: store.shopDomain }, { planCheckedAt: now }).catch(() => {});
    }
  }
  return { checked: due.length, changed, failed };
}

module.exports = { syncActiveSubscription, refreshPlan, recheckPaidPlans, planCheckIsStale, PLAN_STALE_MS, PLAN_RECHECK_MS };
