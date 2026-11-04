const express = require('express');
const {
  requireAuth,
  requireStoreOwnerAnyPlan,
} = require('../middleware/requireOwner');
const Store = require('../models/Store');
const { createSubscription, shouldUseTestCharge, isManagedPricingError, managedPricingUrl, PLAN_PRICE, PLAN_CURRENCY, TRIAL_DAYS } = require('../utils/billing');
const { refreshPlan, planCheckIsStale } = require('../utils/subscriptionSync');
const { PLANS, TIER_ORDER, tierOf, needsPlanChoice } = require('../utils/plans');
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
 * Shopify App Pricing sends no plan-change webhooks, so confirm the plan with Shopify: always when the
 * admin asks (Plans page, incl. the return from Shopify's plan page), otherwise when the last check is
 * older than 6 hours. Never throws; on failure the saved plan is kept.
 */
async function syncPlan(req, force) {
  const store = req.store;
  if (store.isInternal === true) return;
  if (!force && !planCheckIsStale(store)) return;
  try {
    const token = await refreshAccessTokenIfNeeded(store, { sessionToken: sessionTokenOf(req) });
    if (token) await refreshPlan(store, token);
  } catch (err) {
    console.warn('[billing] plan check skipped:', err.message);
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
    return res.json({
      ...report,
      plans: planCards(),
      upgradeUrl: managedPricingUrl(req.store.shopDomain),
      planCheckedAt: req.store.planCheckedAt || null,
      needsPlanChoice: needsPlanChoice(req.store),
      trialDays: TRIAL_DAYS,
    });
  } catch (err) {
    console.error('[billing] usage error:', err.message);
    return res.status(500).json({ error: 'Could not load your plan usage' });
  }
});

/**
 * POST /api/billing/:shopDomain/choose-free
 * The merchant chose the Free plan on the "Choose your plan" screen. -> { ok, needsPlanChoice }
 */
router.post('/:shopDomain/choose-free', requireAuth, requireStoreOwnerAnyPlan, async (req, res) => {
  try {
    const now = new Date();
    await Store.updateOne({ shopDomain: req.store.shopDomain }, { planChosenAt: now });
    req.store.planChosenAt = now;
    return res.json({ ok: true, needsPlanChoice: needsPlanChoice(req.store) });
  } catch (err) {
    console.error('[billing] choose-free error:', err.message);
    return res.status(500).json({ error: 'Could not save your plan choice' });
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
