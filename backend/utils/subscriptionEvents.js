const SubscriptionEvent = require('../models/SubscriptionEvent');
const { PLAN_PRICE, TRIAL_DAYS } = require('./billing');

/**
 * Record a subscription lifecycle event. Never throws and never blocks the
 * caller — a failed write is logged and returns null so the HTTP response
 * path is unaffected.
 *
 * State-change dedupe: if the shop's most-recent event has the same
 * eventType + toPlan + shopifyStatus, the insert is skipped.
 */
function normaliseStatus(s) {
  return s != null ? String(s).trim().toUpperCase() : null;
}

async function recordSubscriptionEvent(data) {
  try {
    const { shopDomain, eventType, toPlan } = data;
    const shopifyStatus = normaliseStatus(data.shopifyStatus);

    // Dedupe: skip if latest event for this shop has identical state.
    const latest = await SubscriptionEvent.findOne(
      { shopDomain },
      { eventType: 1, toPlan: 1, shopifyStatus: 1 },
      { sort: { occurredAt: -1 } }
    ).lean();
    if (
      latest &&
      latest.eventType === eventType &&
      latest.toPlan === toPlan &&
      normaliseStatus(latest.shopifyStatus) === shopifyStatus
    ) {
      return null;
    }

    const occurredAt = data.occurredAt || new Date();
    const doc = { ...data, shopifyStatus, occurredAt };

    if (eventType === 'activated') {
      doc.priceUsd  = PLAN_PRICE;
      doc.trialDays = TRIAL_DAYS;
      doc.trialEndsAt = new Date(occurredAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    }

    await SubscriptionEvent.create(doc);
    return true;
  } catch (err) {
    console.error('[subscriptionEvents] failed to record event:', err.message);
    return null;
  }
}

module.exports = { recordSubscriptionEvent };
