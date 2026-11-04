'use strict';

/**
 * Plan detection on Shopify App Pricing (no webhooks since 28 Apr 2026): utils/partnerApi.js (Partner API
 * activeSubscription), utils/subscriptionSync.refreshPlan / recheckPaidPlans. Real in-memory MongoDB;
 * the network (axios), the Admin API helper and token refresh are replaced.
 */

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../utils/shopifyGraphQL', () => ({ shopifyGraphQL: jest.fn() }));
jest.mock('../utils/shopify', () => ({
  ...jest.requireActual('../utils/shopify'),
  refreshAccessTokenIfNeeded: jest.fn(async () => 'offline-tok'),
}));

const axios = require('axios');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Store = require('../models/Store');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const { shopifyGraphQL } = require('../utils/shopifyGraphQL');
const { refreshAccessTokenIfNeeded } = require('../utils/shopify');
const { isPartnerApiConfigured, getPartnerActiveSubscription, ACTIVE_SUBSCRIPTION_QUERY } = require('../utils/partnerApi');
const { refreshPlan, recheckPaidPlans, planCheckIsStale } = require('../utils/subscriptionSync');
const { tierFromSubscription } = require('../utils/plans');

const SHOP = 'sync-tier.myshopify.com';
const SHOP_GID = 'gid://shopify/Shop/777';
const TOKEN = 'prtapi_secret_token_value';
const ENV = { SHOPIFY_PARTNER_ID: '4242', SHOPIFY_PARTNER_API_TOKEN: TOKEN, SHOPIFY_PARTNER_APP_ID: '9001' };

let mongod;

const sub = (handle, amount, extra = {}) => ({
  data: { activeSubscription: { cancelAtEndOfCycle: false, trialEndsAt: null, items: [{ handle, description: null, price: { __typename: 'FlatRatePrice', amount: String(amount) } }], ...extra } },
});
const partnerReplies = (...replies) => replies.forEach((r) => axios.post.mockResolvedValueOnce({ data: r }));
const noSub = { data: { activeSubscription: null } };
const makeStore = (over = {}) => Store.create({ shopDomain: SHOP, accessToken: 'tok', ...over });
const events = () => SubscriptionEvent.find({ shopDomain: SHOP }).sort({ occurredAt: 1 }).lean();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Store.init();
}, 60000); // starting the in-memory database can be slow when every suite runs at once
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  Object.assign(process.env, ENV);
  shopifyGraphQL.mockImplementation(async (_shop, _tok, query) => {
    if (query.includes('shop { id }')) return { shop: { id: SHOP_GID } };
    return { currentAppInstallation: { activeSubscriptions: [] } };
  });
  await Promise.all([Store.deleteMany({}), SubscriptionEvent.deleteMany({})]);
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const k of Object.keys(ENV)) delete process.env[k];
});

describe('Partner API settings', () => {
  it('configured only with all three values; an app id may be a number or a gid', () => {
    expect(isPartnerApiConfigured()).toBe(true);
    process.env.SHOPIFY_PARTNER_APP_ID = 'gid://shopify/App/9001';
    expect(isPartnerApiConfigured()).toBe(true);
    process.env.SHOPIFY_PARTNER_APP_ID = 'not-an-id';
    expect(isPartnerApiConfigured()).toBe(false);
    process.env.SHOPIFY_PARTNER_APP_ID = '9001';
    delete process.env.SHOPIFY_PARTNER_API_TOKEN;
    expect(isPartnerApiConfigured()).toBe(false);
    process.env.SHOPIFY_PARTNER_API_TOKEN = TOKEN;
    process.env.SHOPIFY_PARTNER_ID = 'abc';
    expect(isPartnerApiConfigured()).toBe(false);
  });
});

describe('getPartnerActiveSubscription', () => {
  it('asks partners.shopify.com with the token, app id and shop id', async () => {
    partnerReplies(sub('growth', 24.99));
    const r = await getPartnerActiveSubscription(SHOP_GID);
    expect(axios.post).toHaveBeenCalledWith(
      'https://partners.shopify.com/4242/api/2026-07/graphql.json',
      { query: ACTIVE_SUBSCRIPTION_QUERY, variables: { appId: 'gid://shopify/App/9001', shopId: SHOP_GID } },
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Shopify-Access-Token': TOKEN }) })
    );
    expect(r).toMatchObject({ tier: 'growth', handles: ['growth'], price: 24.99 });
  });

  it('no subscription → null', async () => {
    partnerReplies(noSub);
    expect(await getPartnerActiveSubscription(SHOP_GID)).toBeNull();
  });

  it('a handle with no plan word is read from its price; the old $10 plan stays Pro', async () => {
    partnerReplies(sub('plan-b', 9.99), sub('shopireachboost-ai', 10), sub('basic', 0));
    expect((await getPartnerActiveSubscription(SHOP_GID)).tier).toBe('starter');
    expect((await getPartnerActiveSubscription(SHOP_GID)).tier).toBe('pro');
    expect((await getPartnerActiveSubscription(SHOP_GID)).tier).toBe('free');
  });

  it('a refused request throws WITHOUT the token in the message', async () => {
    const err = Object.assign(new Error(`Request failed, header ${TOKEN}`), { response: { status: 401 }, config: { headers: { 'X-Shopify-Access-Token': TOKEN } } });
    axios.post.mockRejectedValueOnce(err);
    await expect(getPartnerActiveSubscription(SHOP_GID)).rejects.toThrow('Partner API request failed (401)');
    axios.post.mockRejectedValueOnce(err);
    await getPartnerActiveSubscription(SHOP_GID).catch((e) => expect(e.message).not.toContain(TOKEN));
  });

  it('GraphQL errors and a missing data block throw; a bad shop id is refused before any request', async () => {
    partnerReplies({ errors: [{ message: 'Access denied' }] }, {});
    await expect(getPartnerActiveSubscription(SHOP_GID)).rejects.toThrow('Partner API error: Access denied');
    await expect(getPartnerActiveSubscription(SHOP_GID)).rejects.toThrow('no data');
    axios.post.mockClear();
    await expect(getPartnerActiveSubscription('777')).rejects.toThrow('Missing shop id');
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('tierFromSubscription', () => {
  it('plan words first, then exact prices, then Pro', () => {
    expect(tierFromSubscription({ names: ['ShopiReach-Starter'], price: 49 })).toBe('starter');
    expect(tierFromSubscription({ names: ['x'], price: '49.00' })).toBe('pro');
    expect(tierFromSubscription({ names: [], price: 24.99 })).toBe('growth');
    expect(tierFromSubscription({ names: ['monthly'], price: 15 })).toBe('pro');
    expect(tierFromSubscription({})).toBe('pro');
    expect(tierFromSubscription({ names: ['professional'] })).toBe('pro');
    expect(tierFromSubscription({ names: ['prototype'], price: 9.99 })).toBe('starter');
  });
});

describe('refreshPlan (Partner API)', () => {
  it('Free store picks Growth → saved as Growth, shop id kept, one "activated" event with the tier', async () => {
    const store = await makeStore();
    partnerReplies(sub('growth', 24.99));
    const r = await refreshPlan(store, 'offline-tok');
    expect(r).toEqual({ tier: 'growth', changed: true, source: 'partner_api' });
    const saved = await Store.findOne({ shopDomain: SHOP }).lean();
    expect(saved).toMatchObject({ plan: 'pro', planTier: 'growth', shopGid: SHOP_GID, subscriptionStatus: 'ACTIVE' });
    expect(saved.planCheckedAt).toBeInstanceOf(Date);
    expect(saved.planChosenAt).toBeInstanceOf(Date);
    expect(store.planTier).toBe('growth');
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ eventType: 'activated', toPlan: 'pro', planTier: 'growth', source: 'partner_api' });
  });

  it('nothing changed → only the check time moves, no new event, shop id read once', async () => {
    const store = await makeStore({ plan: 'pro', planTier: 'starter', shopGid: SHOP_GID });
    partnerReplies(sub('starter', 9.99));
    const r = await refreshPlan(store, 'tok');
    expect(r.changed).toBe(false);
    expect(await events()).toHaveLength(0);
    expect(shopifyGraphQL).not.toHaveBeenCalled();
    expect((await Store.findOne({ shopDomain: SHOP }).lean()).planCheckedAt).toBeInstanceOf(Date);
  });

  it('Starter → Pro upgrade is saved', async () => {
    const store = await makeStore({ plan: 'pro', planTier: 'starter', shopGid: SHOP_GID });
    partnerReplies(sub('pro', 49));
    expect((await refreshPlan(store, 'tok')).tier).toBe('pro');
    expect((await Store.findOne({ shopDomain: SHOP }).lean()).planTier).toBe('pro');
  });

  it('cancelled (no subscription) → back to Free with an "ended" event', async () => {
    const store = await makeStore({ plan: 'pro', planTier: 'growth', shopGid: SHOP_GID });
    partnerReplies(noSub);
    const r = await refreshPlan(store, 'tok');
    expect(r).toMatchObject({ tier: 'free', changed: true });
    expect(await Store.findOne({ shopDomain: SHOP }).lean()).toMatchObject({ plan: 'free', planTier: null, subscriptionStatus: 'CANCELLED' });
    expect((await events())[0]).toMatchObject({ eventType: 'ended', fromPlan: 'pro', toPlan: 'free', source: 'partner_api' });
  });

  it('moved to the $0 Free plan → Free', async () => {
    const store = await makeStore({ plan: 'pro', planTier: 'starter', shopGid: SHOP_GID });
    partnerReplies(sub('free', 0));
    expect((await refreshPlan(store, 'tok')).tier).toBe('free');
    expect((await Store.findOne({ shopDomain: SHOP }).lean()).plan).toBe('free');
  });

  it('Free store on the Free plan → no change, no event', async () => {
    const store = await makeStore({ shopGid: SHOP_GID });
    partnerReplies(sub('free', 0));
    expect((await refreshPlan(store, 'tok')).changed).toBe(false);
    expect(await events()).toHaveLength(0);
  });

  it('Shopify cannot be asked → throws and the plan is left exactly as it was', async () => {
    const store = await makeStore({ plan: 'pro', planTier: 'growth', shopGid: SHOP_GID });
    axios.post.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 500 } }));
    await expect(refreshPlan(store, 'tok')).rejects.toThrow('Partner API request failed (500)');
    const saved = await Store.findOne({ shopDomain: SHOP }).lean();
    expect(saved).toMatchObject({ plan: 'pro', planTier: 'growth', planCheckedAt: null });
  });

  it('internal store → Shopify is not asked', async () => {
    const store = await makeStore({ isInternal: true });
    expect(await refreshPlan(store, 'tok')).toEqual({ tier: 'pro', changed: false, source: 'internal' });
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('refreshPlan without the Partner API (Admin API fallback)', () => {
  beforeEach(() => { delete process.env.SHOPIFY_PARTNER_API_TOKEN; });

  it('an active subscription is read from the Admin API', async () => {
    shopifyGraphQL.mockResolvedValueOnce({ currentAppInstallation: { activeSubscriptions: [{ id: 'gid://shopify/AppSubscription/5', name: 'Growth', status: 'ACTIVE', test: true }] } });
    const store = await makeStore();
    expect((await refreshPlan(store, 'tok')).tier).toBe('growth');
    expect(await Store.findOne({ shopDomain: SHOP }).lean()).toMatchObject({ planTier: 'growth', subscriptionId: 'gid://shopify/AppSubscription/5', isTest: true });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('"nothing found" there does NOT end a paid plan (it may not see App Pricing plans)', async () => {
    const store = await makeStore({ plan: 'pro', planTier: 'growth' });
    const r = await refreshPlan(store, 'tok');
    expect(r).toMatchObject({ tier: 'growth', changed: false });
    expect((await Store.findOne({ shopDomain: SHOP }).lean()).plan).toBe('pro');
    expect(await events()).toHaveLength(0);
  });
});

describe('planCheckIsStale', () => {
  it('never checked or older than the limit → stale', () => {
    const now = Date.now();
    expect(planCheckIsStale({}, 1000, now)).toBe(true);
    expect(planCheckIsStale({ planCheckedAt: new Date(now - 500) }, 1000, now)).toBe(false);
    expect(planCheckIsStale({ planCheckedAt: new Date(now - 1500) }, 1000, now)).toBe(true);
  });
});

describe('recheckPaidPlans (poller, once a day)', () => {
  const old = () => new Date(Date.now() - 25 * 60 * 60 * 1000);
  const OTHER = (n) => `paid-${n}.myshopify.com`;

  it('checks only paid, installed, non-internal stores not checked for a day', async () => {
    await makeStore({ plan: 'pro', planTier: 'growth', shopGid: SHOP_GID, planCheckedAt: old() });
    await Store.create([
      { shopDomain: OTHER(1), accessToken: 't', plan: 'pro', planCheckedAt: new Date() },
      { shopDomain: OTHER(2), accessToken: 't', plan: 'free' },
      { shopDomain: OTHER(3), accessToken: 't', plan: 'pro', isInternal: true },
      { shopDomain: OTHER(4), accessToken: 't', plan: 'pro', subscriptionStatus: 'uninstalled' },
    ]);
    partnerReplies(noSub);
    const r = await recheckPaidPlans();
    expect(r).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(refreshAccessTokenIfNeeded).toHaveBeenCalledTimes(1);
    expect((await Store.findOne({ shopDomain: SHOP }).lean()).plan).toBe('free');
  });

  it('at most `limit` stores per tick', async () => {
    await Store.create([1, 2, 3].map((n) => ({ shopDomain: OTHER(n), accessToken: 't', plan: 'pro', shopGid: `gid://shopify/Shop/${n}` })));
    partnerReplies(sub('pro', 49), sub('pro', 49));
    expect((await recheckPaidPlans({ limit: 2 })).checked).toBe(2);
  });

  it('a failure is logged, the plan kept, and the store waits a day before the next try', async () => {
    await makeStore({ plan: 'pro', planTier: 'growth', shopGid: SHOP_GID });
    axios.post.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 503 } }));
    expect(await recheckPaidPlans()).toEqual({ checked: 1, changed: 0, failed: 1 });
    const saved = await Store.findOne({ shopDomain: SHOP }).lean();
    expect(saved).toMatchObject({ plan: 'pro', planTier: 'growth' });
    expect(saved.planCheckedAt).toBeInstanceOf(Date);
    expect((await recheckPaidPlans()).checked).toBe(0);
  });

  it('without the Partner API nothing is done', async () => {
    delete process.env.SHOPIFY_PARTNER_ID;
    await makeStore({ plan: 'pro' });
    expect(await recheckPaidPlans()).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(refreshAccessTokenIfNeeded).not.toHaveBeenCalled();
  });
});
