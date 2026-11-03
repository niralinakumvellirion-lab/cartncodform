const Store = require('../models/Store');
const ProductImageCache = require('../models/ProductImageCache');
const { refreshAccessTokenIfNeeded, API_VERSION } = require('./shopify');

// Everything refreshAccessTokenIfNeeded() needs. The refresh pair must be included or an
// expired expiring token can never be renewed (the lookup then fails an hour after install).
const TOKEN_FIELDS =
  'shopDomain accessToken accessTokenExpiresAt refreshToken refreshTokenExpiresAt onlineAccessToken onlineTokenExpiresAt';

/**
 * Turn a scraped/API image URL into an absolute https URL, or null.
 * Protocol-relative "//cdn.shopify.com/..." gets "https:" prepended; anything
 * that is not http(s) after that (data:, javascript:, relative paths, empty)
 * is treated as missing.
 */
function normalizeImageUrl(url) {
  if (typeof url !== 'string') return null;
  let u = url.trim();
  if (!u) return null;
  if (u.startsWith('//')) u = `https:${u}`;
  return /^https?:\/\//i.test(u) ? u : null;
}

/**
 * carts/* webhooks don't include product images in line_items. Fall back to the
 * Shopify Admin API to fetch the product's primary image.
 */
async function fetchProductImage(shop, accessToken, productId) {
  try {
    if (!productId) return null;

    const shopKey = String(shop || '').trim().toLowerCase();
    const productKey = String(productId);

    // Check cache first — avoids a redundant Admin API call within 24h.
    try {
      const cached = await ProductImageCache.findOne({
        shopDomain: shopKey,
        productId: productKey,
      });
      if (cached && cached.imageUrl) {
        console.log(`[webhook] Product image for ${productId}: cache hit`);
        return cached.imageUrl;
      }
      if (cached && !cached.imageUrl) {
        // Stale null entry — delete it and fall through to re-fetch live,
        // instead of freezing "no image" in place until this row's TTL
        // index expires it (up to 24h). See FIX 1 below: new null results
        // are no longer written here at all, but rows written before that
        // fix still exist and would otherwise keep short-circuiting every
        // future attempt for this product.
        console.log(`[webhook] Discarding stale null-image cache entry for ${productId}, retrying`);
        await ProductImageCache.deleteOne({ shopDomain: shopKey, productId: productKey }).catch(() => {});
      }
    } catch (cacheErr) {
      console.log('[webhook] Cache lookup error (proceeding to fetch):', cacheErr.message);
    }

    // Resolve via the shared refreshAccessTokenIfNeeded() policy
    // (utils/shopify.js) instead of this function's own ad-hoc online-
    // first fallback — same underlying goal (Shopify now rejects the
    // legacy non-expiring offline token outright, see
    // audits/api-token-test-audit.txt), now centralized so every Admin
    // API call site behaves the same way. Re-derived from a fresh Store
    // lookup (rather than trusting the `accessToken` argument, which
    // every current caller passes as the store's offline accessToken)
    // since that argument may be stale; the passed-in `accessToken` is
    // kept as a last-resort fallback if no Store row is found at all.
    const store = await Store.findOne({ shopDomain: shopKey })
      .select(TOKEN_FIELDS);
    const apiToken = store ? await refreshAccessTokenIfNeeded(store) : accessToken;
    if (!apiToken) return null;

    console.log('[webhook] Fetching image for productId:', productId,
      'shop:', shop, 'hasToken:', !!apiToken);

    // A product reference is either Shopify's numeric product id or a storefront handle
    // (push links use whichever the signal stored). Handles are restricted to URL-safe
    // characters before they go into the search string.
    const isNumericId = /^\d+$/.test(productKey);
    if (!isNumericId && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(productKey)) return null;

    const gqlQuery = isNumericId
      ? `query ProductImage($id: ID!) {
          product(id: $id) { featuredImage { url } images(first: 1) { nodes { url } } }
        }`
      : `query ProductImageByHandle($q: String!) {
          products(first: 1, query: $q) { nodes { featuredImage { url } images(first: 1) { nodes { url } } } }
        }`;
    const variables = isNumericId
      ? { id: `gid://shopify/Product/${productKey}` }
      : { q: `handle:${productKey}` };
    const res = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gqlQuery, variables }),
      }
    );

    if (!res.ok) {
      console.warn('[webhook] fetchProductImage failed:', res.status, 'for', productId);
      return null;
    }

    const data = await res.json();
    if (data.errors) {
      console.warn('[webhook] fetchProductImage GraphQL error:', data.errors[0]?.message);
      return null;
    }
    const p = isNumericId ? data.data?.product : data.data?.products?.nodes?.[0];
    const imageUrl = p?.featuredImage?.url ||
                     p?.images?.nodes?.[0]?.url ||
                     null;
    console.log(`[webhook] Product image for ${productId}:`, imageUrl ? 'found' : 'not found');

    // Cache only truthy results — a null is not cached so a later retry
    // (after a transient auth failure etc.) can succeed.
    if (imageUrl) {
      try {
        await ProductImageCache.findOneAndUpdate(
          { shopDomain: shopKey, productId: productKey },
          { imageUrl, cachedAt: new Date() },
          { upsert: true }
        );
      } catch (cacheWriteErr) {
        console.log('[webhook] Cache write error (non-fatal):', cacheWriteErr.message);
      }
    }

    return imageUrl;
  } catch(err) {
    console.log('[webhook] Image fetch error:', err.message);
    return null;
  }
}

/**
 * fetchProductImage() capped at `ms` so a slow Shopify/Admin API call can
 * never hold up a caller (the journey endpoint). Resolves to a normalised
 * URL or null — never rejects.
 */
async function fetchProductImageWithTimeout(shop, productId, ms = 3000) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    const url = await Promise.race([
      fetchProductImage(shop, null, productId),
      timeout,
    ]);
    return normalizeImageUrl(url);
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The product a push link points at: ".../products/<id or handle>?x=y" -> "<id or handle>", else null.
 */
function productRefFromUrl(url) {
  const after = String(url || '').split('/products/')[1];
  if (!after) return null;
  return after.split(/[?#/]/)[0] || null;
}

module.exports = { normalizeImageUrl, fetchProductImage, fetchProductImageWithTimeout, productRefFromUrl };
