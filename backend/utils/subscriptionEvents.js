const SubscriptionEvent = require('../models/SubscriptionEvent');
const { PLAN_PRICE, TRIAL_DAYS } = require('./billing');
const { PLANS } = require('./plans');

const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Record a subscription lifecycle event. Never throws and never blocks the
 * caller — a failed write is logged and returns null so the HTTP response
 * path is unaffected.
 *
 * State-change dedupe: if the shop's most-recent event has the same
 * eventType + toPlan + shopifyStatus + planTier, the insert is skipped.
 *
 * planTier ('free' | 'starter' | 'growth' | 'pro') prices the event for the
 * finance dashboard. Events from before the tiers have none and are priced
 * at PLAN_PRICE, the original single plan.
 */
function normaliseStatus(s) {
  return s != null ? String(s).trim().toUpperCase() : null;
}

async function recordSubscriptionEvent(data) {
  try {
    const { shopDomain, eventType, toPlan } = data;
    const shopifyStatus = normaliseStatus(data.shopifyStatus);
    const planTier = PLANS[data.planTier] ? data.planTier : null;

    // Dedupe: skip if latest event for this shop has identical state.
    const latest = await SubscriptionEvent.findOne(
      { shopDomain },
      { eventType: 1, toPlan: 1, shopifyStatus: 1, planTier: 1, trialDays: 1, trialEndsAt: 1, approxSince: 1 },
      { sort: { occurredAt: -1 } }
    ).lean();
    if (
      latest &&
      latest.eventType === eventType &&
      latest.toPlan === toPlan &&
      normaliseStatus(latest.shopifyStatus) === shopifyStatus &&
      (latest.planTier ?? null) === planTier
    ) {
      return null;
    }

    const occurredAt = data.occurredAt || new Date();
    const doc = { ...data, shopifyStatus, planTier, occurredAt };

    if (eventType === 'activated') {
      doc.priceUsd = planTier ? PLANS[planTier].price : PLAN_PRICE;
      if (latest && latest.toPlan === 'pro' && (latest.eventType === 'activated' || latest.eventType === 'baseline')) {
        // Plan switch (e.g. Starter -> Growth) on an existing subscription: Shopify does not start a new
        // trial, so keep the trial end already in force.
        const trialEndsAt = latest.eventType === 'activated'
          ? (latest.trialEndsAt || null)
          : (latest.approxSince ? new Date(new Date(latest.approxSince).getTime() + TRIAL_MS) : null);
        doc.trialEndsAt = trialEndsAt;
        doc.trialDays = trialEndsAt ? (latest.trialDays ?? TRIAL_DAYS) : 0;
      } else {
        doc.trialDays = TRIAL_DAYS;
        doc.trialEndsAt = new Date(occurredAt.getTime() + TRIAL_MS);
      }
    }

    await SubscriptionEvent.create(doc);
    return true;
  } catch (err) {
    console.error('[subscriptionEvents] failed to record event:', err.message);
    return null;
  }
}

module.exports = { recordSubscriptionEvent };
