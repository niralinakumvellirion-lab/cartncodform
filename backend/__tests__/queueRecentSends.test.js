/**
 * routes/queue.js — GET /:shop/recent-sends
 * Verifies: festival rows come from FestivalQueue (one per broadcast,
 * recipientCount from stored field — no ScheduledJob.aggregate), brain/auto
 * rows come from ScheduledJob with festivalQueueId=null and a real
 * signalType, both sources are merged and sorted by sentAt DESC, and manual
 * rows (signalType='manual') are excluded.
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
jest.mock('../models/FestivalQueue');
jest.mock('../models/Profile');
jest.mock('../models/Store');
jest.mock('../models/CustomerPushSubscription');

const express = require('express');
const ScheduledJob = require('../models/ScheduledJob');
const FestivalQueue = require('../models/FestivalQueue');
const queueRouter = require('../routes/queue');

const SHOP = 'demo.myshopify.com';
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
afterAll((done) => { server.close(done); });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function get(path, shop = SHOP) {
  return fetch(`${base}${path}`, { headers: { 'x-test-shop': shop } });
}

// Helper: mock a Mongoose chain `.sort().limit().select().lean()` → result
function mockChain(model, method, result) {
  const chain = {
    sort: () => chain,
    limit: () => chain,
    select: () => chain,
    lean: () => Promise.resolve(result),
  };
  model[method].mockReturnValue(chain);
}

describe('GET /:shop/recent-sends', () => {
  const PATH = `/api/queue/${SHOP}/recent-sends`;

  test('festival rows come from FestivalQueue — one per broadcast, recipientCount from stored field', async () => {
    mockChain(FestivalQueue, 'find', [
      { _id: 'fq1', title: 'Diwali sale', recipientCount: 342, sentAt: new Date('2026-10-01T10:00:00Z') },
    ]);
    mockChain(ScheduledJob, 'find', []);

    const res = await get(PATH);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sends).toHaveLength(1);
    expect(data.sends[0]).toMatchObject({
      kind: 'festival',
      title: 'Diwali sale',
      recipientCount: 342,
      channel: 'push',
    });
    // recipientCount is from FestivalQueue field — no aggregation
    expect(ScheduledJob.aggregate).not.toHaveBeenCalled();
  });

  test('auto rows come from ScheduledJob with festivalQueueId=null', async () => {
    mockChain(FestivalQueue, 'find', []);
    mockChain(ScheduledJob, 'find', [
      { _id: 'j1', signalType: 'cart_abandon', channel: 'push', outcome: 'delivered', sentAt: new Date('2026-10-01T09:00:00Z') },
    ]);

    const res = await get(PATH);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sends).toHaveLength(1);
    expect(data.sends[0]).toMatchObject({
      kind: 'auto',
      signalType: 'cart_abandon',
      channel: 'push',
      outcome: 'delivered',
    });

    // Verify the ScheduledJob query excludes manual and null signalTypes
    const jobQuery = ScheduledJob.find.mock.calls[0][0];
    expect(jobQuery.festivalQueueId).toBeNull();
    expect(jobQuery.signalType).toEqual({ $nin: ['manual', null] });
  });

  test('merges both sources and sorts by sentAt DESC', async () => {
    mockChain(FestivalQueue, 'find', [
      { _id: 'fq1', title: 'Holi', recipientCount: 100, sentAt: new Date('2026-09-28T12:00:00Z') },
    ]);
    mockChain(ScheduledJob, 'find', [
      { _id: 'j1', signalType: 'checkout_abandon', channel: 'push', outcome: 'delivered', sentAt: new Date('2026-09-30T08:00:00Z') },
      { _id: 'j2', signalType: 'lapsing', channel: 'email', outcome: 'delivered', sentAt: new Date('2026-09-27T06:00:00Z') },
    ]);

    const res = await get(PATH);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sends).toHaveLength(3);
    // sorted newest first
    expect(data.sends[0].signalType).toBe('checkout_abandon'); // Sep 30
    expect(data.sends[1].kind).toBe('festival');               // Sep 28
    expect(data.sends[2].signalType).toBe('lapsing');          // Sep 27
  });

  test('caps total at 6 rows', async () => {
    const festivals = Array.from({ length: 4 }, (_, i) => ({
      _id: `fq${i}`, title: `Festival ${i}`, recipientCount: 10,
      sentAt: new Date(Date.now() - i * 1000),
    }));
    const jobs = Array.from({ length: 4 }, (_, i) => ({
      _id: `j${i}`, signalType: 'cart_abandon', channel: 'push',
      outcome: 'delivered', sentAt: new Date(Date.now() - (i + 10) * 1000),
    }));
    mockChain(FestivalQueue, 'find', festivals);
    mockChain(ScheduledJob, 'find', jobs);

    const res = await get(PATH);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sends.length).toBeLessThanOrEqual(6);
  });

  test('403 when shop header does not match the URL param', async () => {
    const res = await get(`/api/queue/other.myshopify.com/recent-sends`);
    expect(res.status).toBe(403);
  });

  test('500 on DB error', async () => {
    FestivalQueue.find.mockReturnValue({
      sort: () => { throw new Error('db down'); },
    });

    const res = await get(PATH);
    expect(res.status).toBe(500);
  });
});
