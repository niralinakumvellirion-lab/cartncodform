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
  createSubscription: jest.fn(),
  PLAN_PRICE: 10,
  PLAN_CURRENCY: 'USD',
  TRIAL_DAYS: 30,
}));

jest.mock('../utils/shopify', () => ({
  refreshAccessTokenIfNeeded: jest.fn(),
}));

const http = require('http');
const express = require('express');
const { createSubscription } = require('../utils/billing');
const { refreshAccessTokenIfNeeded } = require('../utils/shopify');
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

  test('store with an expiring token → no token work on status', async () => {
    await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`, { headers: AUTH });
    expect(refreshAccessTokenIfNeeded).not.toHaveBeenCalled();
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
    const [shop, token, returnUrl] = createSubscription.mock.calls[0];
    expect(shop).toBe('bill-shop.myshopify.com');
    expect(token).toBe('fresh-tok');
    expect(returnUrl).toBe(
      'https://api.example.test/api/auth/billing/callback?shop=bill-shop.myshopify.com'
    );
  });

  test('no confirmationUrl → 500', async () => {
    createSubscription.mockResolvedValue({ confirmationUrl: null });
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
