'use strict';

// Top-level mocks must be declared before any require().
jest.mock('../utils/shopify', () => ({ verifyWebhookHmac: jest.fn(() => true) }));
jest.mock('../utils/email', () => ({ sendAbandonedCartEmail: jest.fn() }));
jest.mock('../utils/pushNotification', () => ({
  sendPushToStore: jest.fn(),
  sendPushToCustomers: jest.fn(),
}));
jest.mock('../utils/productImage', () => ({ fetchProductImage: jest.fn() }));
jest.mock('../services/profileService', () => ({ upsertProfile: jest.fn() }));
jest.mock('../services/signalEngine', () => ({ computeSignalsForProfile: jest.fn() }));
jest.mock('../utils/subscriptionEvents', () => ({ recordSubscriptionEvent: jest.fn() }));

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { verifyWebhookHmac } = require('../utils/shopify');

const webhooks = require('../routes/webhooks');

const ComplianceRequest = require('../models/ComplianceRequest');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const Profile = require('../models/Profile');
const StorefrontEvent = require('../models/StorefrontEvent');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const PushClick = require('../models/PushClick');
const AttributedEvent = require('../models/AttributedEvent');
const ScheduledJob = require('../models/ScheduledJob');
const CodOrder = require('../models/CodOrder');
const Store = require('../models/Store');
const AutomationConfig = require('../models/AutomationConfig');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const cols = mongoose.connection.collections;
  for (const col of Object.values(cols)) {
    await col.deleteMany({});
  }
  verifyWebhookHmac.mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeReq({ shopDomain = 'shop.myshopify.com', topic = '', body = {}, hmacValid = true } = {}) {
  return {
    rawBody: JSON.stringify(body),
    body,
    get: jest.fn((h) => {
      if (h === 'X-Shopify-Hmac-Sha256') return hmacValid ? 'valid' : 'bad';
      if (h === 'X-Shopify-Shop-Domain') return shopDomain;
      if (h === 'X-Shopify-Topic') return topic;
      return null;
    }),
  };
}

function makeRes() {
  const res = { _status: 200, _body: null };
  res.status = jest.fn((code) => { res._status = code; return res; });
  res.json = jest.fn((b) => { res._body = b; return res; });
  return res;
}

async function flushBackground() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 80));
}

// ---------------------------------------------------------------------------
// 1. handleCustomersDataRequest — HTTP handler
// ---------------------------------------------------------------------------
describe('handleCustomersDataRequest', () => {
  test('returns 401 when HMAC is invalid', async () => {
    verifyWebhookHmac.mockReturnValueOnce(false);
    const req = makeReq({ hmacValid: false });
    const res = makeRes();
    await webhooks._handleCustomersDataRequest(req, res);
    expect(res._status).toBe(401);
    expect(await ComplianceRequest.countDocuments()).toBe(0);
  });

  test('persists ComplianceRequest and returns 200', async () => {
    const shop = 'data-req.myshopify.com';
    const req = makeReq({
      shopDomain: shop,
      body: { customer: { id: '7', email: 'a@b.com', phone: '999' } },
    });
    const res = makeRes();
    await webhooks._handleCustomersDataRequest(req, res);
    expect(res._status).toBe(200);

    const cr = await ComplianceRequest.findOne({ shopDomain: shop });
    expect(cr).toBeTruthy();
    expect(cr.topic).toBe('customers/data_request');
    expect(['received', 'processing', 'completed']).toContain(cr.status);
  });

  test('marks ComplianceRequest completed after background job', async () => {
    const shop = 'data-req2.myshopify.com';
    const req = makeReq({ shopDomain: shop, body: { customer: { id: '8' } } });
    const res = makeRes();
    await webhooks._handleCustomersDataRequest(req, res);
    await flushBackground();
    const cr = await ComplianceRequest.findOne({ shopDomain: shop });
    expect(cr.status).toBe('completed');
    expect(cr.identifiers).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. handleCustomersRedact — HTTP handler
// ---------------------------------------------------------------------------
describe('handleCustomersRedact', () => {
  test('returns 401 when HMAC is invalid', async () => {
    verifyWebhookHmac.mockReturnValueOnce(false);
    const req = makeReq({ hmacValid: false, body: { customer: { id: '1' } } });
    const res = makeRes();
    await webhooks._handleCustomersRedact(req, res);
    expect(res._status).toBe(401);
  });

  test('returns 200 without ComplianceRequest when no identifier supplied', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await webhooks._handleCustomersRedact(req, res);
    expect(res._status).toBe(200);
    expect(await ComplianceRequest.countDocuments()).toBe(0);
  });

  test('persists ComplianceRequest and immediately returns 200', async () => {
    const shop = 'cust-redact.myshopify.com';
    const req = makeReq({ shopDomain: shop, body: { customer: { id: '11' } } });
    const res = makeRes();
    await webhooks._handleCustomersRedact(req, res);
    expect(res._status).toBe(200);
    const cr = await ComplianceRequest.findOne({ shopDomain: shop });
    expect(cr).toBeTruthy();
    expect(cr.topic).toBe('customers/redact');
  });
});

// ---------------------------------------------------------------------------
// 3. handleShopRedact — HTTP handler
// ---------------------------------------------------------------------------
describe('handleShopRedact', () => {
  test('returns 401 when HMAC is invalid', async () => {
    verifyWebhookHmac.mockReturnValueOnce(false);
    const req = makeReq({ hmacValid: false });
    const res = makeRes();
    await webhooks._handleShopRedact(req, res);
    expect(res._status).toBe(401);
  });

  test('returns 200 without ComplianceRequest when no shop domain', async () => {
    const req = makeReq({ shopDomain: '' });
    const res = makeRes();
    await webhooks._handleShopRedact(req, res);
    expect(res._status).toBe(200);
    expect(await ComplianceRequest.countDocuments()).toBe(0);
  });

  test('persists ComplianceRequest and immediately returns 200', async () => {
    const shop = 'shopredact-h.myshopify.com';
    const req = makeReq({ shopDomain: shop });
    const res = makeRes();
    await webhooks._handleShopRedact(req, res);
    expect(res._status).toBe(200);
    const cr = await ComplianceRequest.findOne({ shopDomain: shop });
    expect(cr).toBeTruthy();
    expect(cr.topic).toBe('shop/redact');
  });
});

// ---------------------------------------------------------------------------
// 4. runCustomersRedact — job function
// ---------------------------------------------------------------------------
describe('runCustomersRedact', () => {
  async function makeCr(shop, identifiers) {
    return ComplianceRequest.create({ shopDomain: shop, topic: 'customers/redact', identifiers });
  }

  test('deletes AbandonedCustomer rows for the customer', async () => {
    const shop = 'rc1.myshopify.com';
    await AbandonedCustomer.create({ shopDomain: shop, customerId: '42', cartItems: [] });
    await AbandonedCustomer.create({ shopDomain: shop, customerId: '99', cartItems: [] });
    const cr = await makeCr(shop, { customerId: '42' });
    await webhooks.runCustomersRedact(cr);
    const remaining = await AbandonedCustomer.find({ shopDomain: shop });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].customerId).toBe('99');
  });

  test('[M2] deletes PushClick rows — gap that existed in old code', async () => {
    const shop = 'rc2.myshopify.com';
    await PushClick.create({ shopDomain: shop, customerId: '77' });
    await PushClick.create({ shopDomain: shop, customerId: '88' });
    const cr = await makeCr(shop, { customerId: '77' });
    await webhooks.runCustomersRedact(cr);
    const remaining = await PushClick.find({ shopDomain: shop });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].customerId).toBe('88');
  });

  test('deletes AttributedEvent rows via sessionId — gap that existed in old code', async () => {
    const shop = 'rc3.myshopify.com';
    const sessionId = 'sess-attr-55';
    // Profile lookup is needed to discover sessionIds.
    await Profile.create({
      shopDomain: shop,
      identifiers: { customerId: '55', emails: [], phones: [], sessionIds: [sessionId], cartTokens: [], pushTokens: [] },
    });
    await AttributedEvent.create({ shopDomain: shop, sessionId, eventType: 'revisit' });
    await AttributedEvent.create({ shopDomain: shop, sessionId: 'other-sess', eventType: 'revisit' });
    const cr = await makeCr(shop, { customerId: '55' });
    await webhooks.runCustomersRedact(cr);
    const remaining = await AttributedEvent.find({ shopDomain: shop });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sessionId).toBe('other-sess');
  });

  test('deletes Profile rows', async () => {
    const shop = 'rc4.myshopify.com';
    await Profile.create({
      shopDomain: shop,
      identifiers: { customerId: '11', emails: [], phones: [], sessionIds: [], cartTokens: [], pushTokens: [] },
    });
    const cr = await makeCr(shop, { customerId: '11' });
    await webhooks.runCustomersRedact(cr);
    expect(await Profile.countDocuments({ shopDomain: shop })).toBe(0);
  });

  test('deletes StorefrontEvent rows via sessionId', async () => {
    const shop = 'rc5.myshopify.com';
    const sessionId = 'sess-abc';
    await Profile.create({
      shopDomain: shop,
      identifiers: { customerId: '22', emails: [], phones: [], sessionIds: [sessionId], cartTokens: [], pushTokens: [] },
    });
    await StorefrontEvent.create({ shopDomain: shop, sessionId, type: 'page_view' });
    const cr = await makeCr(shop, { customerId: '22' });
    await webhooks.runCustomersRedact(cr);
    expect(await StorefrontEvent.countDocuments({ shopDomain: shop })).toBe(0);
  });

  test('anonymises CodOrder rows — not deleted', async () => {
    const shop = 'rc6.myshopify.com';
    await CodOrder.create({
      shopDomain: shop,
      email: 'customer@example.com',
      phone: '9999999999',
      name: 'Real Name',
      address: '123 Street',
    });
    const cr = await makeCr(shop, { customerId: null, customerEmail: 'customer@example.com', customerPhone: '9999999999' });
    await webhooks.runCustomersRedact(cr);
    const order = await CodOrder.findOne({ shopDomain: shop });
    expect(order.name).toBe('[redacted]');
    expect(order.phone).toBe('[redacted]');
    expect(order.email).toBe('');
    expect(order.address).toBe('[redacted]');
  });

  test('marks ComplianceRequest completed and wipes identifiers', async () => {
    const shop = 'rc7.myshopify.com';
    const cr = await makeCr(shop, { customerId: '1', customerEmail: 'x@y.com' });
    await webhooks.runCustomersRedact(cr);
    const updated = await ComplianceRequest.findById(cr._id);
    expect(updated.status).toBe('completed');
    expect(updated.identifiers).toBeNull();
    expect(updated.completedAt).toBeTruthy();
  });

  test('is idempotent — second run deletes 0 additional rows', async () => {
    const shop = 'rc8.myshopify.com';
    await AbandonedCustomer.create({ shopDomain: shop, customerId: '3', cartItems: [] });
    const cr = await makeCr(shop, { customerId: '3' });
    await webhooks.runCustomersRedact(cr);
    // Reset to simulate a retry.
    await ComplianceRequest.updateOne({ _id: cr._id }, { $set: { status: 'received', identifiers: { customerId: '3' } } });
    const cr2 = await ComplianceRequest.findById(cr._id).lean();
    await webhooks.runCustomersRedact(cr2);
    expect(await AbandonedCustomer.countDocuments({ shopDomain: shop })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. runShopRedact — job function
// ---------------------------------------------------------------------------
describe('runShopRedact', () => {
  async function makeCr(shop) {
    return ComplianceRequest.create({ shopDomain: shop, topic: 'shop/redact', identifiers: {} });
  }

  test('[M1] deletes Profile rows — gap that existed in old code', async () => {
    const shop = 'sr1.myshopify.com';
    await Profile.create({
      shopDomain: shop,
      identifiers: { emails: [], phones: [], sessionIds: [], cartTokens: [], pushTokens: [] },
    });
    const cr = await makeCr(shop);
    await webhooks.runShopRedact(cr);
    expect(await Profile.countDocuments({ shopDomain: shop })).toBe(0);
  });

  test('deletes all SHOP_REDACT_MODELS collections', async () => {
    const shop = 'sr2.myshopify.com';
    await Promise.all([
      AbandonedCustomer.create({ shopDomain: shop, cartItems: [] }),
      Profile.create({ shopDomain: shop, identifiers: { emails: [], phones: [], sessionIds: [], cartTokens: [], pushTokens: [] } }),
      StorefrontEvent.create({ shopDomain: shop, type: 'page_view' }),
      PushClick.create({ shopDomain: shop }),
      AttributedEvent.create({ shopDomain: shop, eventType: 'revisit' }),
      AutomationConfig.create({ shopDomain: shop }),
      Store.create({ shopDomain: shop, accessToken: 'tok', plan: 'free' }),
    ]);
    const cr = await makeCr(shop);
    await webhooks.runShopRedact(cr);
    const counts = await Promise.all([
      AbandonedCustomer.countDocuments({ shopDomain: shop }),
      Profile.countDocuments({ shopDomain: shop }),
      StorefrontEvent.countDocuments({ shopDomain: shop }),
      PushClick.countDocuments({ shopDomain: shop }),
      AttributedEvent.countDocuments({ shopDomain: shop }),
      AutomationConfig.countDocuments({ shopDomain: shop }),
      Store.countDocuments({ shopDomain: shop }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test('does not touch other shops data', async () => {
    const shop = 'sr3.myshopify.com';
    const other = 'other.myshopify.com';
    await AbandonedCustomer.create({ shopDomain: other, cartItems: [] });
    const cr = await makeCr(shop);
    await webhooks.runShopRedact(cr);
    expect(await AbandonedCustomer.countDocuments({ shopDomain: other })).toBe(1);
  });

  test('marks ComplianceRequest completed and wipes identifiers', async () => {
    const shop = 'sr4.myshopify.com';
    const cr = await makeCr(shop);
    await webhooks.runShopRedact(cr);
    const updated = await ComplianceRequest.findById(cr._id);
    expect(updated.status).toBe('completed');
    expect(updated.identifiers).toBeNull();
    expect(updated.completedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 6. Retry poller query logic
// ---------------------------------------------------------------------------
describe('retryPendingCompliance query', () => {
  function findPending() {
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
    return ComplianceRequest.find({
      status: { $in: ['received', 'failed'] },
      attempts: { $lt: 5 },
      $or: [{ lastAttemptAt: { $lt: twoMinAgo } }, { lastAttemptAt: null }],
    }).lean();
  }

  test('returns failed records older than 2 minutes', async () => {
    await ComplianceRequest.create({
      shopDomain: 'rt1.myshopify.com',
      topic: 'shop/redact',
      status: 'failed',
      attempts: 2,
      lastAttemptAt: new Date(Date.now() - 3 * 60 * 1000),
      identifiers: {},
    });
    const pending = await findPending();
    expect(pending).toHaveLength(1);
  });

  test('skips records with 5 or more attempts', async () => {
    await ComplianceRequest.create({
      shopDomain: 'rt2.myshopify.com',
      topic: 'shop/redact',
      status: 'failed',
      attempts: 5,
      lastAttemptAt: new Date(Date.now() - 3 * 60 * 1000),
      identifiers: {},
    });
    expect(await findPending()).toHaveLength(0);
  });

  test('skips records updated within the last 2 minutes', async () => {
    await ComplianceRequest.create({
      shopDomain: 'rt3.myshopify.com',
      topic: 'shop/redact',
      status: 'failed',
      attempts: 1,
      lastAttemptAt: new Date(),
      identifiers: {},
    });
    expect(await findPending()).toHaveLength(0);
  });

  test('returns received records with no lastAttemptAt', async () => {
    await ComplianceRequest.create({
      shopDomain: 'rt4.myshopify.com',
      topic: 'customers/redact',
      status: 'received',
      attempts: 0,
      identifiers: { customerId: '5' },
    });
    const pending = await findPending();
    expect(pending).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Guard: every model with shopDomain is in SHOP_REDACT_MODELS or ALLOWLIST
// ---------------------------------------------------------------------------
describe('SHOP_REDACT_MODELS guard', () => {
  const path = require('path');
  const fs = require('fs');

  // Models intentionally excluded from shop/redact deletions.
  const ALLOWLIST = new Set([
    'SubscriptionEvent',  // billing analytics; no shopper PII
    'ComplianceRequest',  // audit trail; required for compliance
    'AuditLog',           // admin IP only; no shopper PII
    'CopyCache',          // no PII; TTL-indexed
    'ProductImageCache',  // no PII; TTL 24h
  ]);

  test('every shopDomain model is deleted or explicitly allowlisted', () => {
    const redactNames = new Set(webhooks.SHOP_REDACT_MODELS.map((M) => M.modelName));

    const modelsDir = path.join(__dirname, '../models');
    const files = fs.readdirSync(modelsDir).filter((f) => f.endsWith('.js'));

    const uncovered = [];
    for (const file of files) {
      const src = fs.readFileSync(path.join(modelsDir, file), 'utf8');
      if (!src.includes('shopDomain')) continue;
      const modelName = path.basename(file, '.js');
      if (!redactNames.has(modelName) && !ALLOWLIST.has(modelName)) {
        uncovered.push(modelName);
      }
    }

    if (uncovered.length > 0) {
      throw new Error(
        `Models with shopDomain not in SHOP_REDACT_MODELS or ALLOWLIST: ${uncovered.join(', ')}. ` +
        'Add them to SHOP_REDACT_MODELS in webhooks.js or to ALLOWLIST in this test.'
      );
    }
  });
});
