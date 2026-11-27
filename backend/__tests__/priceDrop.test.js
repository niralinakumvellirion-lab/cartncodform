'use strict';

/**
 * Price drop: helpers, storefront App Proxy route, admin route and the poller sender.
 */

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => next(),
  requireStoreOwner: (req, _res, next) => { req.store = { shopDomain: 'demo.myshopify.com' }; return next(); },
}));
jest.mock('../utils/shopify', () => ({ verifyProxySignature: jest.fn(() => true), API_VERSION: '2025-01' }));
jest.mock('../services/profileService', () => ({ upsertProfile: jest.fn() }));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const P = require('../utils/priceDrop');
const PriceDropConfig = require('../models/PriceDropConfig');
const PriceDropRequest = require('../models/PriceDropRequest');
const ScheduledJob = require('../models/ScheduledJob');
const Store = require('../models/Store');
const AutomationConfig = require('../models/AutomationConfig');
const { upsertProfile } = require('../services/profileService');
const proxyRouter = require('../routes/priceDropProxy');
const adminRouter = require('../routes/priceDrop');
const { processPriceDrops, CHECK_EVERY_MS } = require('../services/priceDrop');

const SHOP = 'demo.myshopify.com';
const TOKEN = 'fcm_token_abcdefghijklmnopqrstuvwxyz_0123456789';

function handler(router, path, method) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  return layer.route.stack.map((s) => s.handle);
}
async function run(router, path, method, req) {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  const chain = handler(router, path, method);
  let i = 0;
  const next = async () => { const h = chain[i++]; if (h) await h(req, res, next); };
  await next();
  return res;
}
const proxyReq = (body) => ({ query: { shop: SHOP, signature: 'x' }, body, ip: '1.2.3.4', params: {} });
const adminReq = (extra = {}) => ({ params: { shopDomain: SHOP }, query: {}, ...extra });

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PriceDropRequest.syncIndexes();
}, 60000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 60000);
beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  proxyRouter._limiter.reset();
  upsertProfile.mockResolvedValue(null);
  await Promise.all([PriceDropConfig, PriceDropRequest, ScheduledJob, Store, AutomationConfig].map((M) => M.deleteMany({})));
});
afterEach(() => jest.restoreAllMocks());

describe('helpers', () => {
  test('defaults and settings', () => {
    const s = P.withDefaults(null);
    expect(s.enabled).toBe(false);
    expect(s.minDropPercent).toBe(5);
    expect(s.channels).toEqual({ push: true, email: true, whatsapp: false });
    expect(P.sanitizeSettings({ minDropPercent: 200 }).minDropPercent).toBe(90);
    expect(P.sanitizeSettings({ minDropPercent: 0 }).minDropPercent).toBe(1);
    expect(() => P.sanitizeSettings({ channels: { push: false, email: false } })).toThrow(/at least one/);
    const pub = P.publicSettings({ whatsappPercent: 70 });
    expect(pub.percent).toEqual({ whatsapp: 70, email: 30 });
    expect(pub.texts.triggerText).toBe('Notify me if the price drops');
    expect(pub.texts.pushTitle).toBeUndefined();
  });

  test('money and drop rule', () => {
    expect(P.formatMoney(1199, 'INR')).toBe('₹1,199');
    expect(P.formatMoney(1199.5, 'INR')).toBe('₹1,199.50');
    expect(P.isDrop(1499, 1424, 5)).toBe(true);
    expect(P.isDrop(1499, 1425, 5)).toBe(false);
    expect(P.isDrop(1499, 1499, 5)).toBe(false);
    expect(P.isDrop(null, 100, 5)).toBe(false);
  });

  test('messages show the old and new price', () => {
    const r = { channel: 'email', productTitle: 'Kurta', variantTitle: 'M', productHandle: 'kurta', variantId: '2', basePrice: 1499, dropPrice: 1199, currencyCode: 'INR' };
    const e = P.buildMessage(P.withDefaults(null), r, SHOP, 'j1');
    expect(e.subject).toBe('Kurta is now ₹1,199');
    expect(e.body).toContain('from ₹1,499 to ₹1,199');
    expect(e.url).toContain('ccf_src=email&ccf_job=j1');
    const w = P.buildMessage(P.withDefaults(null), { ...r, channel: 'whatsapp', phone: '+919876543210' }, SHOP, 'j2');
    expect(w.text).toContain('Kurta is now ₹1,199 (was ₹1,499)');
    expect(w.waLink.startsWith('https://wa.me/919876543210?text=')).toBe(true);
  });
});

describe('storefront + admin routes', () => {
  test('subscribe: off → 404; on → saved without a base price (set by the server later)', async () => {
    const body = { productId: '1', variantId: '2', productTitle: 'Kurta', variantTitle: 'M', channel: 'email', email: 'a@example.com' };
    expect((await run(proxyRouter, '/subscribe', 'post', proxyReq(body))).statusCode).toBe(404);
    await PriceDropConfig.create({ shopDomain: SHOP, enabled: true });
    const ok = await run(proxyRouter, '/subscribe', 'post', proxyReq({ ...body, basePrice: 1 }));
    expect(ok.body).toEqual({ ok: true });
    const row = await PriceDropRequest.findOne({}).lean();
    expect(row).toMatchObject({ status: 'waiting', email: 'a@example.com', basePrice: null });
    const cfg = await run(proxyRouter, '/config', 'get', proxyReq());
    expect(cfg.body.settings.texts.triggerText).toBe('Notify me if the price drops');
  });

  test('admin: save settings, overview shows the price at sign-up', async () => {
    const put = await run(adminRouter, '/:shopDomain/config', 'put', adminReq({ body: { settings: { enabled: true, minDropPercent: 10 } } }));
    expect(put.body.settings.minDropPercent).toBe(10);
    await PriceDropRequest.create({ shopDomain: SHOP, productId: '1', variantId: '2', productTitle: 'Kurta', variantTitle: 'M', channel: 'email', email: 'a@x.com', basePrice: 1499, currencyCode: 'INR', expiresAt: P.expiresAt() });
    const ov = await run(adminRouter, '/:shopDomain/overview', 'get', adminReq());
    expect(ov.body.waiting[0]).toMatchObject({ variantId: '2', count: 1, basePrice: 1499, currencyCode: 'INR' });
    expect(JSON.stringify(ov.body)).not.toContain('a@x.com');
  });
});

describe('sender', () => {
  const NOW = new Date('2026-11-26T08:00:00Z');
  let deps;
  let price;
  const node = () => ({ shop: { currencyCode: 'INR' }, nodes: [{ id: 'gid://shopify/ProductVariant/222', price: String(price), availableForSale: true }] });

  async function setup({ channel = 'email', requests = 1, basePrice = null, config = {} } = {}) {
    await PriceDropConfig.create({ shopDomain: SHOP, enabled: true, ...config });
    await Store.create({ shopDomain: SHOP, accessToken: 'shpat_x', subscriptionStatus: 'active' });
    const rows = [];
    for (let i = 0; i < requests; i++) {
      rows.push({
        shopDomain: SHOP, productId: '111', variantId: '222', productTitle: 'Cotton Kurta', variantTitle: 'M', productHandle: 'cotton-kurta',
        channel, email: channel === 'email' ? `s${i}@example.com` : null, pushToken: channel === 'push' ? `${TOKEN}_${i}` : null,
        phone: channel === 'whatsapp' ? `+91987654321${i}` : null, basePrice,
        createdAt: new Date(NOW.getTime() - (requests - i) * 60000), expiresAt: P.expiresAt(NOW),
      });
    }
    await PriceDropRequest.create(rows);
  }
  const later = (n) => new Date(NOW.getTime() + n * CHECK_EVERY_MS);

  beforeEach(() => {
    price = 1499;
    deps = {
      graphQL: jest.fn(async () => node()),
      sendPush: jest.fn().mockResolvedValue({ success: true, sent: 1 }),
      sendEmail: jest.fn().mockResolvedValue({ success: true }),
      sendOwnerPush: jest.fn().mockResolvedValue({ success: true }),
      isAtLimit: jest.fn().mockResolvedValue(false),
      isQuietNow: jest.fn().mockReturnValue(false),
      hasActivePlan: () => true,
      hashEmail: () => null,
    };
  });

  test('first check stores the sign-up price; a drop of 5%+ later sends the email with old/new price', async () => {
    await setup();
    const [first] = await processPriceDrops({ now: NOW, deps });
    expect(first.based).toBe(1);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect((await PriceDropRequest.findOne({}).lean())).toMatchObject({ basePrice: 1499, currencyCode: 'INR' });

    price = 1450; // only ~3% lower
    await processPriceDrops({ now: later(1), deps });
    expect(deps.sendEmail).not.toHaveBeenCalled();

    price = 1199;
    await processPriceDrops({ now: later(2), deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    const [, subject, html] = deps.sendEmail.mock.calls[0];
    expect(subject).toBe('Cotton Kurta is now ₹1,199');
    expect(html).toContain('₹1,499');
    const job = await ScheduledJob.findOne({}).lean();
    expect(job).toMatchObject({ signalType: 'price_drop', status: 'sent', channel: 'email' });
    expect(await PriceDropRequest.findOne({}).lean()).toMatchObject({ status: 'sent', dropPrice: 1199 });
  });

  test('the seller’s minimum drop is used', async () => {
    await setup({ basePrice: 1000, config: { minDropPercent: 20 } });
    price = 850; // 15% — not enough
    await processPriceDrops({ now: NOW, deps });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    price = 790;
    await processPriceDrops({ now: later(1), deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  test('sold out at the lower price → no alert yet', async () => {
    await setup({ basePrice: 1499 });
    price = 999;
    deps.graphQL.mockResolvedValue({ shop: { currencyCode: 'INR' }, nodes: [{ id: 'gid://shopify/ProductVariant/222', price: '999', availableForSale: false }] });
    await processPriceDrops({ now: NOW, deps });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  test('WhatsApp: marked ready and the seller is reminded; push sent at once', async () => {
    await setup({ channel: 'whatsapp', requests: 2, basePrice: 1499 });
    await PriceDropRequest.create({ shopDomain: SHOP, productId: '111', variantId: '222', productTitle: 'Cotton Kurta', variantTitle: 'M', channel: 'push', pushToken: TOKEN, basePrice: 1499, expiresAt: P.expiresAt(NOW) });
    price = 1199;
    const [sum] = await processPriceDrops({ now: NOW, deps });
    expect(sum.whatsappReady).toBe(2);
    expect(deps.sendOwnerPush.mock.calls[0][1]).toBe('2 WhatsApp price alerts to send');
    expect(deps.sendOwnerPush.mock.calls[0][2]).toMatch(/Cotton Kurta is now ₹1,199/);
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    expect(deps.sendPush.mock.calls[0][2].title).toBe('Price drop! Cotton Kurta is now ₹1,199');
    const list = await run(adminRouter, '/:shopDomain/whatsapp', 'get', adminReq());
    expect(list.body.toSend).toHaveLength(2);
    expect(list.body.toSend[0].text).toContain('now ₹1,199 (was ₹1,499)');
  });

  test('off, quiet hours, price_drop signal off, plan limit', async () => {
    await setup({ basePrice: 1499, config: { enabled: false } });
    price = 999;
    expect((await processPriceDrops({ now: NOW, deps }))[0].reason).toBe('off');
    await PriceDropConfig.updateOne({ shopDomain: SHOP }, { enabled: true });
    deps.isQuietNow.mockReturnValueOnce(true);
    expect((await processPriceDrops({ now: NOW, deps }))[0].reason).toBe('quiet_hours');
    await AutomationConfig.create({ shopDomain: SHOP, enabledSignals: { price_drop: false } });
    expect((await processPriceDrops({ now: later(1), deps }))[0].reason).toBe('automation_off');
    await AutomationConfig.deleteMany({});
    deps.isAtLimit.mockResolvedValue(true);
    expect((await processPriceDrops({ now: later(2), deps }))[0].reason).toBe('plan_limit');
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  test('quiet hours: the sign-up price is still recorded; the alert waits', async () => {
    await setup();
    deps.isQuietNow.mockReturnValue(true);
    const [sum] = await processPriceDrops({ now: NOW, deps });
    expect(sum).toMatchObject({ reason: 'quiet_hours', based: 1 });
    price = 999;
    await processPriceDrops({ now: later(1), deps });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    deps.isQuietNow.mockReturnValue(false);
    await processPriceDrops({ now: later(2), deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  test('price check error is caught', async () => {
    await setup();
    deps.graphQL.mockRejectedValue(new Error('boom'));
    expect((await processPriceDrops({ now: NOW, deps }))[0].reason).toBe('price_check_failed');
  });
});
