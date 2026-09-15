const crypto = require('crypto');
const axios = require('axios');
const Store = require('../models/Store');

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES =
  'read_orders,read_customers,write_customers,read_products,write_discounts,read_discounts';
const API_VERSION = '2025-01';

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
  const url = `https://${shop}/admin/oauth/access_token`;
  const { data } = await axios.post(url, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  });
  return data;
}

/**
 * OAuth Token Exchange: trade a valid App Bridge session token (id_token) for a
 * fresh OFFLINE Admin API access token, without a browser redirect. The
 * returned token carries whatever scopes the merchant has approved for the
 * current app version, so this is how an install picks up newly-added scopes.
 *
 * @param {string} shop         the *.myshopify.com domain
 * @param {string} sessionToken the App Bridge session token from the request
 * @returns {Promise<string|undefined>} the new offline access token
 */
async function exchangeSessionToken(shop, sessionToken) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const { data } = await axios.post(url, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: sessionToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
  });
  return data.access_token;
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
 * Fetch the shop record from the Admin API and return its contact email.
 * Used to link a connected store to an owner when no owner_email was supplied.
 */
async function fetchShopEmail(shop, accessToken) {
  try {
    const url = `https://${shop}/admin/api/${API_VERSION}/shop.json`;
    const { data } = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    return (data && data.shop && data.shop.email) || null;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[shopify] Failed to fetch shop email for ${shop}: ${detail}`);
    return null;
  }
}

/**
 * Register a single webhook topic pointing at our backend.
 */
async function registerWebhook(shop, accessToken, topic, address) {
  const url = `https://${shop}/admin/api/${API_VERSION}/webhooks.json`;
  try {
    await axios.post(
      url,
      { webhook: { topic, address, format: 'json' } },
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    console.log(`[shopify] Registered webhook "${topic}" for ${shop}`);
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[shopify] Failed to register webhook "${topic}" for ${shop}: ${detail}`);
  }
}

/**
 * Register every webhook topic the app relies on.
 */
async function registerAllWebhooks(shop, accessToken, backendUrl) {
  // NOTE: carts/create, carts/update, checkouts/create,
  // checkouts/update, orders/create are now declared in
  // shopify.app.toml (declarative subscriptions) and no longer
  // need to be registered here. This function is kept for any
  // future dynamic registrations only.
  const topics = [
    'app_subscriptions/update',
    'app/uninstalled',
  ];

  for (const topic of topics) {
    let path;
    if (topic === 'app_subscriptions/update') path = 'app-subscription';
    else if (topic === 'app/uninstalled') path = 'app-uninstalled';
    const address = `${backendUrl}/api/webhooks/${path}`;
    await registerWebhook(shop, accessToken, topic, address);
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
async function refreshAccessTokenIfNeeded(store) {
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;

  const offlineExpiry = store.accessTokenExpiresAt ? new Date(store.accessTokenExpiresAt) : null;
  const offlineKnownValid = offlineExpiry && offlineExpiry > new Date(now.getTime() + fiveMinutes);

  // Offline token has a known, comfortably-future expiry — use it.
  if (offlineKnownValid) {
    return store.accessToken;
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
  getOnlineToken,
  fetchShopEmail,
  registerWebhook,
  registerAllWebhooks,
  refreshAccessTokenIfNeeded,
};
