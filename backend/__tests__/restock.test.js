'use strict';

/**
 * Back in stock: helpers, storefront App Proxy route, admin route and the poller sender.
 */

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => next(),
  requireStoreOwner: (req, _res, next) => { req.store = { shopDomain: 'demo.myshopify.com' }; return next(); },
}));
jest.mock('../utils/shopify', () => ({ verifyProxySignature: jest.fn(() => true), API_VERSION: '2025-01' }));
jest.mock('../services/profileService', () => ({ upsertProfile: jest.fn() }));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const R = require('../utils/restock');
const RestockConfig = require('../models/RestockConfig');
const RestockRequest = require('../models/RestockRequest');
const ScheduledJob = require('../models/ScheduledJob');
const Store = require('../models/Store');
const Profile = require('../models/Profile');
const AutomationConfig = require('../models/AutomationConfig');
const PurchaseRecord = require('../models/PurchaseRecord');
const AttributedEvent = require('../models/AttributedEvent');
const { verifyProxySignature } = require('../utils/shopify');
const { upsertProfile } = require('../services/profileService');
const proxyRouter = require('../routes/restockProxy');
const adminRouter = require('../routes/restock');
const { processRestock, CHECK_EVERY_MS, WAVE } = require('../services/restock');

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
const proxyReq = (body, extra = {}) => ({ query: { shop: SHOP, signature: 'x', ...extra }, body, ip: '1.2.3.4', params: {} });
const subscribeBody = (extra = {}) => ({
  productId: '111', variantId: '222', productTitle: 'Cotton Kurta', variantTitle: 'M',
  productHandle: 'cotton-kurta', imageUrl: 'https://cdn.shopify.com/k.jpg', channel: 'email', email: 'Asha@Example.com',
  sessionId: 'abcdef12-3456', ...extra,
});

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await RestockRequest.syncIndexes();
}, 60000); // the in-memory database can take a while to start when the whole suite runs
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 60000);
beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  verifyProxySignature.mockReturnValue(true);
  proxyRouter._limiter.reset();
  upsertProfile.mockResolvedValue(null);
  await Promise.all([RestockConfig, RestockRequest, ScheduledJob, Store, Profile, AutomationConfig, PurchaseRecord, AttributedEvent]
    .map((M) => M.deleteMany({})));
});
afterEach(() => jest.restoreAllMocks());

// ── Helpers ──────────────────────────────────────────────────────────────────

describe('settings helpers', () => {
  test('defaults: off, both channels, default words', () => {
    const s = R.withDefaults(null);
    expect(s.enabled).toBe(false);
    expect(s.channels).toEqual({ push: true, email: true, whatsapp: false });
    expect(s.texts.buttonText).toBe('Notify me');
    expect(s.buttonRadius).toBe(8);
  });

  test('sanitize: caps texts, drops unknown keys, clamps radius, needs a channel and a good colour', () => {
    const s = R.sanitizeSettings({
      enabled: true, accentColor: '#123abc', buttonRadius: 99,
      texts: { boxTitle: 'x'.repeat(200), evil: 'no', pushTitle: '  Back! \u0007 ' }, channels: { email: false },
    });
    expect(s.enabled).toBe(true);
    expect(s.texts.boxTitle).toHaveLength(R.TEXT_MAX.boxTitle);
    expect(s.texts.evil).toBeUndefined();
    expect(s.texts.pushTitle).toBe('Back!');
    expect(s.buttonRadius).toBe(24);
    expect(s.channels).toEqual({ push: true, email: false, whatsapp: false });
    expect(() => R.sanitizeSettings({ accentColor: 'red' })).toThrow(/colour/);
    expect(() => R.sanitizeSettings({ channels: { push: false, email: false } })).toThrow(/at least one/);
  });

  test('WhatsApp channel and email delay settings', () => {
    expect(R.withDefaults(null).channels.whatsapp).toBe(false);
    expect(R.withDefaults(null).emailDelayMinutes).toBe(60);
    const s = R.sanitizeSettings({ channels: { push: false, email: false, whatsapp: true }, emailDelayMinutes: 120 });
    expect(s.channels).toEqual({ push: false, email: false, whatsapp: true });
    expect(s.emailDelayMinutes).toBe(120);
    expect(R.sanitizeSettings({ emailDelayMinutes: 7 }).emailDelayMinutes).toBe(60);
    expect(R.publicSettings({ emailDelayMinutes: 240 }).texts.emailHint).toBe('We email you within 4 hours of the restock');
    expect(R.publicSettings({ emailDelayMinutes: 0 }).texts.emailHint).toBe('We email you within a few minutes of the restock');
    const w = R.sanitizeSubscribe(subscribeBody({ channel: 'whatsapp', phone: '098765 43210', email: '' }));
    expect(w.phone).toBe('+919876543210');
    expect(() => R.sanitizeSubscribe(subscribeBody({ channel: 'whatsapp', phone: '12345' }))).toThrow(/WhatsApp number/);
    const m = R.buildMessage(R.withDefaults(null), { channel: 'whatsapp', phone: '+919876543210', productTitle: 'Kurta', variantTitle: 'M', productHandle: 'kurta', variantId: '2' }, SHOP, 'j9');
    expect(m.text).toContain('Kurta (M) is back in stock');
    expect(m.text).toContain('ccf_src=whatsapp&ccf_job=j9');
    expect(m.waLink.startsWith('https://wa.me/919876543210?text=')).toBe(true);
  });

  test('public settings hide the message texts', () => {
    const p = R.publicSettings({ enabled: true, texts: { pushTitle: 'secret', boxTitle: 'Gone!' } });
    expect(p.texts.boxTitle).toBe('Gone!');
    expect(p.texts.pushTitle).toBeUndefined();
    expect(p.texts.emailBody).toBeUndefined();
  });

  test('subscribe body: ids, channel, email, token are checked', () => {
    const c = R.sanitizeSubscribe(subscribeBody());
    expect(c.email).toBe('asha@example.com');
    expect(c.pushToken).toBeNull();
    expect(() => R.sanitizeSubscribe(subscribeBody({ variantId: 'abc' }))).toThrow(/size/);
    expect(() => R.sanitizeSubscribe(subscribeBody({ email: 'nope' }))).toThrow(/email/);
    expect(() => R.sanitizeSubscribe(subscribeBody({ channel: 'sms' }))).toThrow(/how to be notified/);
    expect(() => R.sanitizeSubscribe(subscribeBody({ channel: 'push', pushToken: 'short' }))).toThrow(/notifications/);
    const p = R.sanitizeSubscribe(subscribeBody({ channel: 'push', pushToken: TOKEN, email: '', imageUrl: 'javascript:x', productHandle: 'Bad Handle' }));
    expect(p.pushToken).toBe(TOKEN);
    expect(p.imageUrl).toBe('');
    expect(p.productHandle).toBe('');
  });

  test('messages fill {product} and {size} and link to the variant with attribution', () => {
    const req = { channel: 'push', productTitle: 'Cotton Kurta', variantTitle: 'M', productHandle: 'cotton-kurta', variantId: '222' };
    const m = R.buildMessage(R.withDefaults({ texts: { pushTitle: 'Your {size} {product} is back' } }), req, SHOP, 'job1');
    expect(m.title).toBe('Your M Cotton Kurta is back');
    expect(m.body).toContain('M is available again');
    expect(m.url).toBe(`https://${SHOP}/products/cotton-kurta?variant=222&ccf_src=push&ccf_job=job1`);
    const e = R.buildMessage(R.withDefaults(null), { ...req, channel: 'email', variantTitle: 'Default Title' }, SHOP, 'j2');
    expect(e.subject).toBe('Cotton Kurta is back in stock');
    expect(e.body).toContain('(it)');
    expect(e.url).toContain('ccf_src=email');
    // An emptied text falls back to the default
    expect(R.buildMessage({ texts: { pushTitle: '  ' } }, req, SHOP).title).toBe('Cotton Kurta is back in stock 🎉');
  });
});

// ── Storefront (App Proxy) ───────────────────────────────────────────────────

describe('storefront route', () => {
  test('rejects a bad signature', async () => {
    verifyProxySignature.mockReturnValue(false);
    const res = await run(proxyRouter, '/config', 'get', proxyReq());
    expect(res.statusCode).toBe(403);
  });

  test('config: public settings only', async () => {
    await RestockConfig.create({ shopDomain: SHOP, enabled: true, texts: { buttonText: 'Tell me' } });
    const res = await run(proxyRouter, '/config', 'get', proxyReq());
    expect(res.body.settings.enabled).toBe(true);
    expect(res.body.settings.texts.buttonText).toBe('Tell me');
    expect(res.body.settings.texts.pushBody).toBeUndefined();
  });

  test('subscribe: off → 404; channel off → 400', async () => {
    let res = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody()));
    expect(res.statusCode).toBe(404);
    await RestockConfig.create({ shopDomain: SHOP, enabled: true, channels: { push: true, email: false } });
    res = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody()));
    expect(res.statusCode).toBe(400);
    expect(res.body.field).toBe('channel');
  });

  test('subscribe: saves one waiting request linked to the profile; a repeat is not duplicated', async () => {
    await RestockConfig.create({ shopDomain: SHOP, enabled: true });
    const pid = new mongoose.Types.ObjectId();
    upsertProfile.mockResolvedValue({ _id: pid });
    const res = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody(), { logged_in_customer_id: '987' }));
    expect(res.body).toEqual({ ok: true });
    expect(upsertProfile).toHaveBeenCalledWith(SHOP, { customerId: '987', email: 'asha@example.com', sessionId: 'abcdef12-3456' }, {});
    const again = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody({ email: 'asha@example.com' })));
    expect(again.body).toEqual({ ok: true, already: true });
    const rows = await RestockRequest.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'waiting', variantId: '222', customerId: '987', email: 'asha@example.com' });
    expect(String(rows[0].profileId)).toBe(String(pid));
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 24 * 3600 * 1000);
  });

  test('subscribe: WhatsApp number saved in +91 format (only when the seller turned WhatsApp on)', async () => {
    await RestockConfig.create({ shopDomain: SHOP, enabled: true });
    const off = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody({ channel: 'whatsapp', phone: '9876543210' })));
    expect(off.statusCode).toBe(400);
    await RestockConfig.updateOne({ shopDomain: SHOP }, { 'channels.whatsapp': true });
    upsertProfile.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    const ok = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody({ channel: 'whatsapp', phone: '98765 43210', email: '' })));
    expect(ok.body.ok).toBe(true);
    expect(upsertProfile.mock.calls[0][1]).toMatchObject({ phone: '+919876543210' });
    // Two different shoppers can wait for the same size on WhatsApp.
    const two = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody({ channel: 'whatsapp', phone: '9123456780', email: '' })));
    expect(two.body.ok).toBe(true);
    expect(await RestockRequest.countDocuments({ channel: 'whatsapp' })).toBe(2);
  });

  test('subscribe: push request keeps the token; bad body → 400; rate limited', async () => {
    await RestockConfig.create({ shopDomain: SHOP, enabled: true });
    const ok = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody({ channel: 'push', pushToken: TOKEN })));
    expect(ok.body.ok).toBe(true);
    expect((await RestockRequest.findOne({ channel: 'push' }).lean()).pushToken).toBe(TOKEN);
    const bad = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody({ email: 'x' })));
    expect(bad.statusCode).toBe(400);
    let last;
    for (let i = 0; i < 12; i++) last = await run(proxyRouter, '/subscribe', 'post', proxyReq(subscribeBody()));
    expect(last.statusCode).toBe(429);
  });
});

// ── Admin ────────────────────────────────────────────────────────────────────

describe('admin route', () => {
  const adminReq = (body) => ({ params: { shopDomain: SHOP }, body });

  test('GET gives defaults; PUT saves; bad colour → 400', async () => {
    let res = await run(adminRouter, '/:shopDomain/config', 'get', adminReq());
    expect(res.body.settings.enabled).toBe(false);
    res = await run(adminRouter, '/:shopDomain/config', 'put', adminReq({ settings: { enabled: true, texts: { buttonText: 'Alert me' } } }));
    expect(res.body.settings.texts.buttonText).toBe('Alert me');
    expect((await RestockConfig.findOne({ shopDomain: SHOP }).lean()).enabled).toBe(true);
    res = await run(adminRouter, '/:shopDomain/config', 'put', adminReq({ settings: { accentColor: 'blue' } }));
    expect(res.statusCode).toBe(400);
  });

  test('overview: waiting grouped per size, no emails; last-30-day results', async () => {
    const base = { shopDomain: SHOP, productId: '1', productTitle: 'Kurta', expiresAt: R.expiresAt() };
    await RestockRequest.create([
      { ...base, variantId: '10', variantTitle: 'M', channel: 'email', email: 'a@x.com' },
      { ...base, variantId: '10', variantTitle: 'M', channel: 'push', pushToken: TOKEN },
      { ...base, variantId: '11', variantTitle: 'L', channel: 'email', email: 'b@x.com' },
      { ...base, variantId: '12', variantTitle: 'S', channel: 'email', email: 'c@x.com', status: 'sent' },
      { ...base, shopDomain: 'other.myshopify.com', variantId: '10', channel: 'email', email: 'd@x.com' },
    ]);
    const job = await ScheduledJob.create({ shopDomain: SHOP, signalType: 'back_in_stock', channel: 'push', status: 'sent', sentAt: new Date(), runAt: new Date(), clickedAt: new Date() });
    await ScheduledJob.create({ shopDomain: SHOP, signalType: 'back_in_stock', channel: 'email', status: 'sent', sentAt: new Date(), runAt: new Date() });
    await AttributedEvent.create({ shopDomain: SHOP, eventType: 'purchase', jobId: job._id, meta: { orderTotal: 1299 } });

    const res = await run(adminRouter, '/:shopDomain/overview', 'get', adminReq());
    expect(res.body.waitingTotal).toBe(3);
    expect(res.body.waiting[0]).toMatchObject({ variantId: '10', variantTitle: 'M', count: 2, push: 1, email: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/@x\.com/);
    expect(res.body.last30).toEqual({ sent: 2, clicked: 1, orders: 1, revenue: 1299 });
  });

  test('whatsapp: list of ready alerts with wa.me links; marking one sent logs a WhatsApp message', async () => {
    const base = { shopDomain: SHOP, productId: '1', productTitle: 'Kurta', productHandle: 'kurta', variantId: '10', variantTitle: 'M', expiresAt: R.expiresAt() };
    const ready = await RestockRequest.create({ ...base, channel: 'whatsapp', phone: '+919876543210', status: 'ready', readyAt: new Date() });
    await RestockRequest.create({ ...base, channel: 'whatsapp', phone: '+919111111111', status: 'waiting' });
    const list = await run(adminRouter, '/:shopDomain/whatsapp', 'get', adminReq());
    expect(list.body.toSend).toHaveLength(1);
    const item = list.body.toSend[0];
    expect(item).toMatchObject({ phone: '+919876543210', productTitle: 'Kurta', variantTitle: 'M' });
    const jobId = String((await RestockRequest.findById(ready._id).lean()).jobId);
    expect(item.waLink).toContain('https://wa.me/919876543210?text=');
    expect(decodeURIComponent(item.waLink)).toContain(`ccf_job=${jobId}`);

    const sent = await run(adminRouter, '/:shopDomain/whatsapp/:id/sent', 'post', { ...adminReq(), params: { shopDomain: SHOP, id: item.id } });
    expect(sent.body).toEqual({ ok: true });
    expect(await RestockRequest.findById(ready._id).lean()).toMatchObject({ status: 'sent' });
    const job = await ScheduledJob.findById(jobId).lean();
    expect(job).toMatchObject({ channel: 'whatsapp', status: 'sent', signalType: 'back_in_stock', origin: 'manual' });
    expect(job.messageText).toContain('Kurta (M) is back in stock');
    const again = await run(adminRouter, '/:shopDomain/whatsapp/:id/sent', 'post', { ...adminReq(), params: { shopDomain: SHOP, id: item.id } });
    expect(again.statusCode).toBe(404);
    const overview = await run(adminRouter, '/:shopDomain/overview', 'get', adminReq());
    expect(overview.body.whatsappToSend).toBe(0);
    expect(overview.body.waiting[0]).toMatchObject({ whatsapp: 1 });
  });

  test('waiting: who is waiting, newest first; push rows use the profile email; one size; this shop only', async () => {
    const prof = await Profile.create({ shopDomain: SHOP, identifiers: { emails: ['pushy@x.com'] } });
    const base = { shopDomain: SHOP, productId: '1', productTitle: 'Kurta', expiresAt: R.expiresAt() };
    await RestockRequest.create([
      { ...base, variantId: '10', variantTitle: 'M', channel: 'email', email: 'a@x.com', customerId: '55', createdAt: new Date(Date.now() - 60000) },
      { ...base, variantId: '10', variantTitle: 'M', channel: 'push', pushToken: TOKEN, profileId: prof._id },
      { ...base, variantId: '11', variantTitle: 'L', channel: 'email', email: 'b@x.com' },
      { ...base, variantId: '10', variantTitle: 'M', channel: 'email', email: 'old@x.com', status: 'sent' },
      { ...base, shopDomain: 'other.myshopify.com', variantId: '10', channel: 'email', email: 'z@x.com' },
    ]);
    const res = await run(adminRouter, '/:shopDomain/waiting', 'get', { ...adminReq(), query: { variantId: '10' } });
    expect(res.body.people.map((p) => p.email)).toEqual(['pushy@x.com', 'a@x.com']);
    expect(res.body.people[0]).toMatchObject({ channel: 'push', profileId: String(prof._id), variantTitle: 'M' });
    expect(res.body.people[1]).toMatchObject({ channel: 'email', customerId: '55' });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    const all = await run(adminRouter, '/:shopDomain/waiting', 'get', { ...adminReq(), query: {} });
    expect(all.body.people).toHaveLength(3);
    const bad = await run(adminRouter, '/:shopDomain/waiting', 'get', { ...adminReq(), query: { variantId: 'x' } });
    expect(bad.statusCode).toBe(400);
  });
});

// ── Sender ───────────────────────────────────────────────────────────────────

describe('sender (poller)', () => {
  const NOW = new Date('2026-11-26T08:00:00Z');
  let deps;

  async function setup({ config = {}, store = {}, requests = 1, channel = 'push' } = {}) {
    await RestockConfig.create({ shopDomain: SHOP, enabled: true, ...config });
    await Store.create({ shopDomain: SHOP, accessToken: 'shpat_x', subscriptionStatus: 'active', ...store });
    const rows = [];
    for (let i = 0; i < requests; i++) {
      rows.push({
        shopDomain: SHOP, productId: '111', variantId: '222', productTitle: 'Cotton Kurta', variantTitle: 'M',
        productHandle: 'cotton-kurta', channel,
        pushToken: channel === 'push' ? `${TOKEN}_${i}` : null,
        email: channel === 'email' ? `s${i}@example.com` : null,
        phone: channel === 'whatsapp' ? `+91987654321${i}` : null,
        createdAt: new Date(NOW.getTime() - (requests - i) * 60000), expiresAt: R.expiresAt(NOW),
      });
    }
    await RestockRequest.create(rows);
  }

  beforeEach(() => {
    deps = {
      graphQL: jest.fn().mockResolvedValue({ nodes: [{ id: 'gid://shopify/ProductVariant/222', availableForSale: true }] }),
      sendPush: jest.fn().mockResolvedValue({ success: true, sent: 1 }),
      sendEmail: jest.fn().mockResolvedValue({ success: true }),
      isAtLimit: jest.fn().mockResolvedValue(false),
      isQuietNow: jest.fn().mockReturnValue(false),
      sendOwnerPush: jest.fn().mockResolvedValue({ success: true, sent: 1 }),
    };
  });

  test('variant back → push sent, logged as a back_in_stock job with attribution link', async () => {
    await setup();
    const [sum] = await processRestock({ now: NOW, deps });
    expect(sum).toMatchObject({ checked: 1, available: 1, sent: 1 });
    expect(deps.graphQL).toHaveBeenCalledWith(SHOP, 'shpat_x', expect.stringContaining('availableForSale'), { ids: ['gid://shopify/ProductVariant/222'] });
    const job = await ScheduledJob.findOne({ signalType: 'back_in_stock' }).lean();
    expect(job).toMatchObject({ status: 'sent', channel: 'push', origin: 'automated' });
    const [shop, tokens, msg] = deps.sendPush.mock.calls[0];
    expect(shop).toBe(SHOP);
    expect(tokens).toEqual([`${TOKEN}_0`]);
    expect(msg.title).toBe('Cotton Kurta is back in stock 🎉');
    expect(msg.url).toBe(`https://${SHOP}/products/cotton-kurta?variant=222&ccf_src=push&ccf_job=${job._id}`);
    const req = await RestockRequest.findOne({}).lean();
    expect(req).toMatchObject({ status: 'sent', jobId: job._id });
  });

  test('still sold out → nothing sent, request keeps waiting', async () => {
    await setup();
    deps.graphQL.mockResolvedValue({ nodes: [{ id: 'gid://shopify/ProductVariant/222', availableForSale: false }] });
    await processRestock({ now: NOW, deps });
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect((await RestockRequest.findOne({}).lean()).status).toBe('waiting');
  });

  test('checks a shop at most every 5 minutes', async () => {
    await setup();
    deps.graphQL.mockResolvedValue({ nodes: [] });
    await processRestock({ now: NOW, deps });
    await processRestock({ now: new Date(NOW.getTime() + 60000), deps });
    expect(deps.graphQL).toHaveBeenCalledTimes(1);
    await processRestock({ now: new Date(NOW.getTime() + CHECK_EVERY_MS), deps });
    expect(deps.graphQL).toHaveBeenCalledTimes(2);
  });

  test(`sends in waves of ${WAVE}, oldest first`, async () => {
    await setup({ requests: WAVE + 5 });
    await processRestock({ now: NOW, deps });
    expect(deps.sendPush).toHaveBeenCalledTimes(WAVE);
    expect(deps.sendPush.mock.calls[0][1]).toEqual([`${TOKEN}_0`]);
    expect(await RestockRequest.countDocuments({ status: 'waiting' })).toBe(5);
    await processRestock({ now: new Date(NOW.getTime() + CHECK_EVERY_MS), deps });
    expect(await RestockRequest.countDocuments({ status: 'sent' })).toBe(WAVE + 5);
  });

  test.each([
    ['feature off', { config: { enabled: false } }, null],
    ['store suspended', { store: { suspended: true } }, 'store_inactive'],
    ['app uninstalled', { store: { subscriptionStatus: 'uninstalled' } }, 'store_inactive'],
  ])('nothing sent when %s', async (_n, opts, reason) => {
    await setup(opts);
    const res = await processRestock({ now: NOW, deps });
    expect(deps.sendPush).not.toHaveBeenCalled();
    if (reason) expect(res[0].reason).toBe(reason);
  });

  test('automation master switch or the back_in_stock signal off → nothing sent', async () => {
    await setup();
    await AutomationConfig.create({ shopDomain: SHOP, enabledSignals: { back_in_stock: false } });
    const [sum] = await processRestock({ now: NOW, deps });
    expect(sum.reason).toBe('automation_off');
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  test('quiet hours: waits, sends on a later check', async () => {
    await setup();
    deps.isQuietNow.mockReturnValueOnce(true);
    const [sum] = await processRestock({ now: NOW, deps });
    expect(sum.reason).toBe('quiet_hours');
    expect(deps.sendPush).not.toHaveBeenCalled();
    await processRestock({ now: new Date(NOW.getTime() + CHECK_EVERY_MS), deps });
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
  });

  test('plan message limit reached → stops, requests keep waiting', async () => {
    await setup({ requests: 3 });
    deps.isAtLimit.mockResolvedValue(true);
    const [sum] = await processRestock({ now: NOW, deps });
    expect(sum.reason).toBe('plan_limit');
    expect(await RestockRequest.countDocuments({ status: 'waiting' })).toBe(3);
  });

  test('email: sent with an unsubscribe-able profile; unsubscribed profile is skipped', async () => {
    await setup({ channel: 'email', requests: 2, config: { emailDelayMinutes: 0 } });
    const ok = await Profile.create({ shopDomain: SHOP });
    const off = await Profile.create({ shopDomain: SHOP, suppressed: true });
    const rows = await RestockRequest.find({}).sort({ createdAt: 1 });
    await RestockRequest.updateOne({ _id: rows[0]._id }, { profileId: ok._id });
    await RestockRequest.updateOne({ _id: rows[1]._id }, { profileId: off._id });
    await processRestock({ now: NOW, deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html, shop, pid] = deps.sendEmail.mock.calls[0];
    expect(to).toBe('s0@example.com');
    expect(subject).toBe('Cotton Kurta is back in stock');
    expect(html).toContain('ccf_src=email');
    expect(shop).toBe(SHOP);
    expect(String(pid)).toBe(String(ok._id));
    expect((await RestockRequest.findById(rows[1]._id).lean())).toMatchObject({ status: 'failed', error: 'unsubscribed' });
    expect(await ScheduledJob.findOne({ channel: 'email', status: 'sent' }).lean()).toMatchObject({ signalType: 'back_in_stock' });
  });

  test('already bought the product since asking → not sent', async () => {
    await setup();
    await RestockRequest.updateMany({}, { customerId: '987' });
    await PurchaseRecord.create({ shopDomain: SHOP, orderId: 'o1', customerId: '987', productIds: ['111'], createdAt: NOW });
    await processRestock({ now: NOW, deps });
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(await RestockRequest.findOne({}).lean()).toMatchObject({ status: 'expired', error: 'already_bought' });
  });

  test('failed push is marked failed (job + request)', async () => {
    await setup();
    deps.sendPush.mockResolvedValue({ success: true, sent: 0, errorCode: 'messaging/registration-token-not-registered' });
    await processRestock({ now: NOW, deps });
    expect(await RestockRequest.findOne({}).lean()).toMatchObject({ status: 'failed', error: 'messaging/registration-token-not-registered' });
    expect((await ScheduledJob.findOne({}).lean()).status).toBe('failed');
  });

  test('old requests expire; stuck "sending" rows go back to waiting', async () => {
    await setup({ requests: 2 });
    deps.graphQL.mockResolvedValue({ nodes: [] });
    const rows = await RestockRequest.find({}).sort({ createdAt: 1 });
    await RestockRequest.updateOne({ _id: rows[0]._id }, { expiresAt: new Date(NOW.getTime() - 1) });
    await RestockRequest.updateOne({ _id: rows[1]._id }, { status: 'sending', claimedAt: new Date(NOW.getTime() - 20 * 60000) });
    await processRestock({ now: NOW, deps });
    expect((await RestockRequest.findById(rows[0]._id).lean()).status).toBe('expired');
    expect((await RestockRequest.findById(rows[1]._id).lean()).status).toBe('waiting');
  });

  test('WhatsApp: not sent automatically — marked ready and the seller is reminded once', async () => {
    await setup({ channel: 'whatsapp', requests: 2 });
    const [sum] = await processRestock({ now: NOW, deps });
    expect(sum.whatsappReady).toBe(2);
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(deps.sendOwnerPush).toHaveBeenCalledTimes(1);
    expect(deps.sendOwnerPush.mock.calls[0][1]).toBe('2 WhatsApp alerts to send');
    expect(deps.sendOwnerPush.mock.calls[0][2]).toMatch(/Cotton Kurta \(M\) is back in stock/);
    expect(await RestockRequest.countDocuments({ status: 'ready' })).toBe(2);
    await processRestock({ now: new Date(NOW.getTime() + CHECK_EVERY_MS), deps });
    expect(deps.sendOwnerPush).toHaveBeenCalledTimes(1); // not reminded again
  });

  test('email waits for the delay; push goes at once', async () => {
    await setup({ channel: 'email', config: { emailDelayMinutes: 60 } });
    await RestockRequest.create({ shopDomain: SHOP, productId: '111', variantId: '222', productTitle: 'Cotton Kurta', variantTitle: 'M', channel: 'push', pushToken: TOKEN, expiresAt: R.expiresAt(NOW) });
    await processRestock({ now: NOW, deps });
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    await processRestock({ now: new Date(NOW.getTime() + 30 * 60000), deps });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    await processRestock({ now: new Date(NOW.getTime() + 61 * 60000), deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  test('sold out again before the email delay → email waits for the next restock; WhatsApp back to waiting', async () => {
    await setup({ channel: 'email', config: { emailDelayMinutes: 60 } });
    await RestockRequest.create({ shopDomain: SHOP, productId: '111', variantId: '222', productTitle: 'Cotton Kurta', variantTitle: 'M', channel: 'whatsapp', phone: '+919999999999', expiresAt: R.expiresAt(NOW) });
    await processRestock({ now: NOW, deps });
    expect(await RestockRequest.countDocuments({ status: 'ready' })).toBe(1);
    deps.graphQL.mockResolvedValue({ nodes: [{ id: 'gid://shopify/ProductVariant/222', availableForSale: false }] });
    await processRestock({ now: new Date(NOW.getTime() + 61 * 60000), deps });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(await RestockRequest.countDocuments({ status: 'waiting', readyAt: null })).toBe(2);
  });

  test('stock check error is caught; nothing sent', async () => {
    await setup();
    deps.graphQL.mockRejectedValue(new Error('boom'));
    const [sum] = await processRestock({ now: NOW, deps });
    expect(sum.reason).toBe('stock_check_failed');
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});
