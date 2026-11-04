const express = require('express');
const {
  requireAuth,
  requireStoreOwnerAnyPlan,
} = require('../middleware/requireOwner');
const { createSubscription, shouldUseTestCharge, isManagedPricingError, managedPricingUrl, PLAN_PRICE, PLAN_CURRENCY, TRIAL_DAYS } = require('../utils/billing');
const { syncActiveSubscription } = require('../utils/subscriptionSync');
const { PLANS, TIER_ORDER, tierOf } = require('../utils/plans');
const { usageReport } = require('../utils/planUsage');
const { refreshAccessTokenIfNeeded } = require('../utils/shopify');

const router = express.Router();

function sessionTokenOf(req) {
  return (req.get('Authorization') || '').slice(7);
}

function getBackendUrl(req) {
  return process.env.BACKEND_URL || `${req.protocol}://${req.headers.host}`;
}

// Plan cards for the admin, in display order.
function planCards() {
  return TIER_ORDER.map((id) => {
    const p = PLANS[id];
    return { id, name: p.name, price: p.price, limits: { ...p.limits }, aiCopy: p.aiCopy, prioritySupport: p.prioritySupport };
  });
}

/**
 * Apps on Shopify managed pricing: the merchant picks a plan on Shopify's own page and returns without
 * our billing callback, so ask Shopify which subscription is active. Runs when no paid plan is known yet,
 * or when the admin asks for a refresh (back from the plan page). Never throws.
 */
async function syncPlan(req, force) {
  if ((req.store.plan === 'pro' || req.store.isInternal) && !force) return;
  try {
    const token = await refreshAccessTokenIfNeeded(req.store, { sessionToken: sessionTokenOf(req) });
    const tier = token ? await syncActiveSubscription(req.store, token, 'managed_pricing') : false;
    if (tier) {
      req.store.plan = 'pro';
      if (typeof tier === 'string') req.store.planTier = tier;
    }
  } catch (err) {
    console.warn('[billing] subscription check skipped:', err.message);
  }
}

/**
 * GET /api/billing/:shopDomain/status
 * -> { hasAccess, plan, tier, priceUsd, trialDays }
 * Every installed store has access (no subscription = Free plan).
 */
router.get('/:shopDomain/status', requireAuth, requireStoreOwnerAnyPlan, async (req, res) => {
  // First admin visit after the token change: convert a legacy non-expiring
  // offline token to an expiring one while we hold a live session token.
  if (!req.store.refreshToken && !req.store.accessTokenExpiresAt) {
    try {
      await refreshAccessTokenIfNeeded(req.store, { sessionToken: sessionTokenOf(req) });
    } catch (err) {
      console.warn('[billing] token conversion skipped:', err.message);
    }
  }
  await syncPlan(req, false);
  return res.json({
    hasAccess: true,
    plan: req.store.plan || 'free',
    tier: tierOf(req.store),
    priceUsd: PLAN_PRICE,
    currency: PLAN_CURRENCY,
    trialDays: TRIAL_DAYS,
  });
});

/**
 * GET /api/billing/:shopDomain/usage[?refresh=1]
 * -> { tier, plan, usage: { codOrders|subscribers|messages: { used, limit } }, reached, resetsAt, plans, upgradeUrl }
 * limit null = unlimited. refresh=1 re-reads the active subscription from Shopify first.
 */
router.get('/:shopDomain/usage', requireAuth, requireStoreOwnerAnyPlan, async (req, res) => {
  try {
    await syncPlan(req, req.query.refresh === '1');
    const report = await usageReport(req.store);
    return res.json({ ...report, plans: planCards(), upgradeUrl: managedPricingUrl(req.store.shopDomain) });
  } catch (err) {
    console.error('[billing] usage error:', err.message);
    return res.status(500).json({ error: 'Could not load your plan usage' });
  }
});

/**
 * POST /api/billing/:shopDomain/start
 * Creates the Shopify subscription (free trial, then monthly) and returns the
 * Shopify-hosted approval URL. The admin opens it in the top window.
 * -> { confirmationUrl }
 */
router.post('/:shopDomain/start', requireAuth, requireStoreOwnerAnyPlan, async (req, res) => {
  try {
    const shop = req.store.shopDomain;
    const returnUrl = `${getBackendUrl(req)}/api/auth/billing/callback?shop=${encodeURIComponent(shop)}`;

    // Expiring offline token: refreshed or minted from the live session token
    // when the stored one is stale or a legacy non-expiring token.
    const token = await refreshAccessTokenIfNeeded(req.store, { sessionToken: sessionTokenOf(req) });

    const isTest = await shouldUseTestCharge(shop, token);
    const { confirmationUrl } = await createSubscription(shop, token, returnUrl, isTest);
    if (!confirmationUrl) {
      return res.status(500).json({ error: 'Failed to create subscription' });
    }
    return res.json({ confirmationUrl });
  } catch (err) {
    // Pricing is managed by Shopify (set in the Dashboard): send the merchant to Shopify's plan page.
    if (isManagedPricingError(err)) {
      console.log('[billing] shop is on Shopify managed pricing - sending to the plan page');
      return res.json({ confirmationUrl: managedPricingUrl(req.store.shopDomain), managedPricing: true });
    }
    // Shopify's error body (no PII) explains refusals such as a non-public app.
    const detail = err.response
      ? `${err.response.status} ${JSON.stringify(err.response.data).slice(0, 500)}`
      : err.message;
    console.error('[billing] start error:', detail);
    return res.status(500).json({ error: 'Failed to start your free trial' });
  }
});

module.exports = router;
