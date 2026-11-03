'use strict';

/**
 * POST /api/discounts/:shop/sync-tiers - the reason must reach the admin screen.
 * A bare 500 showed only "failed (500)"; now a failure answers 200 { synced: false, syncError }.
 * Handler pulled off the router and called directly (same style as discountConfigRoutes.test.js).
 */

jest.mock('../models/Store', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/DiscountConfig', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/CodOrder', () => ({}));
jest.mock('../utils/email', () => ({ sendNewCodOrderEmail: jest.fn() }));
jest.mock('../utils/pushNotification', () => ({ sendPushToStore: jest.fn() }));
jest.mock('../middleware/requireOwner', () => ({ requireAuth: jest.fn(), requireStoreOwner: jest.fn() }));
jest.mock('../utils/shopify', () => ({ verifyProxySignature: jest.fn(() => true), API_VERSION: '2026-10' }));
jest.mock('../services/profileService', () => ({ upsertProfile: jest.fn() }));
jest.mock('../services/tierSync', () => ({ syncTiers: jest.fn() }));

const DiscountConfig = require('../models/DiscountConfig');
const tierSync = require('../services/tierSync');
const router = require('../routes/discounts');

const layer = router.stack.find((l) => l.route && l.route.path === '/:shopDomain/sync-tiers' && l.route.methods.post);
const handler = layer.route.stack[layer.route.stack.length - 1].handle;

function mockRes() {
  const res = { body: null, statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const run = async (shop = ' Demo.myshopify.com ') => {
  const res = mockRes();
  await handler({ params: { shopDomain: shop } }, res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  DiscountConfig.updateOne.mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());

describe('POST /:shopDomain/sync-tiers', () => {
  test('success -> { synced: true }', async () => {
    tierSync.syncTiers.mockResolvedValue({ synced: true, discountId: 'gid://x/1' });
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ synced: true, syncError: null });
    expect(tierSync.syncTiers).toHaveBeenCalledWith('demo.myshopify.com');
  });

  test('service says not synced -> reason returned and stored', async () => {
    tierSync.syncTiers.mockResolvedValue({ synced: false, error: 'No config found for shop' });
    const res = await run();
    expect(res.body).toEqual({ synced: false, syncError: 'No config found for shop' });
    expect(DiscountConfig.updateOne).toHaveBeenCalledWith(
      { shopDomain: 'demo.myshopify.com' },
      { $set: { 'quantityTiers.lastSyncError': 'No config found for shop' } }
    );
  });

  test('service throws -> 200 with the reason (not a bare 500), reason also stored', async () => {
    tierSync.syncTiers.mockRejectedValue(new Error('Shopify refused the request: Invalid API key or access token'));
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ synced: false, syncError: 'Shopify refused the request: Invalid API key or access token' });
    expect(DiscountConfig.updateOne).toHaveBeenCalledWith(
      { shopDomain: 'demo.myshopify.com' },
      { $set: { 'quantityTiers.lastSyncError': 'Shopify refused the request: Invalid API key or access token' } }
    );
  });

  test('a very long reason is cut to 300 characters', async () => {
    tierSync.syncTiers.mockRejectedValue(new Error('x'.repeat(2000)));
    const res = await run();
    expect(res.body.syncError).toHaveLength(300);
  });

  test('a failing save of the reason never breaks the answer', async () => {
    tierSync.syncTiers.mockRejectedValue(new Error('boom'));
    DiscountConfig.updateOne.mockRejectedValue(new Error('db down'));
    const res = await run();
    expect(res.body).toEqual({ synced: false, syncError: 'boom' });
  });
});
