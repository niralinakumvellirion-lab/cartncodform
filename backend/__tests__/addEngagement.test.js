/**
 * Tests for the "Add Engagement" feature:
 *   - POST /:shop/festival channel validation (push/email/whatsapp)
 *   - Past-date rejection
 *   - Bad/foreign templateId rejected
 *   - Defaults to draft
 *   - recent-sends reports real channel
 *   - processFestivalQueue: old rows (no channel) still processed as push
 *   - processFestivalQueue: skips whatsapp items
 *   - processFestivalQueue: sends an approved due email once (not twice)
 *   - processFestivalQueue: failed email increments failedAttempts
 */

// ─── Route tests (POST /festival) ─────────────────────────────────────────────

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => {
    req.shopDomain = req.headers['x-test-shop'] || 'demo.myshopify.com';
    next();
  },
  requireStoreOwner: (req, res, next) => {
    if (req.shopDomain !== req.params.shopDomain) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    req.store = { shopDomain: req.shopDomain };
    next();
  },
}));
jest.mock('../models/Store');
jest.mock('../models/FestivalQueue');
jest.mock('../models/ScheduledJob');
jest.mock('../models/Profile');
jest.mock('../models/CustomerPushSubscription');
jest.mock('../models/EmailTemplate');

const express = require('express');
const Store = require('../models/Store');
const FestivalQueue = require('../models/FestivalQueue');
const EmailTemplate = require('../models/EmailTemplate');
const queueRouter = require('../routes/queue');

const SHOP = 'demo.myshopify.com';
const FUTURE = '2099-12-25T10:00';
let server;
let base;

// A scheduledAt in the future. resolveScheduledAt will ask Store for timezone
// on the local "YYYY-MM-DDTHH:mm" shape, then compare to today start.
// We want today start < future date, so use a far-future date.

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/queue', queueRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});
afterAll((done) => { server.close(done); });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // Default store timezone mock for all POST tests.
  Store.findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ timezone: 'Asia/Kolkata' }) }),
  });
});
afterEach(() => jest.restoreAllMocks());

function post(body, shop = SHOP) {
  return fetch(`${base}/api/queue/${shop}/festival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-shop': shop },
    body: JSON.stringify(body),
  });
}

// ─── POST channel validation ───────────────────────────────────────────────

describe('POST /:shop/festival — channel validation', () => {

  beforeEach(() => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.create.mockImplementation((f) => Promise.resolve({ _id: 'new1', ...f }));
  });

  test('push channel: valid title+body+scheduledAt → 200, stored with channel=push', async () => {
    const res = await post({ channel: 'push', title: 'Flash sale', body: 'Hurry!', scheduledAt: FUTURE });
    expect(res.status).toBe(200);
    const [fields] = FestivalQueue.create.mock.calls[0];
    expect(fields.channel).toBe('push');
  });

  test('push channel: title > 50 chars → 400', async () => {
    const res = await post({ channel: 'push', title: 'A'.repeat(51), body: 'x', scheduledAt: FUTURE });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/50/);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });

  test('push channel: body > 120 chars → 400', async () => {
    const res = await post({ channel: 'push', title: 'T', body: 'B'.repeat(121), scheduledAt: FUTURE });
    expect(res.status).toBe(400);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });

  test('email channel: valid templateId+subject → 200, stored with channel=email and templateId', async () => {
    EmailTemplate.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ _id: 'tpl1' }) }) });
    const res = await post({ channel: 'email', templateId: 'tpl1', subject: 'Hello', scheduledAt: FUTURE });
    expect(res.status).toBe(200);
    const [fields] = FestivalQueue.create.mock.calls[0];
    expect(fields.channel).toBe('email');
    expect(String(fields.templateId)).toBe('tpl1');
    expect(fields.subject).toBe('Hello');
  });

  test('email channel: missing templateId → 400', async () => {
    const res = await post({ channel: 'email', subject: 'Hello', scheduledAt: FUTURE });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/templateId/);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });

  test('email channel: missing subject → 400', async () => {
    const res = await post({ channel: 'email', templateId: 'tpl1', scheduledAt: FUTURE });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/subject/);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });

  test('email channel: templateId not found for this shop → 400', async () => {
    EmailTemplate.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    const res = await post({ channel: 'email', templateId: 'foreign', subject: 'Hi', scheduledAt: FUTURE });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/templateId not found/);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });

  test('whatsapp channel: valid body → 200, stored with channel=whatsapp, title defaults', async () => {
    const res = await post({ channel: 'whatsapp', body: 'Check out our Diwali sale!', scheduledAt: FUTURE });
    expect(res.status).toBe(200);
    const [fields] = FestivalQueue.create.mock.calls[0];
    expect(fields.channel).toBe('whatsapp');
    expect(fields.title).toBe('WhatsApp message');
  });

  test('whatsapp channel: body > 300 chars → 400', async () => {
    const res = await post({ channel: 'whatsapp', body: 'B'.repeat(301), scheduledAt: FUTURE });
    expect(res.status).toBe(400);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });

  test('whatsapp channel: missing body → 400', async () => {
    const res = await post({ channel: 'whatsapp', scheduledAt: FUTURE });
    expect(res.status).toBe(400);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });

  test('invalid channel value → 400', async () => {
    const res = await post({ channel: 'sms', title: 'T', scheduledAt: FUTURE });
    expect(res.status).toBe(400);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });

  test('no channel field defaults to push and saves correctly', async () => {
    const res = await post({ title: 'T', body: 'B', scheduledAt: FUTURE });
    expect(res.status).toBe(200);
    const [fields] = FestivalQueue.create.mock.calls[0];
    expect(fields.channel).toBe('push');
  });

  test('defaults to status=draft when no status provided', async () => {
    const res = await post({ channel: 'push', title: 'T', body: 'B', scheduledAt: FUTURE });
    expect(res.status).toBe(200);
    const [fields] = FestivalQueue.create.mock.calls[0];
    expect(fields.status).toBe('draft');
  });
});

// ─── Past-date rejection ───────────────────────────────────────────────────

describe('POST /:shop/festival — past-date rejection', () => {
  test('scheduledAt before today → 400', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.create.mockResolvedValue({ _id: 'x' });
    // 2020 is definitely in the past.
    const res = await post({ channel: 'push', title: 'T', body: 'B', scheduledAt: '2020-01-01T10:00' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/before today/);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });
});

// ─── recent-sends reports real channel ────────────────────────────────────

describe('GET /:shop/recent-sends — real channel from FestivalQueue', () => {
  function mockChain(model, method, result) {
    const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean: () => Promise.resolve(result) };
    model[method].mockReturnValue(chain);
  }

  const ScheduledJob = require('../models/ScheduledJob');

  test('email festival item reports channel=email, not push', async () => {
    mockChain(FestivalQueue, 'find', [
      { _id: 'fq1', title: 'Newsletter', recipientCount: 50, sentAt: new Date(), channel: 'email' },
    ]);
    mockChain(ScheduledJob, 'find', []);

    const res = await fetch(`${base}/api/queue/${SHOP}/recent-sends`, {
      headers: { 'x-test-shop': SHOP },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.sends[0].channel).toBe('email');
  });

  test('push festival item (no channel field) falls back to push', async () => {
    mockChain(FestivalQueue, 'find', [
      { _id: 'fq2', title: 'Diwali', recipientCount: 200, sentAt: new Date() },
    ]);
    mockChain(ScheduledJob, 'find', []);

    const res = await fetch(`${base}/api/queue/${SHOP}/recent-sends`, {
      headers: { 'x-test-shop': SHOP },
    });
    const data = await res.json();
    expect(data.sends[0].channel).toBe('push');
  });
});

// ─── processFestivalQueue poller tests ────────────────────────────────────

// Poller tests require loading server.js with all its heavy deps mocked.
// The require.main guard prevents server start.

describe('processFestivalQueue poller', () => {
  let _processFestivalQueue;
  let mockFestivalQueue;
  let mockSendPush;
  let mockSendEmailBroadcast;
  let mockLogBroadcastSend;

  beforeAll(() => {
    jest.resetModules();

    jest.mock('dotenv', () => ({ config: jest.fn() }));
    jest.mock('../config/db', () => jest.fn().mockResolvedValue(undefined));
    jest.mock('../routes/auth', () => jest.fn());
    jest.mock('../routes/webhooks', () => jest.fn());
    jest.mock('../routes/stores', () => jest.fn());
    jest.mock('../routes/cod', () => jest.fn());
    jest.mock('../routes/push', () => {
      const fn = jest.fn();
      fn.uploadToCloudinary = jest.fn().mockResolvedValue('https://cdn/img.jpg');
      return fn;
    });
    jest.mock('../routes/proxy', () => jest.fn());
    jest.mock('../routes/discounts', () => jest.fn());
    jest.mock('../routes/events', () => jest.fn());
    jest.mock('../routes/attribution', () => jest.fn());
    jest.mock('../routes/profiles', () => jest.fn());
    jest.mock('../routes/activity', () => jest.fn());
    jest.mock('../routes/queue', () => jest.fn());
    jest.mock('../routes/automation', () => jest.fn());
    jest.mock('../routes/emailTemplates', () => jest.fn());

    jest.mock('../models/FestivalQueue');
    jest.mock('../models/ScheduledJob');
    jest.mock('../models/Store');
    jest.mock('../models/Profile');
    jest.mock('../models/AbandonedCustomer');
    jest.mock('../models/CustomerPushSubscription');
    jest.mock('../models/AutomationConfig');

    jest.mock('../utils/pushNotification', () => ({
      sendPushToCustomers: jest.fn(),
      buildClickUrl: jest.fn().mockReturnValue('https://shop.myshopify.com'),
    }));
    jest.mock('../utils/email', () => ({
      sendAbandonedCartEmail: jest.fn(),
      sendMarketingEmail: jest.fn(),
    }));
    jest.mock('../utils/emailBroadcast', () => ({
      sendEmailBroadcast: jest.fn(),
    }));
    jest.mock('../services/aiService', () => ({
      generateCopy: jest.fn(),
      generateEmailCopy: jest.fn(),
    }));
    jest.mock('../services/pushHygiene', () => ({
      checkUnopenedThreshold: jest.fn().mockResolvedValue(undefined),
      updateDeliveredRate: jest.fn().mockResolvedValue(undefined),
    }));
    jest.mock('../services/signalEngine', () => ({ runNightlySignals: jest.fn() }));
    jest.mock('../services/brain', () => ({ runBrainForShop: jest.fn() }));
    jest.mock('../services/weightsService', () => ({ computeWeights: jest.fn() }));
    jest.mock('../services/sendLogService', () => ({ logBroadcastSend: jest.fn() }));
    jest.mock('../utils/timezone', () => ({
      isQuietNow: jest.fn().mockReturnValue(false),
      zonedTimeToUtc: jest.fn(),
      resolveTz: jest.fn(),
    }));

    mockFestivalQueue = require('../models/FestivalQueue');
    mockSendPush = require('../utils/pushNotification').sendPushToCustomers;
    mockSendEmailBroadcast = require('../utils/emailBroadcast').sendEmailBroadcast;
    mockLogBroadcastSend = require('../services/sendLogService').logBroadcastSend;

    ({ _processFestivalQueue } = require('../server'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockFestivalQueue.findByIdAndUpdate.mockResolvedValue({});
    // Default: claim succeeds (returns truthy) so each item proceeds as normal.
    mockFestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'claimed' });
  });

  afterEach(() => jest.restoreAllMocks());

  // Helper to set up FestivalQueue.find mock with a limit chain.
  function mockFindItems(items) {
    mockFestivalQueue.find.mockReturnValue({ limit: () => Promise.resolve(items) });
  }

  test('old row with no channel field is processed as push', async () => {
    const item = { _id: 'fq1', shopDomain: 'demo.myshopify.com', title: 'T', body: 'B',
      mobileImageUrl: '', desktopImageUrl: '', targetType: 'home', productHandle: '',
      failedAttempts: 0 };
    mockFindItems([item]);
    mockSendPush.mockResolvedValue({ success: true, sent: 10, recipients: [] });
    mockLogBroadcastSend.mockResolvedValue({});

    await _processFestivalQueue();

    expect(mockSendPush).toHaveBeenCalled();
    expect(mockSendEmailBroadcast).not.toHaveBeenCalled();
    expect(mockFestivalQueue.findByIdAndUpdate).toHaveBeenCalledWith(
      'fq1',
      expect.objectContaining({ status: 'sent' })
    );
  });

  test('whatsapp item is skipped — no send, no status change', async () => {
    const item = { _id: 'fq2', shopDomain: 'demo.myshopify.com', channel: 'whatsapp',
      title: 'WA', body: 'Hello', targetType: 'home', failedAttempts: 0 };
    mockFindItems([item]);

    await _processFestivalQueue();

    // FestivalQueue.find filters out whatsapp — item not in dueItems list.
    // If somehow it were in the list, neither send nor status update would fire.
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockSendEmailBroadcast).not.toHaveBeenCalled();
    expect(mockFestivalQueue.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('approved due email item is sent via sendEmailBroadcast and marked sent', async () => {
    const item = { _id: 'fq3', shopDomain: 'demo.myshopify.com', channel: 'email',
      templateId: 'tpl1', subject: 'Summer sale', title: 'Campaign', failedAttempts: 0 };
    mockFindItems([item]);
    mockSendEmailBroadcast.mockResolvedValue({ sent: 25, failed: 0, total: 25 });

    await _processFestivalQueue();

    expect(mockSendEmailBroadcast).toHaveBeenCalledWith(expect.objectContaining({
      shopDomain: 'demo.myshopify.com',
      templateId: 'tpl1',
      subject: 'Summer sale',
      logOrigin: 'scheduled',
      festivalQueueId: 'fq3',
    }));
    expect(mockFestivalQueue.findByIdAndUpdate).toHaveBeenCalledWith(
      'fq3',
      expect.objectContaining({ status: 'sent', recipientCount: 25 })
    );
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test('approved due email item is NOT sent twice (poller runs once, item becomes sent)', async () => {
    // Simulate the item only appearing once in the query (already status=sent after first run).
    const item = { _id: 'fq4', shopDomain: 'demo.myshopify.com', channel: 'email',
      templateId: 'tpl1', subject: 'S', title: 'T', failedAttempts: 0 };
    mockFindItems([item]);
    mockSendEmailBroadcast.mockResolvedValue({ sent: 5, failed: 0, total: 5 });

    await _processFestivalQueue();

    // Only one broadcast call — the item is then marked 'sent' so the next
    // tick won't include it (the query filters status='approved').
    expect(mockSendEmailBroadcast).toHaveBeenCalledTimes(1);
    expect(mockFestivalQueue.findByIdAndUpdate).toHaveBeenCalledWith(
      'fq4', expect.objectContaining({ status: 'sent' })
    );
  });

  test('failed email increments failedAttempts and leaves status approved', async () => {
    const item = { _id: 'fq5', shopDomain: 'demo.myshopify.com', channel: 'email',
      templateId: 'tpl1', subject: 'S', title: 'T', failedAttempts: 0 };
    mockFindItems([item]);
    mockSendEmailBroadcast.mockResolvedValue({ sent: 0, failed: 0, total: 0, error: 'Resend down' });

    await _processFestivalQueue();

    expect(mockFestivalQueue.findByIdAndUpdate).toHaveBeenCalledWith(
      'fq5',
      expect.objectContaining({ $set: { failedAttempts: 1 } })
    );
    // status NOT set to 'sent' or 'cancelled' on first failure
    const calls = mockFestivalQueue.findByIdAndUpdate.mock.calls;
    expect(calls[0][1]).not.toHaveProperty('status');
  });

  test('email item with no templateId is cancelled immediately', async () => {
    const item = { _id: 'fq6', shopDomain: 'demo.myshopify.com', channel: 'email',
      templateId: null, title: 'T', failedAttempts: 0 };
    mockFindItems([item]);

    await _processFestivalQueue();

    expect(mockSendEmailBroadcast).not.toHaveBeenCalled();
    expect(mockFestivalQueue.findByIdAndUpdate).toHaveBeenCalledWith(
      'fq6', { status: 'cancelled' }
    );
  });

  test('two concurrent poller ticks send email only once (atomic claim guard)', async () => {
    const item = { _id: 'fq-claim', shopDomain: 'demo.myshopify.com', channel: 'email',
      templateId: 'tpl1', subject: 'S', title: 'T',
      status: 'approved', scheduledAt: new Date(Date.now() - 1000), failedAttempts: 0 };
    mockFindItems([item]);
    mockSendEmailBroadcast.mockResolvedValue({ sent: 5, failed: 0, total: 5 });

    // First findOneAndUpdate (the claim) returns the item for tick 1, null for tick 2.
    let claimCalls = 0;
    mockFestivalQueue.findOneAndUpdate.mockImplementation(() => {
      claimCalls++;
      return Promise.resolve(claimCalls === 1 ? item : null);
    });

    await Promise.all([_processFestivalQueue(), _processFestivalQueue()]);

    expect(mockSendEmailBroadcast).toHaveBeenCalledTimes(1);
  });
});
