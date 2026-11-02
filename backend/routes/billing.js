const express = require('express');
const {
  requireAuth,
  requireStoreOwnerAnyPlan,
} = require('../middleware/requireOwner');
const { createSubscription, shouldUseTestCharge, PLAN_PRICE, PLAN_CURRENCY, TRIAL_DAYS } = require('../utils/billing');
const { hasActivePlan } = require('../utils/planAccess');
const { refreshAccessTokenIfNeeded } = require('../utils/shopify');

const router = express.Router();

function sessionTokenOf(req) {
  return (req.get('Authorization') || '').slice(7);
}

function getBackendUrl(req) {
  return process.env.BACKEND_URL || `${req.protocol}://${req.headers.host}`;
}

/**
 * GET /api/billing/:shopDomain/status
 * -> { hasAccess, plan, priceUsd, trialDays }
 * Works without a subscription so the admin can decide whether to show the
 * "Start your free trial" screen.
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
  return res.json({
    hasAccess: hasActivePlan(req.store),
    plan: req.store.plan || 'free',
    priceUsd: PLAN_PRICE,
    currency: PLAN_CURRENCY,
    trialDays: TRIAL_DAYS,
  });
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
    // Shopify's error body (no PII) explains refusals such as a non-public app.
    const detail = err.response
      ? `${err.response.status} ${JSON.stringify(err.response.data).slice(0, 500)}`
      : err.message;
    console.error('[billing] start error:', detail);
    return res.status(500).json({ error: 'Failed to start your free trial' });
  }
});

module.exports = router;
