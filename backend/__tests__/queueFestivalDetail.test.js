/**
 * routes/queue.js — festival per-recipient detail endpoints, built on top
 * of the ScheduledJob rows services/sendLogService.js now writes for
 * festival/manual broadcasts (audits/queue-notification-detail-audit.txt
 * finding #2). requireAuth/requireStoreOwner replaced with a pass-through
 * (same pattern as __tests__/optinStats.test.js); ScheduledJob/Profile/
 * FestivalQueue auto-mocked.
 */

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => {
    req.shopDomain = req.headers['x-test-shop'] || 'demo.myshopify.com';
    next();
  },
  requireStoreOwner: (req, res, next) => {
    if (req.shopDomain !== req.params.shopDomain) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }
    req.store = { shopDomain: req.shopDomain };
    next();
  },
}));
jest.mock('../models/ScheduledJob');
jest.mock('../models/Profile');
jest.mock('../models/FestivalQueue');
jest.mock('../models/CustomerPushSubscription');

const express = require('express');
const ScheduledJob = require('../models/ScheduledJob');
const Profile = require('../models/Profile');
const FestivalQueue = require('../models/FestivalQueue');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const queueRouter = require('../routes/queue');

const SHOP = 'demo.myshopify.com';
const FQ_ID = '507f1f77bcf86cd799439011';
let server;
let base;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/queue', queueRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});
afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function get(path) {
  return fetch(`${base}${path}`);
}

describe('GET /:shop/festival — list carries per-item summary, no N+1', () => {
  test('enriches each item with total/delivered/failed from ONE aggregation', async () => {
    FestivalQueue.find.mockReturnValue({
      sort: () => ({ lean: () => Promise.resolve([
        { _id: 'fq1', title: 'Diwali' },
        { _id: 'fq2', title: 'Holi' },
      ]) }),
    });
    ScheduledJob.aggregate.mockResolvedValue([
      { _id: 'fq1', total: 5, delivered: 4, failed: 1 },
    ]);

    const res = await get(`/api/queue/${SHOP}/festival`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(ScheduledJob.aggregate).toHaveBeenCalledTimes(1);
    expect(data.items).toEqual([
      { _id: 'fq1', title: 'Diwali', summary: { total: 5, delivered: 4, failed: 1 } },
      { _id: 'fq2', title: 'Holi', summary: { total: 0, delivered: 0, failed: 0 } },
    ]);
  });
});

describe('GET /:shop/festival/:id/summary', () => {
  function mockItem(fields) {
    FestivalQueue.findOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(fields) }),
    });
  }

  test('aggregates delivered/failed by channel, no preview for a sent item', async () => {
    mockItem({ status: 'sent', scheduledAt: new Date('2026-10-08T03:30:00.000Z') });
    ScheduledJob.aggregate.mockResolvedValue([
      { _id: 'push', total: 10, delivered: 8, failed: 2 },
    ]);

    const res = await get(`/api/queue/${SHOP}/festival/${FQ_ID}/summary`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toEqual({
      total: 10, delivered: 8, failed: 2,
      byChannel: { push: { total: 10, delivered: 8, failed: 2 } },
    });
    expect(data.preview).toBeNull();
    expect(CustomerPushSubscription.countDocuments).not.toHaveBeenCalled();
  });

  test('404s when the festival item does not exist for this shop', async () => {
    mockItem(null);

    const res = await get(`/api/queue/${SHOP}/festival/${FQ_ID}/summary`);
    expect(res.status).toBe(404);
  });

  test('a pending item gets a live mobile/desktop recipient preview instead', async () => {
    mockItem({ status: 'approved', scheduledAt: new Date('2026-10-08T03:30:00.000Z') });
    ScheduledJob.aggregate.mockResolvedValue([]);
    CustomerPushSubscription.countDocuments
      .mockResolvedValueOnce(3) // mobile
      .mockResolvedValueOnce(2); // desktop

    const res = await get(`/api/queue/${SHOP}/festival/${FQ_ID}/summary`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.preview).toEqual({
      mobile: 3, desktop: 2, total: 5,
      scheduledAt: '2026-10-08T03:30:00.000Z',
    });
    // Split by deviceType exactly the way a real send would target them —
    // reuses buildCustomerSubscriptionQuery from utils/pushNotification.js.
    const [mobileQuery] = CustomerPushSubscription.countDocuments.mock.calls[0];
    const [desktopQuery] = CustomerPushSubscription.countDocuments.mock.calls[1];
    expect(mobileQuery).toEqual({ shopDomain: SHOP, deviceType: { $in: ['mobile', 'unknown'] } });
    expect(desktopQuery).toEqual({ shopDomain: SHOP, deviceType: { $in: ['desktop'] } });
  });

  test('a pending item with zero subscribers previews total: 0', async () => {
    mockItem({ status: 'draft', scheduledAt: new Date('2026-10-08T03:30:00.000Z') });
    ScheduledJob.aggregate.mockResolvedValue([]);
    CustomerPushSubscription.countDocuments.mockResolvedValue(0);

    const res = await get(`/api/queue/${SHOP}/festival/${FQ_ID}/summary`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.preview).toEqual({
      mobile: 0, desktop: 0, total: 0,
      scheduledAt: '2026-10-08T03:30:00.000Z',
    });
  });
});

describe('GET /:shop/festival/:id/recipients', () => {
  function mockJobsAndCount(jobs, total = jobs.length) {
    ScheduledJob.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve(jobs) }) }) }),
    });
    ScheduledJob.countDocuments.mockResolvedValue(total);
  }

  test('masks the token to its last 8 characters and never returns the full token', async () => {
    mockJobsAndCount([
      { _id: 'j1', channel: 'push', outcome: 'delivered', sentAt: new Date(), customerId: null, cartToken: null, subscriptionToken: 'AAAAAAAAAAAAAAAAAAAAlast12345678' },
    ]);
    Profile.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });

    const res = await get(`/api/queue/${SHOP}/festival/${FQ_ID}/recipients`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.rows[0].subscriptionTokenMasked).toBe('12345678');
    expect(JSON.stringify(data)).not.toContain('AAAAAAAAAAAAAAAAAAAAlast12345678');
  });

  test('resolves email/profileId via customerId, falling back to cartToken', async () => {
    mockJobsAndCount([
      { _id: 'j1', channel: 'push', outcome: 'delivered', sentAt: new Date(), customerId: 'c1', cartToken: null, subscriptionToken: 't-aaaaaaaa' },
      { _id: 'j2', channel: 'push', outcome: 'delivered', sentAt: new Date(), customerId: null, cartToken: 'cart-2', subscriptionToken: 't-bbbbbbbb' },
      { _id: 'j3', channel: 'push', outcome: 'failed', sentAt: new Date(), customerId: null, cartToken: null, subscriptionToken: 't-cccccccc' },
    ]);
    Profile.find.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([
        { _id: 'p1', identifiers: { customerId: 'c1', cartTokens: [], emails: ['a@b.com'] }, channels: {} },
        { _id: 'p2', identifiers: { customerId: null, cartTokens: ['cart-2'], emails: [] }, channels: { email: { address: 'anon@cart.com' } } },
      ]) }),
    });

    const res = await get(`/api/queue/${SHOP}/festival/${FQ_ID}/recipients`);
    const data = await res.json();

    expect(data.rows[0]).toMatchObject({ email: 'a@b.com', profileId: 'p1' });
    expect(data.rows[1]).toMatchObject({ email: 'anon@cart.com', profileId: 'p2' });
    expect(data.rows[2]).toMatchObject({ email: null, profileId: null });
  });

  test('?outcome=failed filters the query', async () => {
    mockJobsAndCount([]);
    Profile.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });

    await get(`/api/queue/${SHOP}/festival/${FQ_ID}/recipients?outcome=failed`);

    const [matchArg] = ScheduledJob.find.mock.calls[0];
    expect(matchArg).toMatchObject({ outcome: 'failed', festivalQueueId: FQ_ID });
  });

  test('paginates via ?page=', async () => {
    mockJobsAndCount([], 45);
    Profile.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });

    const res = await get(`/api/queue/${SHOP}/festival/${FQ_ID}/recipients?page=2`);
    const data = await res.json();

    expect(data).toMatchObject({ total: 45, page: 2, limit: 20 });
  });
});

describe('GET /:shop/customer/:profileId/notifications', () => {
  test('matches brain jobs (profileId) and festival/manual jobs (customerId/cartTokens) in one query', async () => {
    Profile.findOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({
        _id: 'p1',
        identifiers: { customerId: 'c1', cartTokens: ['cart-1', 'cart-2'] },
      }) }),
    });
    ScheduledJob.find.mockReturnValue({
      sort: () => ({ limit: () => ({ select: () => ({ lean: () => Promise.resolve([
        { _id: 'j1', signalType: 'cart_abandon', channel: 'push', status: 'sent', outcome: 'clicked', sentAt: new Date(), runAt: new Date(), payload: { title: 'Come back' }, festivalQueueId: null },
        { _id: 'j2', signalType: 'festival', channel: 'push', status: 'sent', outcome: 'delivered', sentAt: new Date(), runAt: new Date(), payload: { title: 'Diwali Sale' }, festivalQueueId: FQ_ID },
      ]) }) }) }),
    });

    const res = await get(`/api/queue/${SHOP}/customer/p1/notifications`);
    const data = await res.json();

    expect(res.status).toBe(200);
    const [matchArg] = ScheduledJob.find.mock.calls[0];
    expect(matchArg.$or).toEqual([
      { profileId: 'p1' },
      { customerId: 'c1' },
      { cartToken: { $in: ['cart-1', 'cart-2'] } },
    ]);
    expect(data.notifications).toHaveLength(2);
    expect(data.notifications[1]).toMatchObject({ title: 'Diwali Sale', isFestival: true });
  });

  test('404s when the profile does not exist for this shop', async () => {
    Profile.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    const res = await get(`/api/queue/${SHOP}/customer/missing/notifications`);
    expect(res.status).toBe(404);
  });
});
