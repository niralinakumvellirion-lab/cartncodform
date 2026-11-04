'use strict';

/**
 * Create (or revive) the Store record for a shop the first time its admin opens the app.
 *
 * Shopify can install the app itself ("managed installation", used when scopes are declared
 * in shopify.app.toml, and by the App Store review). That path never visits /api/auth/callback,
 * so no Store exists and every admin request would answer "Store not found". The embedded app
 * always has a valid App Bridge session token, so we trade it for an offline Admin API token
 * (OAuth Token Exchange) and save the same fields the OAuth callback saves.
 *
 * Also revives a Store marked 'uninstalled' (merchant re-installed): fresh tokens, status cleared.
 * Never touches settings or plan of an existing Store.
 */

const Store = require('../models/Store');
const { exchangeSessionToken, fetchShopInfo, fetchBrandData } = require('./shopify');

// One setup at a time per shop: the admin fires several requests at once on first load, and each
// token exchange can invalidate the previous one.
const inflight = new Map();

function validTimezone(tz) {
  if (!tz) return null;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

async function doBootstrap(shop, sessionToken) {
  const existing = await Store.findOne({ shopDomain: shop });
  // Another request already finished the setup while this one waited.
  if (existing && existing.subscriptionStatus !== 'uninstalled') return existing;

  let pair;
  try {
    pair = await exchangeSessionToken(shop, sessionToken);
  } catch (err) {
    const status = err && err.response && err.response.status;
    const code = err && err.response && err.response.data && err.response.data.error;
    console.warn(`[bootstrap] token exchange failed for ${shop}:`, status || '', code || err.message);
    return null;
  }
  if (!pair || !pair.accessToken) return null;

  const set = {
    accessToken: pair.accessToken,
    accessTokenExpiresAt: pair.accessTokenExpiresAt,
    refreshToken: pair.refreshToken,
    refreshTokenExpiresAt: pair.refreshTokenExpiresAt,
    needsReauth: false,
    installedAt: new Date(),
  };

  if (existing) {
    // Re-install: new tokens. Shopify ends the subscription on uninstall, so the plan is confirmed again
    // with Shopify, and the merchant is asked to choose a plan (installedAt is newer than planChosenAt).
    set.subscriptionStatus = null;
    set.plan = 'free';
    set.planTier = null;
    set.planCheckedAt = null;
    return Store.findOneAndUpdate({ shopDomain: shop }, { $set: set }, { new: true });
  }

  const info = await fetchShopInfo(shop, pair.accessToken);
  const brand = await fetchBrandData(shop, pair.accessToken);
  if (info.email) set.ownerEmail = info.email;
  if (info.shopName) set.shopName = info.shopName;
  const tz = validTimezone(info.ianaTimezone);
  if (tz) set.timezone = tz; // otherwise the schema's default applies
  if (brand.logoUrl) set.logoUrl = brand.logoUrl;
  if (brand.primaryColor) set.primaryColor = brand.primaryColor;

  try {
    const store = await Store.findOneAndUpdate(
      { shopDomain: shop },
      { $set: set, $setOnInsert: { shopDomain: shop } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`[bootstrap] Store created for ${shop}`);
    return store;
  } catch (err) {
    if (err && err.code === 11000) return Store.findOne({ shopDomain: shop }); // lost a race
    throw err;
  }
}

/** Returns the Store, or null when it could not be set up (the caller decides what to answer). */
function bootstrapStore(shop, sessionToken) {
  if (!shop || !sessionToken) return Promise.resolve(null);
  if (inflight.has(shop)) return inflight.get(shop);
  const p = doBootstrap(shop, sessionToken)
    .catch((err) => {
      console.error(`[bootstrap] failed for ${shop}:`, err.message);
      return null;
    })
    .finally(() => inflight.delete(shop));
  inflight.set(shop, p);
  return p;
}

module.exports = { bootstrapStore };
