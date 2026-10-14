/**
 * PATCH /:shop/festival/:id — drag-and-drop rescheduling guards.
 *
 * Covers the pre-fetch (status, sendClaimedAt), past-date/time check, festival
 * collision check, and race-condition path added in the drag-reschedule task.
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
jest.mock('../models/EmailTemplate');

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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  Store.findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ timezone: 'Asia/Kolkata' }) }),
  });
});
afterEach(() => jest.restoreAllMocks());

function patch(id, body) {
  return fetch(`${base}/api/queue/${SHOP}/festival/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Pre-fetch mock: returns a draft item with no festival and no claim.
// festival: '' means collision check is skipped (only runs when festival is truthy).
function mockPrefetch({ status = 'draft', sendClaimedAt = null, festival = '' } = {}) {
  FestivalQueue.findOne.mockReturnValueOnce({
    select: () => Promise.resolve({ _id: 'fq1', status, sendClaimedAt, festival, scheduledAt: new Date() }),
  });
}

// ------ Pre-fetch guards ------

test('draft item can be moved — returns 200', async () => {
  mockPrefetch({ status: 'draft' });
  FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1', status: 'draft', groupId: null });

  const res = await patch('fq1', { scheduledAt: '2026-12-10T09:00' });
  expect(res.status).toBe(200);
});

test('approved item can be moved — returns 200', async () => {
  mockPrefetch({ status: 'approved' });
  FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1', status: 'approved', groupId: null });

  const res = await patch('fq1', { scheduledAt: '2026-12-10T09:00' });
  expect(res.status).toBe(200);
});

test('sent item is rejected with 409 before reaching findOneAndUpdate', async () => {
  mockPrefetch({ status: 'sent' });

  const res = await patch('fq1', { scheduledAt: '2026-12-10T09:00' });
  const data = await res.json();

  expect(res.status).toBe(409);
  expect(data.error).toMatch(/already been sent/i);
  expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
});

test('cancelled item is rejected with 409', async () => {
  mockPrefetch({ status: 'cancelled' });

  const res = await patch('fq1', { scheduledAt: '2026-12-10T09:00' });
  const data = await res.json();

  expect(res.status).toBe(409);
  expect(data.error).toMatch(/cancelled/i);
  expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
});

test('claimed item (sendClaimedAt set) is rejected with 409', async () => {
  mockPrefetch({ status: 'draft', sendClaimedAt: new Date() });

  const res = await patch('fq1', { scheduledAt: '2026-12-10T09:00' });
  const data = await res.json();

  expect(res.status).toBe(409);
  expect(data.error).toMatch(/currently being sent/i);
  expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
});

test("another shop's item (not found) returns 404", async () => {
  FestivalQueue.findOne.mockReturnValueOnce({ select: () => Promise.resolve(null) });

  const res = await patch('fq1', { scheduledAt: '2026-12-10T09:00' });
  const data = await res.json();

  expect(res.status).toBe(404);
  expect(data.error).toMatch(/not found/i);
});

// ------ Past-date / past-time checks ------

test('YYYY-MM-DDTHH:mm in the past (before today) returns 400', async () => {
  mockPrefetch();

  const res = await patch('fq1', { scheduledAt: '2020-01-01T09:00' });
  const data = await res.json();

  expect(res.status).toBe(400);
  expect(data.error).toMatch(/before today/i);
  expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
});

test('ISO string in the past is NOT rejected (date field unchanged — edit modal path)', async () => {
  // ISO string bypasses the past-date check: it means the merchant did not
  // touch the date input and Save is just resending the stored value.
  mockPrefetch();
  FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1', status: 'draft', groupId: null });

  const res = await patch('fq1', { scheduledAt: '2020-01-01T09:00:00.000Z' });
  expect(res.status).toBe(200);
});

test('future YYYY-MM-DDTHH:mm is accepted', async () => {
  mockPrefetch();
  FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1', status: 'draft', groupId: null });

  const res = await patch('fq1', { scheduledAt: '2026-12-31T23:59' });
  expect(res.status).toBe(200);
});

test('time of day is preserved: 19:31 IST on a different date converts to 14:01 UTC', async () => {
  mockPrefetch();
  FestivalQueue.findOneAndUpdate.mockImplementation((_q, update) =>
    Promise.resolve({ _id: 'fq1', ...update.$set })
  );

  const res = await patch('fq1', { scheduledAt: '2026-12-20T19:31' });
  const data = await res.json();

  expect(res.status).toBe(200);
  const [, updateArg] = FestivalQueue.findOneAndUpdate.mock.calls[0];
  expect(updateArg.$set.scheduledAt.toISOString()).toBe('2026-12-20T14:01:00.000Z');
});

// ------ Festival collision ------

test('moving a festival item to a date with an existing same-festival item returns 409', async () => {
  FestivalQueue.findOne
    // Pre-fetch: festival item
    .mockReturnValueOnce({
      select: () => Promise.resolve({ _id: 'fq1', status: 'draft', sendClaimedAt: null, festival: 'Diwali', scheduledAt: new Date() }),
    })
    // Collision check: another Diwali item exists on that date
    .mockResolvedValueOnce({ _id: 'fq2', festival: 'Diwali' });

  const res = await patch('fq1', { scheduledAt: '2026-12-10T09:00' });
  const data = await res.json();

  expect(res.status).toBe(409);
  expect(data.error).toMatch(/Diwali/);
  expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
});

test('moving a festival item to a different date with no collision succeeds', async () => {
  FestivalQueue.findOne
    // Pre-fetch
    .mockReturnValueOnce({
      select: () => Promise.resolve({ _id: 'fq1', status: 'draft', sendClaimedAt: null, festival: 'Diwali', scheduledAt: new Date() }),
    })
    // Collision check: no existing item
    .mockResolvedValueOnce(null);

  FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1', status: 'draft', groupId: null });

  const res = await patch('fq1', { scheduledAt: '2026-12-10T09:00' });
  expect(res.status).toBe(200);
});

test('moving a non-festival item (empty festival) skips collision check', async () => {
  mockPrefetch({ festival: '' }); // pre-fetch with no festival
  FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1', status: 'draft', groupId: null });

  await patch('fq1', { scheduledAt: '2026-12-10T09:00' });

  // findOne called exactly once (pre-fetch only; no collision check)
  expect(FestivalQueue.findOne).toHaveBeenCalledTimes(1);
});

// ------ Race condition ------

test('race condition (status changed between pre-fetch and update) returns 409', async () => {
  mockPrefetch({ status: 'draft' });
  // findOneAndUpdate returns null — means status changed concurrently
  FestivalQueue.findOneAndUpdate.mockResolvedValue(null);

  const res = await patch('fq1', { scheduledAt: '2026-12-10T09:00' });
  const data = await res.json();

  expect(res.status).toBe(409);
  expect(data.error).toMatch(/concurrently/i);
});
