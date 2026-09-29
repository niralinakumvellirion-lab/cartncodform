/**
 * routes/queue.js — multi-date festival scheduling (audits/
 * multi-date-festival-audit.txt design (a): one FestivalQueue document
 * per date, linked by a shared groupId). Covers the fixed per-date
 * dedupe, array-shaped scheduledAt creation, bulk edit propagation
 * (content-only, 'sent' documents skipped), group delete, and that a
 * single-date POST is byte-for-byte unchanged from before this task.
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
function del(id, query = '') {
  return fetch(`${base}/api/queue/${SHOP}/festival/${id}${query}`, { method: 'DELETE' });
}

describe('single-date POST — unchanged behaviour', () => {
  test('creates a document exactly as before (no array, no groupId)', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.create.mockImplementation((fields) => Promise.resolve({ _id: 'fq1', ...fields }));

    const res = await post({ title: 'Diwali Sale', scheduledAt: '2026-11-08T09:00', festival: 'Diwali', status: 'approved' });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, id: 'fq1' });
    const [createArg] = FestivalQueue.create.mock.calls[0];
    expect(createArg.scheduledAt.toISOString()).toBe('2026-11-08T03:30:00.000Z');
    expect(createArg.groupId).toBeUndefined();
  });

  test('a repeat submission for the SAME festival and SAME date updates in place (idempotent)', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1' });

    const res = await post({ title: 'Diwali Sale', scheduledAt: '2026-11-08T09:00', festival: 'Diwali', status: 'approved' });

    expect(res.status).toBe(200);
    expect(FestivalQueue.create).not.toHaveBeenCalled();
    const [matchArg] = FestivalQueue.findOneAndUpdate.mock.calls[0];
    expect(matchArg).toMatchObject({
      shopDomain: SHOP,
      festival: 'Diwali',
      status: { $in: ['draft', 'approved'] },
    });
    expect(matchArg.scheduledAt.toISOString()).toBe('2026-11-08T03:30:00.000Z');
  });
});

describe('the exact bug the audit found — two dates for one festival', () => {
  test('two Approve submissions for different dates create TWO documents, not one overwritten', async () => {
    // First date: no existing draft/approved doc for (festival, THAT date) -> create.
    FestivalQueue.findOneAndUpdate.mockResolvedValueOnce(null);
    FestivalQueue.create.mockResolvedValueOnce({ _id: 'fq1', scheduledAt: new Date('2026-11-08T03:30:00.000Z') });
    const res1 = await post({ title: 'Diwali Sale', scheduledAt: '2026-11-08T09:00', festival: 'Diwali', status: 'approved' });
    expect(res1.status).toBe(200);

    // Second date: the match is scoped to THIS date too, so the (different)
    // first document is never found or touched — the old bug matched on
    // shopDomain+festival+status alone and would have overwritten fq1 here.
    FestivalQueue.findOneAndUpdate.mockResolvedValueOnce(null);
    FestivalQueue.create.mockResolvedValueOnce({ _id: 'fq2', scheduledAt: new Date('2026-11-10T03:30:00.000Z') });
    const res2 = await post({ title: 'Diwali Sale', scheduledAt: '2026-11-10T09:00', festival: 'Diwali', status: 'approved' });
    expect(res2.status).toBe(200);

    expect(FestivalQueue.create).toHaveBeenCalledTimes(2);
    const [match1] = FestivalQueue.findOneAndUpdate.mock.calls[0];
    const [match2] = FestivalQueue.findOneAndUpdate.mock.calls[1];
    expect(match1.scheduledAt.toISOString()).toBe('2026-11-08T03:30:00.000Z');
    expect(match2.scheduledAt.toISOString()).toBe('2026-11-10T03:30:00.000Z');
    expect(match1.scheduledAt.getTime()).not.toBe(match2.scheduledAt.getTime());
  });
});

describe('array scheduledAt — multi-date creation', () => {
  test('creates one document per date, all sharing one new groupId', async () => {
    FestivalQueue.insertMany.mockImplementation((docs) =>
      Promise.resolve(docs.map((d, i) => ({ _id: `fq${i + 1}`, ...d })))
    );

    const res = await post({
      title: 'Festival Sale',
      scheduledAt: ['2026-10-02T09:00', '2026-10-05T09:00', '2026-10-08T09:00'],
      festival: 'Navratri',
      status: 'approved',
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.items).toHaveLength(3);
    expect(data.groupId).toBeDefined();

    const [docs] = FestivalQueue.insertMany.mock.calls[0];
    expect(docs).toHaveLength(3);
    const ids = new Set(docs.map((d) => String(d.groupId)));
    expect(ids.size).toBe(1); // every doc shares the same groupId
    expect(docs.map((d) => d.scheduledAt.toISOString())).toEqual([
      '2026-10-02T03:30:00.000Z',
      '2026-10-05T03:30:00.000Z',
      '2026-10-08T03:30:00.000Z',
    ]);
    expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled(); // array path never dedupes
  });

  test('rejects an empty array with 400', async () => {
    const res = await post({ title: 'T', scheduledAt: [], festival: 'X' });
    expect(res.status).toBe(400);
    expect(FestivalQueue.insertMany).not.toHaveBeenCalled();
  });

  test('rejects the whole request with 400 if any one entry is malformed (no partial creation)', async () => {
    const res = await post({
      title: 'T',
      scheduledAt: ['2026-10-02T09:00', 'not-a-date'],
      festival: 'X',
    });
    expect(res.status).toBe(400);
    expect(FestivalQueue.insertMany).not.toHaveBeenCalled();
  });
});

describe('bulk edit — applyToGroup', () => {
  test('propagates content fields to sibling draft/approved documents, never scheduledAt/status, never sent docs', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue({
      _id: 'fq1', groupId: 'g1', title: 'New title', status: 'approved',
    });
    FestivalQueue.updateMany.mockResolvedValue({ modifiedCount: 2 });
    FestivalQueue.find.mockReturnValue({
      sort: () => ({ lean: () => Promise.resolve([{ _id: 'fq1' }, { _id: 'fq2' }, { _id: 'fq3' }]) }),
    });

    const res = await patch('fq1', {
      title: 'New title', scheduledAt: '2026-10-02T09:00', applyToGroup: true,
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.groupItems).toHaveLength(3);

    const [matchArg, updateArg] = FestivalQueue.updateMany.mock.calls[0];
    expect(matchArg).toEqual({
      groupId: 'g1',
      _id: { $ne: 'fq1' },
      status: { $in: ['draft', 'approved'] },
    });
    expect(updateArg.$set).toEqual({ title: 'New title' }); // scheduledAt excluded
    expect(updateArg.$set.status).toBeUndefined();
    expect(updateArg.$set.scheduledAt).toBeUndefined();
  });

  test('without applyToGroup, only the target document is updated (default, unchanged behaviour)', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1', groupId: 'g1' });

    const res = await patch('fq1', { title: 'New title' });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.groupItems).toBeUndefined();
    expect(FestivalQueue.updateMany).not.toHaveBeenCalled();
  });

  test('applyToGroup on an ungrouped item (no groupId) is a no-op beyond the single update', async () => {
    FestivalQueue.findOneAndUpdate.mockResolvedValue({ _id: 'fq1', groupId: null });

    const res = await patch('fq1', { title: 'New title', applyToGroup: true });

    expect(res.status).toBe(200);
    expect(FestivalQueue.updateMany).not.toHaveBeenCalled();
  });
});

describe('group delete', () => {
  test('?group=true deletes sibling draft/approved documents, guarded the same way as bulk edit', async () => {
    FestivalQueue.findOne.mockReturnValue({ select: () => Promise.resolve({ groupId: 'g1' }) });
    FestivalQueue.deleteMany.mockResolvedValue({ deletedCount: 3 });

    const res = await del('fq1', '?group=true');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, deletedCount: 3 });
    expect(FestivalQueue.deleteMany).toHaveBeenCalledWith({
      shopDomain: SHOP,
      groupId: 'g1',
      status: { $in: ['draft', 'approved'] },
    });
    expect(FestivalQueue.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('single-id delete (no ?group=true) is unchanged', async () => {
    FestivalQueue.findOneAndDelete.mockResolvedValue({ _id: 'fq1' });

    const res = await del('fq1');

    expect(res.status).toBe(200);
    expect(FestivalQueue.findOneAndDelete).toHaveBeenCalledWith({ _id: 'fq1', shopDomain: SHOP });
    expect(FestivalQueue.deleteMany).not.toHaveBeenCalled();
  });
});
