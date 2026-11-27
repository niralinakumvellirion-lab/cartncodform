'use strict';

/**
 * Money earned (Dashboard): services/moneySummary.js + routes/money.js.
 */

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => next(),
  requireStoreOwner: (req, _res, next) => { req.store = { shopDomain: 'demo.myshopify.com' }; return next(); },
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const AttributedEvent = require('../models/AttributedEvent');
const ScheduledJob = require('../models/ScheduledJob');
const Store = require('../models/Store');
const { moneySummary, monthRange, featureOf } = require('../services/moneySummary');
const router = require('../routes/money');

const SHOP = 'demo.myshopify.com';
const NOW = new Date('2026-11-20T10:00:00Z');

function handler(path, method) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  return layer.route.stack.map((s) => s.handle);
}
async function run(req) {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  const chain = handler('/:shopDomain', 'get');
  let i = 0;
  const next = async () => { const h = chain[i++]; if (h) await h(req, res, next); };
  await next();
  return res;
}

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 60000);
beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await Promise.all([AttributedEvent, ScheduledJob, Store].map((M) => M.deleteMany({})));
});
afterEach(() => jest.restoreAllMocks());

async function job(signalType, shopDomain = SHOP) {
  return ScheduledJob.create({ shopDomain, signalType, channel: 'push', status: 'sent', runAt: NOW, sentAt: NOW });
}
async function purchase(j, total, ts, extra = {}) {
  return AttributedEvent.create({
    shopDomain: SHOP, eventType: 'purchase', jobId: j ? j._id : undefined, ts,
    meta: { orderId: String(Math.random()), orderTotal: total, currency: 'INR' }, ...extra,
  });
}

describe('helpers', () => {
  test('month range and feature groups', () => {
    const r = monthRange('2026-02', NOW);
    expect(r.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(r.prevStart.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(monthRange('', NOW).key).toBe('2026-11');
    expect(monthRange('2026-13', NOW).key).toBe('2026-11');
    expect(featureOf('checkout_abandon').label).toBe('Cart reminders');
    expect(featureOf('back_in_stock').label).toBe('Back in stock');
    expect(featureOf('price_drop').label).toBe('Price drop');
    expect(featureOf(undefined).label).toBe('Other messages');
  });
});

describe('moneySummary', () => {
  test('sums this month’s tracked orders by feature; compares with last month; counts messages sent', async () => {
    const cart = await job('cart_abandon');
    const bis = await job('back_in_stock');
    const pd = await job('price_drop');
    await purchase(cart, 1500, new Date('2026-11-03T10:00:00Z'));
    await purchase(cart, 900.5, new Date('2026-11-04T10:00:00Z'));
    await purchase(bis, 1299, new Date('2026-11-10T10:00:00Z'));
    await purchase(pd, 1199, new Date('2026-11-11T10:00:00Z'));
    await purchase(null, 500, new Date('2026-11-12T10:00:00Z')); // job gone (TTL) → Other
    await purchase(cart, 2000, new Date('2026-10-15T10:00:00Z')); // last month
    await AttributedEvent.create({ shopDomain: SHOP, eventType: 'add_to_cart', jobId: cart._id, ts: new Date('2026-11-05T10:00:00Z') });
    await AttributedEvent.create({ shopDomain: 'other.myshopify.com', eventType: 'purchase', ts: new Date('2026-11-05T10:00:00Z'), meta: { orderTotal: 99999 } });

    const m = await moneySummary(SHOP, { now: NOW });
    expect(m.month).toBe('2026-11');
    expect(m.currency).toBe('INR');
    expect(m.total).toBe(5398.5);
    expect(m.orders).toBe(5);
    expect(m.prevTotal).toBe(2000);
    expect(m.changePct).toBe(170);
    expect(m.sent).toBe(3);
    expect(m.byFeature).toEqual([
      { key: 'cart', label: 'Cart reminders', revenue: 2400.5, orders: 2 },
      { key: 'back_in_stock', label: 'Back in stock', revenue: 1299, orders: 1 },
      { key: 'price_drop', label: 'Price drop', revenue: 1199, orders: 1 },
      { key: 'other', label: 'Other messages', revenue: 500, orders: 1 },
    ]);
    expect(m.plan).toMatchObject({ id: 'free', price: 0 });
    expect(m.returnMultiple).toBeNull(); // INR store; plans are in USD
  });

  test('USD store on a paid plan gets a return multiple; no last month → no change %', async () => {
    await Store.create({ shopDomain: SHOP, accessToken: 'shpat_x', plan: 'pro', planTier: 'starter' });
    const j = await job('cart_abandon');
    await AttributedEvent.create({ shopDomain: SHOP, eventType: 'purchase', jobId: j._id, ts: new Date('2026-11-03T10:00:00Z'), meta: { orderTotal: 499.5, currency: 'USD' } });
    const m = await moneySummary(SHOP, { now: NOW });
    expect(m.plan).toMatchObject({ id: 'starter', name: 'Starter', price: 9.99 });
    expect(m.returnMultiple).toBe(50);
    expect(m.changePct).toBeNull();
  });

  test('no sales this month → currency of the latest tracked order', async () => {
    const j = await job('cart_abandon');
    await AttributedEvent.create({ shopDomain: SHOP, eventType: 'purchase', jobId: j._id, ts: new Date('2026-09-03T10:00:00Z'), meta: { orderTotal: 10, currency: 'USD' } });
    const m = await moneySummary(SHOP, { now: NOW });
    expect(m).toMatchObject({ total: 0, currency: 'USD' });
  });

  test('nothing yet → zeros', async () => {
    const m = await moneySummary(SHOP, { now: NOW });
    expect(m).toMatchObject({ total: 0, orders: 0, byFeature: [], currency: null, returnMultiple: null });
  });
});

describe('route', () => {
  test('?month=YYYY-MM picks the month; a bad month → 400', async () => {
    const j = await job('price_drop');
    await purchase(j, 1199, new Date('2026-10-05T10:00:00Z'));
    const ok = await run({ params: { shopDomain: SHOP }, query: { month: '2026-10' } });
    expect(ok.body).toMatchObject({ month: '2026-10', total: 1199, orders: 1 });
    const bad = await run({ params: { shopDomain: SHOP }, query: { month: 'nov' } });
    expect(bad.statusCode).toBe(400);
  });
});
