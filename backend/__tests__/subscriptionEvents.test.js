'use strict';

/**
 * Tests for:
 *   backend/utils/subscriptionEvents.js  — recordSubscriptionEvent
 *   backend/routes/webhooks.js           — billing webhook handlers
 *   backend/routes/auth.js               — billing/callback isTest write
 *   GDPR shop/redact                     — SubscriptionEvent NOT deleted
 */

// ── Mock dependencies ─────────────────────────────────────────────────────────

jest.mock('../utils/shopify', () => ({
  ...jest.requireActual('../utils/shopify'),
  verifyWebhookHmac: jest.fn(() => true),
  registerAllWebhooks: jest.fn(),
  verifyHmac:              jest.fn(() => true),
  exchangeCodeForToken:    jest.fn().mockResolvedValue({ access_token: 'tok' }),
  fetchShopInfo:           jest.fn().mockResolvedValue({ email: 'owner@shop.com', shopName: 'Shop', ianaTimezone: 'Asia/Kolkata' }),
  fetchBrandData:          jest.fn().mockResolvedValue({}),
  refreshAccessTokenIfNeeded: jest.fn(s => s.accessToken),
  buildAuthUrl:            jest.fn(() => 'http://example.com/auth'),
  getOnlineToken:          jest.fn(),
  SHOPIFY_API_KEY:         'test-key',
}));

jest.mock('../models/Store');
jest.mock('../models/SubscriptionEvent');
jest.mock('../models/AbandonedCustomer');
jest.mock('../models/StorefrontEvent');
jest.mock('../models/CustomerPushSubscription');
jest.mock('../models/ScheduledJob');
jest.mock('../models/CodOrder');
jest.mock('../models/PushClick');
jest.mock('../models/PushSubscription');
jest.mock('../models/OAuthState');
jest.mock('../models/Profile');
jest.mock('../models/AttributedEvent');
jest.mock('../models/AutomationConfig');
jest.mock('../models/DiscountConfig');
jest.mock('../models/EmailTemplate');
jest.mock('../models/FestivalQueue');
jest.mock('../models/ShopWeights');
jest.mock('../models/Signal');
jest.mock('../models/SignalConfig');
jest.mock('../models/ComplianceRequest');

jest.mock('../utils/billing', () => ({
  PLAN_PRICE: 9.99,
  TRIAL_DAYS: 7,
  getActiveSubscription: jest.fn(),
  createSubscription:    jest.fn(),
  PLAN_NAME:             'Test Plan',
}));

const Store             = require('../models/Store');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const OAuthState        = require('../models/OAuthState');
const { recordSubscriptionEvent } = require('../utils/subscriptionEvents');
const { PLAN_PRICE, TRIAL_DAYS, getActiveSubscription } = require('../utils/billing');

// ── Suppress console noise ────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// recordSubscriptionEvent unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('recordSubscriptionEvent', () => {
  function mockNoLatest() {
    SubscriptionEvent.findOne.mockReturnValue({
      lean: () => Promise.resolve(null),
    });
  }
  function mockLatest(val) {
    SubscriptionEvent.findOne.mockReturnValue({
      lean: () => Promise.resolve(val),
    });
  }

  test('creates an event with correct fields', async () => {
    mockNoLatest();
    SubscriptionEvent.create.mockResolvedValue({});

    await recordSubscriptionEvent({
      shopDomain:    'test.myshopify.com',
      eventType:     'ended',
      fromPlan:      'pro',
      toPlan:        'free',
      shopifyStatus: 'CANCELLED',
      source:        'webhook',
      isTest:        false,
    });

    expect(SubscriptionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain:    'test.myshopify.com',
        eventType:     'ended',
        fromPlan:      'pro',
        toPlan:        'free',
        shopifyStatus: 'CANCELLED',
        source:        'webhook',
        isTest:        false,
      })
    );
  });

  test('activated event: sets priceUsd, trialDays, trialEndsAt from constants', async () => {
    mockNoLatest();
    SubscriptionEvent.create.mockResolvedValue({});

    await recordSubscriptionEvent({
      shopDomain:    'shop.myshopify.com',
      eventType:     'activated',
      toPlan:        'pro',
      shopifyStatus: 'ACTIVE',
      source:        'billing_callback',
    });

    const [doc] = SubscriptionEvent.create.mock.calls[0];
    expect(doc.priceUsd).toBe(PLAN_PRICE);
    expect(doc.trialDays).toBe(TRIAL_DAYS);
    expect(doc.trialEndsAt).toBeInstanceOf(Date);

    const expectedMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const diff = doc.trialEndsAt.getTime() - doc.occurredAt.getTime();
    expect(Math.abs(diff - expectedMs)).toBeLessThan(100);
  });

  test('never throws when SubscriptionEvent.create rejects', async () => {
    mockNoLatest();
    SubscriptionEvent.create.mockRejectedValue(new Error('DB down'));

    await expect(
      recordSubscriptionEvent({
        shopDomain: 'fail.myshopify.com',
        eventType:  'ended',
        toPlan:     'free',
        source:     'webhook',
      })
    ).resolves.toBeNull();
  });

  test('never throws when findOne rejects', async () => {
    SubscriptionEvent.findOne.mockReturnValue({
      lean: () => Promise.reject(new Error('DB down')),
    });

    await expect(
      recordSubscriptionEvent({
        shopDomain: 'fail.myshopify.com',
        eventType:  'ended',
        toPlan:     'free',
        source:     'webhook',
      })
    ).resolves.toBeNull();
    expect(SubscriptionEvent.create).not.toHaveBeenCalled();
  });

  test('dedupe: skips insert when latest event has same eventType + toPlan + shopifyStatus', async () => {
    mockLatest({ eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED' });

    const result = await recordSubscriptionEvent({
      shopDomain:    'dup.myshopify.com',
      eventType:     'ended',
      toPlan:        'free',
      shopifyStatus: 'CANCELLED',
      source:        'webhook',
    });

    expect(result).toBeNull();
    expect(SubscriptionEvent.create).not.toHaveBeenCalled();
  });

  test('dedupe: writes when toPlan differs from latest', async () => {
    mockLatest({ eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED' });
    SubscriptionEvent.create.mockResolvedValue({});

    await recordSubscriptionEvent({
      shopDomain:    'change.myshopify.com',
      eventType:     'activated',
      toPlan:        'pro',
      shopifyStatus: 'ACTIVE',
      source:        'webhook',
    });

    expect(SubscriptionEvent.create).toHaveBeenCalledTimes(1);
  });

  test('dedupe: writes when shopifyStatus differs from latest', async () => {
    mockLatest({ eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED' });
    SubscriptionEvent.create.mockResolvedValue({});

    await recordSubscriptionEvent({
      shopDomain:    'frozen.myshopify.com',
      eventType:     'ended',
      toPlan:        'free',
      shopifyStatus: 'FROZEN',
      source:        'webhook',
    });

    expect(SubscriptionEvent.create).toHaveBeenCalledTimes(1);
  });

  test('normalise: latest shopifyStatus ACTIVE + incoming "active" => skipped (case-insensitive dedupe)', async () => {
    mockLatest({ eventType: 'activated', toPlan: 'pro', shopifyStatus: 'ACTIVE' });

    const result = await recordSubscriptionEvent({
      shopDomain:    'case.myshopify.com',
      eventType:     'activated',
      toPlan:        'pro',
      shopifyStatus: 'active',
      source:        'webhook',
    });

    expect(result).toBeNull();
    expect(SubscriptionEvent.create).not.toHaveBeenCalled();
  });

  test('normalise: shopifyStatus stored as uppercase when called with lowercase', async () => {
    mockNoLatest();
    SubscriptionEvent.create.mockResolvedValue({});

    await recordSubscriptionEvent({
      shopDomain:    'upper.myshopify.com',
      eventType:     'activated',
      toPlan:        'pro',
      shopifyStatus: 'active',
      source:        'webhook',
    });

    const [doc] = SubscriptionEvent.create.mock.calls[0];
    expect(doc.shopifyStatus).toBe('ACTIVE');
  });

  test('normalise: null shopifyStatus works and does not throw', async () => {
    mockNoLatest();
    SubscriptionEvent.create.mockResolvedValue({});

    await expect(
      recordSubscriptionEvent({
        shopDomain:    'nullstatus.myshopify.com',
        eventType:     'ended',
        toPlan:        'free',
        shopifyStatus: null,
        source:        'webhook',
      })
    ).resolves.toBe(true);

    const [doc] = SubscriptionEvent.create.mock.calls[0];
    expect(doc.shopifyStatus).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Webhook handler integration tests
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const webhooksRouter = require('../routes/webhooks');

const SHOP = 'billing-test.myshopify.com';
let server;
let base;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/webhooks', webhooksRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    server.unref();
    done();
  });
});
afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

function postWebhook(path, topic, body) {
  return fetch(`${base}/api/webhooks/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Hmac-Sha256': 'test',
      'X-Shopify-Shop-Domain': SHOP,
      'X-Shopify-Topic': topic,
    },
    body: JSON.stringify(body),
  });
}

function setupWebhookMocks() {
  Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ plan: 'free' }) });
  Store.findOneAndUpdate.mockResolvedValue({});
  Store.deleteOne.mockResolvedValue({ acknowledged: true });
  SubscriptionEvent.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  SubscriptionEvent.create.mockResolvedValue({});
  require('../models/AbandonedCustomer').deleteMany.mockResolvedValue({ deletedCount: 0 });
  require('../models/StorefrontEvent').deleteMany.mockResolvedValue({ deletedCount: 0 });
  require('../models/CustomerPushSubscription').deleteMany.mockResolvedValue({ deletedCount: 0 });
  require('../models/ScheduledJob').deleteMany.mockResolvedValue({ deletedCount: 0 });
  require('../models/CodOrder').deleteMany.mockResolvedValue({ deletedCount: 0 });
  require('../models/PushClick').deleteMany.mockResolvedValue({ deletedCount: 0 });
  require('../models/PushSubscription').deleteMany.mockResolvedValue({ deletedCount: 0 });
  const CR = require('../models/ComplianceRequest');
  CR.create.mockImplementation((doc) => Promise.resolve({ _id: 'cr-id', ...doc }));
  CR.updateOne.mockResolvedValue({ acknowledged: true });
  for (const m of ['AttributedEvent','AutomationConfig','DiscountConfig','EmailTemplate',
                   'FestivalQueue','ShopWeights','Signal','SignalConfig','Profile']) {
    require(`../models/${m}`).deleteMany.mockResolvedValue({ deletedCount: 0 });
  }
}

describe('webhooks: app_subscriptions/update → ACTIVE', () => {
  beforeEach(setupWebhookMocks);

  test('returns 200 with {received:true}', async () => {
    const res = await postWebhook('app-subscription', 'app_subscriptions/update', {
      app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/1', status: 'ACTIVE' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test('updates Store plan to pro', async () => {
    await postWebhook('app-subscription', 'app_subscriptions/update', {
      app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/1', status: 'ACTIVE' },
    });
    expect(Store.findOneAndUpdate).toHaveBeenCalledWith(
      { shopDomain: SHOP },
      expect.objectContaining({ plan: 'pro' })
    );
  });

  test('records one "activated" SubscriptionEvent', async () => {
    await postWebhook('app-subscription', 'app_subscriptions/update', {
      app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/1', status: 'ACTIVE' },
    });
    expect(SubscriptionEvent.create).toHaveBeenCalledTimes(1);
    const [doc] = SubscriptionEvent.create.mock.calls[0];
    expect(doc.eventType).toBe('activated');
    expect(doc.toPlan).toBe('pro');
    expect(doc.source).toBe('webhook');
    expect(doc.shopifyStatus).toBe('ACTIVE');
  });

  test('same ACTIVE payload twice: dedupe prevents second event', async () => {
    SubscriptionEvent.findOne.mockReturnValue({
      lean: () => Promise.resolve({ eventType: 'activated', toPlan: 'pro', shopifyStatus: 'ACTIVE' }),
    });

    await postWebhook('app-subscription', 'app_subscriptions/update', {
      app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/1', status: 'ACTIVE' },
    });
    expect(SubscriptionEvent.create).not.toHaveBeenCalled();
    expect(Store.findOneAndUpdate).toHaveBeenCalled();
  });
});

describe('webhooks: app_subscriptions/update → CANCELLED/FROZEN → "ended"', () => {
  beforeEach(setupWebhookMocks);

  test('CANCELLED: records "ended" event and plan set to free', async () => {
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ plan: 'pro' }) });

    await postWebhook('app-subscription', 'app_subscriptions/update', {
      app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/1', status: 'CANCELLED' },
    });

    expect(Store.findOneAndUpdate).toHaveBeenCalledWith(
      { shopDomain: SHOP },
      expect.objectContaining({ plan: 'free' })
    );
    const [doc] = SubscriptionEvent.create.mock.calls[0];
    expect(doc.eventType).toBe('ended');
    expect(doc.toPlan).toBe('free');
    expect(doc.shopifyStatus).toBe('CANCELLED');
  });

  test('FROZEN: records "ended" event', async () => {
    await postWebhook('app-subscription', 'app_subscriptions/update', {
      app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/1', status: 'FROZEN' },
    });
    const [doc] = SubscriptionEvent.create.mock.calls[0];
    expect(doc.eventType).toBe('ended');
    expect(doc.shopifyStatus).toBe('FROZEN');
  });

  test('handler still returns 200 + updates Store when recordSubscriptionEvent fails', async () => {
    SubscriptionEvent.findOne.mockReturnValue({
      lean: () => Promise.reject(new Error('DB down')),
    });

    const res = await postWebhook('app-subscription', 'app_subscriptions/update', {
      app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/1', status: 'CANCELLED' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(Store.findOneAndUpdate).toHaveBeenCalled();
  });
});

describe('webhooks: app/uninstalled → "uninstalled" event', () => {
  beforeEach(setupWebhookMocks);

  test('records "uninstalled" event with fromPlan from current store', async () => {
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ plan: 'pro' }) });

    await postWebhook('app-uninstalled', 'app/uninstalled', { shop: SHOP });

    const [doc] = SubscriptionEvent.create.mock.calls[0];
    expect(doc.eventType).toBe('uninstalled');
    expect(doc.fromPlan).toBe('pro');
    expect(doc.toPlan).toBe('free');
    expect(doc.shopifyStatus).toBe('UNINSTALLED');
    expect(doc.source).toBe('webhook');
  });

  test('returns 200 with {received:true}', async () => {
    const res = await postWebhook('app-uninstalled', 'app/uninstalled', { shop: SHOP });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test('handler still returns 200 + updates Store when recordSubscriptionEvent fails', async () => {
    SubscriptionEvent.create.mockRejectedValue(new Error('DB down'));

    const res = await postWebhook('app-uninstalled', 'app/uninstalled', { shop: SHOP });
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
    expect(Store.findOneAndUpdate).toHaveBeenCalled();
  });
});

describe('webhooks: shop/redact — SubscriptionEvent is NOT deleted', () => {
  beforeEach(setupWebhookMocks);

  test('shop/redact returns 200 and never calls SubscriptionEvent.deleteMany', async () => {
    const res = await postWebhook('compliance', 'shop/redact', {
      shop_domain: SHOP,
      shop_id: 999,
    });
    expect(res.status).toBe(200);
    expect(SubscriptionEvent.deleteMany).not.toHaveBeenCalled();
    expect(SubscriptionEvent.deleteOne).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// billing/callback: isTest from activeSub.test
// ─────────────────────────────────────────────────────────────────────────────

describe('auth billing/callback: isTest written from activeSub.test', () => {
  let authServer;
  let authBase;

  beforeAll((done) => {
    // Fresh require so module cache doesn't interfere with webhook server.
    jest.resetModules();
    // Re-apply mocks after resetModules.
    jest.mock('../utils/shopify', () => ({
      ...jest.requireActual('../utils/shopify'),
      verifyWebhookHmac: jest.fn(() => true),
      registerAllWebhooks: jest.fn(),
      verifyHmac:              jest.fn(() => true),
      exchangeCodeForToken:    jest.fn().mockResolvedValue({ access_token: 'tok' }),
      fetchShopInfo:           jest.fn().mockResolvedValue({ email: 'owner@shop.com', shopName: 'Shop', ianaTimezone: 'Asia/Kolkata' }),
      fetchBrandData:          jest.fn().mockResolvedValue({}),
      refreshAccessTokenIfNeeded: jest.fn(s => Promise.resolve(s.accessToken || 'tok')),
      buildAuthUrl:            jest.fn(() => 'http://example.com/auth'),
      getOnlineToken:          jest.fn(),
      SHOPIFY_API_KEY:         'test-key',
    }));
    jest.mock('../models/Store');
    jest.mock('../models/SubscriptionEvent');
    jest.mock('../models/OAuthState');
    jest.mock('../utils/billing', () => ({
      PLAN_PRICE: 9.99,
      TRIAL_DAYS: 7,
      getActiveSubscription: jest.fn(),
      createSubscription:    jest.fn(),
      PLAN_NAME:             'Test Plan',
    }));

    const express2 = require('express');
    const authRouter = require('../routes/auth');
    const app2 = express2();
    app2.use(express2.json());
    app2.use('/api/auth', authRouter);
    authServer = app2.listen(0, () => {
      authBase = `http://127.0.0.1:${authServer.address().port}`;
      authServer.unref();
      done();
    });
  });

  afterAll(async () => {
    await new Promise(resolve => authServer.close(resolve));
  });

  test('isTest: true written to Store when activeSub.test is true', async () => {
    const billing = require('../utils/billing');
    const Store2  = require('../models/Store');
    const SubEv   = require('../models/SubscriptionEvent');

    billing.getActiveSubscription.mockResolvedValue({
      id: 'gid://shopify/AppSubscription/1',
      status: 'ACTIVE',
      test: true,
    });
    Store2.findOne.mockResolvedValue({ shopDomain: SHOP, accessToken: 'tok', plan: 'free' });
    Store2.findOneAndUpdate.mockResolvedValue({});
    SubEv.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    SubEv.create.mockResolvedValue({});

    await fetch(`${authBase}/api/auth/billing/callback?shop=${SHOP}`);

    const updateCall = Store2.findOneAndUpdate.mock.calls.find(([, update]) => 'isTest' in update);
    expect(updateCall).toBeDefined();
    expect(updateCall[1].isTest).toBe(true);
  });

  test('isTest: false written to Store when activeSub.test is false', async () => {
    const billing = require('../utils/billing');
    const Store2  = require('../models/Store');
    const SubEv   = require('../models/SubscriptionEvent');

    billing.getActiveSubscription.mockResolvedValue({
      id: 'gid://shopify/AppSubscription/2',
      status: 'ACTIVE',
      test: false,
    });
    Store2.findOne.mockResolvedValue({ shopDomain: SHOP, accessToken: 'tok', plan: 'free' });
    Store2.findOneAndUpdate.mockResolvedValue({});
    SubEv.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    SubEv.create.mockResolvedValue({});

    await fetch(`${authBase}/api/auth/billing/callback?shop=${SHOP}`);

    const updateCall = Store2.findOneAndUpdate.mock.calls.find(([, update]) => 'isTest' in update);
    expect(updateCall).toBeDefined();
    expect(updateCall[1].isTest).toBe(false);
  });
});
