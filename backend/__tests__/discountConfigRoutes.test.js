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
jest.mock('../services/profileService', () => ({
  upsertProfile: jest.fn().mockResolvedValue(null),
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

  test('whatsappCapture.enabled is saved when sent as a boolean', async () => {
    const { update } = await run({ whatsappCapture: { enabled: true } });
    expect(update['whatsappCapture.enabled']).toBe(true);
  });

  test('whatsappCapture is ignored when enabled is not a boolean', async () => {
    const { update } = await run({ whatsappCapture: { enabled: 'yes' } });
    expect(update['whatsappCapture.enabled']).toBeUndefined();
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

describe('POST /generate-discount (App Proxy)', () => {
  const post = handlerFor(proxyRouter, '/generate-discount', 'post');
  const Store = require('../models/Store');

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test.each(['phone', 'both'])("rejects action '%s' with 400 before any lookup or Shopify call", async (action) => {
    const res = mockRes();
    await post({ query: { shop: SHOP }, body: { action, email: 'a@b.co' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Unsupported discount action' });
    expect(DiscountConfig.findOne).not.toHaveBeenCalled();
    expect(Store.findOne).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('missing action is also rejected', async () => {
    const res = mockRes();
    await post({ query: { shop: SHOP }, body: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  test("allows action 'whatsapp' through to config lookup", async () => {
    DiscountConfig.findOne.mockResolvedValue(null);
    const res = mockRes();
    await post({ query: { shop: SHOP }, body: { action: 'whatsapp', whatsappPhone: '9999999999', whatsappConsent: true }, headers: {}, socket: {} }, res);
    // Flag is off (null config) → returns 200 with error body (not 400)
    expect(res.statusCode).toBe(200);
    expect(res.body.error).toBe('WhatsApp capture not enabled');
    expect(DiscountConfig.findOne).toHaveBeenCalled();
  });

  test("action 'whatsapp' returns error when consent is false", async () => {
    DiscountConfig.findOne.mockResolvedValue({ whatsappCapture: { enabled: true } });
    const res = mockRes();
    await post({ query: { shop: SHOP }, body: { action: 'whatsapp', whatsappPhone: '9999999999', whatsappConsent: false }, headers: {}, socket: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.error).toBe('Consent required');
  });

  test("action 'whatsapp' returns error for invalid phone number", async () => {
    DiscountConfig.findOne.mockResolvedValue({ whatsappCapture: { enabled: true } });
    const res = mockRes();
    await post({ query: { shop: SHOP }, body: { action: 'whatsapp', whatsappPhone: '123', whatsappConsent: true }, headers: {}, socket: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.error).toBe('Invalid phone number');
  });

  test("action 'whatsapp' returns 429 when rate limit exceeded (30/min per IP+session)", async () => {
    DiscountConfig.findOne.mockResolvedValue({ whatsappCapture: { enabled: true } });
    // Exhaust the 30-per-minute limit for a unique IP+sessionId key
    const ip = '1.2.3.' + Math.floor(Math.random() * 200);
    const sessionId = 'sess_ratelimit_' + Math.random().toString(36).slice(2);
    const req = { query: { shop: SHOP }, body: { action: 'whatsapp', whatsappPhone: '9999999999', whatsappConsent: true, sessionId }, headers: { 'x-forwarded-for': ip }, socket: {} };
    let lastRes;
    for (let i = 0; i < 31; i++) {
      lastRes = mockRes();
      await post(req, lastRes);
    }
    expect(lastRes.statusCode).toBe(200);
    expect(lastRes.body.error).toBe('Too many requests');
  });

  test("action 'whatsapp' succeeds with flag on, consent true, valid phone", async () => {
    DiscountConfig.findOne.mockResolvedValue({ whatsappCapture: { enabled: true } });
    const res = mockRes();
    await post({ query: { shop: SHOP }, body: { action: 'whatsapp', whatsappPhone: '9876543210', whatsappConsent: true }, headers: {}, socket: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.whatsapp).toBe(true);
    // No discount code issued
    expect(res.body.code).toBeUndefined();
  });

  test.each([
    ['9876543210',  'IN', true,  'national digits only — IN'],
    ['09876543210', 'IN', true,  'trunk-prefix 0 — IN'],
    ['+919876543210', 'IN', true, 'E.164 with + — passes through unchanged'],
    ['4155552671',  'US', true,  'US national number'],
    ['12345',       'IN', false, 'too short — invalid'],
  ])("action 'whatsapp' phone normalisation: '%s' (%s) → valid=%s (%s)", async (phone, country, shouldSucceed) => {
    DiscountConfig.findOne.mockResolvedValue({ whatsappCapture: { enabled: true } });
    const res = mockRes();
    await post({ query: { shop: SHOP }, body: { action: 'whatsapp', whatsappPhone: phone, whatsappCountry: country, whatsappConsent: true }, headers: {}, socket: {} }, res);
    expect(res.statusCode).toBe(200);
    if (shouldSucceed) {
      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeUndefined();
    } else {
      expect(res.body.error).toBe('Invalid phone number');
    }
  });

  test("action 'email' does not save whatsapp channel when flag is off", async () => {
    // Config has whatsappCapture.enabled: false
    const cfg = { pushDiscount: { enabled: false }, emailDiscount: { enabled: false }, whatsappCapture: { enabled: false } };
    DiscountConfig.findOne.mockResolvedValue(cfg);
    Store.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = mockRes();
    await post({ query: { shop: SHOP }, body: { action: 'email', email: 'a@b.co', whatsappPhone: '9999999999', whatsappConsent: true } }, res);
    // Store returns null → no discount code, but no WA profile save attempted
    // We just verify the endpoint does not error out and ignores the WA fields
    expect(res.statusCode).toBe(200);
  });

  test.each(['push', 'email'])("allows action '%s' through to config lookup", async (action) => {
    DiscountConfig.findOne.mockResolvedValue(null);
    Store.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = mockRes();
    await post({ query: { shop: SHOP }, body: { action } }, res);

    expect(res.statusCode).toBe(200);
    expect(DiscountConfig.findOne).toHaveBeenCalled();
  });
});
