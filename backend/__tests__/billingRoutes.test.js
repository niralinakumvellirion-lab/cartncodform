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
  exchangeSessionToken: jest.fn(),
  refreshAccessTokenIfNeeded: jest.fn(),
}));

const http = require('http');
const express = require('express');
const { createSubscription } = require('../utils/billing');
const { exchangeSessionToken, refreshAccessTokenIfNeeded } = require('../utils/shopify');
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
  process.env.BACKEND_URL = 'https://api.example.test';
  global.__billingTestStore = {
    shopDomain: 'bill-shop.myshopify.com',
    accessToken: 'tok',
    plan: 'free',
  };
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/billing/:shop/status', () => {
  test('free store → hasAccess false with price and trial', async () => {
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`);
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
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`);
    expect((await r.json()).hasAccess).toBe(true);
  });

  test('free internal store → hasAccess true', async () => {
    global.__billingTestStore.isInternal = true;
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/status`);
    expect((await r.json()).hasAccess).toBe(true);
  });
});

describe('POST /api/billing/:shop/start', () => {
  const START = () => ({ method: 'POST', headers: { Authorization: 'Bearer session-jwt' } });

  test('returns the Shopify approval URL using a freshly exchanged token', async () => {
    exchangeSessionToken.mockResolvedValue('fresh-tok');
    createSubscription.mockResolvedValue({ confirmationUrl: 'https://shopify.test/confirm/1' });
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ confirmationUrl: 'https://shopify.test/confirm/1' });
    expect(exchangeSessionToken).toHaveBeenCalledWith('bill-shop.myshopify.com', 'session-jwt');
    const [shop, token, returnUrl] = createSubscription.mock.calls[0];
    expect(shop).toBe('bill-shop.myshopify.com');
    expect(token).toBe('fresh-tok');
    expect(returnUrl).toBe(
      'https://api.example.test/api/auth/billing/callback?shop=bill-shop.myshopify.com'
    );
  });

  test('token exchange fails → falls back to the stored-token policy', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    exchangeSessionToken.mockRejectedValue(new Error('exchange denied'));
    refreshAccessTokenIfNeeded.mockResolvedValue('fallback-tok');
    createSubscription.mockResolvedValue({ confirmationUrl: 'https://shopify.test/confirm/2' });
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(r.status).toBe(200);
    expect(refreshAccessTokenIfNeeded).toHaveBeenCalledWith(global.__billingTestStore);
    expect(createSubscription.mock.calls[0][1]).toBe('fallback-tok');
  });

  test('no confirmationUrl → 500', async () => {
    exchangeSessionToken.mockResolvedValue('t'); createSubscription.mockResolvedValue({ confirmationUrl: null });
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(r.status).toBe(500);
  });

  test('Shopify error → 500 with a safe message', async () => {
    exchangeSessionToken.mockResolvedValue('t'); createSubscription.mockRejectedValue(new Error('Billing error: secret detail'));
    const r = await fetch(`${base}/api/billing/bill-shop.myshopify.com/start`, START());
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body.error).toMatch(/free trial/i);
    expect(JSON.stringify(body)).not.toMatch(/secret detail/);
  });
});
