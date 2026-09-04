const AutomationRule = require('../models/AutomationRule');
const ScheduledJob = require('../models/ScheduledJob');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');

/**
 * Called after a carts/create or carts/update webhook is processed.
 * Finds active cart_abandon rules for this shop and schedules jobs
 * for each step, targeting the subscriber linked to this cart.
 *
 * @param {string} shopDomain
 * @param {string} cartToken - normalized Shopify cart token (sessionId on AbandonedCustomer)
 * @param {string|null} customerId
 * @param {object} cartContext - { cartValue, productImageUrl, firstItemTitle }
 */
async function scheduleCartAbandonJobs(shopDomain, cartToken, customerId, cartContext) {
  try {
    const shop = String(shopDomain || '').trim().toLowerCase();
    if (!cartToken) return;

    const rules = await AutomationRule.find({
      shopDomain: shop,
      trigger: 'cart_abandon',
      active: true,
    });

    if (!rules.length) return;

    // Find the subscriber linked to this cart (if any) so we know
    // there's someone to notify before scheduling anything.
    const sub = await CustomerPushSubscription.findOne({
      shopDomain: shop,
      cartToken: cartToken,
    }).sort({ lastActivityAt: -1 });

    if (!sub) {
      console.log(`[automation] No subscriber for cartToken ${cartToken} — skipping schedule`);
      return;
    }

    for (const rule of rules) {
      // Skip entirely if any non-cancelled job already exists for
      // this rule+cart (sent or still pending) — avoids re-sending
      // step 0 on every subsequent carts/update for a long-lived cart.
      const existingJob = await ScheduledJob.findOne({
        shopDomain: shop,
        ruleId: rule._id,
        cartToken,
        status: { $in: ['pending', 'sent'] },
      });
      if (existingJob) {
        console.log(`[automation] Rule "${rule.name}" already has a job for cart ${cartToken} — skipping re-schedule`);
        continue;
      }

      let cumulativeMinutes = 0;
      for (let i = 0; i < rule.steps.length; i++) {
        const step = rule.steps[i];
        cumulativeMinutes += step.delayMinutes;
        const runAt = new Date(Date.now() + cumulativeMinutes * 60 * 1000);

        const title = step.title
          .replace('{cartValue}', cartContext.cartValue || '')
          .replace('{productTitle}', cartContext.firstItemTitle || 'your item');
        const body = step.body
          .replace('{cartValue}', cartContext.cartValue || '')
          .replace('{productTitle}', cartContext.firstItemTitle || 'your item');

        await ScheduledJob.create({
          shopDomain: shop,
          ruleId: rule._id,
          stepIndex: i,
          cartToken,
          customerId: customerId || sub.customerId || null,
          runAt,
          status: 'pending',
          payload: {
            title,
            body,
            url: `https://${shop}`,
            imageUrl: step.imageSource === 'product' ? (cartContext.productImageUrl || null) : null,
          },
        });
      }

      console.log(`[automation] Scheduled ${rule.steps.length} job(s) for rule "${rule.name}" (cart ${cartToken})`);
    }
  } catch (err) {
    console.error('[automation] scheduleCartAbandonJobs error:', err.message);
  }
}

/**
 * Called after orders/create. Cancels any pending jobs tied to this
 * cart/customer so a converted shopper doesn't keep getting reminders.
 */
async function cancelJobsForOrder(shopDomain, cartToken, customerId) {
  try {
    const shop = String(shopDomain || '').trim().toLowerCase();
    const orClauses = [];
    if (cartToken) orClauses.push({ cartToken });
    if (customerId) orClauses.push({ customerId });
    if (!orClauses.length) return { cancelled: 0 };

    const result = await ScheduledJob.updateMany(
      { shopDomain: shop, status: 'pending', $or: orClauses },
      { status: 'cancelled' }
    );

    if (result.modifiedCount > 0) {
      console.log(`[automation] Cancelled ${result.modifiedCount} pending job(s) for order (cart: ${cartToken || 'n/a'}, customer: ${customerId || 'n/a'})`);
    }
    return { cancelled: result.modifiedCount };
  } catch (err) {
    console.error('[automation] cancelJobsForOrder error:', err.message);
    return { cancelled: 0, error: err.message };
  }
}

module.exports = { scheduleCartAbandonJobs, cancelJobsForOrder };
