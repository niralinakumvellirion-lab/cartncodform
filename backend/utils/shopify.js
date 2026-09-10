const crypto = require('crypto');
const axios = require('axios');

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
 * Exchange a temporary OAuth `code` for a permanent access token.
 */
async function exchangeCodeForToken(shop, code) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const { data } = await axios.post(url, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  });
  return data.access_token;
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
  const topics = [
    'carts/create',
    'carts/update',
    'checkouts/create',
    'checkouts/update',
    'orders/create',
    'app_subscriptions/update',
    'app/uninstalled',
  ];

  for (const topic of topics) {
    let path;
    if (topic.startsWith('carts/')) path = 'cart';
    else if (topic.startsWith('checkouts/')) path = 'checkout';
    else if (topic.startsWith('orders/')) path = 'order';
    else if (topic === 'app_subscriptions/update') path = 'app-subscription';
    else if (topic === 'app/uninstalled') path = 'app-uninstalled';
    const address = `${backendUrl}/api/webhooks/${path}`;
    await registerWebhook(shop, accessToken, topic, address);
  }
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
  fetchShopEmail,
  registerWebhook,
  registerAllWebhooks,
};
