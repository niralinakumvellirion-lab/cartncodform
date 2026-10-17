/**
 * Tests for Birthday Phase 1:
 *   - defaultConfig() back-compat includes birthday fields
 *   - PATCH /api/discounts/:shop/config — birthday fields sanitized correctly
 *   - POST /apps/cartncodform/birthday — proxy route (valid, invalid, disabled, bad sig, rate limit)
 *   - Compliance: birthday sub-doc lives on Profile — deleted by Profile.deleteMany
 */

jest.mock('../models/DiscountConfig', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../models/Profile', () => ({
  find: jest.fn(),
  deleteMany: jest.fn(),
}));
jest.mock('../models/CodOrder', () => ({ findOne: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../models/Store', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
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
const { upsertProfile } = require('../services/profileService');
const { verifyProxySignature } = require('../utils/shopify');
const { defaultConfig } = require('../routes/discounts');
const discountsRouter = require('../routes/discounts');
const proxyRouter = require('../routes/proxy');

const SHOP = 'bday-test.myshopify.com';

function handlerFor(router, path, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${path}`);
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

// Unique-per-call session so rate-limit state never leaks between tests.
let _sessCounter = 0;
function uniqueSession() { return 'test-sess-' + (++_sessCounter) + '-' + Date.now(); }

beforeEach(() => {
  jest.clearAllMocks();
  verifyProxySignature.mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// 1. defaultConfig() back-compat includes birthday fields
// ---------------------------------------------------------------------------
describe('defaultConfig back-compat', () => {
  test('contains birthdayCapture with popup.enabled: false', () => {
    const cfg = defaultConfig(SHOP);
    expect(cfg.birthdayCapture).toBeDefined();
    expect(cfg.birthdayCapture.popup).toBeDefined();
    expect(cfg.birthdayCapture.popup.enabled).toBe(false);
  });

  test('contains birthdayDiscount with correct defaults', () => {
    const cfg = defaultConfig(SHOP);
    expect(cfg.birthdayDiscount).toBeDefined();
    expect(cfg.birthdayDiscount.enabled).toBe(false);
    expect(cfg.birthdayDiscount.percentage).toBe(15);
    expect(cfg.birthdayDiscount.expiryDays).toBe(7);
    expect(cfg.birthdayDiscount.prefix).toBe('BDAY');
    expect(cfg.birthdayDiscount.offerText).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 2. PATCH /api/discounts/:shop/config — birthday fields sanitized
// ---------------------------------------------------------------------------
describe('PATCH /:shopDomain/config — birthday fields', () => {
  const patch = handlerFor(discountsRouter, '/:shopDomain/config', 'patch');

  async function run(body) {
    const res = mockRes();
    DiscountConfig.findOneAndUpdate.mockReturnValueOnce({
      lean: () => Promise.resolve({ shopDomain: SHOP, ...body }),
    });
    await patch({ params: { shopDomain: SHOP }, body, store: {} }, res);
    return res;
  }

  test('birthdayCapture.popup.enabled true forwarded', async () => {
    await run({ birthdayCapture: { popup: { enabled: true } } });
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayCapture.popup.enabled']).toBe(true);
  });

  test('birthdayCapture.popup.enabled false forwarded', async () => {
    await run({ birthdayCapture: { popup: { enabled: false } } });
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayCapture.popup.enabled']).toBe(false);
  });

  test('birthdayCapture not in body — key absent from $set', async () => {
    await run({});
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayCapture.popup.enabled']).toBeUndefined();
  });

  test('birthdayDiscount.percentage clamped to 100', async () => {
    await run({ birthdayDiscount: { percentage: 150 } });
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayDiscount.percentage']).toBe(100);
  });

  test('birthdayDiscount.percentage clamped to 0', async () => {
    await run({ birthdayDiscount: { percentage: -5 } });
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayDiscount.percentage']).toBe(0);
  });

  test('birthdayDiscount.expiryDays clamped to 30', async () => {
    await run({ birthdayDiscount: { expiryDays: 90 } });
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayDiscount.expiryDays']).toBe(30);
  });

  test('birthdayDiscount.expiryDays clamped to 1', async () => {
    await run({ birthdayDiscount: { expiryDays: 0 } });
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayDiscount.expiryDays']).toBe(1);
  });

  test('birthdayDiscount.prefix sanitized — strips non-alphanum, uppercased', async () => {
    await run({ birthdayDiscount: { prefix: 'bday-2024!' } });
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayDiscount.prefix']).toBe('BDAY2024');
  });

  test('birthdayDiscount.prefix all non-alphanum falls back to BDAY', async () => {
    await run({ birthdayDiscount: { prefix: '!!!' } });
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayDiscount.prefix']).toBe('BDAY');
  });

  test('birthdayDiscount.offerText trimmed and capped at 120 chars', async () => {
    const long = 'x'.repeat(200);
    await run({ birthdayDiscount: { offerText: '  ' + long + '  ' } });
    const [, { $set }] = DiscountConfig.findOneAndUpdate.mock.calls[0];
    expect($set['birthdayDiscount.offerText'].length).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// 3. POST /apps/cartncodform/birthday — proxy route
// ---------------------------------------------------------------------------
describe('POST /birthday proxy route', () => {
  const post = handlerFor(proxyRouter, '/birthday', 'post');

  // Each test uses a unique IP+session to avoid rate-limit cross-contamination.
  let ipCounter = 100;
  function req(body = {}) {
    const ip = '10.0.' + (ipCounter++) + '.1';
    const session = uniqueSession();
    return {
      query: { shop: SHOP },
      body: { sessionId: session, ...body },
      headers: { 'x-forwarded-for': ip },
      socket: { remoteAddress: ip },
    };
  }

  function withConfig(doc) {
    DiscountConfig.findOne.mockReturnValueOnce({ lean: () => Promise.resolve(doc) });
  }

  function enabledConfig() {
    return { birthdayCapture: { popup: { enabled: true } } };
  }

  test('valid date (March 15) returns { ok: true } and calls upsertProfile', async () => {
    withConfig(enabledConfig());
    const res = mockRes();
    await post(req({ month: 3, day: 15 }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(upsertProfile).toHaveBeenCalledWith(
      SHOP,
      expect.any(Object),
      expect.objectContaining({ 'birthday.month': 3, 'birthday.day': 15, 'birthday.source': 'popup' })
    );
  });

  test('3a: resubmit does NOT include birthday.lastOfferYear → year guard is preserved', async () => {
    // birthday.lastOfferYear must never be sent in a POST /birthday update.
    // upsertProfile uses $set, so only the specified fields are touched.
    withConfig(enabledConfig());
    const res = mockRes();
    await post(req({ month: 6, day: 10 }), res);
    expect(res.statusCode).toBe(200);
    const updateArg = upsertProfile.mock.calls[upsertProfile.mock.calls.length - 1][2];
    expect(Object.keys(updateArg)).not.toContain('birthday.lastOfferYear');
  });

  test('Feb 29 is valid (leap-year birthday)', async () => {
    withConfig(enabledConfig());
    const res = mockRes();
    await post(req({ month: 2, day: 29 }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('Feb 30 is invalid — returns 400', async () => {
    withConfig(enabledConfig());
    const res = mockRes();
    await post(req({ month: 2, day: 30 }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('month 0 is invalid — returns 400', async () => {
    withConfig(enabledConfig());
    const res = mockRes();
    await post(req({ month: 0, day: 15 }), res);
    expect(res.statusCode).toBe(400);
  });

  test('month 13 is invalid — returns 400', async () => {
    withConfig(enabledConfig());
    const res = mockRes();
    await post(req({ month: 13, day: 1 }), res);
    expect(res.statusCode).toBe(400);
  });

  test('day 0 is invalid — returns 400', async () => {
    withConfig(enabledConfig());
    const res = mockRes();
    await post(req({ month: 1, day: 0 }), res);
    expect(res.statusCode).toBe(400);
  });

  test('day 32 is invalid — returns 400', async () => {
    withConfig(enabledConfig());
    const res = mockRes();
    await post(req({ month: 1, day: 32 }), res);
    expect(res.statusCode).toBe(400);
  });

  test('April 31 is invalid — returns 400', async () => {
    withConfig(enabledConfig());
    const res = mockRes();
    await post(req({ month: 4, day: 31 }), res);
    expect(res.statusCode).toBe(400);
  });

  test('disabled shop returns 403', async () => {
    withConfig({ birthdayCapture: { popup: { enabled: false } } });
    const res = mockRes();
    await post(req({ month: 5, day: 10 }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.ok).toBe(false);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  test('null config (no row) returns 403', async () => {
    withConfig(null);
    const res = mockRes();
    await post(req({ month: 5, day: 10 }), res);
    expect(res.statusCode).toBe(403);
  });

  test('bad signature returns 403 without looking up config', async () => {
    verifyProxySignature.mockReturnValueOnce(false);
    const res = mockRes();
    await post(req({ month: 5, day: 10 }), res);
    expect(res.statusCode).toBe(403);
    expect(DiscountConfig.findOne).not.toHaveBeenCalled();
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  test('rate limit: 6th request in 1 min from same ip+shop+session returns 429', async () => {
    const rlIp = '10.99.88.77';
    const rlSession = 'rl-bday-' + Date.now();
    const rlShop = 'rl-bday-' + Date.now() + '.myshopify.com';
    const r = () => ({
      query: { shop: rlShop },
      body: { sessionId: rlSession, month: 3, day: 15 },
      headers: { 'x-forwarded-for': rlIp },
      socket: { remoteAddress: rlIp },
    });

    for (let i = 0; i < 5; i++) {
      DiscountConfig.findOne.mockReturnValueOnce({ lean: () => Promise.resolve(enabledConfig()) });
      const res = mockRes();
      await post(r(), res);
      expect(res.statusCode).toBe(200);
    }

    const res6 = mockRes();
    await post(r(), res6);
    expect(res6.statusCode).toBe(429);
  });

  test('birthday month/day values are not included in any console.log call', async () => {
    withConfig(enabledConfig());
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = mockRes();
    await post(req({ month: 11, day: 22 }), res);
    const logOutput = spy.mock.calls.map((a) => a.join(' ')).join('\n');
    spy.mockRestore();
    // The values 11 and 22 must not appear in any log — birthday is PII.
    expect(logOutput).not.toMatch(/\b11\b.*birthday|birthday.*\b11\b/i);
    expect(logOutput).not.toMatch(/\b22\b.*birthday|birthday.*\b22\b/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Compliance — birthday sub-doc lives inside Profile; Profile.deleteMany
//    deletes the whole document, including birthday, channels.whatsapp, etc.
// ---------------------------------------------------------------------------
describe('Compliance: birthday covered by Profile.deleteMany', () => {
  test('Profile model has birthday sub-doc with required fields', () => {
    // Bypass the jest.mock so we read the real schema.
    const RealProfile = jest.requireActual('../models/Profile');
    const schema = RealProfile.schema;
    expect(schema.path('birthday.month')).toBeDefined();
    expect(schema.path('birthday.day')).toBeDefined();
    expect(schema.path('birthday.capturedAt')).toBeDefined();
    expect(schema.path('birthday.source')).toBeDefined();
  });
});
