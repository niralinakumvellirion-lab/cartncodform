'use strict';

/**
 * Pricing tiers (utils/plans.js, utils/planUsage.js) and where the limits are enforced: COD form + order
 * (App Proxy), push sign-ups (App Proxy and /api/push), the usage endpoint, the subscription webhook and
 * AI copy. Real in-memory MongoDB; only Shopify signatures, auth and outside services are replaced.
 */

jest.mock('../utils/shopify', () => ({
  ...jest.requireActual('../utils/shopify'),
  verifyProxySignature: (q) => q && q.signature === 'valid',
  verifyWebhookHmac: jest.fn(() => true),
  refreshAccessTokenIfNeeded: jest.fn(async () => 'fresh-tok'),
}));
jest.mock('../middleware/requireOwner', () => {
  const Store = require('../models/Store');
  const owner = async (req, res, next) => {
    req.store = await Store.findOne({ shopDomain: req.params.shopDomain });
    if (!req.store) return res.status(404).json({ error: 'Store not found' });
    return next();
  };
  return {
    requireAuth: (req, _res, next) => { req.shopDomain = req.params.shopDomain; next(); },
    requireStoreOwner: owner,
    requireStoreOwnerAnyPlan: owner,
    requireNotSuspended: (_req, _res, next) => next(),
  };
});
jest.mock('../utils/subscriptionSync', () => ({
  refreshPlan: jest.fn(async (store) => ({ tier: store.plan === 'pro' ? store.planTier : 'free', changed: false })),
  planCheckIsStale: (store) => !store.planCheckedAt,
}));
jest.mock('../services/profileService', () => ({ upsertProfile: jest.fn(async () => null) }));

const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Store = require('../models/Store');
const CodOrder = require('../models/CodOrder');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const ScheduledJob = require('../models/ScheduledJob');
const CopyCache = require('../models/CopyCache');
const { refreshPlan } = require('../utils/subscriptionSync');
const { PLANS, tierOf, tierFromSubscriptionName, monthStart, nextMonthStart, needsPlanChoice } = require('../utils/plans');
const { isAtLimit, usageReport, aiCopyAllowed, newSubscriberBlocked } = require('../utils/planUsage');
const { generateCopy, generateTemplateCopy, generateEmailCopy } = require('../services/aiService');

const SHOP = 'tier-shop.myshopify.com';
const PRO_SHOP = 'tier-pro.myshopify.com';

let mongod;
let server;
let base;

const makeStore = (shop, over = {}) => Store.create({ shopDomain: shop, accessToken: 'tok', ...over });
const orders = (shop, n, createdAt = new Date()) => CodOrder.insertMany(
  Array.from({ length: n }, (_, i) => ({ shopDomain: shop, name: `N${i}`, phone: '9999999999', address: 'A', createdAt }))
);
const subs = (shop, n) => CustomerPushSubscription.insertMany(
  Array.from({ length: n }, (_, i) => ({ shopDomain: shop, token: `${shop}-tok-${i}` }))
);
const sentJobs = (shop, n, sentAt = new Date()) => ScheduledJob.insertMany(
  Array.from({ length: n }, () => ({ shopDomain: shop, runAt: sentAt, status: 'sent', sentAt }))
);

function q(shop = SHOP, extra = {}) {
  return new URLSearchParams({ shop, signature: 'valid', ...extra }).toString();
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Store.init(), CustomerPushSubscription.init()]);
  const app = express();
  app.use(express.json());
  app.use('/apps/cartncodform', require('../routes/proxy'));
  app.use('/api/push', require('../routes/push'));
  app.use('/api/billing', require('../routes/billing'));
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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await Promise.all([Store, CodOrder, CustomerPushSubscription, ScheduledJob, CopyCache].map((m) => m.deleteMany({})));
  delete process.env.LLM_API_KEY;
});

afterEach(() => jest.restoreAllMocks());

describe('plan table and tier rules', () => {
  it('four plans at the agreed prices, limits growing from Free to Pro', () => {
    expect(['free', 'starter', 'growth', 'pro'].map((t) => PLANS[t].price)).toEqual([0, 9.99, 24.99, 49]);
    expect(PLANS.free.limits).toEqual({ codOrders: 50, subscribers: 500, messages: 500 });
    expect(PLANS.pro.limits).toEqual({ codOrders: null, subscribers: null, messages: null });
    expect(PLANS.free.aiCopy).toBe(false);
    expect(PLANS.starter.aiCopy).toBe(false);
    expect(PLANS.growth.aiCopy).toBe(true);
    expect(PLANS.pro.prioritySupport).toBe(true);
  });

  it('tier from the Shopify plan name; an unknown paid plan (the original $10 plan) keeps full access', () => {
    expect(tierFromSubscriptionName('Starter')).toBe('starter');
    expect(tierFromSubscriptionName('ShopiReachBoost Growth')).toBe('growth');
    expect(tierFromSubscriptionName('PRO')).toBe('pro');
    expect(tierFromSubscriptionName('shopireachboost-ai')).toBe('pro');
    expect(tierFromSubscriptionName('')).toBe('pro');
    expect(tierFromSubscriptionName('Product growth starter')).toBe('growth');
    expect(tierFromSubscriptionName('approved')).toBe('pro');
  });

  it('tierOf: no subscription = free; subscription = saved tier (pro when none saved); internal = pro', () => {
    expect(tierOf(null)).toBe('free');
    expect(tierOf({ plan: 'free' })).toBe('free');
    expect(tierOf({ plan: 'free', planTier: 'growth' })).toBe('free');
    expect(tierOf({ plan: 'pro', planTier: 'starter' })).toBe('starter');
    expect(tierOf({ plan: 'pro' })).toBe('pro');
    expect(tierOf({ plan: 'pro', planTier: 'bogus' })).toBe('pro');
    expect(tierOf({ plan: 'free', isInternal: true })).toBe('pro');
  });

  it('usage month starts on the 1st (UTC) and resets on the next 1st, also across the new year', () => {
    const d = new Date('2026-12-31T23:59:59Z');
    expect(monthStart(d).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(nextMonthStart(d).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('limits counted from the database', () => {
  it('COD orders: this month only, and only this store', async () => {
    await makeStore(SHOP);
    await orders(SHOP, 49);
    await orders(SHOP, 30, new Date(monthStart().getTime() - 1000));
    await orders('other.myshopify.com', 10);
    expect(await isAtLimit(SHOP, 'codOrders')).toBe(false);
    await orders(SHOP, 1);
    expect(await isAtLimit(SHOP, 'codOrders')).toBe(true);
  });

  it('a higher plan has a higher limit; unlimited never blocks', async () => {
    await makeStore(SHOP, { plan: 'pro', planTier: 'starter' });
    await makeStore(PRO_SHOP, { plan: 'pro', planTier: 'growth' });
    await orders(SHOP, 60);
    await orders(PRO_SHOP, 600);
    expect(await isAtLimit(SHOP, 'codOrders')).toBe(false);
    expect(await isAtLimit(PRO_SHOP, 'codOrders')).toBe(false);
  });

  it('subscribers are a running total; messages count only sent jobs this month', async () => {
    await makeStore(SHOP);
    await subs(SHOP, 500);
    expect(await isAtLimit(SHOP, 'subscribers')).toBe(true);
    await sentJobs(SHOP, 499);
    await sentJobs(SHOP, 50, new Date(monthStart().getTime() - 1000));
    await ScheduledJob.create({ shopDomain: SHOP, runAt: new Date(), status: 'pending' });
    await ScheduledJob.create({ shopDomain: SHOP, runAt: new Date(), status: 'failed', sentAt: new Date() });
    expect(await isAtLimit(SHOP, 'messages')).toBe(false);
    await sentJobs(SHOP, 1);
    expect(await isAtLimit(SHOP, 'messages')).toBe(true);
  });

  it('usage report for the Plans page: used, limits, what is reached, next reset', async () => {
    await makeStore(SHOP);
    await orders(SHOP, 50);
    await subs(SHOP, 3);
    const store = await Store.findOne({ shopDomain: SHOP }).lean();
    const r = await usageReport(store);
    expect(r.tier).toBe('free');
    expect(r.usage).toEqual({
      codOrders: { used: 50, limit: 50 },
      subscribers: { used: 3, limit: 500 },
      messages: { used: 0, limit: 500 },
    });
    expect(r.reached).toEqual(['codOrders']);
    expect(r.resetsAt).toBe(nextMonthStart().toISOString());
  });

  it('usage report on Pro still shows the counts, with no limit', async () => {
    await makeStore(PRO_SHOP, { isInternal: true });
    await orders(PRO_SHOP, 70);
    const r = await usageReport(await Store.findOne({ shopDomain: PRO_SHOP }).lean());
    expect(r.usage.codOrders).toEqual({ used: 70, limit: null });
    expect(r.reached).toEqual([]);
  });
});

describe('COD form and order (App Proxy)', () => {
  it('under the limit: the normal form', async () => {
    await makeStore(SHOP);
    await orders(SHOP, 49);
    const r = await fetch(`${base}/apps/cartncodform/cod-form?${q()}`);
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain('Place COD Order');
    expect(html).not.toContain('data-ccf-cod-unavailable');
  });

  it('limit reached: a polite "not available" page with a link to the cart, no form', async () => {
    await makeStore(SHOP);
    await orders(SHOP, 50);
    const r = await fetch(`${base}/apps/cartncodform/cod-form?${q()}`);
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain('data-ccf-cod-unavailable');
    expect(html).toContain('href="/cart"');
    expect(html).not.toContain('Place COD Order');
  });

  it('limit reached: the order POST is refused and nothing is saved', async () => {
    await makeStore(SHOP);
    await orders(SHOP, 50);
    const r = await fetch(`${base}/apps/cartncodform/cod-order?${q()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ravi', phone: '9876543210', address: 'MG Road', productName: 'Tee', productPrice: 499 }),
    });
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ success: false, code: 'PLAN_LIMIT' });
    expect(await CodOrder.countDocuments({ shopDomain: SHOP })).toBe(50);
  });

  it('a bad signature is still refused before any plan check', async () => {
    const r = await fetch(`${base}/apps/cartncodform/cod-form?${q(SHOP, { signature: 'forged' })}`);
    expect(r.status).toBe(403);
  });
});

describe('push sign-ups', () => {
  const routes = [
    ['App Proxy', (body) => fetch(`${base}/apps/cartncodform/subscribe-customer?${q()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })],
    ['/api/push', (body) => fetch(`${base}/api/push/subscribe-customer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopDomain: SHOP, ...body }) })],
  ];

  describe.each(routes)('%s', (_name, post) => {
    it('limit reached: a new device is refused and not saved', async () => {
      await makeStore(SHOP);
      await subs(SHOP, 500);
      const r = await post({ token: 'brand-new-device' });
      expect(r.status).toBe(402);
      expect((await r.json()).code).toBe('PLAN_LIMIT');
      expect(await CustomerPushSubscription.exists({ token: 'brand-new-device' })).toBeNull();
    });

    it('limit reached: an already subscribed device and a token refresh still work', async () => {
      await makeStore(SHOP);
      await subs(SHOP, 500);
      const again = await post({ token: `${SHOP}-tok-1` });
      expect(again.status).toBe(200);
      const rotated = await post({ token: 'rotated-token', oldToken: `${SHOP}-tok-2` });
      expect(rotated.status).toBe(200);
      expect(await CustomerPushSubscription.exists({ token: 'rotated-token' })).toBeTruthy();
      expect(await CustomerPushSubscription.countDocuments({ shopDomain: SHOP })).toBe(500);
    });

    it('under the limit: a new device is saved', async () => {
      await makeStore(SHOP);
      await subs(SHOP, 499);
      const r = await post({ token: 'fresh-device' });
      expect(r.status).toBe(200);
      expect(await CustomerPushSubscription.exists({ token: 'fresh-device' })).toBeTruthy();
    });
  });

  it('an old token from ANOTHER store does not count as a refresh', async () => {
    await makeStore(SHOP);
    await subs(SHOP, 500);
    await CustomerPushSubscription.create({ shopDomain: 'other.myshopify.com', token: 'foreign-old' });
    expect(await newSubscriberBlocked(SHOP, 'new-one', 'foreign-old')).toBe(true);
  });
});

describe('choosing a plan after an install', () => {
  const day = 86400000;

  it('needsPlanChoice: new install, reinstall after the last choice → yes; chosen, paid or internal → no', () => {
    const installedAt = new Date();
    expect(needsPlanChoice({ plan: 'free', installedAt })).toBe(true);
    expect(needsPlanChoice({ plan: 'free', installedAt, planChosenAt: new Date(installedAt.getTime() - day) })).toBe(true);
    expect(needsPlanChoice({ plan: 'free', installedAt, planChosenAt: new Date(installedAt.getTime() + 1000) })).toBe(false);
    expect(needsPlanChoice({ plan: 'free', planChosenAt: new Date() })).toBe(false);
    expect(needsPlanChoice({ plan: 'pro', planTier: 'starter', installedAt })).toBe(false);
    expect(needsPlanChoice({ plan: 'free', isInternal: true, installedAt })).toBe(false);
    expect(needsPlanChoice(null)).toBe(false);
  });

  it('a new install is asked to choose, with the trial length; "Continue with Free" is saved and ends it', async () => {
    await makeStore(SHOP, { installedAt: new Date(), planCheckedAt: new Date() });
    let body = await (await fetch(`${base}/api/billing/${SHOP}/usage`)).json();
    expect(body).toMatchObject({ needsPlanChoice: true, trialDays: 30, tier: 'free' });

    const r = await fetch(`${base}/api/billing/${SHOP}/choose-free`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, needsPlanChoice: false });
    expect((await Store.findOne({ shopDomain: SHOP }).lean()).planChosenAt).toBeInstanceOf(Date);

    body = await (await fetch(`${base}/api/billing/${SHOP}/usage`)).json();
    expect(body.needsPlanChoice).toBe(false);
  });

  it('a store that picked a paid plan on Shopify is not asked', async () => {
    await makeStore(SHOP, { installedAt: new Date(), plan: 'pro', planTier: 'growth', planCheckedAt: new Date() });
    const body = await (await fetch(`${base}/api/billing/${SHOP}/usage`)).json();
    expect(body.needsPlanChoice).toBe(false);
  });
});

describe('GET /api/billing/:shop/usage', () => {
  it('plan, usage, all four plan cards and the Shopify plan page link', async () => {
    await makeStore(SHOP, { plan: 'pro', planTier: 'starter', planCheckedAt: new Date() });
    await orders(SHOP, 12);
    const r = await fetch(`${base}/api/billing/${SHOP}/usage`);
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.tier).toBe('starter');
    expect(body.usage.codOrders).toEqual({ used: 12, limit: 500 });
    expect(body.plans.map((p) => [p.id, p.price])).toEqual([['free', 0], ['starter', 9.99], ['growth', 24.99], ['pro', 49]]);
    expect(body.upgradeUrl).toBe('https://admin.shopify.com/store/tier-shop/charges/cartncod-form/pricing_plans');
    expect(refreshPlan).not.toHaveBeenCalled();
    expect(body.planCheckedAt).toBeTruthy();
  });

  it('refresh=1 asks Shopify again even when a plan is known (back from the plan page)', async () => {
    await makeStore(SHOP, { plan: 'pro', planTier: 'starter', planCheckedAt: new Date() });
    refreshPlan.mockImplementationOnce(async (store) => {
      store.planTier = 'growth';
      return { tier: 'growth', changed: true };
    });
    const body = await (await fetch(`${base}/api/billing/${SHOP}/usage?refresh=1`)).json();
    expect(refreshPlan).toHaveBeenCalledTimes(1);
    expect(body.tier).toBe('growth');
    expect(body.usage.codOrders.limit).toBeNull();
  });
});

describe('app_subscriptions/update webhook', () => {
  const hook = (body) => fetch(`${base}/api/webhooks/app-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Shop-Domain': SHOP, 'X-Shopify-Hmac-Sha256': 'x' },
    body: JSON.stringify({ app_subscription: body }),
  });

  it('saves the tier from the plan name', async () => {
    await makeStore(SHOP);
    await hook({ admin_graphql_api_id: 'gid://shopify/AppSubscription/1', name: 'Growth', status: 'ACTIVE' });
    const s = await Store.findOne({ shopDomain: SHOP }).lean();
    expect(s).toMatchObject({ plan: 'pro', planTier: 'growth', subscriptionId: 'gid://shopify/AppSubscription/1' });
  });

  it('plan change: the OLD subscription ending after the new one started does not drop the store to Free', async () => {
    await makeStore(SHOP);
    await hook({ admin_graphql_api_id: 'gid://shopify/AppSubscription/2', name: 'Pro', status: 'ACTIVE' });
    await hook({ admin_graphql_api_id: 'gid://shopify/AppSubscription/1', name: 'Starter', status: 'CANCELLED' });
    const s = await Store.findOne({ shopDomain: SHOP }).lean();
    expect(s).toMatchObject({ plan: 'pro', planTier: 'pro', subscriptionId: 'gid://shopify/AppSubscription/2' });
  });

  it('the CURRENT subscription ending moves the store to Free', async () => {
    await makeStore(SHOP);
    await hook({ admin_graphql_api_id: 'gid://shopify/AppSubscription/3', name: 'Starter', status: 'ACTIVE' });
    await hook({ admin_graphql_api_id: 'gid://shopify/AppSubscription/3', name: 'Starter', status: 'CANCELLED' });
    const s = await Store.findOne({ shopDomain: SHOP }).lean();
    expect(s.plan).toBe('free');
    expect(s.planTier).toBeNull();
    expect(tierOf(s)).toBe('free');
  });
});

describe('AI copy is a Growth and Pro feature', () => {
  beforeEach(() => {
    process.env.LLM_API_KEY = 'test-key';
    global.fetchBackup = global.fetch;
  });
  afterEach(() => { global.fetch = global.fetchBackup; });

  function fakeAnthropic(reply) {
    const real = global.fetchBackup;
    const spy = jest.fn(async (url, opts) => {
      if (String(url).startsWith('https://api.anthropic.com')) {
        return { ok: true, json: async () => ({ content: [{ text: JSON.stringify(reply) }], usage: { input_tokens: 5 } }) };
      }
      return real(url, opts);
    });
    global.fetch = spy;
    return spy;
  }

  it('Free and Starter: built-in template, the AI is never called (cached AI copy not reused either)', async () => {
    await makeStore(SHOP, { plan: 'pro', planTier: 'starter' });
    const spy = fakeAnthropic({ title: 'AI title', body: 'AI body' });
    const out = await generateCopy({ shopDomain: SHOP }, 'cart_abandon', null, 'push');
    expect(out.title).toBe('You left something behind');
    expect(spy).not.toHaveBeenCalled();
    expect(await aiCopyAllowed(SHOP)).toBe(false);

    const tpl = await generateTemplateCopy(SHOP, 'Shop', 'normal', null, {});
    expect(tpl.fallback).toBe(true);
    const email = await generateEmailCopy(SHOP, { type: 'lapsing' }, {}, {});
    expect(email.subject).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('Growth: the AI writes the copy', async () => {
    await makeStore(SHOP, { plan: 'pro', planTier: 'growth' });
    const spy = fakeAnthropic({ title: 'AI title', body: 'AI body' });
    const out = await generateCopy({ shopDomain: SHOP }, 'cart_abandon', null, 'push');
    expect(out.title).toBe('AI title');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('no subscription (Free) → no AI', async () => {
    await makeStore(SHOP);
    expect(await aiCopyAllowed(SHOP)).toBe(false);
  });
});
