'use strict';

/**
 * Tests for product page birthday box:
 *  A. DiscountConfig.js model — productPage sub-doc defaults
 *  B. discounts.js PATCH — productPage validation
 *  D. proxy.js GET /discount-config — productPage key
 *  E. proxy.js POST /birthday — product_page source
 */

jest.mock('../models/DiscountConfig', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../models/Profile', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../models/CodOrder', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../models/Store', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../utils/email', () => ({ sendNewCodOrderEmail: jest.fn() }));
jest.mock('../utils/pushNotification', () => ({ sendPushToStore: jest.fn() }));
jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn(),
  requireStoreOwner: jest.fn(),
}));
jest.mock('../utils/shopify', () => ({
  verifyProxySignature: jest.fn(() => true),
  verifyHmac: jest.fn(() => true),
  API_VERSION: '2025-01',
}));
jest.mock('../services/profileService', () => ({
  upsertProfile: jest.fn().mockResolvedValue(null),
}));

const DiscountConfig = require('../models/DiscountConfig');
const discountsRouter = require('../routes/discounts');
const proxyRouter = require('../routes/proxy');
const { upsertProfile } = require('../services/profileService');

const SHOP = 'test.myshopify.com';

// ── Test helpers ──────────────────────────────────────────────────────────

function handlerFor(router, routePath, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  const res = { body: null, statusCode: 200, _html: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res._html = b; return res; };
  res.setHeader = jest.fn();
  return res;
}

function setConfig(cfg) {
  DiscountConfig.findOne.mockReturnValue({ lean: () => Promise.resolve(cfg) });
}

beforeEach(() => {
  jest.clearAllMocks();
  DiscountConfig.findOneAndUpdate.mockReturnValue({
    lean: () => Promise.resolve({ ok: true }),
  });
});

// ── Handlers ──────────────────────────────────────────────────────────────

const patchHandler = handlerFor(discountsRouter, '/:shopDomain/config', 'patch');
const discountConfigHandler = handlerFor(proxyRouter, '/discount-config', 'get');
const birthdayHandler = handlerFor(proxyRouter, '/birthday', 'post');

async function runPatch(body) {
  const res = mockRes();
  await patchHandler({ params: { shopDomain: SHOP }, body, store: {} }, res);
  const calls = DiscountConfig.findOneAndUpdate.mock.calls;
  const set = calls.length ? calls[0][1].$set : null;
  return { res, set };
}

async function runDiscountConfig(configOverride) {
  if (configOverride !== undefined) setConfig(configOverride);
  const res = mockRes();
  await discountConfigHandler({ query: { shop: SHOP } }, res);
  return res;
}

let _bdayIpCounter = 0;
async function runBirthday(body, configOverride) {
  if (configOverride !== undefined) setConfig(configOverride);
  const res = mockRes();
  // Use a unique IP each call to avoid hitting the rate limiter across tests.
  const ip = '10.0.0.' + ((++_bdayIpCounter) % 254 + 1);
  const req = { query: { shop: SHOP }, body, headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: ip } };
  await birthdayHandler(req, res);
  return res;
}

// ── Section A: Model defaults ────────────────────────────────────────────────

describe('DiscountConfig — productPage defaults', () => {
  const RealDC = jest.requireActual('../models/DiscountConfig');

  test('productPage.enabled defaults to false', () => {
    const p = RealDC.schema.path('birthdayCapture.productPage.enabled');
    expect(p).toBeTruthy();
    expect(p.defaultValue).toBe(false);
  });

  test('productPage.copy has all 9 wording keys defaulting to empty string', () => {
    const keys = ['heading','sub','emailPlaceholder','consent','button','skip','saved','error','emailError'];
    for (const k of keys) {
      const p = RealDC.schema.path('birthdayCapture.productPage.copy.' + k);
      expect(p).toBeTruthy();
      expect(p.defaultValue).toBe('');
    }
  });

  test('productPage.buttonTextMode and textMode default to "auto"', () => {
    const btn = RealDC.schema.path('birthdayCapture.productPage.buttonTextMode');
    expect(btn.defaultValue).toBe('auto');
    expect(btn.enumValues).toEqual(['auto','white','dark']);
    const txt = RealDC.schema.path('birthdayCapture.productPage.textMode');
    expect(txt.defaultValue).toBe('auto');
    expect(txt.enumValues).toEqual(['auto','white','dark']);
  });

  test('productPage.accentColor and bgColor default to empty string', () => {
    expect(RealDC.schema.path('birthdayCapture.productPage.accentColor').defaultValue).toBe('');
    expect(RealDC.schema.path('birthdayCapture.productPage.bgColor').defaultValue).toBe('');
  });
});

// ── Section B: PATCH validation ──────────────────────────────────────────────

describe('PATCH /:shopDomain/config — productPage validation', () => {
  test('rejects invalid accentColor', async () => {
    const { res } = await runPatch({ birthdayCapture: { productPage: { accentColor: 'badcolor' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/productPage.accentColor/);
  });

  test('rejects invalid bgColor', async () => {
    const { res } = await runPatch({ birthdayCapture: { productPage: { bgColor: 'not-hex' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/productPage.bgColor/);
  });

  test('rejects invalid buttonTextMode', async () => {
    const { res } = await runPatch({ birthdayCapture: { productPage: { buttonTextMode: 'orange' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/productPage.buttonTextMode/);
  });

  test('rejects invalid textMode', async () => {
    const { res } = await runPatch({ birthdayCapture: { productPage: { textMode: 'light' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/productPage.textMode/);
  });

  test('accepts empty accentColor (clear to default)', async () => {
    const { res } = await runPatch({ birthdayCapture: { productPage: { accentColor: '' } } });
    expect(res.statusCode).not.toBe(400);
  });

  test('accepts valid accentColor hex', async () => {
    const { res, set } = await runPatch({ birthdayCapture: { productPage: { accentColor: '#7C3AED' } } });
    expect(res.statusCode).not.toBe(400);
    expect(set['birthdayCapture.productPage.accentColor']).toBe('#7C3AED');
  });

  test.each([['auto'], ['white'], ['dark']])('accepts buttonTextMode=%s', async (mode) => {
    const { res } = await runPatch({ birthdayCapture: { productPage: { buttonTextMode: mode } } });
    expect(res.statusCode).not.toBe(400);
  });

  test('toggling enabled only sets enabled in the $set', async () => {
    const { set } = await runPatch({ birthdayCapture: { productPage: { enabled: true } } });
    expect(set['birthdayCapture.productPage.enabled']).toBe(true);
    expect(set['birthdayCapture.productPage.accentColor']).toBeUndefined();
  });

  test('copy fields sanitised: strips control chars, truncates to max', async () => {
    const { set } = await runPatch({
      birthdayCapture: { productPage: { copy: { heading: 'Hello\x00World\x1F', emailError: 'x'.repeat(100) } } },
    });
    expect(set['birthdayCapture.productPage.copy.heading']).toBe('HelloWorld');
    expect(set['birthdayCapture.productPage.copy.emailError'].length).toBe(60);
  });
});

// ── Section D: /discount-config response ────────────────────────────────────

describe('GET /discount-config — productPage key', () => {
  test('productPage present and enabled=false for null config', async () => {
    const res = await runDiscountConfig(null);
    expect(res.statusCode).toBe(200);
    expect(res.body.birthdayCapture.productPage).toBeDefined();
    expect(res.body.birthdayCapture.productPage.enabled).toBe(false);
  });

  test('productPage.copy has non-empty defaults when copy fields are empty', async () => {
    const res = await runDiscountConfig({
      birthdayCapture: { productPage: { enabled: true, copy: {} } },
      birthdayDiscount: { percentage: 15, leadDays: 3 },
    });
    const copy = res.body.birthdayCapture.productPage.copy;
    expect(copy.heading.length).toBeGreaterThan(0);
    expect(copy.button.length).toBeGreaterThan(0);
    expect(copy.emailPlaceholder.length).toBeGreaterThan(0);
  });

  test('tokens {pct} and {days} substituted in default copy', async () => {
    const res = await runDiscountConfig({
      birthdayCapture: { productPage: { enabled: true, copy: {} } },
      birthdayDiscount: { percentage: 20, leadDays: 5 },
    });
    const allCopy = Object.values(res.body.birthdayCapture.productPage.copy).join(' ');
    expect(allCopy).not.toContain('{pct}');
    expect(allCopy).not.toContain('{days}');
    expect(allCopy).toContain('20');
    expect(allCopy).toContain('5');
  });

  test('tokens substituted in custom copy fields', async () => {
    const res = await runDiscountConfig({
      birthdayCapture: { productPage: { enabled: true, copy: { heading: 'Get {pct}% off — {days} days notice!' } } },
      birthdayDiscount: { percentage: 10, leadDays: 7 },
    });
    expect(res.body.birthdayCapture.productPage.copy.heading).toBe('Get 10% off — 7 days notice!');
  });

  test('productPage.colors has all required color keys', async () => {
    const res = await runDiscountConfig(null);
    const colors = res.body.birthdayCapture.productPage.colors;
    expect(colors).toBeDefined();
    for (const k of ['accent','btnFg','text','muted','fieldBg','fieldBorder','checkBorder']) {
      expect(typeof colors[k]).toBe('string');
    }
    expect(colors.bg === null || typeof colors.bg === 'string').toBe(true);
  });

  test('existing keys (popup, banner, postOrder) unchanged', async () => {
    const res = await runDiscountConfig(null);
    const bc = res.body.birthdayCapture;
    expect(bc.popup).toBeDefined();
    expect(bc.banner).toBeDefined();
    expect(bc.postOrder).toBeDefined();
    expect(bc.postOrder.enabled).toBe(false);
  });

  test('board-10 defaults: exact strings returned for empty copy (pct=15, days=3)', async () => {
    const res = await runDiscountConfig({
      birthdayCapture: { productPage: { enabled: true, copy: {} } },
      birthdayDiscount: { percentage: 15, leadDays: 3 },
    });
    const copy = res.body.birthdayCapture.productPage.copy;
    expect(copy.heading).toBe('Get 15% off on your birthday');
    expect(copy.sub).toBe("Tell us your birthday and we'll email you a gift 3 days before.");
    expect(copy.emailPlaceholder).toBe('Your email');
    expect(copy.consent).toBe('Email me my birthday offer');
    expect(copy.button).toBe('Save my birthday');
    expect(copy.skip).toBe('No thanks');
    expect(copy.saved).toBe('Thanks! Your gift will arrive before your birthday.');
    expect(copy.error).toBe('Please select a month and day.');
    expect(copy.emailError).toBe('Enter a valid email and tick the box.');
  });
});

// ── Section E: /birthday product_page source ─────────────────────────────────

describe('POST /birthday — product_page source', () => {
  const VALID = { month: 6, day: 15, email: 'user@example.com', consent: true, sessionId: 'sid-1', source: 'product_page' };
  const ppEnabledCfg = { birthdayCapture: { productPage: { enabled: true } } };

  test('accepts valid product_page submission', async () => {
    const res = await runBirthday(VALID, ppEnabledCfg);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('attaches email via channels.email.address and records consentedAt', async () => {
    await runBirthday(VALID, ppEnabledCfg);
    const updates = upsertProfile.mock.calls[0][2];
    expect(updates['channels.email.address']).toBe('user@example.com');
    expect(updates['channels.email.source']).toBe('form');
    expect(updates['channels.email.capturedAt']).toBeInstanceOf(Date);
    expect(updates['channels.email.consentedAt']).toBeInstanceOf(Date);
    expect(updates['channels.email.consentedAt']).toEqual(updates['channels.email.capturedAt']);
  });

  test('email lowercased before saving', async () => {
    await runBirthday({ ...VALID, email: 'User@EXAMPLE.COM' }, ppEnabledCfg);
    expect(upsertProfile.mock.calls[0][2]['channels.email.address']).toBe('user@example.com');
  });

  test('rejects missing email', async () => {
    const { email, ...rest } = VALID;
    const res = await runBirthday(rest, ppEnabledCfg);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_EMAIL');
  });

  test('rejects invalid email format', async () => {
    const res = await runBirthday({ ...VALID, email: 'not-an-email' }, ppEnabledCfg);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_EMAIL');
  });

  test('rejects consent: false', async () => {
    const res = await runBirthday({ ...VALID, consent: false }, ppEnabledCfg);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('CONSENT_REQUIRED');
  });

  test('rejects missing consent', async () => {
    const { consent, ...rest } = VALID;
    const res = await runBirthday(rest, ppEnabledCfg);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('CONSENT_REQUIRED');
  });

  test('profile update includes birthday fields and source=product_page', async () => {
    await runBirthday(VALID, ppEnabledCfg);
    const updates = upsertProfile.mock.calls[0][2];
    expect(updates['birthday.month']).toBe(6);
    expect(updates['birthday.day']).toBe(15);
    expect(updates['birthday.source']).toBe('product_page');
  });

  test('profile identifiers include email for identity resolution', async () => {
    await runBirthday(VALID, ppEnabledCfg);
    const identifiers = upsertProfile.mock.calls[0][1];
    expect(identifiers.email).toBe('user@example.com');
  });

  test('existing source=popup works without email', async () => {
    const res = await runBirthday({ month: 6, day: 15, sessionId: 'sid-2', source: 'popup' }, ppEnabledCfg);
    expect(res.statusCode).toBe(200);
  });

  test('existing source=banner does not require consent', async () => {
    const res = await runBirthday(
      { month: 6, day: 15, sessionId: 'sid-3', source: 'banner' },
      { birthdayCapture: { banner: { enabled: true } } }
    );
    expect(res.statusCode).toBe(200);
  });

  test('unknown source falls back to popup — no email requirement', async () => {
    const res = await runBirthday({ month: 6, day: 15, sessionId: 'sid-4', source: 'mystery' }, ppEnabledCfg);
    expect(res.statusCode).toBe(200);
  });

  test('productPage.enabled=true → anyEnabled (other methods off)', async () => {
    const res = await runBirthday(VALID, { birthdayCapture: { productPage: { enabled: true }, popup: { enabled: false } } });
    expect(res.statusCode).toBe(200);
  });

  test('all methods disabled → 403', async () => {
    const res = await runBirthday(VALID, { birthdayCapture: { productPage: { enabled: false }, popup: { enabled: false } } });
    expect(res.statusCode).toBe(403);
  });
});

// ── Section F: buildPayload sends productPage to the PATCH handler ────────────

describe('buildPayload — productPage payload', () => {
  let buildPayload;

  beforeAll(() => {
    buildPayload = require('../../frontend/app/admin/screens/Discounts').buildPayload;
  });

  // a. Real buildPayload output with enabled=true → $set has productPage.enabled=true
  test('a. real buildPayload(enabled=true) → $set["birthdayCapture.productPage.enabled"] is true', async () => {
    const config = { birthdayCapture: { productPage: { enabled: true } } };
    const payload = buildPayload(config);
    DiscountConfig.findOneAndUpdate.mockReturnValue({
      lean: () => Promise.resolve({ birthdayCapture: { productPage: { enabled: true } } }),
    });
    const { set } = await runPatch(payload);
    expect(set['birthdayCapture.productPage.enabled']).toBe(true);
  });

  // b. Full round-trip: save → proxy read returns enabled=true, custom heading, custom accent
  test('b. round trip: enabled=true + custom heading + custom accentColor survive save+read', async () => {
    const config = {
      birthdayCapture: {
        productPage: {
          enabled: true,
          copy: { heading: 'My heading', button: 'Click me' },
          accentColor: '#FF5733',
        },
      },
      birthdayDiscount: { percentage: 20, leadDays: 5 },
    };
    const payload = buildPayload(config);
    const savedDoc = {
      birthdayCapture: {
        productPage: {
          enabled: true,
          copy: payload.birthdayCapture.productPage.copy,
          accentColor: '#FF5733',
          bgColor: '',
          buttonTextMode: 'auto',
          textMode: 'auto',
        },
      },
      birthdayDiscount: { percentage: 20, leadDays: 5 },
    };
    DiscountConfig.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(savedDoc) });
    const { set } = await runPatch(payload);
    expect(set['birthdayCapture.productPage.enabled']).toBe(true);
    expect(set['birthdayCapture.productPage.copy.heading']).toBe('My heading');
    expect(set['birthdayCapture.productPage.copy.button']).toBe('Click me');
    expect(set['birthdayCapture.productPage.accentColor']).toBe('#FF5733');
    const res = await runDiscountConfig(savedDoc);
    expect(res.body.birthdayCapture.productPage.enabled).toBe(true);
    expect(res.body.birthdayCapture.productPage.copy.heading).toBe('My heading');
  });

  // c. Switch off: enabled=false is written, not skipped
  test('c. enabled=false is written to $set (not skipped)', async () => {
    const config = { birthdayCapture: { productPage: { enabled: false } } };
    const payload = buildPayload(config);
    DiscountConfig.findOneAndUpdate.mockReturnValue({
      lean: () => Promise.resolve({ birthdayCapture: { productPage: { enabled: false } } }),
    });
    const { set } = await runPatch(payload);
    expect(set['birthdayCapture.productPage.enabled']).toBe(false);
  });

  // d. All defaults: enabled false, copy all empty, colours empty, modes auto → backend accepts (200)
  test('d. all defaults (empty config): no 400, enabled false, all copy empty, modes auto', async () => {
    const payload = buildPayload({});
    DiscountConfig.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve({}) });
    const { res } = await runPatch(payload);
    expect(res.statusCode).toBe(200);
    const pp = payload.birthdayCapture.productPage;
    expect(pp.enabled).toBe(false);
    for (const k of ['heading','sub','emailPlaceholder','consent','button','skip','saved','error','emailError']) {
      expect(pp.copy[k]).toBe('');
    }
    expect(pp.accentColor).toBe('');
    expect(pp.bgColor).toBe('');
    expect(pp.buttonTextMode).toBe('auto');
    expect(pp.textMode).toBe('auto');
  });

  // e. Over-long copy and invalid hex are trimmed/cleared → backend never returns 400
  test('e. over-long copy trimmed to max, invalid hex cleared to empty → no 400', async () => {
    const config = {
      birthdayCapture: {
        productPage: {
          enabled: true,
          copy: {
            heading:          'x'.repeat(200),
            sub:              'y'.repeat(200),
            emailPlaceholder: 'z'.repeat(200),
            consent:          'c'.repeat(200),
            button:           'b'.repeat(200),
            skip:             's'.repeat(200),
            saved:            'k'.repeat(200),
            error:            'e'.repeat(200),
            emailError:       'a'.repeat(200),
          },
          accentColor: 'notahex',
          bgColor: '#ZZZZZZZ',
          buttonTextMode: 'invalid',
          textMode: 'bad',
        },
      },
    };
    const payload = buildPayload(config);
    const pp = payload.birthdayCapture.productPage;
    expect(pp.copy.heading.length).toBe(60);
    expect(pp.copy.sub.length).toBe(120);
    expect(pp.copy.emailPlaceholder.length).toBe(40);
    expect(pp.copy.consent.length).toBe(80);
    expect(pp.copy.button.length).toBe(30);
    expect(pp.copy.skip.length).toBe(30);
    expect(pp.copy.saved.length).toBe(80);
    expect(pp.copy.error.length).toBe(60);
    expect(pp.copy.emailError.length).toBe(60);
    expect(pp.accentColor).toBe('');
    expect(pp.bgColor).toBe('');
    expect(pp.buttonTextMode).toBe('auto');
    expect(pp.textMode).toBe('auto');
    DiscountConfig.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve({}) });
    const { res } = await runPatch(payload);
    expect(res.statusCode).toBe(200);
  });

  // f. Parity guard: buildPayload emits every key the backend PATCH handler accepts
  test('f. parity: buildPayload emits all keys accepted by the PATCH handler for every birthdayCapture sub-section', () => {
    const config = {
      birthdayCapture: {
        popup: { enabled: true },
        postOrder: {
          enabled: true,
          copy: { pitch: 'p', button: 'b', skip: 's', saved: 'ok', error: 'err' },
          accentColor: '#4F46E5', bgColor: '#FFFFFF', buttonTextMode: 'white', textMode: 'dark',
        },
        banner: {
          enabled: true, text: 't', buttonText: 'Get', dismissDays: 7,
          bgColor: '#3730A3', textColor: 'white', highlight: true,
        },
        productPage: {
          enabled: true,
          copy: { heading: 'h', sub: 'su', emailPlaceholder: 'ep', consent: 'co', button: 'b', skip: 's', saved: 'ok', error: 'er', emailError: 'ee' },
          accentColor: '#4F46E5', bgColor: '#FFFFFF', buttonTextMode: 'white', textMode: 'dark',
        },
      },
    };
    const payload = buildPayload(config);
    const bc = payload.birthdayCapture;

    // popup: backend accepts enabled only
    expect(bc.popup).toHaveProperty('enabled');

    // postOrder: backend accepts enabled, copy.{5}, accentColor, bgColor, buttonTextMode, textMode
    for (const k of ['enabled','accentColor','bgColor','buttonTextMode','textMode']) {
      expect(bc.postOrder).toHaveProperty(k);
    }
    for (const k of ['pitch','button','skip','saved','error']) {
      expect(bc.postOrder.copy).toHaveProperty(k);
    }

    // banner: backend accepts enabled, text, buttonText, dismissDays, bgColor, textColor, highlight
    for (const k of ['enabled','text','buttonText','dismissDays','bgColor','textColor','highlight']) {
      expect(bc.banner).toHaveProperty(k);
    }

    // productPage: backend accepts enabled, copy.{9}, accentColor, bgColor, buttonTextMode, textMode
    for (const k of ['enabled','accentColor','bgColor','buttonTextMode','textMode']) {
      expect(bc.productPage).toHaveProperty(k);
    }
    for (const k of ['heading','sub','emailPlaceholder','consent','button','skip','saved','error','emailError']) {
      expect(bc.productPage.copy).toHaveProperty(k);
    }
  });
});

// ── Step 1b — pct number in productPage /discount-config response ─────────────
describe('Step 1b — productPage.pct field', () => {
  test('pct is the birthday discount percentage as a number', async () => {
    const doc = {
      birthdayCapture: { productPage: { enabled: true, copy: {}, accentColor: '', bgColor: '', buttonTextMode: 'auto', textMode: 'auto' } },
      birthdayDiscount: { percentage: 20, leadDays: 5 },
    };
    const res = await runDiscountConfig(doc);
    expect(res.body.birthdayCapture.productPage.pct).toBe(20);
  });

  test('pct defaults to 15 when birthdayDiscount.percentage is absent', async () => {
    const doc = {
      birthdayCapture: { productPage: { enabled: true, copy: {} } },
      birthdayDiscount: {},
    };
    const res = await runDiscountConfig(doc);
    expect(res.body.birthdayCapture.productPage.pct).toBe(15);
  });
});

// ── Step 1c — new gift-card color keys appear in /discount-config response ────
describe('Step 1c — productPage.colors new keys', () => {
  test('colors includes all 6 new gift-card keys', async () => {
    const doc = {
      birthdayCapture: { productPage: { enabled: true, accentColor: '#4F46E5', bgColor: '#FFFFFF', buttonTextMode: 'auto', textMode: 'auto' } },
      birthdayDiscount: { percentage: 15, leadDays: 3 },
    };
    const res = await runDiscountConfig(doc);
    const colors = res.body.birthdayCapture.productPage.colors;
    for (const k of ['stubFg', 'sealText', 'bodyBg', 'err', 'errBg', 'ok']) {
      expect(colors).toHaveProperty(k);
    }
    expect(typeof colors.stubFg).toBe('string');
    expect(typeof colors.ok).toBe('string');
  });

  test('dark body: err is lighter red, ok is lighter green', async () => {
    const doc = {
      birthdayCapture: { productPage: { enabled: true, accentColor: '#4F46E5', bgColor: '#0F172A', buttonTextMode: 'auto', textMode: 'auto' } },
      birthdayDiscount: { percentage: 15, leadDays: 3 },
    };
    const res = await runDiscountConfig(doc);
    const colors = res.body.birthdayCapture.productPage.colors;
    expect(colors.err).toBe('#F87171');
    expect(colors.ok).toBe('#4ADE80');
    expect(colors.errBg).toBe('#450A0A');
  });
});
