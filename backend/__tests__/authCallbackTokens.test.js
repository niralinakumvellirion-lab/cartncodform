jest.mock('../models/Store');
jest.mock('../models/OAuthState');
jest.mock('../utils/billing', () => ({
  getActiveSubscription: jest.fn(),
  createSubscription: jest.fn(),
}));
jest.mock('../utils/subscriptionEvents', () => ({ recordSubscriptionEvent: jest.fn() }));
jest.mock('../utils/shopify', () => ({
  SHOPIFY_API_KEY: 'k',
  buildAuthUrl: jest.fn(),
  verifyHmac: jest.fn(() => true),
  exchangeCodeForToken: jest.fn(),
  getOnlineToken: jest.fn(),
  fetchShopInfo: jest.fn(async () => ({ email: null, ianaTimezone: null, shopName: 'S' })),
  fetchBrandData: jest.fn(async () => ({ logoUrl: null, primaryColor: null })),
  refreshAccessTokenIfNeeded: jest.fn(async (s) => s.accessToken),
}));

const http = require('http');
const express = require('express');
const Store = require('../models/Store');
const OAuthState = require('../models/OAuthState');
const { getActiveSubscription, createSubscription } = require('../utils/billing');
const { exchangeCodeForToken } = require('../utils/shopify');
const authRouter = require('../routes/auth');

const SHOP = 'cb-shop.myshopify.com';
let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use('/api/auth', authRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((r) => server.close(r)));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env.BACKEND_URL = 'https://api.example.test';
  OAuthState.findOneAndDelete.mockResolvedValue({ nonce: 'n', shop: SHOP });
  Store.exists.mockResolvedValue(null);
  Store.findOneAndUpdate.mockResolvedValue({ shopDomain: SHOP, plan: 'free' });
  getActiveSubscription.mockResolvedValue(null);
  createSubscription.mockResolvedValue({ confirmationUrl: 'https://shopify.test/approve/1' });
  exchangeCodeForToken.mockResolvedValue({
    access_token: 'acc',
    expires_in: 3600,
    refresh_token: 'ref',
    refresh_token_expires_in: 7776000,
  });
});

afterEach(() => jest.restoreAllMocks());

function callback() {
  return fetch(`${base}/api/auth/callback?shop=${SHOP}&code=c&state=n&hmac=h`, { redirect: 'manual' });
}

describe('GET /api/auth/callback — expiring tokens + billing redirect', () => {
  test('saves the access token with its expiry and the refresh token pair', async () => {
    await callback();
    const update = Store.findOneAndUpdate.mock.calls[0][1];
    expect(update.accessToken).toBe('acc');
    expect(update.refreshToken).toBe('ref');
    expect(update.accessTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(update.refreshTokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 80 * 86400000);
  });

  test('non-expiring response (no refresh token) stores nulls, not undefined garbage', async () => {
    exchangeCodeForToken.mockResolvedValue({ access_token: 'acc' });
    await callback();
    const update = Store.findOneAndUpdate.mock.calls[0][1];
    expect(update.refreshToken).toBeNull();
    expect(update.refreshTokenExpiresAt).toBeNull();
    expect(update.accessTokenExpiresAt).toBeNull();
  });

  test('no active subscription → redirected to the Shopify approval page', async () => {
    const r = await callback();
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://shopify.test/approve/1');
    const [shop, token, returnUrl] = createSubscription.mock.calls[0];
    expect(shop).toBe(SHOP);
    expect(token).toBe('acc');
    expect(returnUrl).toBe(`https://api.example.test/api/auth/billing/callback?shop=${SHOP}`);
  });

  test('subscription cannot be created → falls back to the app, using the real app handle', async () => {
    createSubscription.mockRejectedValue(new Error('403'));
    const r = await callback();
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://admin.shopify.com/store/cb-shop/apps/cartncod-form');
  });

  test('already subscribed → plan set to pro, redirected to the app, no new subscription', async () => {
    getActiveSubscription.mockResolvedValue({ id: 'gid://s/1', status: 'ACTIVE', test: false });
    const r = await callback();
    expect(createSubscription).not.toHaveBeenCalled();
    expect(r.headers.get('location')).toBe('https://admin.shopify.com/store/cb-shop/apps/cartncod-form');
    const proUpdate = Store.findOneAndUpdate.mock.calls.find(([, u]) => u.plan === 'pro');
    expect(proUpdate).toBeDefined();
  });
});
