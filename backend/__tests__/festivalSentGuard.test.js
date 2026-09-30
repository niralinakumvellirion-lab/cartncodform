/**
 * routes/queue.js — a 'sent' FestivalQueue document must never be edited
 * or deleted (audits/queue-detail-picker-bugs-audit.txt bug 1). Before
 * this fix, PATCH/DELETE only guarded SIBLING documents during bulk
 * group operations — the target document itself, hit directly by a
 * plain PATCH/DELETE, had no such guard, which is how a document could
 * end up 'sent' with a scheduledAt someone later edited into the future.
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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  Store.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ timezone: 'Asia/Kolkata' }) }) });
});
afterEach(() => jest.restoreAllMocks());

function patch(id, body) {
  return fetch(`${base}/api/queue/${SHOP}/festival/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function del(id) {
  return fetch(`${base}/api/queue/${SHOP}/festival/${id}`, { method: 'DELETE' });
}

describe('PATCH — a sent document is never edited', () => {
  test('scopes the update match to status != sent, so a sent doc is never matched', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.findOne.mockReturnValue({ select: () => Promise.resolve({ status: 'sent' }) });

    const res = await patch('fq1', { title: 'New title' });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/already been sent/i);
    const [matchArg] = FestivalQueue.findOneAndUpdate.mock.calls[0];
    expect(matchArg).toMatchObject({ _id: 'fq1', shopDomain: SHOP, status: { $ne: 'sent' } });
  });

  test('changing scheduledAt on a sent document is rejected the same way (the exact bug: a future date + Sent badge)', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.findOne.mockReturnValue({ select: () => Promise.resolve({ status: 'sent' }) });

    const res = await patch('fq1', { scheduledAt: '2026-10-02T09:00' });
    expect(res.status).toBe(409);
  });

  test('a genuinely missing document still returns success:true, item:null (unchanged behaviour)', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.findOne.mockReturnValue({ select: () => Promise.resolve(null) });

    const res = await patch('missing', { title: 'New title' });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, item: null });
  });

  test('a draft/approved document still edits normally', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1', status: 'approved', groupId: null });

    const res = await patch('fq1', { title: 'New title' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE — a sent document is never deleted', () => {
  test('single-id delete rejects a sent document with 409', async () => {
    FestivalQueue.findOneAndDelete.mockResolvedValue(null);
    FestivalQueue.findOne.mockReturnValue({ select: () => Promise.resolve({ status: 'sent' }) });

    const res = await del('fq1');
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/already been sent/i);
    const [matchArg] = FestivalQueue.findOneAndDelete.mock.calls[0];
    expect(matchArg).toMatchObject({ _id: 'fq1', shopDomain: SHOP, status: { $ne: 'sent' } });
  });

  test('deleting an already-gone document still returns success:true (unchanged, idempotent)', async () => {
    FestivalQueue.findOneAndDelete.mockResolvedValue(null);
    FestivalQueue.findOne.mockReturnValue({ select: () => Promise.resolve(null) });

    const res = await del('missing');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true });
  });

  test('deleting a draft/approved document still succeeds normally', async () => {
    FestivalQueue.findOneAndDelete.mockResolvedValue({ _id: 'fq1', status: 'draft' });

    const res = await del('fq1');
    expect(res.status).toBe(200);
  });
});
