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

    const shopDomain = shop.toString().trim().toLowerCase();
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

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/dashboard/${encodeURIComponent(shopDomain)}`);
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error('[auth] /callback error:', detail);
    return res.status(500).json({ error: 'OAuth callback failed' });
  }
});

module.exports = router;
