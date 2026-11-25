'use strict';

/**
 * The automatic discount's title must be unique per store. The live app uses
 * "Quantity Tier Discount"; the dev app (same test store) sets TIER_DISCOUNT_TITLE.
 * The Shopify FUNCTION is still looked up by its own title "Quantity Tier Discount".
 */

jest.mock('../models/Store', () => ({ findOne: jest.fn() }));
jest.mock('../models/DiscountConfig', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../utils/shopify', () => ({
  API_VERSION: '2026-10',
  refreshAccessTokenIfNeeded: jest.fn(async (s) => s),
}));

const ORIGINAL = process.env.TIER_DISCOUNT_TITLE;

function loadWithTitle(value) {
  jest.resetModules();
  if (value === undefined) delete process.env.TIER_DISCOUNT_TITLE;
  else process.env.TIER_DISCOUNT_TITLE = value;
  const Store = require('../models/Store');
  const DiscountConfig = require('../models/DiscountConfig');
  Store.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ accessToken: 'shpat_x' }) }) });
  DiscountConfig.findOne.mockReturnValue({
    lean: () => Promise.resolve({ quantityTiers: { enabled: true, tiers: [{ minQty: 2, percent: 10, badge: '' }], discountId: '' } }),
  });
  DiscountConfig.updateOne.mockResolvedValue({});
  return require('../services/tierSync');
}

function capturingFetch() {
  const bodies = [];
  const replies = [
    { data: { shop: { id: 'gid://shopify/Shop/1' } } },
    { data: { metafieldsSet: { userErrors: [] } } },
    { data: { shopifyFunctions: { nodes: [{ id: 'gid://shopify/ShopifyFunction/1', title: 'Quantity Tier Discount' }] } } },
    { data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/9' }, userErrors: [] } } },
  ];
  global.fetch = jest.fn((url, opts) => {
    bodies.push(JSON.parse(opts.body));
    const next = replies.shift() || { data: {} };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(next) });
  });
  return bodies;
}

function createdTitle(bodies) {
  const create = bodies.find((b) => /discountAutomaticAppCreate/.test(b.query));
  return create && create.variables.discount.title;
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.TIER_DISCOUNT_TITLE;
  else process.env.TIER_DISCOUNT_TITLE = ORIGINAL;
  delete global.fetch;
  jest.resetModules();
});

test('live default title', async () => {
  const { syncTiers } = loadWithTitle(undefined);
  const bodies = capturingFetch();
  const r = await syncTiers('demo.myshopify.com');
  expect(r.synced).toBe(true);
  expect(createdTitle(bodies)).toBe('Quantity Tier Discount');
});

test('dev app title from TIER_DISCOUNT_TITLE; function still found by its own title', async () => {
  const { syncTiers } = loadWithTitle('Quantity Tier Discount (Dev)');
  const bodies = capturingFetch();
  const r = await syncTiers('demo.myshopify.com');
  expect(r.synced).toBe(true);
  expect(createdTitle(bodies)).toBe('Quantity Tier Discount (Dev)');
});

test('blank env falls back to the live title', async () => {
  const { syncTiers } = loadWithTitle('   ');
  const bodies = capturingFetch();
  await syncTiers('demo.myshopify.com');
  expect(createdTitle(bodies)).toBe('Quantity Tier Discount');
});
