const crypto = require('crypto');
const axios = require('axios');
const Store = require('../models/Store');

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = 'read_orders,read_products,write_discounts';
const API_VERSION = '2026-10';

/**
 * Build the Shopify OAuth authorization URL the merchant is redirected to.
 */
function buildAuthUrl(shop, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verify the HMAC signature Shopify appends to OAuth redirects / requests.
 * `query` is the parsed query object (req.query).
 */
function verifyHmac(query) {
  if (!SHOPIFY_API_SECRET) return false;
  const { hmac, signature, ...rest } = query;
  if (!hmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(',') : rest[key]}`)
    .join('&');

  const generated = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(hmac));
  } catch (err) {
    return false;
  }
}

/**
 * Verify Shopify's App Proxy request signature.
 * Shopify appends ?signature=<hmac>&<other signed params> to every
 * App Proxy request; the HMAC is SHA256 of the remaining params sorted by
 * key and concatenated as key=value (no separator), keyed with the app's
 * shared secret (SHOPIFY_API_SECRET).
 *
 * `query` is the parsed query object (req.query).
 */
function verifyProxySignature(query) {
  try {
    const { signature, ...rest } = query;
    if (!signature) return false;
    if (!SHOPIFY_API_SECRET) {
      console.error('[proxy] SHOPIFY_API_SECRET not configured — cannot verify signature');
      return false;
    }

    const sorted = Object.keys(rest)
      .sort()
      .map((key) => {
        const val = Array.isArray(rest[key]) ? rest[key].join(',') : rest[key];
        return `${key}=${val}`;
      })
      .join('');

    const hash = crypto
      .createHmac('sha256', SHOPIFY_API_SECRET)
      .update(sorted)
      .digest('hex');

    return hash === signature;
  } catch (err) {
    console.error('[proxy] Signature verification error:', err.message);
    return false;
  }
}

/**
 * Verify the HMAC header on an incoming webhook request.
 * `rawBody` must be the raw request buffer/string (not the parsed JSON).
 */
function verifyWebhookHmac(rawBody, hmacHeader) {
  if (!SHOPIFY_API_SECRET || !hmacHeader) return false;
  const generated = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(hmacHeader));
  } catch (err) {
    return false;
  }
}

/**
 * Exchange a temporary OAuth `code` for an access token. Returns the full
 * token response object (access_token, expires_in, scope, ...) rather than
 * just the token string, so callers can also capture expires_in — Shopify's
 * current offline-token format is expiring, unlike the old non-expiring
 * format (see audits/api-token-test-audit.txt for the live 403 that format
 * now gets rejected with).
 */
async function exchangeCodeForToken(shop, code) {
  return postTokenRequest(shop, { code, expiring: '1' });
}

/**
 * POST to the shop's OAuth token endpoint, form-encoded as Shopify documents
 * for the expiring-token grants. Returns the raw response body.
 */
async function postTokenRequest(shop, params) {
  const { data } = await axios.post(
    `https://${shop}/admin/oauth/access_token`,
    new URLSearchParams({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      ...params,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } }
  );
  return data;
}

function secondsFromNow(seconds) {
  return seconds ? new Date(Date.now() + Number(seconds) * 1000) : null;
}

// Turn a token-endpoint response into the fields we store on Store.
function toTokenPair(data) {
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: secondsFromNow(data.expires_in),
    refreshToken: data.refresh_token || null,
    refreshTokenExpiresAt: secondsFromNow(data.refresh_token_expires_in),
  };
}

/**
 * OAuth Token Exchange: trade a valid App Bridge session token (id_token) for a
 * fresh OFFLINE Admin API access token, without a browser redirect. The
 * returned token carries whatever scopes the merchant has approved for the
 * current app version, so this is how an install picks up newly-added scopes.
 *
 * @param {string} shop         the *.myshopify.com domain
 * @param {string} sessionToken the App Bridge session token from the request
 * @returns {Promise<{accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt}>}
 *          a new EXPIRING offline token pair (caller stores it)
 */
async function exchangeSessionToken(shop, sessionToken) {
  const data = await postTokenRequest(shop, {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: sessionToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    expiring: '1',
  });
  return toTokenPair(data);
}

/**
 * Convert a stored NON-expiring offline token into an expiring one (Shopify
 * invalidates the old token). The caller must store the returned pair.
 */
async function migrateOfflineToken(shop, oldOfflineToken) {
  const data = await postTokenRequest(shop, {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: oldOfflineToken,
    subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    expiring: '1',
  });
  return toTokenPair(data);
}

/** Trade a refresh token for a new access + refresh token pair. */
async function refreshOfflineToken(shop, refreshToken) {
  const data = await postTokenRequest(shop, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return toTokenPair(data);
}

/**
 * OAuth Token Exchange: trade a valid App Bridge session token (id_token) for
 * an ONLINE Admin API access token (shpua_), tied to the admin user whose
 * session minted it and expiring after `expires_in` seconds.
 *
 * @param {string} shop         the *.myshopify.com domain
 * @param {string} sessionToken the App Bridge session token from the request
 * @returns {Promise<{token: string|undefined, expiresAt: Date|null}>}
 */
async function getOnlineToken(shop, sessionToken) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const { data } = await axios.post(url, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: sessionToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:online-access-token',
  });
  // data.access_token = online token (shpua_); data.expires_in = seconds until expiry.
  return {
    token: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
  };
}

/**
 * Fetch the shop record via Admin GraphQL and return the fields we need at
 * install time: contact email, IANA timezone, and shop name.
 * No scope beyond what an installed app already has (Shop is always readable).
 */
async function fetchShopInfo(shop, accessToken) {
  try {
    const url = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
    const query = `{ shop { email ianaTimezone name } }`;
    const { data } = await axios.post(
      url,
      { query },
      { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
    );
    const s = data && data.data && data.data.shop;
    return {
      email: (s && s.email) || null,
      ianaTimezone: (s && s.ianaTimezone) || null,
      shopName: (s && s.name) || null,
    };
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[shopify] Failed to fetch shop info for ${shop}: ${detail}`);
    return { email: null, ianaTimezone: null, shopName: null };
  }
}

/**
 * Fetch brand logo + primary color via Admin GraphQL.
 * No extra scope needed — Shop is always readable by an installed app.
 * Hard-timeout at 3 s. Never throws; returns nulls on any error so
 * the install callback can ignore failures.
 */
async function fetchBrandData(shop, accessToken) {
  try {
    const url = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
    const query = `{ shop { brand { logo { image { url } } colors { primary { background } } } } }`;
    const { data } = await axios.post(
      url,
      { query },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      }
    );
    const brand = data && data.data && data.data.shop && data.data.shop.brand;
    return {
      logoUrl: (brand && brand.logo && brand.logo.image && brand.logo.image.url) || null,
      primaryColor:
        (brand && brand.colors && brand.colors.primary && brand.colors.primary.background) || null,
    };
  } catch (err) {
    console.error(`[shopify] fetchBrandData failed for ${shop}:`, err.message);
    return { logoUrl: null, primaryColor: null };
  }
}


/**
 * Resolve a usable Admin API token for `store`. Prefers the offline
 * accessToken while it has a known, comfortably-future expiry; falls back
 * to the online token otherwise (including when accessTokenExpiresAt is
 * not set at all — true for every store that installed before this field
 * existed, which currently includes every real installed store — treating
 * an unknown expiry as "not provably valid" rather than trusting it
 * forever, since the pre-existing offline token for at least one store is
 * a legacy non-expiring format Shopify now rejects outright, see
 * audits/api-token-test-audit.txt). Flags needsReauth only once neither
 * token can be confirmed usable.
 *
 * NOTE: this is deliberately stricter than the literal version given in
 * this task's own instructions, which returned `store.accessToken`
 * immediately whenever accessTokenExpiresAt was unset — that would have
 * made every current call site (which today all have accessTokenExpiresAt
 * unset, since it's a brand-new field) always use the known-broken offline
 * token and never try the working online token, which is a regression from
 * webhooks.js's fetchProductImage() own pre-existing fallback logic (see
 * audits/token-fix-audit.txt for the full reasoning).
 */
function refreshAccessTokenIfNeeded(store, opts = {}) {
  // One resolution at a time per shop: a refresh replaces the refresh token,
  // so two concurrent refreshes could leave one caller with a dead token.
  const key = store.shopDomain;
  if (inflightTokenResolutions.has(key)) return inflightTokenResolutions.get(key);
  const p = resolveAccessToken(store, opts).finally(() => inflightTokenResolutions.delete(key));
  inflightTokenResolutions.set(key, p);
  return p;
}

const inflightTokenResolutions = new Map();

function logTokenFailure(what, shop, err) {
  const status = err && err.response && err.response.status;
  const code = err && err.response && err.response.data && err.response.data.error;
  console.warn(`[auth] ${what} failed for ${shop}:`, status || '', code || err.message);
}

async function saveTokenPair(shop, pair) {
  await Store.updateOne(
    { shopDomain: shop },
    {
      $set: {
        accessToken: pair.accessToken,
        accessTokenExpiresAt: pair.accessTokenExpiresAt,
        refreshToken: pair.refreshToken,
        refreshTokenExpiresAt: pair.refreshTokenExpiresAt,
        needsReauth: false,
      },
    }
  );
}

async function resolveAccessToken(store, opts) {
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;
  const shop = store.shopDomain;

  const offlineExpiry = store.accessTokenExpiresAt ? new Date(store.accessTokenExpiresAt) : null;
  const offlineKnownValid = offlineExpiry && offlineExpiry > new Date(now.getTime() + fiveMinutes);

  // Offline token has a known, comfortably-future expiry — use it.
  if (offlineKnownValid) {
    return store.accessToken;
  }

  // Expiring offline token is stale: trade the refresh token for a new pair.
  if (store.refreshToken && (!store.refreshTokenExpiresAt || new Date(store.refreshTokenExpiresAt) > now)) {
    try {
      const pair = await refreshOfflineToken(shop, store.refreshToken);
      await saveTokenPair(shop, pair);
      return pair.accessToken;
    } catch (err) {
      logTokenFailure('offline token refresh', shop, err);
      if (err.response && err.response.status === 401) {
        // Terminal: Shopify no longer knows this refresh token.
        await Store.updateOne({ shopDomain: shop }, { $set: { refreshToken: null, refreshTokenExpiresAt: null } }).catch(() => {});
      }
    }
  }

  // A live App Bridge session token can mint a brand-new expiring pair.
  if (opts.sessionToken) {
    try {
      const pair = await exchangeSessionToken(shop, opts.sessionToken);
      await saveTokenPair(shop, pair);
      return pair.accessToken;
    } catch (err) {
      logTokenFailure('session token exchange', shop, err);
    }
  }

  // Legacy store: a stored NON-expiring offline token (no expiry, no refresh
  // token). Shopify rejects it for the Admin API, so convert it once.
  if (!offlineExpiry && !store.refreshToken && store.accessToken) {
    try {
      const pair = await migrateOfflineToken(shop, store.accessToken);
      await saveTokenPair(shop, pair);
      return pair.accessToken;
    } catch (err) {
      logTokenFailure('offline token migration', shop, err);
    }
  }

  // Offline token is expired, expiring soon, or its expiry is unknown —
  // use the online token as fallback if it's present and unexpired.
  if (store.onlineAccessToken && store.onlineTokenExpiresAt) {
    const onlineExpiry = new Date(store.onlineTokenExpiresAt);
    if (onlineExpiry > now) {
      console.log('[auth] using onlineToken fallback for', store.shopDomain);
      return store.onlineAccessToken;
    }
  }

  // No usable online token. Only flag needsReauth once the offline token's
  // expiry is POSITIVELY known to be in the past — an unknown expiry still
  // gets one last attempt with the offline token rather than an immediate
  // reauth flag, since it may still work.
  if (offlineExpiry && offlineExpiry <= now) {
    console.warn('[auth] both tokens expired for', store.shopDomain, '— needs reauth');
    await Store.updateOne(
      { shopDomain: store.shopDomain },
      { $set: { needsReauth: true } }
    );
  }
  return store.accessToken; // return anyway, will fail gracefully
}

module.exports = {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SCOPES,
  API_VERSION,
  buildAuthUrl,
  verifyHmac,
  verifyProxySignature,
  verifyWebhookHmac,
  exchangeCodeForToken,
  exchangeSessionToken,
  migrateOfflineToken,
  refreshOfflineToken,
  getOnlineToken,
  fetchShopInfo,
  fetchBrandData,
  refreshAccessTokenIfNeeded,
};
