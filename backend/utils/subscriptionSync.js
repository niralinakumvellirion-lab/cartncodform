'use strict';

const Store = require('../models/Store');
const { getActiveSubscription } = require('./billing');
const { recordSubscriptionEvent } = require('./subscriptionEvents');
const { tierFromSubscriptionName } = require('./plans');

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

module.exports = { syncActiveSubscription };
