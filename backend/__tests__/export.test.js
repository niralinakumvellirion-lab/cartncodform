/**
 * GET /api/export/:shopDomain/customer/:profileId
 * Tests for the per-customer activity Excel export endpoint.
 *
 * requireAuth / requireStoreOwner are replaced with the same pass-through
 * pattern used by other queue/profile tests so we can control the shop
 * without real JWTs. Models are auto-mocked; exceljs is NOT mocked so we
 * can read the generated workbook back to verify contents.
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
    req.store = { shopDomain: req.shopDomain, timezone: 'Asia/Kolkata' };
    next();
  },
}));

jest.mock('../models/Profile');
jest.mock('../models/StorefrontEvent');

const express = require('express');
const Profile = require('../models/Profile');
const StorefrontEvent = require('../models/StorefrontEvent');
const exportRouter = require('../routes/export');
const ExcelJS = require('exceljs');

const SHOP = 'demo.myshopify.com';
const OTHER_SHOP = 'other.myshopify.com';
const PROFILE_ID = '507f1f77bcf86cd799439011';

let server;
let base;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/export', exportRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});
afterAll((done) => {
  // closeAllConnections forces keep-alive connections closed so server.close()
  // resolves promptly after the streaming xlsx responses finish.
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(done);
}, 15000);
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function get(path, shop = SHOP) {
  return fetch(`${base}${path}`, {
    headers: { 'x-test-shop': shop },
  });
}

function makeProfile(overrides = {}) {
  return {
    _id: PROFILE_ID,
    shopDomain: SHOP,
    stage: 'identified',
    identifiers: {
      customerId: '555',
      emails: ['shopper@example.com'],
      phones: ['+911234567890'],
      sessionIds: ['sess-uuid-1', 'sess-uuid-2'],
      cartTokens: ['cart-abc'],
      pushTokens: ['fcm-token-secret'],
    },
    channels: {
      push: { subscribed: true },
      email: { address: 'shopper@example.com' },
    },
    orders: { count: 2, ltv: 999.50 },
    suppressed: false,
    createdAt:  new Date('2026-01-01T10:00:00Z'),
    lastSeenAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

function makeEvents(n) {
  return Array.from({ length: n }, (_, i) => ({
    _id: `ev${i}`,
    shopDomain: SHOP,
    sessionId: 'sess-uuid-1',
    customerId: '555',
    type: i % 2 === 0 ? 'page_view' : 'product_view',
    path: '/products/test',
    pageType: i % 2 === 0 ? 'home' : 'product',
    meta: i % 2 === 0
      ? { title: 'Home', referrer: null, pageType: 'home' }
      : { productTitle: 'Blue Shirt', productPrice: 499, productId: 'pid1' },
    ts: new Date('2026-10-01T10:00:00Z'),
  }));
}

function mockProfile(profile) {
  Profile.findOne.mockReturnValue({ lean: () => Promise.resolve(profile) });
}

function mockEvents(events) {
  StorefrontEvent.find.mockReturnValue({
    sort: () => ({
      limit: () => ({
        lean: () => Promise.resolve(events),
      }),
    }),
  });
}

async function loadWorkbook(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

// ── 403 / 400 / 404 ──────────────────────────────────────────────────────────

describe('auth and validation errors', () => {
  test('403 when authenticated shop does not match path shopDomain', async () => {
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`, OTHER_SHOP);
    expect(res.status).toBe(403);
  });

  test('400 when profileId is not a valid 24-hex ObjectId', async () => {
    const res = await get(`/api/export/${SHOP}/customer/not-an-id`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });

  test('404 when profile is not found for this shop', async () => {
    mockProfile(null);
    mockEvents([]);
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });
});

// ── 200 — headers ────────────────────────────────────────────────────────────

describe('200 — response headers', () => {
  test('content-type is spreadsheetml', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(2));
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/spreadsheetml/);
  });

  test('content-disposition is attachment with .xlsx filename', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(2));
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const cd = res.headers.get('content-disposition') || '';
    expect(cd).toMatch(/attachment/);
    expect(cd).toMatch(/\.xlsx/);
  });

  test('cache-control is no-store', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(2));
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

// ── 200 — workbook structure ─────────────────────────────────────────────────

describe('200 — workbook structure', () => {
  test('workbook has both Customer and Activity sheets', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(3));
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    const names = wb.worksheets.map(ws => ws.name);
    expect(names).toContain('Customer');
    expect(names).toContain('Activity');
  });

  test('Activity sheet row count equals event count (header excluded)', async () => {
    const events = makeEvents(5);
    mockProfile(makeProfile());
    mockEvents(events);
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet('Activity');
    expect(ws.rowCount - 1).toBe(events.length);
  });

  test('Activity sheet has bold header and correct column headers', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(1));
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet('Activity');
    const headerRow = ws.getRow(1);
    expect(headerRow.getCell(1).font && headerRow.getCell(1).font.bold).toBe(true);
    expect(String(headerRow.getCell(1).value)).toMatch(/Date/i);
    expect(String(headerRow.getCell(2).value)).toMatch(/Event/i);
  });

  test('Customer sheet contains profile summary rows', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(2));
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet('Customer');
    const fields = [];
    ws.eachRow(row => { fields.push(String(row.getCell(1).value || '')); });
    expect(fields).toContain('Email(s)');
    expect(fields).toContain('Push subscribed');
    expect(fields).toContain('Data range');
  });
});

// ── 200 — query scoping ───────────────────────────────────────────────────────

describe('200 — StorefrontEvent query scoping', () => {
  test('query includes both customerId and all session identifiers', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(2));
    await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);

    const [query] = StorefrontEvent.find.mock.calls[0];
    expect(query.shopDomain).toBe(SHOP);
    const orEntries = query.$or || [];
    expect(orEntries).toContainEqual({ customerId: '555' });
    expect(orEntries).toContainEqual({
      sessionId: { $in: expect.arrayContaining(['sess-uuid-1', 'sess-uuid-2', 'cart-abc']) },
    });
  });

  test('events from a different session are excluded by the query (mock returns only matching events)', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(3)); // mock already scoped to profile's sessions
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet('Activity');
    expect(ws.rowCount - 1).toBe(3);
  });
});

// ── 200 — privacy: no tokens or full session ids ──────────────────────────────

describe('200 — privacy checks', () => {
  test('push token never appears in any cell', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(3));
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    let found = false;
    wb.worksheets.forEach(ws => {
      ws.eachRow(row => {
        row.eachCell(cell => {
          if (String(cell.value || '').includes('fcm-token-secret')) found = true;
        });
      });
    });
    expect(found).toBe(false);
  });

  test('full session id (36 chars) never appears — only first 8 are written', async () => {
    mockProfile(makeProfile());
    mockEvents(makeEvents(2));
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    let tooLong = false;
    const ws = wb.getWorksheet('Activity');
    ws.eachRow((row, ri) => {
      if (ri === 1) return;
      const sessionCell = String(row.getCell(15).value || '');
      if (sessionCell.length > 8) tooLong = true;
    });
    expect(tooLong).toBe(false);
  });
});

// ── 200 — formula injection ───────────────────────────────────────────────────

describe('200 — formula injection guard', () => {
  test('cell starting with = gets a leading apostrophe / is stored as plain text', async () => {
    const events = [{
      ...makeEvents(1)[0],
      meta: { title: '=HYPERLINK("http://evil.com","click me")' },
    }];
    mockProfile(makeProfile());
    mockEvents(events);
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet('Activity');
    let dangerousCell = false;
    ws.eachRow((row, ri) => {
      if (ri === 1) return;
      row.eachCell(cell => {
        if (String(cell.value || '').startsWith('=')) dangerousCell = true;
      });
    });
    expect(dangerousCell).toBe(false);
  });
});

// ── 200 — 50k cap ─────────────────────────────────────────────────────────────

describe('200 — 50 000-row cap', () => {
  test('cap note appears in Customer sheet when query returns > 50 000 events', async () => {
    const bigEvents = Array.from({ length: 50001 }, (_, i) => ({
      _id: `ev${i}`, shopDomain: SHOP, sessionId: 'sess-uuid-1',
      type: 'page_view', path: '/', pageType: 'home', meta: {}, ts: new Date(),
    }));
    mockProfile(makeProfile());
    mockEvents(bigEvents);
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet('Customer');
    let hasNote = false;
    ws.eachRow(row => {
      const v = String(row.getCell(2).value || '');
      if (v.includes('50,000') || v.includes('50000')) hasNote = true;
    });
    expect(hasNote).toBe(true);
  }, 120000);
});

// ── 200 — timezone formatting ─────────────────────────────────────────────────

describe('200 — store timezone formatting', () => {
  test('event at 00:00 UTC formats as 05:30 in Asia/Kolkata (UTC+5:30)', async () => {
    const events = [{
      ...makeEvents(1)[0],
      ts: new Date('2026-10-01T00:00:00Z'),
    }];
    mockProfile(makeProfile());
    mockEvents(events);
    const res = await get(`/api/export/${SHOP}/customer/${PROFILE_ID}`);
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet('Activity');
    const dateCell = String(ws.getRow(2).getCell(1).value || '');
    expect(dateCell).toMatch(/05:30/);
  });
});
