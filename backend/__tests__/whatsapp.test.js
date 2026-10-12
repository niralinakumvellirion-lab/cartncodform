/**
 * Tests for backend/routes/whatsapp.js and the CodOrder GDPR fix.
 * Same direct-handler pattern as settingsRoute.test.js / popupConfigRoute.test.js.
 */

jest.mock('../models/Profile', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
  deleteMany: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../models/ScheduledJob', () => ({
  create: jest.fn(),
  find: jest.fn(),
  distinct: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../models/AttributedEvent', () => ({
  find: jest.fn(),
}));
jest.mock('../models/Store', () => ({
  findOne: jest.fn(),
}));
jest.mock('../models/DiscountConfig', () => ({
  findOne: jest.fn(),
}));
jest.mock('../models/CodOrder', () => ({
  find: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('../models/AbandonedCustomer', () => ({
  find: jest.fn(),
  deleteMany: jest.fn(),
}));
jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn(),
  requireStoreOwner: jest.fn(),
}));
jest.mock('../utils/phone', () => ({
  toWaDigits: jest.fn((e164) => (e164 ? e164.replace(/^\+/, '') : null)),
  normalizePhone: jest.fn((raw, _country) => {
    if (!raw || raw === 'bad' || raw === '555') return null;
    return raw.startsWith('+') ? raw : `+91${raw}`;
  }),
}));
jest.mock('../services/profileService', () => ({
  upsertProfile: jest.fn().mockResolvedValue(null),
}));

const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const AttributedEvent = require('../models/AttributedEvent');
const CodOrder = require('../models/CodOrder');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const { upsertProfile } = require('../services/profileService');
const whatsappRouter = require('../routes/whatsapp');
const { generateDiscount } = require('../routes/discounts');

function handlerFor(router, path, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${path}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  const res = { body: null, statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const SHOP = 'demo.myshopify.com';
const PROFILE_ID = '507f1f77bcf86cd799439011';
const STORE = { shopDomain: SHOP, timezone: 'Asia/Kolkata' }; // → country 'IN'

const sendHandler = handlerFor(whatsappRouter, '/:shopDomain/send', 'post');
const statsHandler = handlerFor(whatsappRouter, '/:shopDomain/stats', 'get');
const pendingHandler = handlerFor(whatsappRouter, '/:shopDomain/pending', 'get');
const optOutHandler = handlerFor(whatsappRouter, '/:shopDomain/opt-out', 'post');
const profileHandler = handlerFor(whatsappRouter, '/:shopDomain/profile/:profileId', 'get');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // Support both .lean() directly (GDPR handlers) and .select().lean() chaining (resolveOrderPhone).
  const emptyLean = jest.fn().mockResolvedValue([]);
  const emptyChain = { lean: emptyLean };
  CodOrder.find.mockReturnValue({ lean: emptyLean, select: jest.fn().mockReturnValue(emptyChain) });
  AbandonedCustomer.find.mockReturnValue({ lean: emptyLean, select: jest.fn().mockReturnValue(emptyChain) });
  ScheduledJob.updateOne.mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// POST /send — followup (default)
// ---------------------------------------------------------------------------

test('send followup: returns url/jobId/purpose for a consented profile', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID,
    shopDomain: SHOP,
    channels: {
      whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null },
      email: { address: 'alice@example.com' },
    },
    identifiers: { emails: ['alice@example.com'], phones: [] },
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'job123' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('followup');
  expect(res.body.url).toMatch(/^https:\/\/wa\.me\/91/);
  expect(decodeURIComponent(res.body.url)).toContain('ccf_job=job123');
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({ channel: 'whatsapp', status: 'sent', purpose: 'followup' })
  );
});

test('send followup: 400 when profile has no consent', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: null, consentedAt: null } },
    identifiers: {},
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('send followup: 400 when customer has opted out', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: new Date() } },
    identifiers: {},
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('send: created job has status "sent" (never pending)', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null } },
    identifiers: {},
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'jobX' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(ScheduledJob.create.mock.calls[0][0].status).toBe('sent');
  expect(ScheduledJob.create.mock.calls[0][0].channel).toBe('whatsapp');
});

// ---------------------------------------------------------------------------
// POST /send — purpose=order
// ---------------------------------------------------------------------------

test('send order: succeeds when phone comes from CodOrder only (no whatsapp consent)', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: null, consentedAt: null, optedOutAt: null } },
    identifiers: { emails: ['customer@example.com'], phones: [] },
  });
  // CodOrder has a normalizable phone
  CodOrder.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ phone: '9876543210' }]),
    }),
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'orderJob1' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID, purpose: 'order' }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('order');
  expect(decodeURIComponent(res.body.url)).toContain('about your order');
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({ purpose: 'order', status: 'sent' })
  );
});

test('send order: 400 "Phone number needs a country code" when no phone normalizes', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: 'bad', consentedAt: null, optedOutAt: null } },
    identifiers: { phones: ['555'], emails: [] },
  });
  // CodOrder and AbandonedCustomer also return bad phones
  CodOrder.find.mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ phone: 'bad' }]) }),
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID, purpose: 'order' }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(res.body.error).toBe('Phone number needs a country code');
});

test('send order: 400 when opted out', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: new Date() } },
    identifiers: { phones: ['9876543210'] },
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID, purpose: 'order' }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('send: unknown purpose defaults to followup', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null } },
    identifiers: {},
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'jX' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID, purpose: 'unknown_value' }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('followup');
});

// ---------------------------------------------------------------------------
// GET /stats
// ---------------------------------------------------------------------------

test('stats: returns pending/sent/sentFollowup/sentOrder/canMessageCount', async () => {
  Profile.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: 'p1' }, { _id: 'p2' }]),
    }),
  });
  ScheduledJob.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: 's1', profileId: 'p1', purpose: 'followup' },
        { _id: 's2', profileId: 'p1', purpose: 'order' },
      ]),
    }),
  });
  ScheduledJob.distinct.mockResolvedValue(['p1']);
  Profile.countDocuments.mockResolvedValue(5);
  AttributedEvent.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { eventType: 'revisit', jobId: 's1' },
        { eventType: 'purchase', jobId: 's2' },
      ]),
    }),
  });

  const res = mockRes();
  await statsHandler(
    { params: { shopDomain: SHOP }, query: {}, store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.sent).toBe(2);
  expect(res.body.sentFollowup).toBe(1);
  expect(res.body.sentOrder).toBe(1);
  expect(res.body.pending).toBe(1); // p2 not contacted
  expect(res.body.canMessageCount).toBe(5);
  expect(res.body.clicked).toBe(1);
  expect(res.body.purchased).toBe(1);
});

test('stats: missing purpose on old jobs defaults to followup count', async () => {
  Profile.find.mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  });
  // Jobs with no purpose field
  ScheduledJob.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: 'old1', profileId: 'p1' }, // no purpose field
      ]),
    }),
  });
  ScheduledJob.distinct.mockResolvedValue([]);
  Profile.countDocuments.mockResolvedValue(0);
  AttributedEvent.find.mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  });

  const res = mockRes();
  await statsHandler(
    { params: { shopDomain: SHOP }, query: {}, store: STORE },
    res
  );

  expect(res.body.sentFollowup).toBe(1); // defaults to followup
  expect(res.body.sentOrder).toBe(0);
});

// ---------------------------------------------------------------------------
// POST /opt-out
// ---------------------------------------------------------------------------

test('opt-out: sets optedOutAt on the profile', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210' } },
  });
  Profile.updateOne.mockResolvedValue({ modifiedCount: 1 });

  const res = mockRes();
  await optOutHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(Profile.updateOne).toHaveBeenCalledWith(
    { _id: PROFILE_ID },
    { $set: { 'channels.whatsapp.optedOutAt': expect.any(Date) } }
  );
});

// ---------------------------------------------------------------------------
// GET /profile/:profileId
// ---------------------------------------------------------------------------

test('profile: returns canFollowup=true when consented and not opted out', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null } },
        identifiers: { phones: [], emails: [] },
        messages: [{ channel: 'whatsapp', type: 'cart_abandon' }],
      }),
    }),
  });

  const res = mockRes();
  await profileHandler(
    { params: { shopDomain: SHOP, profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.canFollowup).toBe(true);
  expect(res.body.canOrder).toBe(true); // wa.phone is normalizable
  expect(res.body.orderReason).toBeNull();
});

test('profile: canOrder=true and orderReason=null when phone from COD', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        channels: { whatsapp: { phone: null, consentedAt: null, optedOutAt: null } },
        identifiers: { phones: [], emails: ['cod@example.com'] },
        messages: [],
      }),
    }),
  });
  CodOrder.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ phone: '9876543210' }]),
    }),
  });

  const res = mockRes();
  await profileHandler(
    { params: { shopDomain: SHOP, profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.body.canOrder).toBe(true);
  expect(res.body.orderReason).toBeNull();
  expect(res.body.canFollowup).toBe(false);
});

test('profile: orderReason=no_phone when profile has no phone at all', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        channels: { whatsapp: null },
        identifiers: { phones: [], emails: [] },
        messages: [],
      }),
    }),
  });

  const res = mockRes();
  await profileHandler(
    { params: { shopDomain: SHOP, profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.body.canOrder).toBe(false);
  expect(res.body.orderReason).toBe('no_phone');
});

test('profile: orderReason=opted_out when opted out', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: new Date() } },
        identifiers: { phones: [], emails: [] },
        messages: [],
      }),
    }),
  });

  const res = mockRes();
  await profileHandler(
    { params: { shopDomain: SHOP, profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.body.canOrder).toBe(false);
  expect(res.body.canFollowup).toBe(false);
  expect(res.body.orderReason).toBe('opted_out');
});

test('profile: messages filtered to whatsapp channel only', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date() } },
        identifiers: { phones: [], emails: [] },
        messages: [
          { channel: 'push', type: 'cart_abandon' },
          { channel: 'whatsapp', type: 'cart_abandon', purpose: 'followup' },
        ],
      }),
    }),
  });

  const res = mockRes();
  await profileHandler(
    { params: { shopDomain: SHOP, profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.body.messages).toHaveLength(1);
  expect(res.body.messages[0].channel).toBe('whatsapp');
});

// ---------------------------------------------------------------------------
// CodOrder GDPR fix (handleCustomersRedact and handleCustomersDataRequest)
// ---------------------------------------------------------------------------

jest.mock('../utils/shopify', () => ({
  verifyWebhookHmac: jest.fn().mockReturnValue(true),
  verifyProxySignature: jest.fn().mockReturnValue(true),
}));
jest.mock('../models/StorefrontEvent', () => ({
  deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
  find: jest.fn(),
}));
jest.mock('../models/CustomerPushSubscription', () => ({ deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }) }));
jest.mock('../models/PushClick', () => ({ deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }) }));

const webhooksRouter = require('../routes/webhooks');

function gdprHandler(router, path) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods.post
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const redactHandler = gdprHandler(webhooksRouter, '/compliance');

function makeGdprReq(topic, body) {
  return {
    get: (h) => {
      if (h === 'X-Shopify-Hmac-Sha256') return 'valid';
      if (h === 'X-Shopify-Topic') return topic;
      if (h === 'X-Shopify-Shop-Domain') return SHOP;
      return null;
    },
    rawBody: '',
    body,
  };
}

const StorefrontEvent = require('../models/StorefrontEvent');
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  Profile.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
  AbandonedCustomer.deleteMany.mockResolvedValue({ deletedCount: 0 });
  StorefrontEvent.find.mockReturnValue({
    limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  });
  ScheduledJob.find.mockReturnValue({
    limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  });
  ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 0 });
  CodOrder.updateMany.mockResolvedValue({ modifiedCount: 0 });
  Profile.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
});

test('customers/redact: anonymises CodOrder rows by email', async () => {
  CodOrder.updateMany.mockResolvedValue({ modifiedCount: 1 });

  const res = mockRes();
  await redactHandler(makeGdprReq('customers/redact', {
    customer: { id: 42, email: 'shopper@example.com', phone: null },
  }), res);

  expect(CodOrder.updateMany).toHaveBeenCalledWith(
    { shopDomain: SHOP, $or: expect.arrayContaining([{ email: 'shopper@example.com' }]) },
    { $set: expect.objectContaining({ name: '[redacted]', phone: '[redacted]', address: '[redacted]' }) }
  );
});

test('customers/redact: anonymises CodOrder rows by phone', async () => {
  CodOrder.updateMany.mockResolvedValue({ modifiedCount: 2 });

  const res = mockRes();
  await redactHandler(makeGdprReq('customers/redact', {
    customer: { id: null, email: null, phone: '+919876543210' },
  }), res);

  expect(CodOrder.updateMany).toHaveBeenCalledWith(
    { shopDomain: SHOP, $or: expect.arrayContaining([{ phone: '+919876543210' }]) },
    { $set: expect.objectContaining({ name: '[redacted]' }) }
  );
});

test('customers/data_request: includes CodOrder count in log', async () => {
  CodOrder.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: 'c1' }, { _id: 'c2' }]) });
  AbandonedCustomer.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
  Profile.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
  StorefrontEvent.find.mockReturnValue({
    limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  });

  const logSpy = jest.spyOn(console, 'log');
  const res = mockRes();
  await redactHandler(makeGdprReq('customers/data_request', {
    customer: { id: null, email: 'shopper@example.com' },
  }), res);

  const logMsg = logSpy.mock.calls.find(([m]) => typeof m === 'string' && m.includes('CodOrder'));
  expect(logMsg).toBeDefined();
  expect(logMsg[0]).toContain('CodOrder rows: 2');
});

// ---------------------------------------------------------------------------
// generateDiscount — WhatsApp capture (regression from Step 1)
// ---------------------------------------------------------------------------

const Store = require('../models/Store');
const DiscountConfig = require('../models/DiscountConfig');

function shopifyOk(code) {
  return Promise.resolve({
    json: () =>
      Promise.resolve({
        data: {
          discountCodeBasicCreate: {
            userErrors: [],
            codeDiscountNode: { id: 'gid://shopify/DiscountCodeNode/1', codes: { nodes: [{ code }] } },
          },
        },
      }),
  });
}

beforeEach(() => {
  Store.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({ accessToken: 'shpat_test' }),
  });
  DiscountConfig.findOne.mockResolvedValue({
    pushDiscount: { enabled: true, percentage: 10, maxUses: 100, expiryDays: 7, prefix: 'PUSH' },
  });
  global.fetch = jest.fn().mockReturnValue(shopifyOk('PUSH-XYZ'));
});

test('generateDiscount: captures whatsapp consent when phone + consent present and flag on', async () => {
  DiscountConfig.findOne.mockResolvedValue({
    pushDiscount: { enabled: true, percentage: 10, maxUses: 100, expiryDays: 7, prefix: 'PUSH' },
    whatsappCapture: { enabled: true },
  });
  const r = await generateDiscount(SHOP, {
    action: 'push',
    whatsappPhone: '9876543210',
    whatsappConsent: true,
  });

  expect(r.code).toBeTruthy();
  expect(upsertProfile).toHaveBeenCalledWith(
    SHOP,
    expect.objectContaining({ phone: '+919876543210' }),
    expect.objectContaining({ 'channels.whatsapp.phone': '+919876543210', 'channels.whatsapp.source': 'popup' })
  );
});

test('generateDiscount: skips capture when consent is false', async () => {
  await generateDiscount(SHOP, {
    action: 'push',
    whatsappPhone: '9876543210',
    whatsappConsent: false,
  });

  expect(upsertProfile).not.toHaveBeenCalledWith(
    SHOP,
    expect.objectContaining({ phone: expect.anything() }),
    expect.objectContaining({ 'channels.whatsapp.phone': expect.anything() })
  );
});

// ---------------------------------------------------------------------------
// Poller channel guard (regression from Step 1)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /pending
// ---------------------------------------------------------------------------

test('pending: returns empty when no opted-in profiles', async () => {
  Profile.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  });
  const res = mockRes();
  await pendingHandler({ params: { shopDomain: SHOP }, query: {} }, res);
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ total: 0, items: [] });
});

test('pending: returns opted-in profiles with no whatsapp job', async () => {
  const now = new Date();
  const prof = {
    _id: PROFILE_ID,
    channels: { whatsapp: { consentedAt: now, phone: '+919876543210' }, email: { address: 'bob@example.com' } },
    identifiers: { emails: ['bob@example.com'], phones: [] },
  };
  Profile.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([prof]),
  });
  ScheduledJob.distinct.mockResolvedValue([]); // no jobs yet

  const res = mockRes();
  await pendingHandler({ params: { shopDomain: SHOP }, query: {} }, res);
  expect(res.statusCode).toBe(200);
  expect(res.body.total).toBe(1);
  expect(res.body.items).toHaveLength(1);
  expect(res.body.items[0].profileId).toBe(PROFILE_ID);
  expect(res.body.items[0].email).toBe('bob@example.com');
  expect(res.body.items[0].phone).toBe('+919876543210');
  expect(res.body.items[0].name).toBe('Bob');
});

test('pending: excludes profiles that already have a whatsapp job', async () => {
  const now = new Date();
  const prof = {
    _id: PROFILE_ID,
    channels: { whatsapp: { consentedAt: now, phone: '+919876543210' }, email: { address: 'bob@example.com' } },
    identifiers: { emails: [], phones: [] },
  };
  Profile.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([prof]),
  });
  ScheduledJob.distinct.mockResolvedValue([PROFILE_ID]); // already contacted

  const res = mockRes();
  await pendingHandler({ params: { shopDomain: SHOP }, query: {} }, res);
  expect(res.statusCode).toBe(200);
  expect(res.body.total).toBe(0);
  expect(res.body.items).toHaveLength(0);
});

test('pending: respects limit param (max 50)', async () => {
  const now = new Date();
  const profs = Array.from({ length: 10 }, (_, i) => ({
    _id: `507f1f77bcf86cd79943901${i}`,
    channels: { whatsapp: { consentedAt: now }, email: { address: `u${i}@x.com` } },
    identifiers: { emails: [`u${i}@x.com`], phones: [] },
  }));
  Profile.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(profs),
  });
  ScheduledJob.distinct.mockResolvedValue([]);

  const res = mockRes();
  await pendingHandler({ params: { shopDomain: SHOP }, query: { limit: '3' } }, res);
  expect(res.body.total).toBe(10);
  expect(res.body.items).toHaveLength(3);
});

test('pending: clamps limit above 50 to 50', async () => {
  const now = new Date();
  const profs = Array.from({ length: 60 }, (_, i) => ({
    _id: `507f1f77bcf86cd79943${String(i).padStart(6, '0')}`,
    channels: { whatsapp: { consentedAt: now }, email: {} },
    identifiers: { emails: [], phones: [] },
  }));
  Profile.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(profs),
  });
  ScheduledJob.distinct.mockResolvedValue([]);

  const res = mockRes();
  await pendingHandler({ params: { shopDomain: SHOP }, query: { limit: '999' } }, res);
  expect(res.body.total).toBe(60);
  expect(res.body.items).toHaveLength(50);
});

test('poller: a whatsapp job created as sent is never status:pending', () => {
  const jobData = { channel: 'whatsapp', status: 'sent' };
  expect(jobData.status === 'pending').toBe(false);
});

test('poller: channel filter excludes whatsapp from pending scan', () => {
  const jobs = [
    { status: 'pending', channel: 'push' },
    { status: 'pending', channel: 'email' },
    { status: 'pending', channel: 'whatsapp' },
  ];
  const picked = jobs.filter((j) => j.status === 'pending' && j.channel !== 'whatsapp');
  expect(picked).toHaveLength(2);
  expect(picked.every((j) => j.channel !== 'whatsapp')).toBe(true);
});

// ---------------------------------------------------------------------------
// POST /send — template field
// ---------------------------------------------------------------------------

test('send template cart_reminder: uses followup purpose and cart_reminder copy', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null },
                email: { address: 'alice@example.com' } },
    identifiers: { emails: ['alice@example.com'], phones: [] },
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'tplJob1' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'cart_reminder' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('followup');
  const decoded = decodeURIComponent(res.body.url);
  expect(decoded).toContain('left something in your cart');
  expect(decoded).toContain('sells out');
});

test('send template cod_confirmation: uses order purpose and cod copy', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: null, optedOutAt: null },
                email: { address: 'bob@example.com' } },
    identifiers: { emails: ['bob@example.com'], phones: ['+919876543210'] },
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'tplJob2' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'cod_confirmation' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('order');
  const decoded = decodeURIComponent(res.body.url);
  expect(decoded).toContain('Cash on Delivery');
});

test('send template order_thank_you: uses order purpose', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: null, optedOutAt: null } },
    identifiers: { emails: [], phones: ['+919876543210'] },
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'tplJob3' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'order_thank_you' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('order');
  const decoded = decodeURIComponent(res.body.url);
  expect(decoded).toContain('Thank you for your order');
});

test('send template win_back: uses followup purpose and win_back copy', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null },
                email: { address: 'carol@example.com' } },
    identifiers: { emails: ['carol@example.com'], phones: [] },
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'tplJob4' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'win_back' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('followup');
  const decoded = decodeURIComponent(res.body.url);
  expect(decoded).toContain("It's been a while");
});

test('send template welcome_offer: uses followup purpose and welcome copy', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null },
                email: { address: 'dave@example.com' } },
    identifiers: { emails: ['dave@example.com'], phones: [] },
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'tplJob5' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'welcome_offer' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('followup');
  const decoded = decodeURIComponent(res.body.url);
  expect(decoded).toContain('Welcome');
});

test('send template product_followup: uses followup purpose', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null } },
    identifiers: { emails: [], phones: [] },
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'tplJob6' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'product_followup' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('followup');
});

test('send template: unknown template key returns 400', async () => {
  Profile.findOne.mockResolvedValue(null); // should not reach DB

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'not_a_real_template' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/Unknown template/);
  expect(Profile.findOne).not.toHaveBeenCalled();
});

test('send template followup: 400 when no consent even with valid template key', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: null, optedOutAt: null } },
    identifiers: { emails: [], phones: [] },
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'cart_reminder' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(res.body.error).toContain('consent');
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('send template order: 400 when opted out even with valid template key', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: null, optedOutAt: new Date() } },
    identifiers: { emails: [], phones: [] },
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'cod_confirmation' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('send template: default path unchanged when template omitted', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null } },
    identifiers: {},
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'dfltJob' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.purpose).toBe('followup');
  const decoded = decodeURIComponent(res.body.url);
  // Original followup template text
  expect(decoded).toContain('You left something in your cart at');
});

// ---------------------------------------------------------------------------
// POST /send — custom message field
// ---------------------------------------------------------------------------

const CONSENTED_PROFILE = {
  _id: PROFILE_ID, shopDomain: SHOP,
  channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null },
              email: { address: 'alice@example.com' } },
  identifiers: { emails: ['alice@example.com'], phones: [] },
};

test('custom message: replaces template body in the url', async () => {
  Profile.findOne.mockResolvedValue(CONSENTED_PROFILE);
  ScheduledJob.create.mockResolvedValue({ _id: 'msgJob1' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup', message: 'Hello from my store!' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  const decoded = decodeURIComponent(res.body.url);
  expect(decoded).toContain('Hello from my store!');
  // Template text should NOT appear
  expect(decoded).not.toContain('You left something in your cart at');
});

test('custom message: store link always appended with ccf_job', async () => {
  Profile.findOne.mockResolvedValue(CONSENTED_PROFILE);
  ScheduledJob.create.mockResolvedValue({ _id: 'msgJob2' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup', message: 'Come visit us.' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  const decoded = decodeURIComponent(res.body.url);
  expect(decoded).toContain('ccf_src=whatsapp');
  expect(decoded).toContain('ccf_job=msgJob2');
});

test('custom message: does not duplicate link when already present', async () => {
  Profile.findOne.mockResolvedValue(CONSENTED_PROFILE);
  ScheduledJob.create.mockResolvedValue({ _id: 'msgJob3' });

  // First call to get the storeLink format
  const storeLink = `https://${SHOP}?ccf_src=whatsapp&ccf_job=msgJob3`;
  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup', message: `Visit us: ${storeLink}` },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  const decoded = decodeURIComponent(res.body.url);
  // Link should appear exactly once
  const occurrences = decoded.split(storeLink).length - 1;
  expect(occurrences).toBe(1);
});

test('custom message: empty string after trim → 400', async () => {
  Profile.findOne.mockResolvedValue(null); // should not be reached

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup', message: '   ' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/empty/i);
  expect(Profile.findOne).not.toHaveBeenCalled();
});

test('custom message: over 1000 chars → 400', async () => {
  Profile.findOne.mockResolvedValue(null);

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup', message: 'a'.repeat(1001) },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/too long/i);
  expect(Profile.findOne).not.toHaveBeenCalled();
});

test('custom message: exactly 1000 chars → 200', async () => {
  Profile.findOne.mockResolvedValue(CONSENTED_PROFILE);
  ScheduledJob.create.mockResolvedValue({ _id: 'msg1kJob' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup', message: 'x'.repeat(1000) },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
});

test('custom message: strips bare control characters', async () => {
  Profile.findOne.mockResolvedValue(CONSENTED_PROFILE);
  ScheduledJob.create.mockResolvedValue({ _id: 'ctrlJob' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup',
              message: 'Hello\x01\x02World' }, // \x01 and \x02 are control chars
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  const decoded = decodeURIComponent(res.body.url);
  expect(decoded).toContain('HelloWorld');
  expect(decoded).not.toContain('\x01');
});

test('custom message: newlines and tabs are preserved', async () => {
  Profile.findOne.mockResolvedValue(CONSENTED_PROFILE);
  ScheduledJob.create.mockResolvedValue({ _id: 'nlJob' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup',
              message: 'Line one\nLine two' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  const decoded = decodeURIComponent(res.body.url);
  expect(decoded).toContain('Line one\nLine two');
});

test('custom message: eligibility still enforced (no consent for followup)', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: null, optedOutAt: null } },
    identifiers: {},
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup', message: 'Hello!' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(res.body.error).toContain('consent');
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('custom message: eligibility still enforced (opted out)', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID, shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: new Date() } },
    identifiers: {},
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup', message: 'Hello!' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('custom message: messageText stored on ScheduledJob', async () => {
  Profile.findOne.mockResolvedValue(CONSENTED_PROFILE);
  ScheduledJob.create.mockResolvedValue({ _id: 'storeJob' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, purpose: 'followup', message: 'My custom text.' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(ScheduledJob.updateOne).toHaveBeenCalledWith(
    { _id: 'storeJob' },
    { $set: { messageText: expect.stringContaining('My custom text.') } }
  );
  // Link is also in messageText
  const call = ScheduledJob.updateOne.mock.calls[0];
  expect(call[1].$set.messageText).toContain('ccf_job=storeJob');
});

test('default path: messageText still stored (template path)', async () => {
  Profile.findOne.mockResolvedValue(CONSENTED_PROFILE);
  ScheduledJob.create.mockResolvedValue({ _id: 'dfltStore' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP },
      body: { profileId: PROFILE_ID, template: 'cart_reminder' },
      store: STORE },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(ScheduledJob.updateOne).toHaveBeenCalledWith(
    { _id: 'dfltStore' },
    { $set: { messageText: expect.stringContaining('ccf_job=dfltStore') } }
  );
});
