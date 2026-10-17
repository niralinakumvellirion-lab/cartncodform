'use strict';

/**
 * tierSync — idempotently creates/updates/deactivates the automatic
 * quantity-tier discount on Shopify and writes the discount-node metafield
 * that the Shopify Function reads, plus a shop metafield the theme block reads.
 *
 * A sync failure must NOT fail the config save: callers receive
 * { synced: false, error } and store lastSyncError on DiscountConfig.
 *
 * Shop metafield uses namespace "$app" (app-reserved) — no write_metafields
 * scope required. In Liquid: shop.metafields.$app.quantity_tiers
 */

const Store = require('../models/Store');
const DiscountConfig = require('../models/DiscountConfig');
const { API_VERSION } = require('../utils/shopify');

// ── Token resolution ─────────────────────────────────────────────────────────

async function getToken(shopDomain) {
  const store = await Store.findOne({ shopDomain })
    .select('accessToken onlineAccessToken onlineTokenExpiresAt')
    .lean();
  if (!store || !store.accessToken) throw new Error('Store not connected');
  if (
    store.onlineAccessToken &&
    store.onlineTokenExpiresAt &&
    new Date() < new Date(store.onlineTokenExpiresAt)
  ) {
    return store.onlineAccessToken;
  }
  return store.accessToken;
}

// ── Shopify GraphQL helper ───────────────────────────────────────────────────

async function gql(shopDomain, token, query, variables) {
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables: variables || {} }),
  });
  return res.json();
}

// ── Function ID lookup ───────────────────────────────────────────────────────

async function getFunctionId(shopDomain, token) {
  const data = await gql(shopDomain, token, `
    query {
      shopifyFunctions(first: 25) {
        nodes { id apiType title }
      }
    }
  `);
  const nodes = (data && data.data && data.data.shopifyFunctions && data.data.shopifyFunctions.nodes) || [];
  const fn = nodes.find(
    (n) => n.apiType === 'product_discounts' && n.title === 'Quantity Tier Discount'
  );
  if (!fn) throw new Error('Quantity Tier Discount function not deployed — run: shopify app deploy');
  return fn.id;
}

// ── Discount create / update / deactivate ────────────────────────────────────

const COMBINES_WITH = { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false };

async function createDiscount(shopDomain, token, functionId, configJson) {
  const data = await gql(shopDomain, token, `
    mutation Create($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }
  `, {
    discount: {
      title: 'Quantity Tier Discount',
      functionId,
      startsAt: new Date(Date.now() - 60000).toISOString(),
      combinesWith: COMBINES_WITH,
      metafields: [{
        namespace: 'cartncodform',
        key: 'function-configuration',
        type: 'json',
        value: configJson,
      }],
    },
  });

  const payload = data && data.data && data.data.discountAutomaticAppCreate;
  const errs = payload && payload.userErrors;
  if (errs && errs.length) throw new Error(errs[0].message);
  const gid = payload && payload.automaticAppDiscount && payload.automaticAppDiscount.discountId;
  if (!gid) throw new Error('discountAutomaticAppCreate returned no id');
  return gid;
}

async function updateDiscount(shopDomain, token, discountId, functionId, configJson) {
  const data = await gql(shopDomain, token, `
    mutation Update($id: ID!, $discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }
  `, {
    id: discountId,
    discount: {
      title: 'Quantity Tier Discount',
      functionId,
      combinesWith: COMBINES_WITH,
      metafields: [{
        namespace: 'cartncodform',
        key: 'function-configuration',
        type: 'json',
        value: configJson,
      }],
    },
  });

  const payload = data && data.data && data.data.discountAutomaticAppUpdate;
  const errs = payload && payload.userErrors;
  if (errs && errs.length) throw new Error(errs[0].message);
}

async function deactivateDiscount(shopDomain, token, discountId) {
  // discountAutomaticDeactivate is the safest — leaves the record but makes
  // it inactive. Use discountAutomaticDelete if you want full removal.
  const data = await gql(shopDomain, token, `
    mutation Deactivate($id: ID!) {
      discountAutomaticDeactivate(id: $id) {
        automaticDiscountNode { id }
        userErrors { field message }
      }
    }
  `, { id: discountId });

  const errs =
    data &&
    data.data &&
    data.data.discountAutomaticDeactivate &&
    data.data.discountAutomaticDeactivate.userErrors;
  if (errs && errs.length) {
    console.warn('[tierSync] deactivate userErrors (non-fatal):', errs[0].message);
  }
}

// ── Shop metafield write ────────────────────────────────────────────────────

async function writeShopMetafield(shopDomain, token, value) {
  // Uses the app-reserved namespace ($app). No write_metafields scope needed —
  // Shopify allows apps to write to their own reserved namespace.
  // In Liquid the block reads this as: shop.metafields.$app.quantity_tiers
  const shopData = await gql(shopDomain, token, `
    query { shop { id } }
  `);
  const shopId = shopData && shopData.data && shopData.data.shop && shopData.data.shop.id;
  if (!shopId) return;

  const result = await gql(shopDomain, token, `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message code }
      }
    }
  `, {
    metafields: [{
      namespace: '$app',
      key: 'quantity_tiers',
      type: 'json',
      value,
      ownerId: shopId,
    }],
  });

  const errs = result && result.data && result.data.metafieldsSet && result.data.metafieldsSet.userErrors;
  if (errs && errs.length) {
    throw new Error(errs[0].message);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * syncTiers(shopDomain) → { synced: bool, discountId?, error? }
 *
 * On enabled=true:
 *   1. Look up deployed function ID.
 *   2. Create or update the automatic discount with the tiers metafield.
 *   3. Persist discountId + lastSyncAt on DiscountConfig.
 *
 * On enabled=false:
 *   1. Deactivate the existing discount (if any).
 *   2. Clear discountId.
 *
 * Shop metafield write (4b) is attempted but failure is non-fatal.
 */
async function syncTiers(shopDomain) {
  const cfg = await DiscountConfig.findOne({ shopDomain }).lean();
  if (!cfg) return { synced: false, error: 'No config found for shop' };

  const qt = cfg.quantityTiers || {};
  const token = await getToken(shopDomain);

  const configJson = JSON.stringify({
    enabled: !!qt.enabled,
    tiers: Array.isArray(qt.tiers) ? qt.tiers : [],
  });

  // ── Shop metafield — non-fatal ───────────────────────────────────────────
  try {
    await writeShopMetafield(shopDomain, token, configJson);
  } catch (mfErr) {
    console.warn('[tierSync] shop metafield write failed:', mfErr.message);
  }

  // ── Deactivate when disabled ──────────────────────────────────────────────
  if (!qt.enabled) {
    if (qt.discountId) {
      try {
        await deactivateDiscount(shopDomain, token, qt.discountId);
      } catch (e) {
        console.warn('[tierSync] deactivate failed (non-fatal):', e.message);
      }
    }
    await DiscountConfig.updateOne(
      { shopDomain },
      { $set: { 'quantityTiers.lastSyncAt': new Date(), 'quantityTiers.lastSyncError': '' } }
    );
    return { synced: true };
  }

  // ── Create or update ──────────────────────────────────────────────────────
  const functionId = await getFunctionId(shopDomain, token);
  const existingId = qt.discountId || '';

  let discountId;
  if (existingId) {
    await updateDiscount(shopDomain, token, existingId, functionId, configJson);
    discountId = existingId;
  } else {
    discountId = await createDiscount(shopDomain, token, functionId, configJson);
  }

  await DiscountConfig.updateOne(
    { shopDomain },
    {
      $set: {
        'quantityTiers.discountId': discountId,
        'quantityTiers.lastSyncAt': new Date(),
        'quantityTiers.lastSyncError': '',
      },
    }
  );

  return { synced: true, discountId };
}

module.exports = { syncTiers };
