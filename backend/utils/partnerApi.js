'use strict';

const axios = require('axios');
const { tierFromSubscription } = require('./plans');

/**
 * Shopify Partner API: the reliable source of a shop's Shopify App Pricing plan. Since 28 Apr 2026 App
 * Pricing sends no subscription webhooks; Shopify's docs say to confirm plans with activeSubscription.
 *
 * Env (Render): SHOPIFY_PARTNER_ID (number in the Partner Dashboard URL), SHOPIFY_PARTNER_API_TOKEN
 * (Partner API client token with "Manage apps"), SHOPIFY_PARTNER_APP_ID (app id, number or gid).
 * The token is organisation-wide: it is only ever sent to partners.shopify.com and never logged.
 */
const PARTNER_API_VERSION = '2026-07';

const ACTIVE_SUBSCRIPTION_QUERY = `query ActiveSubscription($appId: ID!, $shopId: ID!) {
  activeSubscription(appId: $appId, shopId: $shopId) {
    cancelAtEndOfCycle
    trialEndsAt
    items {
      handle
      description
      price {
        __typename
        ... on FlatRatePrice { amount }
      }
    }
  }
}`;

function partnerConfig() {
  const partnerId = String(process.env.SHOPIFY_PARTNER_ID || '').trim();
  const token = String(process.env.SHOPIFY_PARTNER_API_TOKEN || '').trim();
  const rawApp = String(process.env.SHOPIFY_PARTNER_APP_ID || '').trim();
  if (!/^\d+$/.test(partnerId) || !token || !rawApp) return null;
  const appId = /^\d+$/.test(rawApp) ? `gid://shopify/App/${rawApp}` : rawApp;
  if (!/^gid:\/\/shopify\/App\/\d+$/.test(appId)) return null;
  return { partnerId, token, appId };
}

function isPartnerApiConfigured() {
  return partnerConfig() !== null;
}

/**
 * The shop's active App Pricing subscription, or null when it has none.
 * -> { tier, handles, price, cancelAtEndOfCycle, trialEndsAt }
 * Throws when the API is not configured or Shopify refuses the request (the caller keeps the plan as is).
 */
async function getPartnerActiveSubscription(shopGid) {
  const cfg = partnerConfig();
  if (!cfg) throw new Error('Partner API is not configured');
  if (!/^gid:\/\/shopify\/Shop\/\d+$/.test(String(shopGid || ''))) throw new Error('Missing shop id');

  let res;
  try {
    res = await axios.post(
      `https://partners.shopify.com/${cfg.partnerId}/api/${PARTNER_API_VERSION}/graphql.json`,
      { query: ACTIVE_SUBSCRIPTION_QUERY, variables: { appId: cfg.appId, shopId: shopGid } },
      { headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': cfg.token }, timeout: 10000 }
    );
  } catch (err) {
    // Never pass axios' error on: its config carries the token.
    const status = err.response ? err.response.status : 'network';
    throw new Error(`Partner API request failed (${status})`);
  }
  const body = res.data || {};
  if (Array.isArray(body.errors) && body.errors.length) {
    const msg = body.errors.map((e) => (e && e.message) || 'error').join('; ').slice(0, 300);
    throw new Error(`Partner API error: ${msg}`);
  }
  const sub = body.data ? body.data.activeSubscription : undefined;
  if (sub === undefined) throw new Error('Partner API returned no data');
  if (!sub) return null;

  const items = Array.isArray(sub.items) ? sub.items : [];
  const handles = items.map((i) => i && i.handle).filter(Boolean);
  const names = [...handles, ...items.map((i) => i && i.description).filter(Boolean)];
  const flat = items.find((i) => i && i.price && i.price.__typename === 'FlatRatePrice');
  const price = flat ? Number(flat.price.amount) : null;
  return {
    tier: tierFromSubscription({ names, price }),
    handles,
    price: Number.isFinite(price) ? price : null,
    cancelAtEndOfCycle: !!sub.cancelAtEndOfCycle,
    trialEndsAt: sub.trialEndsAt || null,
  };
}

module.exports = {
  PARTNER_API_VERSION,
  ACTIVE_SUBSCRIPTION_QUERY,
  isPartnerApiConfigured,
  getPartnerActiveSubscription,
};
