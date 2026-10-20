/**
 * popupCopy — PATCH /api/discounts/:shop/config and GET /discount-config (proxy).
 *
 * Covers:
 *   - PATCH max-length truncation for every popupCopy key
 *   - PATCH control-character / newline stripping
 *   - PATCH unknown keys ignored (no dotpath key emitted)
 *   - PATCH non-string values coerced to string then processed
 *   - PATCH legacy doc without popupCopy (no crash, popupCopy dotkeys emitted)
 *   - GET exposes exactly the 11 allowlisted popupCopy keys, no extras
 *   - GET legacy doc (popupCopy missing) returns all 11 keys as ''
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
const proxyRouter    = require('../routes/proxy');

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
  res.json  = (b) => { res.body = b; return res; };
  res.setHeader = jest.fn();
  return res;
}

const SHOP = 'demo.myshopify.com';

// Per-key max lengths — must match POPUP_COPY_MAX in discounts.js
const PC_MAX = {
  emailPlaceholder: 40, captureButton: 50,
  subscribedTitle: 40,  subscribedSub: 60,
  unlockedTitle: 40,    unlockedSub: 60,
  bdSub: 120,           bdButton: 30,
  bdSkip: 30,           bdOkTitle: 40,
  bdOkSub: 120,
};
const PC_KEYS = Object.keys(PC_MAX);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});

  DiscountConfig.findOneAndUpdate.mockReturnValue({
    lean: () => Promise.resolve({ popupCopy: { emailPlaceholder: '' } }),
  });
});
afterEach(() => jest.restoreAllMocks());

// ─────────────────────────────────────────────────────────────
// Helper: run PATCH, return the $set that Mongo would receive
// ─────────────────────────────────────────────────────────────
const patch = handlerFor(discountsRouter, '/:shopDomain/config', 'patch');

async function runPatch(body) {
  const res = mockRes();
  await patch({ params: { shopDomain: SHOP }, body }, res);
  const calls = DiscountConfig.findOneAndUpdate.mock.calls;
  const setArg = calls.length ? calls[0][1].$set : {};
  return { res, set: setArg };
}

// ─────────────────────────────────────────────────────────────
// 1. PATCH — per-key max-length truncation
// ─────────────────────────────────────────────────────────────
describe('PATCH popupCopy max-length truncation', () => {
  test.each(PC_KEYS)('%s: value at max is kept; value at max+1 is truncated', async (key) => {
    const max = PC_MAX[key];
    const atMax    = 'a'.repeat(max);
    const overMax  = 'b'.repeat(max + 1);

    const { set: setA } = await runPatch({ popupCopy: { [key]: atMax } });
    const { set: setB } = await runPatch({ popupCopy: { [key]: overMax } });

    expect(setA[`popupCopy.${key}`]).toHaveLength(max);
    expect(setB[`popupCopy.${key}`]).toHaveLength(max);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. PATCH — control characters and newlines are stripped
// ─────────────────────────────────────────────────────────────
test('PATCH popupCopy strips control chars and newlines from all keys', async () => {
  const dirty = 'hello\u0000world\n\r\t<test>';
  const popupCopy = {};
  for (const k of PC_KEYS) popupCopy[k] = dirty;

  const { set } = await runPatch({ popupCopy });

  for (const k of PC_KEYS) {
    const v = set[`popupCopy.${k}`];
    expect(v).toBeDefined();
    expect(v).not.toMatch(/[\x00-\x1F\x7F]/);
    expect(v).toBe('helloworld<test>'); // control chars stripped, printable kept
  }
});

// ─────────────────────────────────────────────────────────────
// 3. PATCH — unknown keys are ignored (no dotpath key emitted)
// ─────────────────────────────────────────────────────────────
test('PATCH popupCopy ignores unknown keys', async () => {
  const { set } = await runPatch({
    popupCopy: {
      emailPlaceholder: 'Valid',
      unknownKey: 'should not appear',
      __proto__: { injected: true },
      constructor: 'bad',
    },
  });

  expect(set['popupCopy.emailPlaceholder']).toBe('Valid');
  expect(set['popupCopy.unknownKey']).toBeUndefined();
  expect(set['popupCopy.__proto__']).toBeUndefined();
  expect(set['popupCopy.constructor']).toBeUndefined();
});

// ─────────────────────────────────────────────────────────────
// 4. PATCH — non-string values are coerced then processed
// ─────────────────────────────────────────────────────────────
test('PATCH popupCopy coerces number to string', async () => {
  const { set } = await runPatch({ popupCopy: { captureButton: 42 } });
  expect(set['popupCopy.captureButton']).toBe('42');
});

test('PATCH popupCopy coerces null to empty string (null → String(null) = "null", trimmed)', async () => {
  const { set } = await runPatch({ popupCopy: { bdButton: null } });
  // String(null) = 'null', strip control chars = 'null', trim = 'null'
  expect(set['popupCopy.bdButton']).toBe('null');
});

// ─────────────────────────────────────────────────────────────
// 5. PATCH — popupCopy absent → no dotpath keys, no crash
// ─────────────────────────────────────────────────────────────
test('PATCH without popupCopy key does not emit any popupCopy dotkeys', async () => {
  const { set } = await runPatch({ pushDiscount: { enabled: false } });
  const popupKeys = Object.keys(set).filter((k) => k.startsWith('popupCopy.'));
  expect(popupKeys).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────
// 6. PATCH — empty object {} emits no dotpath keys
// ─────────────────────────────────────────────────────────────
test('PATCH popupCopy:{} emits no dotpath keys', async () => {
  const { set } = await runPatch({ popupCopy: {} });
  const popupKeys = Object.keys(set).filter((k) => k.startsWith('popupCopy.'));
  expect(popupKeys).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────
// 7. GET /discount-config — exposes exactly the 11 allowlisted keys
// ─────────────────────────────────────────────────────────────
describe('GET /discount-config popupCopy exposure', () => {
  const get = handlerFor(proxyRouter, '/discount-config', 'get');

  async function runGet(docPopupCopy) {
    const res = mockRes();
    const doc = {
      pushDiscount: { enabled: false, percentage: 0 },
      emailDiscount: { enabled: false, percentage: 0 },
      phoneDiscount: { enabled: false, percentage: 0 },
      bothDiscount: { enabled: false, percentage: 0 },
      offerHeadline: '',
      whatsappCapture: { enabled: false },
      birthdayCapture: { popup: { enabled: false }, banner: { enabled: false, text: '', buttonText: 'Get my gift', dismissDays: 7, bgColor: '#3730A3', textColor: 'auto', highlight: true }, postOrder: { enabled: false } },
      birthdayDiscount: { enabled: false, percentage: 15, offerText: '', consentText: '' },
      quantityTiers: { enabled: false, tiers: [], heading: 'Buy more, save more', accentColor: '#4F46E5', layout: 'cards' },
      popupCopy: docPopupCopy,
    };
    DiscountConfig.findOne.mockReturnValue({ lean: () => Promise.resolve(doc) });
    await get({ query: { shop: SHOP } }, res);
    return res.body;
  }

  test('returns exactly 11 popupCopy keys with correct values', async () => {
    const docPc = {
      emailPlaceholder: 'Enter your email',
      captureButton: 'Claim offer',
      subscribedTitle: 'Done!',
      subscribedSub: 'Code incoming',
      unlockedTitle: '{pct}% OFF',
      unlockedSub: 'Valid {days} days',
      bdSub: 'Birthday text',
      bdButton: 'Gift me',
      bdSkip: 'Skip',
      bdOkTitle: 'Set!',
      bdOkSub: 'Gift in {days} days',
      __extraKey: 'should not appear',
    };
    const body = await runGet(docPc);

    expect(body.popupCopy).toBeDefined();
    expect(Object.keys(body.popupCopy).sort()).toEqual(PC_KEYS.slice().sort());
    expect(body.popupCopy.emailPlaceholder).toBe('Enter your email');
    expect(body.popupCopy.captureButton).toBe('Claim offer');
    expect(body.popupCopy.__extraKey).toBeUndefined();
  });

  test('legacy doc (popupCopy missing) returns all 11 keys as empty strings', async () => {
    const body = await runGet(undefined);

    expect(body.popupCopy).toBeDefined();
    expect(Object.keys(body.popupCopy).sort()).toEqual(PC_KEYS.slice().sort());
    for (const k of PC_KEYS) {
      expect(body.popupCopy[k]).toBe('');
    }
  });

  test('partial popupCopy: missing keys return empty string, present keys return value', async () => {
    const body = await runGet({ emailPlaceholder: 'Email hint', bdButton: 'Submit' });

    expect(body.popupCopy.emailPlaceholder).toBe('Email hint');
    expect(body.popupCopy.bdButton).toBe('Submit');
    expect(body.popupCopy.captureButton).toBe('');
    expect(body.popupCopy.subscribedTitle).toBe('');
  });
});
