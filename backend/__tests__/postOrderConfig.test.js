'use strict';

/**
 * Tests for the "After the first COD order" wording + colours feature:
 *
 * a) Backend validation for the new postOrder fields in PATCH /:shop/config
 * b) postOrderColors backend unit tests (see postOrderColors.test.js)
 * c) DIFFERENTIAL: GET /cod-form with NO new fields must be byte-identical
 *    to the baseline (all new fields absent or at empty/auto defaults)
 * d) With new fields set: BOOT and CSS contain expected values
 * e) XSS / hostile copy: rendered page has no injected elements, text is literal
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
  API_VERSION: '2025-01',
}));
jest.mock('../services/profileService', () => ({
  upsertProfile: jest.fn().mockResolvedValue(null),
}));

const DiscountConfig = require('../models/DiscountConfig');
const discountsRouter = require('../routes/discounts');
const proxyRouter = require('../routes/proxy');

const SHOP = 'postorder-test.myshopify.com';

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

beforeEach(() => {
  jest.clearAllMocks();
  DiscountConfig.findOneAndUpdate.mockReturnValue({
    lean: () => Promise.resolve({ ok: true }),
  });
});

const patch = handlerFor(discountsRouter, '/:shopDomain/config', 'patch');
async function runPatch(body) {
  const res = mockRes();
  await patch({ params: { shopDomain: SHOP }, body, store: {} }, res);
  const calls = DiscountConfig.findOneAndUpdate.mock.calls;
  const set = calls.length ? calls[0][1].$set : null;
  return { res, set };
}

const getForm = handlerFor(proxyRouter, '/cod-form', 'get');
async function runForm(cfgDoc, query = {}) {
  DiscountConfig.findOne.mockReturnValueOnce({ lean: () => Promise.resolve(cfgDoc) });
  const res = mockRes();
  await getForm({ query: { shop: SHOP, ...query } }, res);
  return res._html || '';
}

// ─── a) PATCH validation ──────────────────────────────────────────────────────
describe('PATCH postOrder new fields — validation', () => {
  test('copy.pitch saved, trimmed, capped at 120', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { copy: { pitch: 'x'.repeat(150) } } } });
    expect(set['birthdayCapture.postOrder.copy.pitch'].length).toBe(120);
  });

  test('copy.button capped at 30', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { copy: { button: 'a'.repeat(50) } } } });
    expect(set['birthdayCapture.postOrder.copy.button'].length).toBe(30);
  });

  test('copy.skip capped at 30', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { copy: { skip: 'b'.repeat(40) } } } });
    expect(set['birthdayCapture.postOrder.copy.skip'].length).toBe(30);
  });

  test('copy.saved capped at 80', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { copy: { saved: 'c'.repeat(100) } } } });
    expect(set['birthdayCapture.postOrder.copy.saved'].length).toBe(80);
  });

  test('copy.error capped at 60', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { copy: { error: 'd'.repeat(80) } } } });
    expect(set['birthdayCapture.postOrder.copy.error'].length).toBe(60);
  });

  test('control characters stripped from copy', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { copy: { pitch: 'Hello\x00World\x1F!' } } } });
    expect(set['birthdayCapture.postOrder.copy.pitch']).toBe('HelloWorld!');
  });

  test('whitespace-only copy saved as empty string', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { copy: { pitch: '   ' } } } });
    expect(set['birthdayCapture.postOrder.copy.pitch']).toBe('');
  });

  test('unknown copy key is not written', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { copy: { hacked: 'bad' } } } });
    expect(set).not.toHaveProperty('birthdayCapture.postOrder.copy.hacked');
  });

  test('accentColor valid hex saved', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { accentColor: '#7A3B74' } } });
    expect(set['birthdayCapture.postOrder.accentColor']).toBe('#7A3B74');
  });

  test('accentColor empty string saved (clear override)', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { accentColor: '' } } });
    expect(set['birthdayCapture.postOrder.accentColor']).toBe('');
  });

  test('accentColor invalid hex → 400', async () => {
    const { res } = await runPatch({ birthdayCapture: { postOrder: { accentColor: '#ZZZ' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/accentColor/i);
  });

  test('accentColor 3-digit hex → 400', async () => {
    const { res } = await runPatch({ birthdayCapture: { postOrder: { accentColor: '#ABC' } } });
    expect(res.statusCode).toBe(400);
  });

  test('bgColor valid hex saved', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { bgColor: '#FFF7ED' } } });
    expect(set['birthdayCapture.postOrder.bgColor']).toBe('#FFF7ED');
  });

  test('bgColor empty string saved', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { bgColor: '' } } });
    expect(set['birthdayCapture.postOrder.bgColor']).toBe('');
  });

  test('bgColor invalid → 400', async () => {
    const { res } = await runPatch({ birthdayCapture: { postOrder: { bgColor: 'cream' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/bgColor/i);
  });

  test('buttonTextMode: auto saved', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { buttonTextMode: 'auto' } } });
    expect(set['birthdayCapture.postOrder.buttonTextMode']).toBe('auto');
  });

  test('buttonTextMode: white saved', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { buttonTextMode: 'white' } } });
    expect(set['birthdayCapture.postOrder.buttonTextMode']).toBe('white');
  });

  test('buttonTextMode: dark saved', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { buttonTextMode: 'dark' } } });
    expect(set['birthdayCapture.postOrder.buttonTextMode']).toBe('dark');
  });

  test('buttonTextMode invalid → 400', async () => {
    const { res } = await runPatch({ birthdayCapture: { postOrder: { buttonTextMode: 'blue' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/buttonTextMode/i);
  });

  test('textMode: auto saved', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { textMode: 'auto' } } });
    expect(set['birthdayCapture.postOrder.textMode']).toBe('auto');
  });

  test('textMode invalid → 400', async () => {
    const { res } = await runPatch({ birthdayCapture: { postOrder: { textMode: 'yellow' } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/textMode/i);
  });

  test('enabled still works alongside copy', async () => {
    const { set } = await runPatch({ birthdayCapture: { postOrder: { enabled: true, copy: { button: 'Go!' } } } });
    expect(set['birthdayCapture.postOrder.enabled']).toBe(true);
    expect(set['birthdayCapture.postOrder.copy.button']).toBe('Go!');
  });
});

// ─── c) DIFFERENTIAL: no new fields → HTML byte-identical to baseline ─────────
describe('GET /cod-form — differential (no new fields)', () => {
  function baselineCfg() {
    return {
      birthdayCapture: { postOrder: { enabled: true } },
      birthdayDiscount: { percentage: 15, consentText: "We'll use your birthday only to send you a birthday offer." },
    };
  }
  function newFieldsCfg() {
    return {
      birthdayCapture: {
        postOrder: {
          enabled: true,
          copy: { pitch: '', button: '', skip: '', saved: '', error: '' },
          accentColor: '', buttonTextMode: 'auto', bgColor: '', textMode: 'auto',
        },
      },
      birthdayDiscount: { percentage: 15, consentText: "We'll use your birthday only to send you a birthday offer." },
    };
  }

  test('all-defaults new fields produce identical HTML to no-new-fields', async () => {
    const html1 = await runForm(baselineCfg());
    const html2 = await runForm(newFieldsCfg());
    expect(html1).toBe(html2);
  });

  test('explicit empty accentColor + auto modes → no extra CSS block', async () => {
    const html = await runForm(newFieldsCfg());
    expect(html).not.toContain('post-order colour overrides');
  });
});

// ─── d) New fields set: BOOT and CSS contain expected values ──────────────────
describe('GET /cod-form — with custom fields set', () => {
  test('custom pitch in BOOT.postOrderCopy', async () => {
    const html = await runForm({
      birthdayCapture: { postOrder: { enabled: true, copy: { pitch: 'Tell us your {pct} gift date!' } } },
      birthdayDiscount: { percentage: 20 },
    });
    expect(html).toContain('"pitch":"Tell us your {pct} gift date!"');
  });

  test('custom button in BOOT.postOrderCopy', async () => {
    const html = await runForm({
      birthdayCapture: { postOrder: { enabled: true, copy: { button: 'Claim gift' } } },
      birthdayDiscount: { percentage: 15 },
    });
    expect(html).toContain('"button":"Claim gift"');
  });

  test('custom accentColor emits override CSS', async () => {
    const html = await runForm({
      birthdayCapture: { postOrder: { enabled: true, accentColor: '#7A3B74' } },
      birthdayDiscount: { percentage: 15 },
    });
    expect(html).toContain('post-order colour overrides');
    expect(html).toContain('background:#7A3B74');
  });

  test('custom bgColor emits block background CSS', async () => {
    const html = await runForm({
      birthdayCapture: { postOrder: { enabled: true, bgColor: '#FFF7ED' } },
      birthdayDiscount: { percentage: 15 },
    });
    expect(html).toContain('background:#FFF7ED');
  });

  test('whitespace-only consentText falls back to default', async () => {
    const html = await runForm({
      birthdayCapture: { postOrder: { enabled: true } },
      birthdayDiscount: { percentage: 15, consentText: '   ' },
    });
    // apostrophe is not escaped by JSON.stringify (no backslash)
    expect(html).toContain("We'll use your birthday only to send you a birthday offer.");
  });

  test('BOOT does not contain </script> literal (XSS serialisation safe)', async () => {
    const html = await runForm({
      birthdayCapture: { postOrder: { enabled: true, copy: { pitch: 'A</script>B' } } },
      birthdayDiscount: { percentage: 15 },
    });
    // The literal string </script> must not appear inside any <script> block's content
    // (it would break out of the script tag). We extract the BOOT= part only.
    const bootMatch = html.match(/var BOOT\s*=\s*({[^;]+})/);
    if (bootMatch) {
      expect(bootMatch[1]).not.toContain('</script>');
    }
    // Instead the encoded form must be present in the page
    expect(html).toContain('\\u003c/script');
  });
});
// ─── e) XSS: hostile copy: < chars are encoded in BOOT ───────────────────────
describe('GET /cod-form — hostile copy is not injected', () => {
  test('hostile pitch copy: < encoded as \\u003c, no raw <img in BOOT', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const html = await runForm({
      birthdayCapture: { postOrder: { enabled: true, copy: { pitch: hostile } } },
      birthdayDiscount: { percentage: 15 },
    });
    expect(html).toContain('\\u003cimg src=x onerror=alert(1)>');
    // No raw <img tag in the full page
    expect(html.indexOf('<img')).toBe(-1);
  });

  test('script injection in copy: </script> encoded, raw tag not injected', async () => {
    const inject = '</script><script>alert(1)</script>';
    const html = await runForm({
      birthdayCapture: { postOrder: { enabled: true, copy: { button: inject } } },
      birthdayDiscount: { percentage: 15 },
    });
    // Only < is replaced with \u003c; > is not replaced
    expect(html).toContain('\\u003c/script>\\u003cscript>');
    // Count <script> tags — should be exactly 1 (the existing inline script)
    const scriptTagCount = (html.match(/<script/g) || []).length;
    expect(scriptTagCount).toBe(1);
  });
});
