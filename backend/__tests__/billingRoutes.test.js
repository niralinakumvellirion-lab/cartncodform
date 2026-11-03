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
  syncActiveSubscription: jest.fn(),
}));

jest.mock('../utils/shopify', () => ({
  refreshAccessTokenIfNeeded: jest.fn(),
}));

const http = require('http');
const express = require('express');
const { createSubscription, shouldUseTestCharge } = require('../utils/billing');
const { refreshAccessTokenIfNeeded } = require('../utils/shopify');
const { syncActiveSubscription } = require('../utils/subscriptionSync');
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
  syncActiveSubscription.mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

const AUTH = { Authorization: 'Bearer session-jwt' };

describe('GET /api/billing/:shop/status', () => {
  test('free store → hasAccess false with price and trial', async () => {
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      hasAccess: false,
      plan: 'free',
      priceUsd: 10,
      currency: 'USD',
      trialDays: 30,
    });
  });

  test('pro store → hasAccess true', async () => {
    global.__billingTestStore.plan = 'pro';
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect((await r.json()).hasAccess).toBe(true);
  });

  test('free internal store → hasAccess true', async () => {
    global.__billingTestStore.isInternal = true;
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect((await r.json()).hasAccess).toBe(true);
  });

  test('store already on a plan → no token work and no call to Shopify on status', async () => {
    global.__billingTestStore.plan = 'pro';
    await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(refreshAccessTokenIfNeeded).not.toHaveBeenCalled();
    expect(syncActiveSubscription).not.toHaveBeenCalled();
  });

  test('internal store → Shopify is not asked either', async () => {
    global.__billingTestStore.isInternal = true;
    await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(syncActiveSubscription).not.toHaveBeenCalled();
  });

  test('store without a plan but WITH an active Shopify subscription (managed pricing) → hasAccess true', async () => {
    syncActiveSubscription.mockResolvedValue(true);
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    const body = await r.json();
    expect(body).toMatchObject({ hasAccess: true, plan: 'pro' });
    expect(syncActiveSubscription).toHaveBeenCalledWith(global.__billingTestStore, 'fresh-tok', 'managed_pricing');
  });

  test('no subscription at Shopify → still no access', async () => {
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect((await r.json())).toMatchObject({ hasAccess: false, plan: 'free' });
  });

  test('a failing Shopify check never breaks the status answer', async () => {
    syncActiveSubscription.mockRejectedValue(new Error('shopify down'));
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(r.status).toBe(200);
    expect((await r.json()).hasAccess).toBe(false);
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
    expect((await r.json()).hasAccess).toBe(false);
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
