const express = require('express');
const router = express.Router();

const Store = require('../models/Store');
const DiscountConfig = require('../models/DiscountConfig');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { verifyProxySignature, API_VERSION } = require('../utils/shopify');

// The four storefront actions that can earn a discount code, and the
// DiscountConfig sub-doc key each maps to.
const ACTIONS = ['push', 'email', 'phone', 'both'];
const ACTION_KEYS = ['pushDiscount', 'emailDiscount', 'phoneDiscount', 'bothDiscount'];
const DEFAULT_PREFIX = {
  pushDiscount: 'PUSH',
  emailDiscount: 'EMAIL',
  phoneDiscount: 'PHONE',
  bothDiscount: 'VIP',
};

// A full config object with schema defaults — returned by GET when the shop
// has never saved the Discounts screen, so the admin always renders a
// complete form.
function defaultConfig(shop) {
  return {
    shopDomain: shop,
    pushDiscount: { enabled: false, percentage: 10, maxUses: 100, expiryDays: 7, prefix: 'PUSH' },
    emailDiscount: { enabled: false, percentage: 15, maxUses: 100, expiryDays: 7, prefix: 'EMAIL' },
    phoneDiscount: { enabled: false, percentage: 15, maxUses: 100, expiryDays: 7, prefix: 'PHONE' },
    bothDiscount: { enabled: false, percentage: 20, maxUses: 100, expiryDays: 7, prefix: 'VIP' },
    offerHeadline: 'Get a discount on your first order!',
  };
}

// Clamp / coerce one incoming rule sub-doc before it is written.
function sanitizeRule(input, fallbackPrefix) {
  const r = input && typeof input === 'object' ? input : {};
  const pct = Number(r.percentage);
  const uses = Number(r.maxUses);
  const days = Number(r.expiryDays);
  const prefix = String(r.prefix || fallbackPrefix)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  return {
    enabled: !!r.enabled,
    percentage: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 10,
    maxUses: Number.isFinite(uses) ? Math.min(100000, Math.max(1, Math.round(uses))) : 100,
    expiryDays: Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : 7,
    prefix: prefix || fallbackPrefix,
  };
}

/**
 * Core: create a single-use-limited Shopify discount code for `action`.
 * Shared by the storefront POST route below and proxy.js POST /generate-discount.
 *
 * @returns {Promise<{code: string|null, percentage?: number, expiryDays?: number, error?: string}>}
 */
async function generateDiscount(shopDomain, body = {}) {
  const shop = String(shopDomain || '').trim().toLowerCase();
  const action = String(body.action || '').trim();

  if (!shop || ACTIONS.indexOf(action) === -1) {
    return { code: null, error: 'Invalid action' };
  }

  const [config, store] = await Promise.all([
    DiscountConfig.findOne({ shopDomain: shop }),
    Store.findOne({ shopDomain: shop }).select(
      'accessToken onlineAccessToken onlineTokenExpiresAt'
    ),
  ]);

  if (!store || !store.accessToken) {
    return { code: null, error: 'Store not connected' };
  }

  // Prefer the online token (shpua_) — works with new Shopify API.
  // Fall back to the offline token for backwards compatibility.
  let apiToken = store.onlineAccessToken || store.accessToken;

  // Check if the online token is expired.
  if (store.onlineAccessToken && store.onlineTokenExpiresAt) {
    if (new Date() > store.onlineTokenExpiresAt) {
      console.log('[discounts] online token expired for', shop);
      // Fall back to offline token.
      apiToken = store.accessToken;
    }
  }

  console.log(
    '[discounts] using token type:',
    apiToken && apiToken.startsWith('shpua_') ? 'online' : 'offline'
  );

  // action -> config sub-doc: push->pushDiscount, email->emailDiscount,
  // phone->phoneDiscount, both->bothDiscount.
  const cfg = config && config[action + 'Discount'];
  if (!cfg || !cfg.enabled) {
    // This action's discount is switched off — nothing to hand out.
    return { code: null, shop };
  }

  const code =
    (cfg.prefix || action.toUpperCase()) +
    '_' +
    Math.random().toString(36).slice(2, 8).toUpperCase();

  // Back-date startsAt by a minute so a small client/server clock skew can't
  // make Shopify reject the code as "starts in the future".
  const startsAt = new Date(Date.now() - 60 * 1000);
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + (cfg.expiryDays || 7));

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                nodes { code }
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    basicCodeDiscount: {
      title: code,
      code,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      customerGets: {
        value: { percentage: (cfg.percentage || 0) / 100 },
        items: { all: true },
      },
      appliesOncePerCustomer: true,
      usageLimit: cfg.maxUses || 100,
      // Required as of the 2024-10+ discounts schema: eligibility now goes
      // through `context` (the legacy `customerSelection` field is
      // deprecated). Omitting it is what produces Shopify's userErrors
      // message "Context can't be blank". { all: ALL } = applies to every
      // buyer, matching the old customerSelection: { all: true } behavior.
      context: { all: 'ALL' },
    },
  };

  let data;
  try {
    const shopifyRes = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': apiToken,
        },
        body: JSON.stringify({ query: mutation, variables }),
      }
    );
    data = await shopifyRes.json();
  } catch (err) {
    console.error('[discounts] Shopify API error:', err.message);
    return { code: null, error: 'Discount service unavailable' };
  }

  // 1. Top-level GraphQL errors (auth / throttling / schema) — the mutation
  //    never ran. This is the ACCESS_DENIED case when the installed token
  //    predates the write_discounts scope. Do NOT log the token or any PII.
  if (Array.isArray(data && data.errors) && data.errors.length) {
    const gqlCode =
      (data.errors[0].extensions && data.errors[0].extensions.code) ||
      data.errors[0].message;
    console.error('[discounts] GraphQL error: ' + gqlCode);
    if (gqlCode === 'ACCESS_DENIED') {
      // Flag the store so the admin can prompt the merchant to reconnect.
      Store.updateOne({ shopDomain: shop }, { $set: { needsReauth: true } }).catch(() => {});
    }
    return { code: null, error: 'Discount creation failed' };
  }

  // 2. Field-level userErrors from the mutation itself (bad input, limits).
  const errors =
    data &&
    data.data &&
    data.data.discountCodeBasicCreate &&
    data.data.discountCodeBasicCreate.userErrors;
  if (errors && errors.length) {
    console.error('[discounts] discountCodeBasicCreate userErrors:', errors[0].message);
    return { code: null, error: errors[0].message };
  }

  // 3. Success requires a real node id. Anything else means the code was NOT
  //    created in Shopify — never hand back a code Shopify doesn't know.
  const node =
    data &&
    data.data &&
    data.data.discountCodeBasicCreate &&
    data.data.discountCodeBasicCreate.codeDiscountNode;
  if (!node || !node.id) {
    console.error('[discounts] discountCodeBasicCreate returned no codeDiscountNode.id');
    return { code: null, error: 'Discount creation failed' };
  }

  // Best-effort: attach the captured email/phone to a profile. Never blocks
  // the response and never logs the PII.
  const email = body.email ? String(body.email).trim() : '';
  const phone = body.phone ? String(body.phone).trim() : '';
  if (email || phone) {
    try {
      const { upsertProfile } = require('../services/profileService');
      upsertProfile(
        shop,
        { email: email || null, phone: phone || null, sessionId: body.sessionId || null },
        {
          ...(email
            ? { 'channels.email.address': email, 'channels.email.source': 'popup' }
            : {}),
          lastSeenAt: new Date(),
        }
      ).catch(() => {});
    } catch (e) {
      /* profileService optional — ignore */
    }
  }

  // `shop` is included so the storefront can build /discount/<code> redirect
  // URLs (and absolute links) client-side without a second round-trip.
  return { code, percentage: cfg.percentage, expiryDays: cfg.expiryDays, shop };
}

/**
 * GET /api/discounts/:shopDomain/config
 * Admin only. Returns { config } — a full object even when no row exists yet.
 */
router.get('/:shopDomain/config', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const doc = await DiscountConfig.findOne({ shopDomain: shop }).lean();
    return res.json({
      config: doc || defaultConfig(shop),
      // Surfaces the "reconnect to enable discounts" banner in the admin.
      needsReauth: !!(req.store && req.store.needsReauth),
    });
  } catch (err) {
    console.error('[discounts] GET config error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch discount config' });
  }
});

/**
 * PATCH /api/discounts/:shopDomain/config
 * Admin only. Upserts the DiscountConfig with any of the four rule sub-docs
 * (replaced wholesale, clamped) and offerHeadline.
 * -> { updated: true, config }
 */
router.patch('/:shopDomain/config', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const set = { updatedAt: new Date() };

    for (const key of ACTION_KEYS) {
      if (req.body[key] && typeof req.body[key] === 'object') {
        set[key] = sanitizeRule(req.body[key], DEFAULT_PREFIX[key]);
      }
    }
    if (typeof req.body.offerHeadline === 'string') {
      set.offerHeadline = req.body.offerHeadline.slice(0, 200);
    }

    const config = await DiscountConfig.findOneAndUpdate(
      { shopDomain: shop },
      { $set: set, $setOnInsert: { shopDomain: shop } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ updated: true, config });
  } catch (err) {
    console.error('[discounts] PATCH config error:', err.message);
    return res.status(500).json({ error: 'Failed to update discount config' });
  }
});

/**
 * POST /api/discounts/:shopDomain/generate
 * PUBLIC — called from the storefront popup through the App Proxy, so the
 * App Proxy signature is the auth (hard-enforced). Body:
 *   { action: 'push'|'email'|'phone'|'both', email?, phone?, sessionId }
 * -> { code, percentage, expiryDays } | { code: null }
 */
router.post('/:shopDomain/generate', async (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[discounts] Invalid or missing App Proxy signature on /generate — rejecting');
    return res.status(403).json({ code: null, error: 'Invalid signature' });
  }
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const result = await generateDiscount(shop, req.body || {});
    return res.json(result);
  } catch (err) {
    console.error('[discounts] POST generate error:', err.message);
    return res.status(500).json({ code: null, error: 'Failed to generate discount' });
  }
});

module.exports = router;
module.exports.generateDiscount = generateDiscount;
module.exports.defaultConfig = defaultConfig;
