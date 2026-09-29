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

  // A full ISO string (e.g. a festival-suggestion prefill the merchant
  // never edited) is already an unambiguous instant — no store-timezone
  // conversion needed or wanted, and it must NOT be rejected.
  test('a full ISO scheduledAt passes through unchanged (not run through store-timezone conversion)', async () => {
    mockStoreTimezone('Asia/Kolkata');
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.create.mockImplementation((fields) => Promise.resolve({ _id: 'new1', ...fields }));

    const res = await post({ title: 'T', scheduledAt: '2026-09-29T19:31:00.000Z' });

    expect(res.status).toBe(200);
    const [createArg] = FestivalQueue.create.mock.calls[0];
    expect(createArg.scheduledAt.toISOString()).toBe('2026-09-29T19:31:00.000Z');
  });

  test('rejects a genuinely unparseable scheduledAt with 400', async () => {
    mockStoreTimezone('Asia/Kolkata');

    const res = await post({ title: 'T', scheduledAt: 'not-a-date' });
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

  // Regression: the Edit modal's Save button always sends `scheduledAt`,
  // even when the merchant never touched the date field — in that case
  // it's still the item's existing FULL ISO string from the database
  // (set by openEditModal, never replaced by onChange), not a freshly
  // typed local string. An earlier version of resolveScheduledAt() only
  // accepted the "YYYY-MM-DDTHH:mm" shape and silently 400'd on this
  // (commit 60c2010's regression) — this must pass straight through
  // unchanged instead, since it's already an unambiguous instant.
  test('a full ISO scheduledAt (date field untouched this edit) passes through unchanged', async () => {
    mockStoreTimezone('Asia/Kolkata');
    FestivalQueue.findOneAndUpdate.mockImplementation((_q, update) => Promise.resolve({ _id: 'fq1', ...update.$set }));

    const res = await patch('fq1', { title: 'New title', scheduledAt: '2026-09-29T14:01:00.000Z' });

    expect(res.status).toBe(200);
    const [, updateArg] = FestivalQueue.findOneAndUpdate.mock.calls[0];
    expect(updateArg.$set.scheduledAt.toISOString()).toBe('2026-09-29T14:01:00.000Z');
    expect(updateArg.$set.title).toBe('New title');
  });

  test('rejects a genuinely unparseable scheduledAt with 400 and does not touch other fields', async () => {
    mockStoreTimezone('Asia/Kolkata');

    const res = await patch('fq1', { title: 'New title', scheduledAt: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Full round trip: store -> read back -> reformat for the input (what the
// merchant would see on reopen) -> resave that exact displayed value ->
// repeat. A one-way "does POST convert correctly" test can't catch drift
// that only appears after several open/save cycles; this can. formatLocal
// DateTimeInput below is a literal copy of the frontend's (QuietHours
// Warning.jsx) — there is no frontend test runner in this repo (backend-
// only per CLAUDE.md), so this mirrors it here, same "must stay in sync"
// convention that file already documents against utils/timezone.js.
// ---------------------------------------------------------------------------
const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const pad2 = (n) => String(n).padStart(2, '0');
function formatLocalDateTimeInput(value, tz) {
  const { zonedParts, resolveTz } = require('../utils/timezone');
  if (!value) return '';
  const s = String(value);
  if (LOCAL_INPUT_RE.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const p = zonedParts(d, resolveTz(tz));
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}T${pad2(p.h)}:${pad2(p.mi)}`;
}

describe('Full round trip — store, read back, resave, repeated 3x', () => {
  test('re-picking the displayed value every reopen never drifts (Asia/Kolkata)', async () => {
    mockStoreTimezone('Asia/Kolkata');
    let stored = null;
    FestivalQueue.findOneAndUpdate.mockImplementation((_q, update) => {
      stored = { _id: 'fq1', ...update.$set };
      return Promise.resolve(stored);
    });

    // Cycle 1: merchant types 28/09/2026 12:00 IST for the first time.
    let res = await patch('fq1', { scheduledAt: '2026-09-28T12:00' });
    expect(res.status).toBe(200);
    expect(stored.scheduledAt.toISOString()).toBe('2026-09-28T06:30:00.000Z');

    for (let cycle = 2; cycle <= 3; cycle++) {
      // Reopen: the input displays formatLocalDateTimeInput of whatever's
      // now stored. Merchant re-touches it (worst case — re-selects the
      // exact same date/time shown) and saves again.
      const displayed = formatLocalDateTimeInput(stored.scheduledAt.toISOString(), 'Asia/Kolkata');
      expect(displayed).toBe('2026-09-28T12:00');
      res = await patch('fq1', { scheduledAt: displayed });
      expect(res.status).toBe(200);
      expect(stored.scheduledAt.toISOString()).toBe('2026-09-28T06:30:00.000Z');
    }
  });

  test('leaving the date field untouched every reopen (Save resends the stored ISO) never drifts', async () => {
    mockStoreTimezone('Asia/Kolkata');
    let stored = null;
    FestivalQueue.findOneAndUpdate.mockImplementation((_q, update) => {
      stored = { _id: 'fq1', ...update.$set };
      return Promise.resolve(stored);
    });

    let res = await patch('fq1', { scheduledAt: '2026-09-28T12:00' });
    expect(res.status).toBe(200);
    expect(stored.scheduledAt.toISOString()).toBe('2026-09-28T06:30:00.000Z');

    for (let cycle = 2; cycle <= 3; cycle++) {
      // openEditModal set editScheduledAt to the full ISO from the DB;
      // the merchant edits something else and Save resends it unchanged.
      res = await patch('fq1', { title: `edit #${cycle}`, scheduledAt: stored.scheduledAt.toISOString() });
      expect(res.status).toBe(200);
      expect(stored.scheduledAt.toISOString()).toBe('2026-09-28T06:30:00.000Z');
    }
  });
});
