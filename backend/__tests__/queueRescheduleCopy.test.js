/**
 * POST /api/queue/:shopDomain/festival/:id/reschedule-copy
 * Tests for the reschedule-copy (Design B clone) endpoint.
 * requireAuth / requireStoreOwner replaced with the same pass-through pattern
 * used by queueFestivalDetail.test.js. FestivalQueue and Store auto-mocked.
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
jest.mock('../models/FestivalQueue');
jest.mock('../models/Store');

// Timezone utils: fixed deterministic mapping so date validation is predictable
// in tests. The formula h-5 / m-30 mimics IST offset without a real tz library.
jest.mock('../utils/timezone', () => ({
  resolveTz: () => 'Asia/Kolkata',
  zonedTimeToUtc: (y, mo, d, h, m) => new Date(Date.UTC(y, mo - 1, d, h - 5, m - 30)),
  zonedParts: (dt) => {
    const date = new Date(dt);
    return { y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate() };
  },
}));

const express = require('express');
const FestivalQueue = require('../models/FestivalQueue');
const Store = require('../models/Store');
const queueRouter = require('../routes/queue');

const SHOP = 'demo.myshopify.com';
const OTHER_SHOP = 'other.myshopify.com';
const ITEM_ID = '507f1f77bcf86cd799439011';

// A future local datetime string — far enough away to never be "past today".
const FUTURE_DT = '2099-12-25T10:00';

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
  Store.findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ timezone: 'Asia/Kolkata' }) }),
  });
});
afterEach(() => jest.restoreAllMocks());

function post(path, body, shop = SHOP) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-shop': shop },
    body: JSON.stringify(body),
  });
}

// Helper: mock the first FestivalQueue.findOne call (with .select chain) for
// the original doc lookup, then a second call for the collision check (no
// .select — returns a Promise directly).
function mockFindOnce(doc) {
  FestivalQueue.findOne.mockReturnValueOnce({
    select: () => Promise.resolve(doc),
  });
}

function makeOriginal(overrides = {}) {
  return {
    _id: ITEM_ID,
    status: 'sent',
    sendClaimedAt: null,
    festival: '',
    scheduledAt: new Date('2026-09-01T10:00:00Z'),
    channel: 'push',
    title: 'Diwali Push',
    body: 'Shop now!',
    mobileImageUrl: 'https://example.com/m.jpg',
    desktopImageUrl: '',
    targetType: 'home',
    productId: '',
    productHandle: '',
    productTitle: '',
    templateId: null,
    subject: '',
    segment: 'everyone',
    ...overrides,
  };
}

// ── 404 ─────────────────────────────────────────────────────────────────────

describe('404 — not found', () => {
  test('returns 404 when item does not exist for this shop', async () => {
    FestivalQueue.findOne.mockReturnValueOnce({ select: () => Promise.resolve(null) });
    const res = await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt: FUTURE_DT });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });
});

// ── 403 wrong shop ───────────────────────────────────────────────────────────

describe('403 — wrong shop', () => {
  test('returns 403 when x-test-shop does not match path shopDomain', async () => {
    const res = await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt: FUTURE_DT }, OTHER_SHOP);
    expect(res.status).toBe(403);
  });
});

// ── 400 — not sent ───────────────────────────────────────────────────────────

describe('400 — original not sent', () => {
  test.each(['draft', 'approved', 'cancelled'])(
    'returns 400 when original status is %s',
    async (status) => {
      mockFindOnce(makeOriginal({ status }));
      const res = await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt: FUTURE_DT });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/only sent/i);
    }
  );
});

// ── 201 — stale sendClaimedAt on a sent item is ignored ─────────────────────
// The poller does not clear sendClaimedAt on a successful send, so a sent item
// can have a non-null sendClaimedAt. Status 'sent' is the authoritative signal
// that the send completed; the stale claim must not block the resend copy.

describe('201 — sent with stale sendClaimedAt succeeds', () => {
  test('returns 201 and does not copy sendClaimedAt to the clone', async () => {
    mockFindOnce(makeOriginal({ sendClaimedAt: new Date() }));
    FestivalQueue.create.mockResolvedValue({ _id: 'cloneId' });
    const res = await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt: FUTURE_DT });
    expect(res.status).toBe(201);
    const arg = FestivalQueue.create.mock.calls[0][0];
    expect(arg.sendClaimedAt).toBeUndefined();
  });
});

// ── 400 — past date ──────────────────────────────────────────────────────────

describe('400 — past date', () => {
  test('returns 400 when scheduledAt LOCAL_DATETIME_RE date is before today', async () => {
    mockFindOnce(makeOriginal());
    // '2020-01-01T10:00' matches LOCAL_DATETIME_RE.
    // Mock maps (2020,1,1,10,0) → Date.UTC(2020,0,1,5,-30) = 2019-12-31T04:30Z → far past.
    // todayStartUtc = zonedTimeToUtc(today...) → some 2026 date → scheduledAtUtc < today → 400.
    const res = await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt: '2020-01-01T10:00' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/before today|passed/i);
  });
});

// ── 400 — time already passed today ─────────────────────────────────────────

describe('400 — time already passed today', () => {
  test('returns 400 when LOCAL_DATETIME_RE datetime resolves to before now', async () => {
    mockFindOnce(makeOriginal());
    // Construct "today at 00:01" in UTC date parts so the string matches today's date.
    // Mock maps (y, mo, d, 0, 1) → Date.UTC(y, mo-1, d, -5, -29) → ~18 hours ago.
    // todayStartUtc = (y, mo, d, 0, 0) → Date.UTC(y, mo-1, d, -5, -30) → ~18.5 hours ago.
    // scheduledAtUtc > todayStartUtc (not "before today") but scheduledAtUtc < now → 400.
    const now = new Date();
    const y = now.getUTCFullYear();
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const scheduledAt = `${y}-${mo}-${d}T00:01`;
    const res = await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/passed today/i);
  });
});

// ── 409 — festival collision ─────────────────────────────────────────────────

describe('409 — festival collision', () => {
  test('returns 409 when an existing draft/approved item has the same festival on the target date', async () => {
    mockFindOnce(makeOriginal({ festival: 'Diwali' }));
    // Collision check: FestivalQueue.findOne(query) — no .select chain, resolves to a doc.
    FestivalQueue.findOne.mockResolvedValueOnce({ _id: 'other', status: 'draft' });
    const res = await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt: FUTURE_DT });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/Diwali/);
  });

  test('skips collision check when original.festival is empty', async () => {
    mockFindOnce(makeOriginal({ festival: '' }));
    FestivalQueue.create.mockResolvedValue({ _id: 'newid123' });
    const res = await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt: FUTURE_DT });
    // The collision findOne must NOT have been called (findOne called once only, for the original).
    expect(FestivalQueue.findOne).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(201);
  });
});

// ── 201 — happy path ─────────────────────────────────────────────────────────

describe('201 — happy path', () => {
  test('creates a new draft with all copied fields, isResend true, groupId null', async () => {
    const original = makeOriginal({
      festival: 'Holi',
      channel: 'email',
      title: 'Holi Email',
      body: 'Celebrate!',
      mobileImageUrl: 'https://example.com/m.jpg',
      desktopImageUrl: 'https://example.com/d.jpg',
      targetType: 'product',
      productId: 'pid',
      productHandle: 'blue-shirt',
      productTitle: 'Blue Shirt',
      templateId: '605c72ef153207d1cb3b2a10',
      subject: 'Happy Holi',
      segment: 'bought_once',
    });
    mockFindOnce(original);
    // Collision check: festival is set → findOne runs. Return null = no collision.
    FestivalQueue.findOne.mockResolvedValueOnce(null);
    const cloneId = '507f1f77bcf86cd799439099';
    FestivalQueue.create.mockResolvedValue({ _id: cloneId });

    const res = await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt: FUTURE_DT });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBe(cloneId);

    expect(FestivalQueue.create).toHaveBeenCalledTimes(1);
    const arg = FestivalQueue.create.mock.calls[0][0];
    expect(arg.shopDomain).toBe(SHOP);
    expect(arg.channel).toBe('email');
    expect(arg.title).toBe('Holi Email');
    expect(arg.body).toBe('Celebrate!');
    expect(arg.mobileImageUrl).toBe('https://example.com/m.jpg');
    expect(arg.desktopImageUrl).toBe('https://example.com/d.jpg');
    expect(arg.festival).toBe('Holi');
    expect(arg.targetType).toBe('product');
    expect(arg.productId).toBe('pid');
    expect(arg.productHandle).toBe('blue-shirt');
    expect(arg.productTitle).toBe('Blue Shirt');
    expect(arg.templateId).toBe('605c72ef153207d1cb3b2a10');
    expect(arg.subject).toBe('Happy Holi');
    expect(arg.segment).toBe('bought_once');
    expect(arg.status).toBe('draft');
    expect(arg.isResend).toBe(true);
    expect(arg.groupId).toBeNull();

    // sentAt, recipientCount, failedAttempts, sendClaimedAt must NOT be copied
    expect(arg.sentAt).toBeUndefined();
    expect(arg.recipientCount).toBeUndefined();
    expect(arg.failedAttempts).toBeUndefined();
    expect(arg.sendClaimedAt).toBeUndefined();
  });

  test('original document is never modified', async () => {
    mockFindOnce(makeOriginal());
    FestivalQueue.create.mockResolvedValue({ _id: 'newclone' });

    await post(`/api/queue/${SHOP}/festival/${ITEM_ID}/reschedule-copy`, { scheduledAt: FUTURE_DT });

    expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
    expect(FestivalQueue.updateMany).not.toHaveBeenCalled();
    expect(FestivalQueue.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
