'use strict';

/**
 * Tests for banner look fields (bgColor, textColor, highlight) in:
 * - PATCH /api/discounts/:shop/config (validation, persistence)
 * - GET /discount-config (proxy, defaults for legacy docs)
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
const proxyRouter     = require('../routes/proxy');

function handlerFor(router, path, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  const res = { body: null, statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = jest.fn();
  return res;
}

const SHOP = 'banner-test.myshopify.com';

beforeEach(() => {
  jest.clearAllMocks();
  DiscountConfig.findOneAndUpdate.mockReturnValue({
    lean: () => Promise.resolve({ ok: true }),
  });
});

const patch = handlerFor(discountsRouter, '/:shopDomain/config', 'patch');

async function runPatch(body) {
  const res = mockRes();
  await patch({ params: { shopDomain: SHOP }, body }, res);
  const calls = DiscountConfig.findOneAndUpdate.mock.calls;
  const set = calls.length ? calls[0][1].$set : null;
  return { res, set };
}

// ─── PATCH validation ─────────────────────────────────────────────────────────
describe('PATCH banner look fields', () => {
  test('saves valid bgColor', async () => {
    const { set } = await runPatch({ birthdayCapture: { banner: { bgColor: '#B4472B' } } });
    expect(set['birthdayCapture.banner.bgColor']).toBe('#B4472B');
  });

  test('saves valid textColor: auto', async () => {
    const { set } = await runPatch({ birthdayCapture: { banner: { textColor: 'auto' } } });
    expect(set['birthdayCapture.banner.textColor']).toBe('auto');
  });

  test('saves valid textColor: white', async () => {
    const { set } = await runPatch({ birthdayCapture: { banner: { textColor: 'white' } } });
    expect(set['birthdayCapture.banner.textColor']).toBe('white');
  });

  test('saves valid textColor: dark', async () => {
    const { set } = await runPatch({ birthdayCapture: { banner: { textColor: 'dark' } } });
    expect(set['birthdayCapture.banner.textColor']).toBe('dark');
  });

  test('coerces highlight to boolean: true', async () => {
    const { set } = await runPatch({ birthdayCapture: { banner: { highlight: 1 } } });
    expect(set['birthdayCapture.banner.highlight']).toBe(true);
  });

  test('coerces highlight to boolean: false', async () => {
    const { set } = await runPatch({ birthdayCapture: { banner: { highlight: 0 } } });
    expect(set['birthdayCapture.banner.highlight']).toBe(false);
  });

  test('rejects bgColor missing #', async () => {
    const { res } = await runPatch({ birthdayCapture: { banner: { bgColor: '3730A3' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/bgColor/i);
  });

  test('rejects bgColor with 3-digit hex', async () => {
    const { res } = await runPatch({ birthdayCapture: { banner: { bgColor: '#3A2' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/bgColor/i);
  });

  test('rejects bgColor as plain text', async () => {
    const { res } = await runPatch({ birthdayCapture: { banner: { bgColor: 'indigo' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/bgColor/i);
  });

  test('rejects invalid textColor', async () => {
    const { res } = await runPatch({ birthdayCapture: { banner: { textColor: 'yellow' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/textColor/i);
  });

  test('bgColor not present: field omitted from $set', async () => {
    const { set } = await runPatch({ birthdayCapture: { banner: { enabled: true } } });
    expect(set).not.toHaveProperty('birthdayCapture.banner.bgColor');
  });

  test('textColor not present: field omitted from $set', async () => {
    const { set } = await runPatch({ birthdayCapture: { banner: { enabled: true } } });
    expect(set).not.toHaveProperty('birthdayCapture.banner.textColor');
  });

  test('saves all three together', async () => {
    const { set, res } = await runPatch({
      birthdayCapture: {
        banner: { bgColor: '#171A22', textColor: 'white', highlight: false },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(set['birthdayCapture.banner.bgColor']).toBe('#171A22');
    expect(set['birthdayCapture.banner.textColor']).toBe('white');
    expect(set['birthdayCapture.banner.highlight']).toBe(false);
  });
});

// ─── Proxy GET /discount-config ───────────────────────────────────────────────
const proxyGet = handlerFor(proxyRouter, '/discount-config', 'get');

async function runProxy(doc) {
  DiscountConfig.findOne.mockReturnValue({ lean: () => Promise.resolve(doc) });
  const res = mockRes();
  await proxyGet({ query: { shop: SHOP } }, res);
  return res.body;
}

describe('GET /discount-config — banner look fields', () => {
  test('exposes bgColor, textColor, highlight from document', async () => {
    const body = await runProxy({
      birthdayCapture: {
        banner: { enabled: true, bgColor: '#0F5132', textColor: 'dark', highlight: false },
      },
    });
    expect(body.birthdayCapture.banner.bgColor).toBe('#0F5132');
    expect(body.birthdayCapture.banner.textColor).toBe('dark');
    expect(body.birthdayCapture.banner.highlight).toBe(false);
  });

  test('legacy document without new fields gets defaults', async () => {
    const body = await runProxy({
      birthdayCapture: { banner: { enabled: true } },
    });
    expect(body.birthdayCapture.banner.bgColor).toBe('#3730A3');
    expect(body.birthdayCapture.banner.textColor).toBe('auto');
    expect(body.birthdayCapture.banner.highlight).toBe(true);
  });

  test('invalid bgColor in db falls back to #3730A3', async () => {
    const body = await runProxy({
      birthdayCapture: { banner: { bgColor: 'notahex' } },
    });
    expect(body.birthdayCapture.banner.bgColor).toBe('#3730A3');
  });

  test('invalid textColor in db falls back to auto', async () => {
    const body = await runProxy({
      birthdayCapture: { banner: { textColor: 'rainbow' } },
    });
    expect(body.birthdayCapture.banner.textColor).toBe('auto');
  });

  test('highlight=false in db is preserved (not defaulted to true)', async () => {
    const body = await runProxy({
      birthdayCapture: { banner: { highlight: false } },
    });
    expect(body.birthdayCapture.banner.highlight).toBe(false);
  });

  test('null document gives defaults', async () => {
    const body = await runProxy(null);
    expect(body.birthdayCapture.banner.bgColor).toBe('#3730A3');
    expect(body.birthdayCapture.banner.textColor).toBe('auto');
    expect(body.birthdayCapture.banner.highlight).toBe(true);
  });

  test('Cache-Control is no-store (never stale)', async () => {
    const res = mockRes();
    DiscountConfig.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    await proxyGet({ query: { shop: SHOP } }, res);
    const calls = res.setHeader.mock.calls;
    const cc = calls.find((c) => c[0] === 'Cache-Control');
    expect(cc).toBeDefined();
    expect(cc[1]).toMatch(/no-store/);
  });
});
