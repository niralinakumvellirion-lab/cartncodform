const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { refreshAccessTokenIfNeeded } = require('../utils/shopify');
const Store = require('../models/Store');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const CodOrder = require('../models/CodOrder');
const PushSubscription = require('../models/PushSubscription');

const router = express.Router();

// In-memory cache for GET /:shopDomain/products — the trimmed, active-only
// product list per shop, 5 minutes. A plain module-level Map is enough
// ("a small in-memory cache", per spec): this file is a single Express
// router instance shared by the one running process, same lifetime as
// every other in-process cache already in this codebase. Keyed by
// shopDomain only (not by limit) — a cache hit is sliced to the requested
// limit, so repeat opens of the picker at the same (typically default)
// limit are served from cache; a later request asking for MORE items than
// were cached on the populating call just gets fewer than it asked for
// until the entry naturally expires, rather than erroring.
const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000;
const productsCache = new Map(); // shopDomain -> { data, expiresAt }

// Phase C2: the old `GET /api/stores` (list-my-stores) route was removed. It
// filtered on `req.userEmail`, which no longer exists after the session-token
// auth swap, and a single-shop embedded app has no use for it.

/**
 * GET /api/stores/:shopDomain/customers
 */
router.get('/:shopDomain/customers', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const { status } = req.query;

    const filter = { shopDomain };
    if (status) filter.status = status;

    const customers = await AbandonedCustomer.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(customers);
  } catch (err) {
    console.error('[stores] GET /:shopDomain/customers error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch abandoned customers' });
  }
});

/**
 * GET /api/stores/:shopDomain/orders
 */
router.get('/:shopDomain/orders', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const { status } = req.query;

    const filter = { shopDomain };
    if (status) filter.status = status;

    const orders = await CodOrder.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(orders);
  } catch (err) {
    console.error('[stores] GET /:shopDomain/orders error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch COD orders' });
  }
});

/**
 * GET /api/stores/:shopDomain/products
 * Query: ?q=<search term> (optional), ?limit=<n> (default 50, max 250,
 * applied AFTER any search filtering). Returns a trimmed, active-only
 * product list: [{ id, title, handle, imageUrl, status }].
 *
 * Search is done LOCALLY (case-insensitive substring match on title),
 * never via Shopify's own title= query param — that param is an EXACT
 * match, not substring, so searching "navratri" returned [] even for a
 * product actually titled "Navratri Special Kurta". The cache now backs
 * both the plain browse list and every search, since a search no longer
 * needs its own live Shopify call — filtering happens in JS against
 * whichever list (cached or freshly fetched) is in scope.
 *
 * KNOWN LIMITATION: the underlying list this searches is capped at 250
 * products — Shopify's own per-request max for products.json, and what
 * this route always fetches regardless of the requested `limit`. A store
 * with MORE than 250 active products could have real matches beyond that
 * window silently missed by a search. Fixing this would mean paginating
 * through Shopify's product list (following page_info cursors) until the
 * full catalog is fetched — deliberately not built here; flagging it as
 * a follow-up rather than doing it as part of this fix.
 */
router.get('/:shopDomain/products', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const q = String(req.query.q || '').trim();

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    limit = Math.min(limit, 250);

    let allProducts;
    const cached = productsCache.get(shopDomain);
    if (cached && cached.expiresAt > Date.now()) {
      allProducts = cached.data;
    } else {
      const store = await Store.findOne({ shopDomain })
        .select('shopDomain accessToken accessTokenExpiresAt onlineAccessToken onlineTokenExpiresAt');
      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }

      const apiToken = await refreshAccessTokenIfNeeded(store);
      if (!apiToken) {
        console.error('[stores] GET /:shopDomain/products — no usable Admin API token for', shopDomain);
        return res.status(502).json({
          error: 'Could not authenticate with Shopify to load products. Please reconnect the store.',
        });
      }

      // Always fetch Shopify's own per-request max (250), never scoped by
      // `title=` — the response `limit` is applied to our own
      // filtered/searched result below, not to this fetch.
      const params = new URLSearchParams({
        limit: '250',
        fields: 'id,title,handle,image,status',
      });

      let shopifyRes;
      try {
        shopifyRes = await fetch(
          `https://${shopDomain}/admin/api/2025-01/products.json?${params.toString()}`,
          {
            headers: {
              'X-Shopify-Access-Token': apiToken,
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (fetchErr) {
        console.error('[stores] GET /:shopDomain/products — Shopify request failed:', fetchErr.message);
        return res.status(502).json({ error: 'Failed to reach Shopify to load products. Please try again.' });
      }

      if (!shopifyRes.ok) {
        const errBody = await shopifyRes.text().catch(() => '');
        console.error(
          '[stores] GET /:shopDomain/products — Shopify API error:',
          shopifyRes.status, errBody
        );
        return res.status(502).json({ error: 'Failed to load products from Shopify. Please try again.' });
      }

      const data = await shopifyRes.json();
      allProducts = (data.products || [])
        .filter((p) => p.status === 'active')
        .map((p) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          imageUrl: p.image?.src || null,
          status: p.status,
        }));

      productsCache.set(shopDomain, {
        data: allProducts,
        expiresAt: Date.now() + PRODUCTS_CACHE_TTL_MS,
      });
    }

    let result = allProducts;
    if (q) {
      const term = q.trim().toLowerCase();
      result = allProducts.filter((p) => p.title.toLowerCase().includes(term));
    }

    return res.json(result.slice(0, limit));
  } catch (err) {
    console.error('[stores] GET /:shopDomain/products error:', err.message);
    return res.status(502).json({ error: 'Failed to load products from Shopify. Please try again.' });
  }
});

/**
 * DELETE /api/stores/:shopDomain
 * Disconnect a store: remove the Store plus every record tied to that shop.
 */
router.delete('/:shopDomain', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();

    await Store.findOneAndDelete({ shopDomain });

    const [abandoned, cod, push] = await Promise.all([
      AbandonedCustomer.deleteMany({ shopDomain }),
      CodOrder.deleteMany({ shopDomain }),
      PushSubscription.deleteMany({ shopDomain }),
    ]);

    console.log(
      `[stores] Disconnected store: ${shopDomain} ` +
        `(removed ${abandoned.deletedCount} abandoned, ${cod.deletedCount} COD, ` +
        `${push.deletedCount} push)`
    );

    return res.json({ success: true, message: 'Store disconnected' });
  } catch (err) {
    console.error('[stores] DELETE /:shopDomain error:', err.message);
    return res.status(500).json({ error: 'Failed to disconnect store' });
  }
});

module.exports = router;
