'use strict';

/**
 * "Pay online and save" offer on the COD form: utils/prepaidOffer.js, the App Proxy endpoint and COD form,
 * the admin routes, orders/create tracking and the clean-up. Real in-memory MongoDB; Shopify (Admin API,
 * signatures, tokens) and auth are replaced.
 */

jest.mock('../utils/shopifyGraphQL', () => ({ shopifyGraphQL: jest.fn() }));
jest.mock('../utils/shopify', () => ({
  ...jest.requireActual('../utils/shopify'),
  verifyProxySignature: (q) => q && q.signature === 'valid',
  verifyWebhookHmac: jest.fn(() => true),
  refreshAccessTokenIfNeeded: jest.fn(async () => 'offline-tok'),
}));
jest.mock('../middleware/requireOwner', () => {
  const Store = require('../models/Store');
  const owner = async (req, res, next) => {
    req.store = await Store.findOne({ shopDomain: req.params.shopDomain });
    if (!req.store) return res.status(404).json({ error: 'Store not found' });
    return next();
  };
  return {
    requireAuth: (req, _res, next) => next(),
    requireStoreOwner: owner,
    requireStoreOwnerAnyPlan: owner,
    requireNotSuspended: (_req, _res, next) => next(),
  };
});
jest.mock('../services/profileService', () => ({ upsertProfile: jest.fn(async () => null) }));

const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Store = require('../models/Store');
const PrepaidOffer = require('../models/PrepaidOffer');
const PrepaidCode = require('../models/PrepaidCode');
const DiscountConfig = require('../models/DiscountConfig');
const { shopifyGraphQL } = require('../utils/shopifyGraphQL');
const pp = require('../utils/prepaidOffer');

const SHOP = 'pp-shop.myshopify.com';
const OTHER = 'pp-other.myshopify.com';
const PID = '111';
const VID = '222';

let mongod;
let server;
let base;

const ON = { enabled: true, discountType: 'percent', value: 5, maxDiscount: 100, minOrder: 0, heading: 'Pay online and save', buttonText: 'Pay online', accentColor: '#4F46E5' };
const starter = (shop = SHOP, over = {}) => Store.create({ shopDomain: shop, accessToken: 't', plan: 'pro', planTier: 'starter', ...over });
const offer = (over = {}, shop = SHOP) => PrepaidOffer.create({ shopDomain: shop, ...ON, ...over });

/** Fake Admin API: variant 222 of product 111 at the given price; product 111 with the given variants. */
function shopify({ price = '999.00', variants = null, createErrors = [] } = {}) {
  shopifyGraphQL.mockImplementation(async (_shop, _tok, query, vars) => {
    if (query.includes('productVariant(')) {
      if (vars.id !== `gid://shopify/ProductVariant/${VID}`) return { productVariant: null };
      return { productVariant: { id: vars.id, price, availableForSale: true, product: { id: `gid://shopify/Product/${PID}`, handle: 'cotton-kurta' } } };
    }
    if (query.includes('product(')) {
      if (vars.id !== `gid://shopify/Product/${PID}`) return { product: null };
      const nodes = variants || [{ id: `gid://shopify/ProductVariant/${VID}`, price, availableForSale: true }];
      return { product: { id: vars.id, handle: 'cotton-kurta', variants: { nodes } } };
    }
    if (query.includes('discountCodeBasicCreate')) {
      // Errors are honoured even if Shopify were to send a node with them.
      return { discountCodeBasicCreate: { codeDiscountNode: { id: 'gid://shopify/DiscountCodeNode/9' }, userErrors: createErrors } };
    }
    if (query.includes('discountCodeDelete')) {
      return { discountCodeDelete: { deletedCodeDiscountId: vars.id, userErrors: [] } };
    }
    throw new Error(`unexpected query ${query.slice(0, 40)}`);
  });
}
const createCall = () => shopifyGraphQL.mock.calls.find(([, , q]) => q.includes('discountCodeBasicCreate'));
const checkout = (over = {}) => pp.createPrepaidCheckout({ shop: SHOP, productId: PID, variantId: VID, quantity: 1, visitor: `v-${Math.random()}`, ...over });

async function post(path, body, { shop = SHOP, signature = 'valid', headers = {} } = {}) {
  const q = new URLSearchParams({ shop, signature });
  const r = await fetch(`${base}${path}?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Store.init(), PrepaidOffer.init(), PrepaidCode.init()]);
  const app = express();
  app.use(express.json());
  app.use('/apps/cartncodform', require('../routes/proxy'));
  app.use('/api/prepaid-offer', require('../routes/prepaidOffer'));
  app.use('/api/webhooks', require('../routes/webhooks'));
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
}, 60000); // starting the in-memory database can be slow when every suite runs at once

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  pp._resetRateLimits();
  shopify();
  await Promise.all([Store, PrepaidOffer, PrepaidCode, DiscountConfig].map((m) => m.deleteMany({})));
});
afterEach(() => jest.restoreAllMocks());

describe('settings checks', () => {
  it('a full valid form is accepted and tidied', () => {
    const r = pp.sanitizeSettings({ ...ON, heading: '  Pay   online\n and save ', accentColor: '#abcdef' });
    expect(r).toEqual({ ok: true, settings: { ...ON, heading: 'Pay online and save', accentColor: '#ABCDEF' } });
  });

  it.each([
    ['enabled not a boolean', { enabled: 'yes' }],
    ['unknown type', { discountType: 'bogus' }],
    ['percent over 50', { value: 51 }],
    ['percent not whole', { value: 5.5 }],
    ['percent below 1', { value: 0 }],
    ['fixed below 1', { discountType: 'fixed', value: 0.5 }],
    ['negative cap', { maxDiscount: -1 }],
    ['negative minimum', { minOrder: -5 }],
    ['empty heading', { heading: '   ' }],
    ['long heading', { heading: 'x'.repeat(61) }],
    ['long button text', { buttonText: 'x'.repeat(31) }],
    ['bad colour', { accentColor: 'red' }],
    ['not a number', { minOrder: 'abc' }],
  ])('refused: %s', (_n, over) => {
    expect(pp.sanitizeSettings({ ...ON, ...over }).ok).toBe(false);
  });
});

describe('discount amount', () => {
  const pct = { discountType: 'percent', value: 5, maxDiscount: 100, minOrder: 0 };
  it('percent of the order, capped by the maximum, rounded down', () => {
    expect(pp.computeDiscount(pct, 999)).toBe(49.95);
    expect(pp.computeDiscount(pct, 5000)).toBe(100);
    expect(pp.computeDiscount({ ...pct, maxDiscount: 0 }, 5000)).toBe(250);
    expect(pp.computeDiscount({ ...pct, value: 3 }, 333.33)).toBe(9.99);
  });
  it('fixed amount; nothing when below the minimum, under ₹1, or the whole order', () => {
    const fixed = { discountType: 'fixed', value: 50, maxDiscount: 0, minOrder: 0 };
    expect(pp.computeDiscount(fixed, 999)).toBe(50);
    expect(pp.computeDiscount(fixed, 50)).toBe(0);
    expect(pp.computeDiscount({ ...pct, minOrder: 500 }, 499.99)).toBe(0);
    expect(pp.computeDiscount({ ...pct, minOrder: 500 }, 500)).toBe(25);
    expect(pp.computeDiscount(pct, 10)).toBe(0);
    expect(pp.computeDiscount(pct, 0)).toBe(0);
  });
  it('subtotal uses the quantity-tier price like the COD order', () => {
    const qt = { enabled: true, tiers: [{ minQty: 2, percent: 10 }] };
    expect(pp.subtotalFor(500, 1, qt)).toBe(500);
    expect(pp.subtotalFor(500, 2, qt)).toBe(900);
    expect(pp.subtotalFor(500, 2, null)).toBe(1000);
  });
});

describe('createPrepaidCheckout', () => {
  it('known option → one-time code (single use, this product, 24 h) and straight to checkout', async () => {
    await starter();
    await offer();
    const r = await checkout({ quantity: 2 });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.amount).toBe(99.9);
    expect(r.body.code).toMatch(/^PAYNOW-[A-Z2-9]{8}$/);
    expect(r.body.url).toBe(`/cart/${VID}:2?discount=${r.body.code}`);

    const input = createCall()[3].basicCodeDiscount;
    expect(input).toMatchObject({
      code: r.body.code,
      usageLimit: 1,
      appliesOncePerCustomer: true,
      context: { all: 'ALL' },
      combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: true },
      customerGets: { value: { discountAmount: { amount: '99.90', appliesOnEachItem: false } }, items: { products: { productsToAdd: [`gid://shopify/Product/${PID}`] } } },
    });
    expect(input.minimumRequirement).toBeUndefined();
    const hours = (new Date(input.endsAt) - Date.now()) / 3600000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);

    const saved = await PrepaidCode.findOne({ shopDomain: SHOP }).lean();
    expect(saved).toMatchObject({ code: r.body.code, discountId: 'gid://shopify/DiscountCodeNode/9', amount: 99.9, productId: PID, variantId: VID, quantity: 2, usedAt: null });
  });

  it('the price comes from Shopify, not from the visitor', async () => {
    await starter();
    await offer();
    shopify({ price: '2000.00' });
    const r = await checkout({ price: 1 });
    expect(r.body.amount).toBe(100);
  });

  it('quantity tiers lower the subtotal the discount is worked out from', async () => {
    await starter();
    await offer({ maxDiscount: 0 });
    await DiscountConfig.create({ shopDomain: SHOP, quantityTiers: { enabled: true, tiers: [{ minQty: 2, percent: 10, badge: '' }] } });
    shopify({ price: '1000.00' });
    expect((await checkout({ quantity: 2 })).body.amount).toBe(90);
  });

  it('a minimum order is also set on the Shopify code', async () => {
    await starter();
    await offer({ minOrder: 500 });
    await checkout();
    expect(createCall()[3].basicCodeDiscount.minimumRequirement).toEqual({ subtotal: { greaterThanOrEqualToSubtotal: '500.00' } });
  });

  it('no option in the link, product with one option → still straight to checkout', async () => {
    await starter();
    await offer();
    const r = await checkout({ variantId: null });
    expect(r.body.url).toMatch(new RegExp(`^/cart/${VID}:1\\?discount=PAYNOW-`));
  });

  it('several options and none in the link → cheapest on-sale price, product page with the code applied', async () => {
    await starter();
    await offer({ maxDiscount: 0 });
    shopify({ variants: [
      { id: 'gid://shopify/ProductVariant/1', price: '1200.00', availableForSale: true },
      { id: 'gid://shopify/ProductVariant/2', price: '800.00', availableForSale: true },
      { id: 'gid://shopify/ProductVariant/3', price: '100.00', availableForSale: false },
    ] });
    const r = await checkout({ variantId: '' });
    expect(r.body.amount).toBe(40);
    expect(r.body.url).toBe(`/discount/${r.body.code}?redirect=%2Fproducts%2Fcotton-kurta`);
    expect((await PrepaidCode.findOne().lean()).variantId).toBeNull();
  });

  it('an option from ANOTHER product is refused, and no code is made', async () => {
    await starter();
    await offer();
    shopifyGraphQL.mockImplementationOnce(async () => ({ productVariant: { id: `gid://shopify/ProductVariant/${VID}`, price: '999.00', product: { id: 'gid://shopify/Product/999', handle: 'x' } } }));
    expect((await checkout()).status).toBe(400);
    expect(createCall()).toBeUndefined();
    expect(await PrepaidCode.countDocuments()).toBe(0);
  });

  it.each([
    ['Free plan (offer still saved as on from a paid plan)', async () => { await Store.create({ shopDomain: SHOP, accessToken: 't' }); await offer(); }, 403],
    ['offer turned off', async () => { await starter(); await PrepaidOffer.create({ shopDomain: SHOP, ...ON, enabled: false }); }, 403],
    ['never set up', () => starter(), 403],
    ['app uninstalled', async () => { await starter(SHOP, { subscriptionStatus: 'uninstalled' }); await offer(); }, 404],
    ['store suspended', async () => { await starter(SHOP, { suspended: true }); await offer(); }, 404],
    ['unknown store', async () => {}, 404],
  ])('%s → refused (%i), no code', async (_n, setup, status) => {
    await setup();
    expect((await checkout()).status).toBe(status);
    expect(createCall()).toBeUndefined();
  });

  it.each([
    ['bad product id', { productId: 'abc' }],
    ['bad option id', { variantId: '12x' }],
    ['quantity 0', { quantity: 0 }],
    ['quantity 100', { quantity: 100 }],
    ['quantity not whole', { quantity: 1.5 }],
    ['bad shop', { shop: 'evil.com' }],
  ])('%s → 400', async (_n, over) => {
    await starter();
    await offer();
    expect((await checkout(over)).status).toBe(400);
  });

  it('order below the minimum → 400, no code', async () => {
    await starter();
    await offer({ minOrder: 5000 });
    const r = await checkout();
    expect(r.status).toBe(400);
    expect(createCall()).toBeUndefined();
  });

  it('Shopify refuses the code → 502 with a friendly message, nothing saved', async () => {
    await starter();
    await offer();
    shopify({ createErrors: [{ field: ['code'], message: 'Code must be unique' }] });
    const r = await checkout();
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/Cash on Delivery/);
    expect(await PrepaidCode.countDocuments()).toBe(0);
  });

  it('one visitor gets 5 tries per 10 minutes; another visitor is not affected', async () => {
    await starter();
    await offer();
    for (let i = 0; i < 5; i++) expect((await checkout({ visitor: 'same' })).status).toBe(200);
    expect((await checkout({ visitor: 'same' })).status).toBe(429);
    expect((await checkout({ visitor: 'someone-else' })).status).toBe(200);
  });

  it('a shop-wide cap stops a flood from many visitors', () => {
    const now = Date.now();
    for (let i = 0; i < 120; i++) expect(pp.rateCheck(SHOP, `v${i}`, now)).toBe(true);
    expect(pp.rateCheck(SHOP, 'v-new', now)).toBe(false);
    expect(pp.rateCheck(OTHER, 'v-new', now)).toBe(true);
  });
});

describe('App Proxy: POST /prepaid-checkout', () => {
  it('needs the Shopify signature', async () => {
    await starter();
    await offer();
    expect((await post('/apps/cartncodform/prepaid-checkout', { productId: PID, quantity: 1 }, { signature: 'forged' })).status).toBe(403);
    expect(createCall()).toBeUndefined();
  });

  it('the shop comes from the signed link, never from the body', async () => {
    await starter();
    await offer();
    await starter(OTHER);
    await offer({}, OTHER);
    const r = await post('/apps/cartncodform/prepaid-checkout', { productId: PID, variantId: VID, quantity: 1, shop: OTHER, shopDomain: OTHER });
    expect(r.status).toBe(200);
    expect(await PrepaidCode.countDocuments({ shopDomain: SHOP })).toBe(1);
    expect(await PrepaidCode.countDocuments({ shopDomain: OTHER })).toBe(0);
  });
});

describe('COD form page', () => {
  const formPage = async (extra = {}) => {
    const q = new URLSearchParams({ shop: SHOP, signature: 'valid', productId: PID, productName: 'Kurta', price: '999', quantity: '1', ...extra });
    return (await fetch(`${base}/apps/cartncodform/cod-form?${q}`)).text();
  };
  const boot = (html) => JSON.parse(/var BOOT = (\{.*?\});\n/s.exec(html)[1]);

  it('offer on and allowed → the page carries the offer and the box', async () => {
    await starter();
    await offer({ heading: 'Save <b>now</b>', accentColor: '#FFEE00' });
    const html = await formPage({ variantId: VID });
    const b = boot(html);
    expect(b.prepaid).toEqual({ heading: 'Save <b>now</b>', buttonText: 'Pay online', accentColor: '#FFEE00', discountType: 'percent', value: 5, maxDiscount: 100, minOrder: 0 });
    expect(b.variantId).toBe(VID);
    expect(html).toContain('id="ccf-pp"');
    expect(html).not.toContain('Save <b>now</b>');
    expect(html).toContain('color: #111827; }');
  });

  it('the offer box: save badge, secure line, tint from the chosen colour, no extra space above the button', async () => {
    await starter();
    await offer({ accentColor: '#16A34A' });
    const html = await formPage({ variantId: VID });
    expect(html).toContain('id="ccf-pp-badge"');
    expect(html).toContain('Secure checkout by Shopify');
    expect(html).toContain('background: rgba(22, 163, 74, 0.05)');
    // The form's general "button { margin-top: 18px }" must not add a gap above the offer button.
    expect(html).toMatch(/\.ccf-pp \.ccf-pp-btn \{[^}]*margin-top: 12px/);
  });

  it('Free plan or offer off → no offer', async () => {
    await Store.create({ shopDomain: SHOP, accessToken: 't' });
    await offer();
    expect(boot(await formPage()).prepaid).toBeNull();
    await Store.updateOne({ shopDomain: SHOP }, { plan: 'pro', planTier: 'growth' });
    await PrepaidOffer.updateOne({ shopDomain: SHOP }, { enabled: false });
    expect(boot(await formPage()).prepaid).toBeNull();
  });

  it('the page script is valid JavaScript, with and without the offer (a stray quote once broke the whole form)', async () => {
    const scripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    await starter();
    const plain = scripts(await formPage());
    await offer({ heading: "Don't miss: pay & save", buttonText: "It's quick" });
    const withOffer = scripts(await formPage({ variantId: VID }));
    for (const js of [...plain, ...withOffer]) {
      // eslint-disable-next-line no-new-func
      expect(() => new Function(js)).not.toThrow();
    }
    expect(plain.length).toBeGreaterThan(0);
  });

  it('only a number is accepted as the option id', async () => {
    await starter();
    expect(boot(await formPage({ variantId: '"><script>' })).variantId).toBe('');
  });
});

describe('orders/create', () => {
  const makeCode = (code, over = {}) => PrepaidCode.create({ shopDomain: SHOP, code, discountId: 'gid://x/1', amount: 50, expiresAt: new Date(Date.now() + 3600e3), ...over });
  const hook = (order) => fetch(`${base}/api/webhooks/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Shop-Domain': SHOP, 'X-Shopify-Hmac-Sha256': 'x' },
    body: JSON.stringify(order),
  });

  it('an online-paid order with the code is counted as prepaid (code matched in any case)', async () => {
    await makeCode('PAYNOW-ABCD2345');
    await hook({ id: 555, total_price: '949.00', discount_codes: [{ code: 'paynow-abcd2345' }], payment_gateway_names: ['razorpay'], line_items: [] });
    const c = await PrepaidCode.findOne({ code: 'PAYNOW-ABCD2345' }).lean();
    expect(c).toMatchObject({ orderId: '555', orderTotal: 949, paidOnline: true });
    expect(c.usedAt).toBeInstanceOf(Date);
  });

  it('code used but paid Cash on Delivery at Shopify checkout → counted as such', async () => {
    await makeCode('PAYNOW-COD22222');
    expect(await pp.recordPrepaidUse(SHOP, { id: 1, total_price: '949', discount_codes: [{ code: 'PAYNOW-COD22222' }], payment_gateway_names: ['Cash on Delivery (COD)'] })).toBe(1);
    expect((await PrepaidCode.findOne().lean()).paidOnline).toBe(false);
  });

  it('other codes, other shops and a second delivery change nothing', async () => {
    await makeCode('PAYNOW-ONCE2222');
    expect(await pp.recordPrepaidUse(SHOP, { id: 1, discount_codes: [{ code: 'SUMMER10' }] })).toBe(0);
    expect(await pp.recordPrepaidUse(OTHER, { id: 1, discount_codes: [{ code: 'PAYNOW-ONCE2222' }] })).toBe(0);
    expect(await pp.recordPrepaidUse(SHOP, { id: 7, discount_codes: [{ code: 'PAYNOW-ONCE2222' }] })).toBe(1);
    expect(await pp.recordPrepaidUse(SHOP, { id: 8, discount_codes: [{ code: 'PAYNOW-ONCE2222' }] })).toBe(0);
    expect((await PrepaidCode.findOne().lean()).orderId).toBe('7');
    expect(await pp.recordPrepaidUse(SHOP, null)).toBe(0);
  });
});

describe('clean-up of unused codes', () => {
  const at = (h) => new Date(Date.now() + h * 3600e3);
  it('deletes from Shopify only codes unused and expired over an hour ago, once', async () => {
    await starter();
    await PrepaidCode.create([
      { shopDomain: SHOP, code: 'PAYNOW-OLD22222', discountId: 'gid://d/1', amount: 50, expiresAt: at(-2) },
      { shopDomain: SHOP, code: 'PAYNOW-RECENT22', discountId: 'gid://d/2', amount: 50, expiresAt: at(-0.5) },
      { shopDomain: SHOP, code: 'PAYNOW-LIVE2222', discountId: 'gid://d/3', amount: 50, expiresAt: at(5) },
      { shopDomain: SHOP, code: 'PAYNOW-USED2222', discountId: 'gid://d/4', amount: 50, expiresAt: at(-5), usedAt: new Date() },
    ]);
    expect(await pp.cleanupExpiredPrepaidCodes()).toEqual({ deleted: 1, failed: 0 });
    const deletes = shopifyGraphQL.mock.calls.filter(([, , q]) => q.includes('discountCodeDelete'));
    expect(deletes).toHaveLength(1);
    expect(deletes[0][3]).toEqual({ id: 'gid://d/1' });
    expect((await PrepaidCode.findOne({ code: 'PAYNOW-OLD22222' }).lean()).deletedAt).toBeInstanceOf(Date);
    expect(await pp.cleanupExpiredPrepaidCodes()).toEqual({ deleted: 0, failed: 0 });
  });

  it('a Shopify failure is logged and not retried forever', async () => {
    await starter();
    await PrepaidCode.create({ shopDomain: SHOP, code: 'PAYNOW-FAIL2222', discountId: 'gid://d/9', amount: 50, expiresAt: at(-2) });
    shopifyGraphQL.mockRejectedValue(new Error('down'));
    expect(await pp.cleanupExpiredPrepaidCodes()).toEqual({ deleted: 0, failed: 1 });
    expect(await pp.cleanupExpiredPrepaidCodes()).toEqual({ deleted: 0, failed: 0 });
  });
});

describe('admin: /api/prepaid-offer/:shop', () => {
  const put = (shop, body) => fetch(`${base}/api/prepaid-offer/${shop}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('GET: defaults, plan status and this month numbers', async () => {
    await starter();
    await PrepaidCode.create([
      { shopDomain: SHOP, code: 'PAYNOW-A2222222', discountId: 'g1', amount: 50, expiresAt: new Date(), usedAt: new Date(), paidOnline: true, orderTotal: 949 },
      { shopDomain: SHOP, code: 'PAYNOW-B2222222', discountId: 'g2', amount: 40, expiresAt: new Date(), usedAt: new Date(), paidOnline: false, orderTotal: 760 },
      { shopDomain: SHOP, code: 'PAYNOW-C2222222', discountId: 'g3', amount: 30, expiresAt: new Date() },
      { shopDomain: OTHER, code: 'PAYNOW-D2222222', discountId: 'g4', amount: 99, expiresAt: new Date(), usedAt: new Date(), paidOnline: true, orderTotal: 5000 },
    ]);
    const body = await (await fetch(`${base}/api/prepaid-offer/${SHOP}`)).json();
    expect(body.settings).toEqual({ ...pp.DEFAULTS });
    expect(body).toMatchObject({ allowed: true, planName: 'Starter' });
    // For the upgrade popup on the Free plan: the cheapest plan with the offer, and the trial length.
    expect(body.upgradePlan).toMatchObject({ id: 'starter', name: 'Starter', price: 9.99, prepaidOffer: true });
    expect(body.trialDays).toBe(30);
    expect(body.stats).toEqual({ offersTaken: 3, prepaidOrders: 1, usedWithCod: 1, discountGiven: 90, prepaidRevenue: 949 });
  });

  it('PUT: saves a valid form; refuses a bad one', async () => {
    await starter();
    const ok = await put(SHOP, { ...ON, value: 7 });
    expect(ok.status).toBe(200);
    expect((await ok.json()).settings.value).toBe(7);
    expect((await PrepaidOffer.findOne({ shopDomain: SHOP }).lean()).value).toBe(7);
    const bad = await put(SHOP, { ...ON, value: 80 });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/1 to 50/);
  });

  it('PUT on the Free plan: turning it on is refused (402); saving it off is fine', async () => {
    await Store.create({ shopDomain: SHOP, accessToken: 't' });
    const on = await put(SHOP, ON);
    expect(on.status).toBe(402);
    expect((await on.json()).code).toBe('PLAN_FEATURE');
    expect(await PrepaidOffer.countDocuments()).toBe(0);
    expect((await put(SHOP, { ...ON, enabled: false })).status).toBe(200);
  });
});
