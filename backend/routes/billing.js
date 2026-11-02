const express = require('express');
const {
  requireAuth,
  requireStoreOwnerAnyPlan,
} = require('../middleware/requireOwner');
const { createSubscription, PLAN_PRICE, PLAN_CURRENCY, TRIAL_DAYS } = require('../utils/billing');
const { hasActivePlan } = require('../utils/planAccess');
const { exchangeSessionToken, refreshAccessTokenIfNeeded } = require('../utils/shopify');

const router = express.Router();

function getBackendUrl(req) {
  return process.env.BACKEND_URL || `${req.protocol}://${req.headers.host}`;
}

/**
 * GET /api/billing/:shopDomain/status
 * -> { hasAccess, plan, priceUsd, trialDays }
 * Works without a subscription so the admin can decide whether to show the
 * "Start your free trial" screen.
 */
router.get('/:shopDomain/status', requireAuth, requireStoreOwnerAnyPlan, (req, res) => {
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
    const isTest = process.env.NODE_ENV !== 'production';

    // The stored offline token can be stale or a legacy format Shopify rejects
    // (403). Trade the merchant's live session token for a fresh one; fall back
    // to the shared token policy only if that exchange fails.
    let token;
    try {
      const sessionToken = (req.get('Authorization') || '').slice(7);
      token = await exchangeSessionToken(shop, sessionToken);
    } catch (exErr) {
      console.warn('[billing] token exchange failed, using stored token:', exErr.message);
    }
    if (!token) token = await refreshAccessTokenIfNeeded(req.store);

    const { confirmationUrl } = await createSubscription(shop, token, returnUrl, isTest);
    if (!confirmationUrl) {
      return res.status(500).json({ error: 'Failed to create subscription' });
    }
    return res.json({ confirmationUrl });
  } catch (err) {
    console.error('[billing] start error:', err.message);
    return res.status(500).json({ error: 'Failed to start your free trial' });
  }
});

module.exports = router;
