'use strict';

jest.mock('../models/Store', () => ({
  findOne: jest.fn(),
}));
jest.mock('../models/DiscountConfig', () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../utils/shopify', () => ({ API_VERSION: '2025-01' }));

const Store = require('../models/Store');
const DiscountConfig = require('../models/DiscountConfig');
const { syncTiers } = require('../services/tierSync');

const SHOP = 'demo.myshopify.com';
const TOKEN = 'shpat_test_token';
const FN_ID = 'gid://shopify/ShopifyFunction/abc123';
const DISCOUNT_GID = 'gid://shopify/DiscountAutomaticNode/999';

function storeResult(token = TOKEN) {
  const lean = () => Promise.resolve({ accessToken: token });
  const select = () => ({ lean });
  return { select };
}

function storeNotFound() {
  const lean = () => Promise.resolve(null);
  const select = () => ({ lean });
  return { select };
}

function cfgResult(overrides = {}) {
  return {
    lean: () => Promise.resolve({
      quantityTiers: {
        enabled: true,
        tiers: [{ minQty: 2, percent: 10, badge: '' }],
        discountId: '',
        lastSyncAt: null,
        lastSyncError: '',
        ...overrides,
      },
    }),
  };
}

function shopifyJson(body) {
  return Promise.resolve({ json: () => Promise.resolve(body) });
}

function makeFetch(responses) {
  // responses is an array; each call pops one
  const q = [...responses];
  return jest.fn(() => {
    const next = q.shift();
    if (typeof next === 'function') return next();
    return shopifyJson(next);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  DiscountConfig.updateOne.mockResolvedValue({});
});

// ── no config ────────────────────────────────────────────────────────────────

test('no config → synced:false', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  const r = await syncTiers(SHOP);
  expect(r.synced).toBe(false);
  expect(r.error).toMatch(/No config/);
});

// ── store not connected ───────────────────────────────────────────────────────

test('store not connected → throws', async () => {
  Store.findOne.mockReturnValue(storeNotFound());
  DiscountConfig.findOne.mockReturnValue(cfgResult());
  await expect(syncTiers(SHOP)).rejects.toThrow('Store not connected');
});

// ── disabled: deactivates existing discount ──────────────────────────────────

test('disabled with existing discountId → deactivates', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue(cfgResult({ enabled: false, discountId: DISCOUNT_GID }));

  global.fetch = makeFetch([
    // writeShopMetafield: shop id query
    { data: { shop: { id: 'gid://shopify/Shop/1' } } },
    // writeShopMetafield: metafieldsSet
    { data: { metafieldsSet: { userErrors: [] } } },
    // deactivateDiscount
    { data: { discountAutomaticDeactivate: { automaticDiscountNode: { id: DISCOUNT_GID }, userErrors: [] } } },
  ]);

  const r = await syncTiers(SHOP);
  expect(r.synced).toBe(true);
  expect(DiscountConfig.updateOne).toHaveBeenCalled();
});

// ── disabled with no discountId → skips deactivate ──────────────────────────

test('disabled with no discountId → synced:true, no deactivate call', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue(cfgResult({ enabled: false, discountId: '' }));

  global.fetch = makeFetch([
    { data: { shop: { id: 'gid://shopify/Shop/1' } } },
    { data: { metafieldsSet: { userErrors: [] } } },
  ]);

  const r = await syncTiers(SHOP);
  expect(r.synced).toBe(true);
  expect(global.fetch).toHaveBeenCalledTimes(2); // only shop query + metafieldsSet
});

// ── create new discount ──────────────────────────────────────────────────────

test('enabled, no existing discount → creates discount', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue(cfgResult({ discountId: '' }));

  global.fetch = makeFetch([
    // writeShopMetafield
    { data: { shop: { id: 'gid://shopify/Shop/1' } } },
    { data: { metafieldsSet: { userErrors: [] } } },
    // getFunctionId
    { data: { shopifyFunctions: { nodes: [{ id: FN_ID, apiType: 'product_discounts', title: 'Quantity Tier Discount' }] } } },
    // createDiscount
    { data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: DISCOUNT_GID }, userErrors: [] } } },
  ]);

  const r = await syncTiers(SHOP);
  expect(r.synced).toBe(true);
  expect(r.discountId).toBe(DISCOUNT_GID);
  expect(DiscountConfig.updateOne).toHaveBeenCalledWith(
    { shopDomain: SHOP },
    expect.objectContaining({
      $set: expect.objectContaining({ 'quantityTiers.discountId': DISCOUNT_GID }),
    })
  );
});

// ── update existing discount ─────────────────────────────────────────────────

test('enabled, existing discountId → updates discount', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue(cfgResult({ discountId: DISCOUNT_GID }));

  global.fetch = makeFetch([
    { data: { shop: { id: 'gid://shopify/Shop/1' } } },
    { data: { metafieldsSet: { userErrors: [] } } },
    { data: { shopifyFunctions: { nodes: [{ id: FN_ID, apiType: 'product_discounts', title: 'Quantity Tier Discount' }] } } },
    { data: { discountAutomaticAppUpdate: { automaticAppDiscount: { discountId: DISCOUNT_GID }, userErrors: [] } } },
  ]);

  const r = await syncTiers(SHOP);
  expect(r.synced).toBe(true);
  expect(r.discountId).toBe(DISCOUNT_GID);
});

// ── function not deployed ────────────────────────────────────────────────────

test('function not deployed → throws (sync fails)', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue(cfgResult({ discountId: '' }));

  global.fetch = makeFetch([
    { data: { shop: { id: 'gid://shopify/Shop/1' } } },
    { data: { metafieldsSet: { userErrors: [] } } },
    { data: { shopifyFunctions: { nodes: [] } } }, // no matching function
  ]);

  await expect(syncTiers(SHOP)).rejects.toThrow('not deployed');
});

// ── Shopify API error on create ──────────────────────────────────────────────

test('create userErrors → throws', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue(cfgResult({ discountId: '' }));

  global.fetch = makeFetch([
    { data: { shop: { id: 'gid://shopify/Shop/1' } } },
    { data: { metafieldsSet: { userErrors: [] } } },
    { data: { shopifyFunctions: { nodes: [{ id: FN_ID, apiType: 'product_discounts', title: 'Quantity Tier Discount' }] } } },
    { data: { discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: [{ message: 'Invalid function id' }] } } },
  ]);

  await expect(syncTiers(SHOP)).rejects.toThrow('Invalid function id');
});

// ── shop metafield uses $app reserved namespace ───────────────────────────────

test('shop metafield uses $app namespace (no write_metafields scope)', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue(cfgResult({ discountId: '' }));

  let capturedMetafieldInput = null;
  global.fetch = jest.fn((url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.query && body.query.includes('metafieldsSet')) {
      capturedMetafieldInput = body.variables && body.variables.metafields && body.variables.metafields[0];
      return shopifyJson({ data: { metafieldsSet: { userErrors: [] } } });
    }
    return shopifyJson({
      data: {
        shop: { id: 'gid://shopify/Shop/1' },
        shopifyFunctions: { nodes: [{ id: FN_ID, apiType: 'product_discounts', title: 'Quantity Tier Discount' }] },
        discountAutomaticAppCreate: { automaticAppDiscount: { discountId: DISCOUNT_GID }, userErrors: [] },
      },
    });
  });

  await syncTiers(SHOP);
  expect(capturedMetafieldInput).not.toBeNull();
  expect(capturedMetafieldInput.namespace).toBe('$app');
  expect(capturedMetafieldInput.key).toBe('quantity_tiers');
});

// ── shop metafield failure is non-fatal ──────────────────────────────────────

test('shop metafield write failure is non-fatal', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue(cfgResult({ discountId: '' }));

  global.fetch = makeFetch([
    // shop id query throws
    () => { throw new Error('metafield write rejected'); },
    // getFunctionId
    { data: { shopifyFunctions: { nodes: [{ id: FN_ID, apiType: 'product_discounts', title: 'Quantity Tier Discount' }] } } },
    // createDiscount
    { data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: DISCOUNT_GID }, userErrors: [] } } },
  ]);

  const r = await syncTiers(SHOP);
  expect(r.synced).toBe(true); // still succeeded despite metafield failure
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringContaining('[tierSync] shop metafield write failed'),
    expect.any(String)
  );
});

// ── idempotent re-run ────────────────────────────────────────────────────────

test('idempotent re-run with same discountId → updates (not creates)', async () => {
  Store.findOne.mockReturnValue(storeResult());
  DiscountConfig.findOne.mockReturnValue(cfgResult({ discountId: DISCOUNT_GID }));

  let createCalled = false;
  let updateCalled = false;

  global.fetch = jest.fn((url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.query && body.query.includes('discountAutomaticAppCreate')) createCalled = true;
    if (body.query && body.query.includes('discountAutomaticAppUpdate')) updateCalled = true;

    return shopifyJson({
      data: {
        shop: { id: 'gid://shopify/Shop/1' },
        metafieldsSet: { userErrors: [] },
        shopifyFunctions: { nodes: [{ id: FN_ID, apiType: 'product_discounts', title: 'Quantity Tier Discount' }] },
        discountAutomaticAppUpdate: { automaticAppDiscount: { discountId: DISCOUNT_GID }, userErrors: [] },
      },
    });
  });

  await syncTiers(SHOP);
  expect(createCalled).toBe(false);
  expect(updateCalled).toBe(true);
});
