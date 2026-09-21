/**
 * PATCH /api/discounts/:shop/config and the App Proxy GET /discount-config:
 * per-discount offerText, and the phone/both "leak" being shut off.
 * Handlers are pulled off the routers and called directly with mock req/res.
 */

jest.mock('../models/Store', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/DiscountConfig', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../models/CodOrder', () => ({}));
jest.mock('../utils/email', () => ({ sendNewCodOrderEmail: jest.fn() }));
jest.mock('../utils/pushNotification', () => ({ sendPushToStore: jest.fn() }));
jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn(),
  requireStoreOwner: jest.fn(),
}));
jest.mock('../utils/shopify', () => ({
  verifyProxySignature: jest.fn(() => true),
  API_VERSION: '2025-01',
}));

const DiscountConfig = require('../models/DiscountConfig');
const discountsRouter = require('../routes/discounts');
const proxyRouter = require('../routes/proxy');

function handlerFor(router, path, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  const res = { body: null, statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = jest.fn();
  return res;
}

const SHOP = 'demo.myshopify.com';

beforeEach(() => {
  jest.clearAllMocks();
  DiscountConfig.findOneAndUpdate.mockReturnValue({
    lean: () => Promise.resolve({ ok: true }),
  });
});

describe('PATCH /:shopDomain/config', () => {
  const patch = handlerFor(discountsRouter, '/:shopDomain/config', 'patch');

  async function run(body) {
    const res = mockRes();
    await patch({ params: { shopDomain: SHOP }, body }, res);
    return { res, update: DiscountConfig.findOneAndUpdate.mock.calls[0][1].$set };
  }

  test('offerText is trimmed and capped at 120 chars for push and email', async () => {
    const { update } = await run({
      pushDiscount: { enabled: true, percentage: 10, offerText: '  hi there  ' },
      emailDiscount: { enabled: true, percentage: 15, offerText: 'x'.repeat(300) },
    });
    expect(update.pushDiscount.offerText).toBe('hi there');
    expect(update.emailDiscount.offerText).toHaveLength(120);
  });

  test('missing / non-string offerText saves as empty string', async () => {
    const { update } = await run({
      pushDiscount: { enabled: true, offerText: 42 },
      emailDiscount: { enabled: true },
    });
    expect(update.pushDiscount.offerText).toBe('');
    expect(update.emailDiscount.offerText).toBe('');
  });

  test('phone/both are always forced disabled, even if the body enables them', async () => {
    const { update } = await run({
      phoneDiscount: { enabled: true, percentage: 50 },
      bothDiscount: { enabled: true, percentage: 50 },
    });
    expect(update['phoneDiscount.enabled']).toBe(false);
    expect(update['bothDiscount.enabled']).toBe(false);
    // their values are not replaced from the request body
    expect(update.phoneDiscount).toBeUndefined();
    expect(update.bothDiscount).toBeUndefined();
  });

  test('phone/both forced disabled even when the body omits them', async () => {
    const { update } = await run({ offerHeadline: 'Hello' });
    expect(update['phoneDiscount.enabled']).toBe(false);
    expect(update['bothDiscount.enabled']).toBe(false);
    expect(update.offerHeadline).toBe('Hello');
  });
});

describe('GET /discount-config (App Proxy)', () => {
  const get = handlerFor(proxyRouter, '/discount-config', 'get');

  test('returns offerText for push/email and enabled:false for stale phone/both', async () => {
    DiscountConfig.findOne.mockReturnValue({
      lean: () => Promise.resolve({
        pushDiscount: { enabled: true, percentage: 10, offerText: ' Push text ' },
        emailDiscount: { enabled: true, percentage: 15, offerText: 'Email text' },
        phoneDiscount: { enabled: true, percentage: 15 },
        bothDiscount: { enabled: true, percentage: 20 },
        offerHeadline: 'Head',
      }),
    });
    const res = mockRes();
    await get({ query: { shop: SHOP } }, res);

    expect(res.body.pushDiscount).toEqual({ enabled: true, percentage: 10, offerText: 'Push text' });
    expect(res.body.emailDiscount).toEqual({ enabled: true, percentage: 15, offerText: 'Email text' });
    expect(res.body.phoneDiscount.enabled).toBe(false);
    expect(res.body.bothDiscount.enabled).toBe(false);
    expect(res.body.offerHeadline).toBe('Head');
  });
});
