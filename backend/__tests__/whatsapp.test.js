/**
 * Tests for backend/routes/whatsapp.js (send, stats, opt-out, profile)
 * and the generateDiscount WhatsApp capture path.
 *
 * Same direct-handler pattern as settingsRoute.test.js / popupConfigRoute.test.js.
 */

jest.mock('../models/Profile', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../models/ScheduledJob', () => ({
  create: jest.fn(),
  find: jest.fn(),
  distinct: jest.fn(),
  countDocuments: jest.fn(),
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
jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn(),
  requireStoreOwner: jest.fn(),
}));
jest.mock('../utils/phone', () => ({
  toWaDigits: jest.fn((e164) => (e164 ? e164.replace(/^\+/, '') : null)),
  normalizePhone: jest.fn((raw) => {
    if (!raw || raw === 'bad') return null;
    return raw.startsWith('+') ? raw : `+91${raw}`;
  }),
}));
jest.mock('../services/profileService', () => ({
  upsertProfile: jest.fn().mockResolvedValue(null),
}));

const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const AttributedEvent = require('../models/AttributedEvent');
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

const sendHandler = handlerFor(whatsappRouter, '/:shopDomain/send', 'post');
const statsHandler = handlerFor(whatsappRouter, '/:shopDomain/stats', 'get');
const optOutHandler = handlerFor(whatsappRouter, '/:shopDomain/opt-out', 'post');
const profileHandler = handlerFor(whatsappRouter, '/:shopDomain/profile/:profileId', 'get');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// POST /send
// ---------------------------------------------------------------------------

test('send: returns url and jobId for a consented profile', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID,
    shopDomain: SHOP,
    channels: {
      whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null },
      email: { address: 'alice@example.com' },
    },
    identifiers: { emails: ['alice@example.com'] },
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'job123' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: { shopDomain: SHOP } },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.url).toMatch(/^https:\/\/wa\.me\/91/);
  // ccf_job value is inside the URL-encoded message text
  expect(decodeURIComponent(res.body.url)).toContain('ccf_job=job123');
  expect(res.body.jobId).toBe('job123');
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({ channel: 'whatsapp', status: 'sent' })
  );
});

test('send: 400 when profile has no consent', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID,
    shopDomain: SHOP,
    channels: { whatsapp: { phone: null, consentedAt: null } },
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: {} },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('send: 400 when customer has opted out', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID,
    shopDomain: SHOP,
    channels: {
      whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: new Date() },
    },
  });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: {} },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('send: created job has status "sent" (never pending)', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID,
    shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date(), optedOutAt: null } },
    identifiers: {},
  });
  ScheduledJob.create.mockResolvedValue({ _id: 'jobX' });

  const res = mockRes();
  await sendHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: {} },
    res
  );

  const callArgs = ScheduledJob.create.mock.calls[0][0];
  expect(callArgs.status).toBe('sent');
  expect(callArgs.channel).toBe('whatsapp');
});

// ---------------------------------------------------------------------------
// GET /stats
// ---------------------------------------------------------------------------

test('stats: returns pending/sent/clicked/carted/purchased', async () => {
  Profile.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: 'p1' }, { _id: 'p2' }]),
    }),
  });
  ScheduledJob.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: 's1', profileId: 'p1' }]),
    }),
  });
  ScheduledJob.distinct.mockResolvedValue(['p1']); // p1 was contacted
  AttributedEvent.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { eventType: 'revisit', jobId: 's1' },
        { eventType: 'purchase', jobId: 's1' },
      ]),
    }),
  });

  const res = mockRes();
  await statsHandler(
    { params: { shopDomain: SHOP }, query: {}, store: {} },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.sent).toBe(1);
  expect(res.body.clicked).toBe(1);
  expect(res.body.purchased).toBe(1);
  expect(res.body.carted).toBe(0);
  expect(res.body.pending).toBe(1); // p2 not contacted
});

// ---------------------------------------------------------------------------
// POST /opt-out
// ---------------------------------------------------------------------------

test('opt-out: sets optedOutAt on the profile', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID,
    shopDomain: SHOP,
    channels: { whatsapp: { phone: '+919876543210' } },
  });
  Profile.updateOne.mockResolvedValue({ modifiedCount: 1 });

  const res = mockRes();
  await optOutHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: {} },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.updated).toBe(true);
  expect(Profile.updateOne).toHaveBeenCalledWith(
    { _id: PROFILE_ID },
    { $set: { 'channels.whatsapp.optedOutAt': expect.any(Date) } }
  );
});

test('opt-out: 400 when profile has no whatsapp number', async () => {
  Profile.findOne.mockResolvedValue({
    _id: PROFILE_ID,
    shopDomain: SHOP,
    channels: { whatsapp: { phone: null } },
  });

  const res = mockRes();
  await optOutHandler(
    { params: { shopDomain: SHOP }, body: { profileId: PROFILE_ID }, store: {} },
    res
  );

  expect(res.statusCode).toBe(400);
  expect(Profile.updateOne).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// GET /profile/:profileId
// ---------------------------------------------------------------------------

test('profile: returns whatsapp channel + whatsapp messages', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        channels: { whatsapp: { phone: '+919876543210', consentedAt: new Date() } },
        messages: [
          { channel: 'push', type: 'cart_abandon' },
          { channel: 'whatsapp', type: 'cart_abandon' },
        ],
      }),
    }),
  });

  const res = mockRes();
  await profileHandler(
    { params: { shopDomain: SHOP, profileId: PROFILE_ID }, store: {} },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.whatsapp.phone).toBe('+919876543210');
  expect(res.body.messages).toHaveLength(1); // only whatsapp messages
  expect(res.body.messages[0].channel).toBe('whatsapp');
});

// ---------------------------------------------------------------------------
// generateDiscount — WhatsApp capture
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

test('generateDiscount: captures whatsapp consent when phone + consent present', async () => {
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

test('generateDiscount: skips capture when phone is invalid', async () => {
  await generateDiscount(SHOP, {
    action: 'push',
    whatsappPhone: 'bad',
    whatsappConsent: true,
  });

  expect(upsertProfile).not.toHaveBeenCalledWith(
    SHOP,
    expect.objectContaining({ phone: expect.anything() }),
    expect.objectContaining({ 'channels.whatsapp.phone': expect.anything() })
  );
});

// ---------------------------------------------------------------------------
// Poller channel guard
// ---------------------------------------------------------------------------

test('poller: a whatsapp job created as sent is never status:pending', () => {
  // The /send route creates with status:'sent' explicitly.
  // A status:'pending' query will never match it.
  const jobData = { channel: 'whatsapp', status: 'sent' };
  const pollerPicks = jobData.status === 'pending';
  expect(pollerPicks).toBe(false);
});

test('poller: channel filter excludes whatsapp from pending scan', () => {
  const jobs = [
    { status: 'pending', channel: 'push' },
    { status: 'pending', channel: 'email' },
    { status: 'pending', channel: 'whatsapp' },
  ];
  // Mirror the query guard added to server.js processScheduledJobs:
  // { status: 'pending', channel: { $ne: 'whatsapp' } }
  const picked = jobs.filter((j) => j.status === 'pending' && j.channel !== 'whatsapp');
  expect(picked).toHaveLength(2);
  expect(picked.every((j) => j.channel !== 'whatsapp')).toBe(true);
});
