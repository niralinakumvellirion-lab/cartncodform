/**
 * PATCH /api/profiles/:shop/popup — the new popup-style validation layer:
 * styleId is checked against the real id list, styleFields is sanitized,
 * and mobileStyleOverride/mobilePopup.styleId/mobilePopup.styleFields are
 * handled the same way. The handler is pulled off the router and called
 * directly with mock req/res, same pattern as discountConfigRoutes.test.js.
 */

jest.mock('../models/Profile', () => ({}));
jest.mock('../models/Signal', () => ({}));
jest.mock('../models/SignalConfig', () => ({}));
jest.mock('../models/StorefrontEvent', () => ({}));
jest.mock('../models/ScheduledJob', () => ({}));
jest.mock('../models/ShopWeights', () => ({}));
jest.mock('../models/Store', () => ({ updateOne: jest.fn(), findOne: jest.fn() }));
jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn(),
  requireStoreOwner: jest.fn(),
}));
jest.mock('../services/analyticsService', () => ({}));
jest.mock('../services/aiService', () => ({}));

const Store = require('../models/Store');
const profilesRouter = require('../routes/profiles');

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
  return res;
}

const SHOP = 'demo.myshopify.com';
const patch = handlerFor(profilesRouter, '/:shopDomain/popup', 'patch');

async function run(body) {
  const res = mockRes();
  await patch({ params: { shopDomain: SHOP }, body }, res);
  const call = Store.updateOne.mock.calls[0];
  return { res, set: call ? call[1].$set : undefined };
}

beforeEach(() => {
  jest.clearAllMocks();
  Store.updateOne.mockResolvedValue({});
});

test('valid styleId is set on popup.styleId', async () => {
  const { set } = await run({ styleId: 'flash_sale' });
  expect(set['popup.styleId']).toBe('flash_sale');
});

test('unregistered styleId is silently dropped, not saved', async () => {
  const { res } = await run({ styleId: 'editorial' });
  // no recognizable field to set at all -> the existing "nothing to save" guard fires
  expect(res.statusCode).toBe(400);
});

test('unregistered styleId alongside a real field: only the real field is set', async () => {
  const { set } = await run({ styleId: 'spotlight', headline: 'Hello' });
  expect(set['popup.styleId']).toBeUndefined();
  expect(set['popup.headline']).toBe('Hello');
});

test('styleFields is sanitized before being saved', async () => {
  const { set } = await run({
    styleFields: { badgeText: 'Sale', countdownSource: 'discount_expiry', junk: 'x' },
  });
  expect(set['popup.styleFields']).toEqual({
    badgeText: 'Sale',
    countdownSource: 'discount_expiry',
  });
});

test('mobileStyleOverride is coerced to a boolean on popup, never on mobilePopup', async () => {
  const { set } = await run({ mobileStyleOverride: 'true', mobilePopup: {} });
  expect(set['popup.mobileStyleOverride']).toBe(true);
  expect(set['mobilePopup.mobileStyleOverride']).toBeUndefined();
});

test('mobilePopup.styleId and styleFields are validated/sanitized independently of desktop', async () => {
  const { set } = await run({
    mobilePopup: {
      styleId: 'gift_reveal',
      styleFields: { giftIconEnabled: 'yes', notReal: 1 },
    },
  });
  expect(set['mobilePopup.styleId']).toBe('gift_reveal');
  expect(set['mobilePopup.styleFields']).toEqual({ giftIconEnabled: true });
});

test('an unregistered mobilePopup.styleId is dropped but other mobilePopup fields still save', async () => {
  const { set } = await run({ mobilePopup: { styleId: 'editorial', headline: 'Mobile hi' } });
  expect(set['mobilePopup.styleId']).toBeUndefined();
  expect(set['mobilePopup.headline']).toBe('Mobile hi');
});

test('a removed style id (full_takeover) is normalized to classic on both popup and mobilePopup', async () => {
  const { set } = await run({ styleId: 'full_takeover', mobilePopup: { styleId: 'full_takeover' } });
  expect(set['popup.styleId']).toBe('classic');
  expect(set['mobilePopup.styleId']).toBe('classic');
});

test('a removed layout (banner) is normalized to card on both popup and mobilePopup', async () => {
  const { set } = await run({ layout: 'banner', mobilePopup: { layout: 'banner' } });
  expect(set['popup.layout']).toBe('card');
  expect(set['mobilePopup.layout']).toBe('card');
});

test('valid layouts (split, card) are passed through unchanged', async () => {
  const { set } = await run({ layout: 'split', mobilePopup: { layout: 'card' } });
  expect(set['popup.layout']).toBe('split');
  expect(set['mobilePopup.layout']).toBe('card');
});
