jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => {
    req.shopDomain = 'bill-shop.myshopify.com';
    next();
  },
  requireStoreOwnerAnyPlan: (req, _res, next) => {
    req.store = global.__billingTestStore;
    next();
  },
}));

jest.mock('../utils/billing', () => ({
  ...jest.requireActual('../utils/billing'),
  createSubscription: jest.fn(),
  shouldUseTestCharge: jest.fn(),
}));

jest.mock('../utils/subscriptionSync', () => ({
  refreshPlan: jest.fn(),
  planCheckIsStale: (store) => !store.planCheckedAt || Date.now() - new Date(store.planCheckedAt).getTime() > 6 * 3600 * 1000,
}));

jest.mock('../utils/shopify', () => ({
  refreshAccessTokenIfNeeded: jest.fn(),
}));

const http = require('http');
const express = require('express');
const { createSubscription, shouldUseTestCharge } = require('../utils/billing');
const { refreshAccessTokenIfNeeded } = require('../utils/shopify');
const { refreshPlan } = require('../utils/subscriptionSync');
const { isManagedPricingError, managedPricingUrl } = require('../utils/billing');
const billingRouter = require('../routes/billing');

let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/billing', billingRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((r) => server.close(r)));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.BACKEND_URL = 'https://api.example.test';
  global.__billingTestStore = {
    shopDomain: 'bill-shop.myshopify.com',
    accessToken: 'tok',
    accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
    refreshToken: 'r',
    plan: 'free',
  };
  refreshAccessTokenIfNeeded.mockResolvedValue('fresh-tok');
  shouldUseTestCharge.mockResolvedValue(false);
  // Shopify reports no subscription unless a test says otherwise.
  refreshPlan.mockImplementation(async (store) => {
    store.planCheckedAt = new Date();
    return { tier: store.plan === 'pro' ? (store.planTier || 'pro') : 'free', changed: false, source: 'partner_api' };
  });
});

afterEach(() => jest.restoreAllMocks());

const AUTH = { Authorization: 'Bearer session-jwt' };

describe('GET /api/billing/:shop/status', () => {
  test('store without a subscription → Free plan, still full access', async () => {
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      hasAccess: true,
      plan: 'free',
      tier: 'free',
      priceUsd: 10,
      currency: 'USD',
      trialDays: 30,
    });
  });

  test('pro store with a tier saved → that tier', async () => {
    global.__billingTestStore.plan = 'pro';
    global.__billingTestStore.planTier = 'growth';
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(await r.json()).toMatchObject({ hasAccess: true, plan: 'pro', tier: 'growth' });
  });

  test('free internal store → Pro tier', async () => {
    global.__billingTestStore.isInternal = true;
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(await r.json()).toMatchObject({ hasAccess: true, tier: 'pro' });
  });

  test('plan confirmed with Shopify in the last 6 hours → no token work and no call to Shopify on status', async () => {
    global.__billingTestStore.plan = 'pro';
    global.__billingTestStore.planCheckedAt = new Date(Date.now() - 60 * 60 * 1000);
    await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(refreshAccessTokenIfNeeded).not.toHaveBeenCalled();
    expect(refreshPlan).not.toHaveBeenCalled();
  });

  test('a FREE store checked a minute ago is asked again (it may have just subscribed on Shopify) — review 1.2.2', async () => {
    global.__billingTestStore.planCheckedAt = new Date(Date.now() - 60 * 1000);
    refreshPlan.mockImplementationOnce(async (store) => {
      Object.assign(store, { plan: 'pro', planTier: 'starter', planCheckedAt: new Date() });
      return { tier: 'starter', changed: true, source: 'managed_pricing' };
    });
    const body = await (await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH })).json();
    expect(refreshPlan).toHaveBeenCalledWith(global.__billingTestStore, 'fresh-tok');
    expect(body).toMatchObject({ tier: 'starter' });
  });

  test('a PAID plan checked within 6 hours is not asked again on status', async () => {
    global.__billingTestStore.plan = 'pro';
    global.__billingTestStore.planTier = 'growth';
    global.__billingTestStore.planCheckedAt = new Date(Date.now() - 60 * 1000);
    await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(refreshPlan).not.toHaveBeenCalled();
  });

  test('a PAID plan whose last check is over 6 hours old is confirmed again (catches a cancellation)', async () => {
    global.__billingTestStore.plan = 'pro';
    global.__billingTestStore.planTier = 'growth';
    global.__billingTestStore.planCheckedAt = new Date(Date.now() - 7 * 60 * 60 * 1000);
    refreshPlan.mockImplementationOnce(async (store) => {
      Object.assign(store, { plan: 'free', planTier: null, planCheckedAt: new Date() });
      return { tier: 'free', changed: true, source: 'partner_api' };
    });
    const body = await (await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH })).json();
    expect(refreshPlan).toHaveBeenCalledWith(global.__billingTestStore, 'fresh-tok');
    expect(body).toMatchObject({ plan: 'free', tier: 'free' });
  });

  test('internal store → Shopify is not asked either', async () => {
    global.__billingTestStore.isInternal = true;
    await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(refreshPlan).not.toHaveBeenCalled();
  });

  test('store never checked, WITH an active Shopify subscription → that tier', async () => {
    refreshPlan.mockImplementationOnce(async (store) => {
      Object.assign(store, { plan: 'pro', planTier: 'starter', planCheckedAt: new Date() });
      return { tier: 'starter', changed: true, source: 'partner_api' };
    });
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    const body = await r.json();
    expect(body).toMatchObject({ hasAccess: true, plan: 'pro', tier: 'starter' });
    expect(refreshPlan).toHaveBeenCalledWith(global.__billingTestStore, 'fresh-tok');
  });

  test('no subscription at Shopify → Free plan', async () => {
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect((await r.json())).toMatchObject({ hasAccess: true, plan: 'free', tier: 'free' });
  });

  test('a failing Shopify check never breaks the status answer', async () => {
    refreshPlan.mockRejectedValue(new Error('shopify down'));
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(r.status).toBe(200);
    expect((await r.json()).tier).toBe('free');
  });

  test('legacy store (no expiry, no refresh token) → converted using the session token', async () => {
    global.__billingTestStore = { shopDomain: 'bill-shop.myshopify.com', accessToken: 'legacy', plan: 'free' };
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(r.status).toBe(200);
    expect(refreshAccessTokenIfNeeded).toHaveBeenCalledWith(
      global.__billingTestStore,
      { sessionToken: 'session-jwt' }
    );
  });

  test('conversion failure never breaks the status answer', async () => {
    global.__billingTestStore = { shopDomain: 'bill-shop.myshopify.com', accessToken: 'legacy', plan: 'free' };
    refreshAccessTokenIfNeeded.mockRejectedValue(new Error('shopify down'));
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(r.status).toBe(200);
    expect((await r.json()).tier).toBe('free');
  });
});

describe('POST /api/billing/:shop/start', () => {
  const START = () => ({ method: 'POST', headers: AUTH });

  test('returns the Shopify approval URL using the resolved expiring token', async () => {
    createSubscription.mockResolvedValue({ confirmationUrl: 'https://shopify.test/confirm/1' });
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ confirmationUrl: 'https://shopify.test/confirm/1' });
    expect(refreshAccessTokenIfNeeded).toHaveBeenCalledWith(
      global.__billingTestStore,
      { sessionToken: 'session-jwt' }
    );
    const [shop, token, returnUrl, isTest] = createSubscription.mock.calls[0];
    expect(shop).toBe('bill-shop.myshopify.com');
    expect(token).toBe('fresh-tok');
    expect(isTest).toBe(false);
    expect(returnUrl).toBe(
      'https://api.example.test/api/auth/billing/callback?shop=bill-shop.myshopify.com'
    );
  });

  test('development store → subscription created as a TEST charge', async () => {
    shouldUseTestCharge.mockResolvedValue(true);
    createSubscription.mockResolvedValue({ confirmationUrl: 'https://shopify.test/confirm/3' });
    await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(shouldUseTestCharge).toHaveBeenCalledWith('bill-shop.myshopify.com', 'fresh-tok');
    expect(createSubscription.mock.calls[0][3]).toBe(true);
  });

  test('no confirmationUrl → 500', async () => {
    createSubscription.mockResolvedValue({ confirmationUrl: null });
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(r.status).toBe(500);
  });

  test('app on Shopify managed pricing → returns the Shopify plan page instead of an error', async () => {
    createSubscription.mockRejectedValue(new Error('Billing error: [{"field":null,"message":"Cannot use the Billing API (to create charges) when on Shopify App Pricing."}]'));
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      confirmationUrl: 'https://admin.shopify.com/store/bill-shop/charges/cartncod-form/pricing_plans',
      managedPricing: true,
    });
  });

  test('another billing refusal is still an error', async () => {
    createSubscription.mockRejectedValue(new Error('Billing error: [{"field":null,"message":"Something else"}]'));
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(r.status).toBe(500);
  });

  test('Shopify error → 500 with a safe message, full Shopify body only in the log', async () => {
    const err = new Error('Request failed with status code 403');
    err.response = { status: 403, data: { errors: 'secret detail' } };
    createSubscription.mockRejectedValue(err);
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body.error).toMatch(/free trial/i);
    expect(JSON.stringify(body)).not.toMatch(/secret detail/);
    expect(console.error.mock.calls[0].join(' ')).toMatch(/403/);
  });
});

describe('managed pricing helpers', () => {
  test('recognises the Shopify refusal and nothing else', () => {
    expect(isManagedPricingError(new Error('Cannot use the Billing API (to create charges) when on Shopify App Pricing.'))).toBe(true);
    expect(isManagedPricingError(new Error('This app is using managed pricing'))).toBe(true);
    expect(isManagedPricingError(new Error('Request failed with status code 403'))).toBe(false);
    expect(isManagedPricingError(null)).toBe(false);
  });

  test('builds the plan page address from the shop domain', () => {
    expect(managedPricingUrl('My-Store.myshopify.com')).toBe('https://admin.shopify.com/store/My-Store/charges/cartncod-form/pricing_plans');
    expect(managedPricingUrl('abc.myshopify.com')).toContain('/store/abc/charges/');
  });
});
