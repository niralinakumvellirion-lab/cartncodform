/**
 * routes/queue.js festival POST/PATCH — the Schedule Date & Time input
 * sends a "YYYY-MM-DDTHH:mm" string with no timezone, representing the
 * STORE's wall-clock time. It must be converted to UTC using the store's
 * own IANA timezone (zonedTimeToUtc), not `new Date(str)` (which uses
 * whatever timezone the Node process itself happens to run in).
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
jest.mock('../models/Store');
jest.mock('../models/FestivalQueue');
jest.mock('../models/ScheduledJob');
jest.mock('../models/Profile');

const express = require('express');
const Store = require('../models/Store');
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

function mockStoreTimezone(tz) {
  Store.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(tz ? { timezone: tz } : null) }) });
}

function post(body) {
  return fetch(`${base}/api/queue/${SHOP}/festival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(id, body) {
  return fetch(`${base}/api/queue/${SHOP}/festival/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /:shop/festival — store-timezone-aware scheduling', () => {
  const CASES = [
    { tz: 'Asia/Kolkata', expected: '2026-09-29T14:01:00.000Z' },
    { tz: 'Asia/Kathmandu', expected: '2026-09-29T13:46:00.000Z' },
    { tz: 'UTC', expected: '2026-09-29T19:31:00.000Z' },
  ];

  test.each(CASES)('19:31 entered for a store in $tz converts to $expected UTC', async ({ tz, expected }) => {
    mockStoreTimezone(tz);
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.create.mockImplementation((fields) => Promise.resolve({ _id: 'new1', ...fields }));

    const res = await post({ title: 'T', scheduledAt: '2026-09-29T19:31' });
    const data = await res.json();

    expect(res.status).toBe(200);
    const [createArg] = FestivalQueue.create.mock.calls[0];
    expect(createArg.scheduledAt.toISOString()).toBe(expected);
  });

  test('no store timezone on file falls back to Asia/Kolkata (app default)', async () => {
    mockStoreTimezone(null);
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.create.mockImplementation((fields) => Promise.resolve({ _id: 'new1', ...fields }));

    await post({ title: 'T', scheduledAt: '2026-09-29T19:31' });

    const [createArg] = FestivalQueue.create.mock.calls[0];
    expect(createArg.scheduledAt.toISOString()).toBe('2026-09-29T14:01:00.000Z');
  });

  test('rejects a malformed scheduledAt (not "YYYY-MM-DDTHH:mm") with 400', async () => {
    mockStoreTimezone('Asia/Kolkata');

    const res = await post({ title: 'T', scheduledAt: '2026-09-29T19:31:00.000Z' });
    expect(res.status).toBe(400);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /:shop/festival/:id — store-timezone-aware scheduling', () => {
  test('19:31 entered for a Asia/Kathmandu store converts to 13:46 UTC', async () => {
    mockStoreTimezone('Asia/Kathmandu');
    FestivalQueue.findOneAndUpdate.mockImplementation((_q, update) => Promise.resolve({ _id: 'fq1', ...update.$set }));

    const res = await patch('fq1', { scheduledAt: '2026-09-29T19:31' });
    const data = await res.json();

    expect(res.status).toBe(200);
    const [, updateArg] = FestivalQueue.findOneAndUpdate.mock.calls[0];
    expect(updateArg.$set.scheduledAt.toISOString()).toBe('2026-09-29T13:46:00.000Z');
  });

  test('rejects a malformed scheduledAt with 400 and does not touch other fields', async () => {
    mockStoreTimezone('Asia/Kolkata');

    const res = await patch('fq1', { title: 'New title', scheduledAt: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
