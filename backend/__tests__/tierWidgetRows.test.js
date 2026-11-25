'use strict';

/**
 * Phase 1 tier widget: rows layout + display extras.
 * - utils: subtitle, sanitizeTierDisplay, publicTierDisplay, normalizeLayout
 * - PATCH /api/discounts/:shop/config accepts 'rows' and the new fields
 * - GET /discount-config (proxy) sends them to the storefront
 */

jest.mock('../models/Store', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/DiscountConfig', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/CodOrder', () => ({}));
jest.mock('../utils/email', () => ({ sendNewCodOrderEmail: jest.fn() }));
jest.mock('../utils/pushNotification', () => ({ sendPushToStore: jest.fn() }));
jest.mock('../middleware/requireOwner', () => ({ requireAuth: jest.fn(), requireStoreOwner: jest.fn() }));
jest.mock('../utils/shopify', () => ({ verifyProxySignature: jest.fn(() => true), API_VERSION: '2026-10' }));
jest.mock('../services/profileService', () => ({ upsertProfile: jest.fn().mockResolvedValue(null) }));
jest.mock('../services/tierSync', () => ({ syncTiers: jest.fn().mockResolvedValue({ synced: true }) }));

const {
  sanitizeTiers, sanitizeTierDisplay, publicTierDisplay, publicTiers, normalizeLayout,
} = require('../utils/quantityTiers');
const DiscountConfig = require('../models/DiscountConfig');
const discountsRouter = require('../routes/discounts');
const proxyRouter = require('../routes/proxy');

function handlerFor(router, path, method) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
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
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  DiscountConfig.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve({ quantityTiers: {} }) });
  DiscountConfig.updateOne.mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());

// ── utils ────────────────────────────────────────────────────────────────────

describe('tier subtitle', () => {
  test('kept, trimmed and capped at 40 chars', () => {
    const out = sanitizeTiers([
      { minQty: 2, percent: 10, badge: '', subtitle: '  Save a little  ' },
      { minQty: 3, percent: 20, badge: '', subtitle: 'x'.repeat(60) },
    ]);
    expect(out[0].subtitle).toBe('Save a little');
    expect(out[1].subtitle).toHaveLength(40);
  });

  test('missing subtitle -> empty string', () => {
    expect(sanitizeTiers([{ minQty: 2, percent: 10 }])[0].subtitle).toBe('');
  });
});

describe('sanitizeTierDisplay', () => {
  test('picks only known keys, trims text to 40, keeps booleans', () => {
    const out = sanitizeTierDisplay({
      topLabel: '  Limited time offer  ',
      footerNote: 'y'.repeat(50),
      showCompareAt: false,
      showTotal: true,
      showSingle: true,
      heading: 'ignored here',
      evil: 'nope',
    });
    expect(out).toEqual({
      topLabel: 'Limited time offer',
      footerNote: 'y'.repeat(40),
      showCompareAt: false,
      showTotal: true,
      showSingle: true,
    });
  });

  test('non-boolean flags and non-string text are ignored', () => {
    expect(sanitizeTierDisplay({ showTotal: 'yes', showSingle: 1, topLabel: 5 })).toEqual({});
  });

  test('bad input -> empty object', () => {
    expect(sanitizeTierDisplay(null)).toEqual({});
    expect(sanitizeTierDisplay('x')).toEqual({});
  });
});

describe('publicTierDisplay / normalizeLayout / publicTiers', () => {
  test('defaults for an old doc without the new fields', () => {
    expect(publicTierDisplay({ layout: 'list' })).toEqual({
      layout: 'list', discountType: 'percent', topLabel: '', footerNote: '', showCompareAt: true, showTotal: true, showSingle: false, variantPicker: false,
    });
  });

  test('unknown layout falls back to cards; rows is allowed', () => {
    expect(normalizeLayout('grid')).toBe('cards');
    expect(normalizeLayout('rows')).toBe('rows');
  });

  test('publicTiers copies only public tier fields', () => {
    expect(publicTiers([{ minQty: 2, percent: 10, badge: 'Hot', subtitle: 'Nice', secret: 1 }]))
      .toEqual([{ minQty: 2, percent: 10, badge: 'Hot', subtitle: 'Nice' }]);
    expect(publicTiers(undefined)).toEqual([]);
  });
});

// ── PATCH /:shopDomain/config ────────────────────────────────────────────────

const patch = handlerFor(discountsRouter, '/:shopDomain/config', 'patch');

async function runPatch(quantityTiers) {
  const res = mockRes();
  await patch({ params: { shopDomain: SHOP }, body: { quantityTiers } }, res);
  const calls = DiscountConfig.findOneAndUpdate.mock.calls;
  return { res, set: calls.length ? calls[0][1].$set : {} };
}

describe('PATCH quantityTiers rows fields', () => {
  test('rows layout and display fields are saved', async () => {
    const { res, set } = await runPatch({
      layout: 'rows', topLabel: ' Bundle and save ', footerNote: 'Free delivery',
      showCompareAt: false, showTotal: true, showSingle: true,
    });
    expect(res.statusCode).toBe(200);
    expect(set['quantityTiers.layout']).toBe('rows');
    expect(set['quantityTiers.topLabel']).toBe('Bundle and save');
    expect(set['quantityTiers.footerNote']).toBe('Free delivery');
    expect(set['quantityTiers.showCompareAt']).toBe(false);
    expect(set['quantityTiers.showTotal']).toBe(true);
    expect(set['quantityTiers.showSingle']).toBe(true);
  });

  test('unknown layout -> 400', async () => {
    const { res } = await runPatch({ layout: 'grid' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/rows/);
  });

  test('tier subtitles are saved through sanitizeTiers', async () => {
    const { set } = await runPatch({ tiers: [{ minQty: 2, percent: 10, badge: '', subtitle: 'Try it' }] });
    expect(set['quantityTiers.tiers']).toEqual([{ minQty: 2, percent: 10, badge: '', subtitle: 'Try it' }]);
  });

  test('display fields absent -> no display dotkeys', async () => {
    const { set } = await runPatch({ heading: 'Hello' });
    expect(Object.keys(set).filter((k) => /topLabel|footerNote|show(CompareAt|Total|Single)/.test(k))).toEqual([]);
  });
});

// ── GET /discount-config (proxy) ─────────────────────────────────────────────

describe('GET /discount-config sends rows fields', () => {
  const get = handlerFor(proxyRouter, '/discount-config', 'get');

  test('rows config reaches the storefront', async () => {
    DiscountConfig.findOne.mockReturnValue({
      lean: () => Promise.resolve({
        quantityTiers: {
          enabled: true, heading: 'Buy more', accentColor: '#111827', layout: 'rows',
          topLabel: 'Limited time offer', footerNote: '', showCompareAt: true, showTotal: false, showSingle: true,
          tiers: [{ minQty: 2, percent: 10, badge: 'Most popular', subtitle: 'Good deal' }],
        },
      }),
    });
    const res = mockRes();
    await get({ query: { shop: SHOP } }, res);
    const qt = res.body.quantityTiers;
    expect(qt.layout).toBe('rows');
    expect(qt.topLabel).toBe('Limited time offer');
    expect(qt.showTotal).toBe(false);
    expect(qt.showSingle).toBe(true);
    expect(qt.tiers[0]).toEqual({ minQty: 2, percent: 10, badge: 'Most popular', subtitle: 'Good deal' });
  });
});

// ── Phase 2a: discountType on PATCH ──────────────────────────────────────────

describe('PATCH quantityTiers discountType', () => {
  test('amount tiers are validated and saved with the type', async () => {
    const { res, set } = await runPatch({
      discountType: 'amount',
      tiers: [{ minQty: 2, amount: 200, badge: '' }, { minQty: 3, amount: 400, badge: 'Hot' }],
    });
    expect(res.statusCode).toBe(200);
    expect(set['quantityTiers.discountType']).toBe('amount');
    expect(set['quantityTiers.tiers']).toEqual([
      { minQty: 2, percent: 0, amount: 200, badge: '', subtitle: '' },
      { minQty: 3, percent: 0, amount: 400, badge: 'Hot', subtitle: '' },
    ]);
  });

  test('tiers sent without a type are percent tiers', async () => {
    const { set } = await runPatch({ tiers: [{ minQty: 2, percent: 10, badge: '' }] });
    expect(set['quantityTiers.discountType']).toBe('percent');
  });

  test('type without tiers -> 400', async () => {
    const { res } = await runPatch({ discountType: 'amount' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/together with tiers/);
  });

  test('unknown type -> 400', async () => {
    const { res } = await runPatch({ discountType: 'bogo', tiers: [{ minQty: 2, percent: 10 }] });
    expect(res.statusCode).toBe(400);
  });

  test('bad amount -> 400 with the reason', async () => {
    const { res } = await runPatch({ discountType: 'amount', tiers: [{ minQty: 2, amount: 0 }] });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/amount must be between/);
  });
});

describe('variantPicker setting (Phase 2c)', () => {
  test('PATCH saves it; storefront gets it (default off)', async () => {
    const { set } = await runPatch({ variantPicker: true });
    expect(set['quantityTiers.variantPicker']).toBe(true);
    expect(publicTierDisplay({ variantPicker: true }).variantPicker).toBe(true);
    expect(publicTierDisplay({}).variantPicker).toBe(false);
  });
  test('non-boolean is ignored', async () => {
    const { set } = await runPatch({ variantPicker: 'yes' });
    expect(set).not.toHaveProperty('quantityTiers.variantPicker');
  });
});

describe('combinesWith (Combinations)', () => {
  const { sanitizeCombinesWith } = require('../utils/quantityTiers');

  test('sanitize: only real true counts; missing = false', () => {
    expect(sanitizeCombinesWith({ productDiscounts: true, orderDiscounts: 'yes', extra: true }))
      .toEqual({ productDiscounts: true, orderDiscounts: false, shippingDiscounts: false });
    expect(sanitizeCombinesWith()).toEqual({ productDiscounts: false, orderDiscounts: false, shippingDiscounts: false });
  });

  test('PATCH saves it and triggers a Shopify sync', async () => {
    const tierSync = require('../services/tierSync');
    const { set } = await runPatch({ combinesWith: { orderDiscounts: true } });
    expect(set['quantityTiers.combinesWith']).toEqual({ productDiscounts: false, orderDiscounts: true, shippingDiscounts: false });
    expect(tierSync.syncTiers).toHaveBeenCalled();
  });
});
