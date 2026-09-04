const express = require('express');
const crypto = require('crypto');
const Store = require('../models/Store');
const OAuthState = require('../models/OAuthState');
const {
  SHOPIFY_API_KEY,
  buildAuthUrl,
  verifyHmac,
  exchangeCodeForToken,
  fetchShopEmail,
  registerAllWebhooks,
} = require('../utils/shopify');
const { getActiveSubscription, createSubscription } = require('../utils/billing');

const router = express.Router();

// Build the public base URL of THIS backend. In production BACKEND_URL must be
// set (e.g. https://cartncodform-backend.onrender.com) so the OAuth redirect_uri
// exactly matches the one registered in the Shopify app. Only when it is unset
// do we fall back to the incoming request's protocol + host.
function getBackendUrl(req) {
  return (
    process.env.BACKEND_URL || `${req.protocol}://${req.headers.host}`
  );
}

/**
 * GET /api/auth/install?shop=example.myshopify.com
 * Kicks off the Shopify OAuth flow by redirecting to the merchant's consent screen.
 */
router.get('/install', async (req, res) => {
  try {
    const shop = (req.query.shop || process.env.SHOP_DOMAIN || '').toString().trim().toLowerCase();

    if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      return res.status(400).json({ error: 'Missing or invalid ?shop=your-store.myshopify.com' });
    }

    if (!SHOPIFY_API_KEY) {
      return res.status(500).json({ error: 'SHOPIFY_API_KEY is not configured on the backend' });
    }

    // Optional: link the store to the dashboard account that started the install.
    const ownerEmail =
      (req.query.owner_email || '').toString().trim().toLowerCase() || undefined;

    const state = crypto.randomBytes(16).toString('hex');
    await OAuthState.create({ nonce: state, ownerEmail });

    const redirectUri = `${getBackendUrl(req)}/api/auth/callback`;
    const authUrl = buildAuthUrl(shop, redirectUri, state);

    console.log(`[auth] Starting OAuth for ${shop}`);
    console.log(`[auth] redirect_uri: ${redirectUri}`);
    return res.redirect(authUrl);
  } catch (err) {
    console.error('[auth] /install error:', err.message);
    return res.status(500).json({ error: 'Failed to start OAuth' });
  }
});

/**
 * GET /api/auth/callback
 * Handles the OAuth redirect from Shopify, exchanges the code for a token,
 * saves the store, and registers webhooks.
 */
router.get('/callback', async (req, res) => {
  try {
    const { shop, code, state } = req.query;

    if (!shop || !code || !state) {
      return res.status(400).json({ error: 'Missing shop, code or state in callback' });
    }

    // Validate + consume the state nonce (single use).
    const savedState = await OAuthState.findOneAndDelete({ nonce: state });
    if (!savedState) {
      return res.status(400).json({ error: 'Invalid or expired OAuth state' });
    }

    // Validate HMAC (skipped gracefully if secret missing, but logged).
    if (!verifyHmac(req.query)) {
      console.warn(`[auth] HMAC verification failed for ${shop} — continuing in dev mode`);
    }

    // Normalise: lowercase, no surrounding whitespace, no trailing slash.
    const shopDomain = shop.toString().trim().toLowerCase().replace(/\/+$/, '');
    const accessToken = await exchangeCodeForToken(shopDomain, code);

    // Owner email: prefer the one passed at install time, otherwise pull the
    // shop's contact email from the Shopify Admin API (GET /admin/api/<v>/shop.json).
    let ownerEmail = savedState.ownerEmail || null;
    if (!ownerEmail) {
      ownerEmail = await fetchShopEmail(shopDomain, accessToken);
    }

    const update = { shopDomain, accessToken, installedAt: new Date() };
    if (ownerEmail) update.ownerEmail = ownerEmail;

    const store = await Store.findOneAndUpdate(
      { shopDomain },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(
      `[auth] Store connected: ${shopDomain}${ownerEmail ? ` (owner: ${ownerEmail})` : ''}`
    );

    // Register webhooks (best-effort, non-blocking failures are logged).
    await registerAllWebhooks(shopDomain, accessToken, getBackendUrl(req));

    // Strip any trailing slash on FRONTEND_URL so we never emit "//dashboard".
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const dashboardUrl = `${frontendUrl}/dashboard/${shopDomain}`;

    // Check for an existing active subscription. If found, sync it
    // locally and go straight to the dashboard.
    try {
      const activeSub = await getActiveSubscription(shopDomain, accessToken);
      if (activeSub) {
        await Store.findOneAndUpdate(
          { shopDomain },
          {
            plan: 'pro',
            subscriptionId: activeSub.id,
            subscriptionStatus: activeSub.status,
            planUpdatedAt: new Date(),
          }
        );
        console.log(`[auth] Active subscription found for ${shopDomain} — redirecting to dashboard`);
        return res.redirect(dashboardUrl);
      }
    } catch (billingCheckErr) {
      console.error(`[auth] Billing check failed for ${shopDomain}:`, billingCheckErr.message);
      // Fall through to dashboard on free plan — don't block install on a billing API hiccup.
      return res.redirect(dashboardUrl);
    }

    // No active subscription — the merchant stays on the free plan
    // for now. They can upgrade later from the dashboard (a separate
    // "Upgrade" button/route will trigger createSubscription + redirect
    // to Shopify's hosted confirmation page).
    console.log(`[auth] No active subscription for ${shopDomain} — redirecting to dashboard on free plan`);
    return res.redirect(dashboardUrl);
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error('[auth] /callback error:', detail);
    return res.status(500).json({ error: 'OAuth callback failed' });
  }
});

/**
 * GET /api/auth/upgrade?shop=<domain>
 * Creates a new app subscription and redirects the merchant to
 * Shopify's hosted confirmation page. Requires the merchant to
 * already be an installed store (has an accessToken on file).
 */
router.get('/upgrade', async (req, res) => {
  try {
    const shop = (req.query.shop || '').toString().trim().toLowerCase();
    if (!shop) {
      return res.status(400).json({ error: 'shop is required' });
    }

    const store = await Store.findOne({ shopDomain: shop });
    if (!store) {
      return res.status(404).json({ error: 'Store not found — please reinstall the app' });
    }

    const backendUrl = getBackendUrl(req);
    const returnUrl = `${backendUrl}/api/auth/billing/callback?shop=${encodeURIComponent(shop)}`;
    const isTest = process.env.NODE_ENV !== 'production';

    const { confirmationUrl } = await createSubscription(shop, store.accessToken, returnUrl, isTest);

    if (!confirmationUrl) {
      return res.status(500).json({ error: 'Failed to create subscription' });
    }

    return res.redirect(confirmationUrl);
  } catch (err) {
    console.error('[auth] /upgrade error:', err.message);
    return res.status(500).json({ error: 'Failed to start upgrade' });
  }
});

/**
 * GET /api/auth/billing/callback?shop=<domain>&charge_id=<id>
 * Shopify redirects here after the merchant approves (or declines)
 * the subscription on the hosted confirmation page. Re-check the
 * active subscription and sync locally, then send them to the dashboard.
 */
router.get('/billing/callback', async (req, res) => {
  try {
    const shop = (req.query.shop || '').toString().trim().toLowerCase();
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const dashboardUrl = `${frontendUrl}/dashboard/${shop}`;

    if (!shop) {
      return res.redirect(frontendUrl);
    }

    const store = await Store.findOne({ shopDomain: shop });
    if (!store) {
      return res.redirect(dashboardUrl);
    }

    const activeSub = await getActiveSubscription(shop, store.accessToken);
    if (activeSub) {
      await Store.findOneAndUpdate(
        { shopDomain: shop },
        {
          plan: 'pro',
          subscriptionId: activeSub.id,
          subscriptionStatus: activeSub.status,
          planUpdatedAt: new Date(),
        }
      );
      console.log(`[auth] Subscription confirmed for ${shop}`);
    } else {
      console.log(`[auth] No active subscription after billing callback for ${shop} (declined?)`);
    }

    return res.redirect(dashboardUrl);
  } catch (err) {
    console.error('[auth] /billing/callback error:', err.message);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return res.redirect(frontendUrl);
  }
});

module.exports = router;
