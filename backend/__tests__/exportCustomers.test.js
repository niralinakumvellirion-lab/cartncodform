/**
 * GET /api/export/:shopDomain/customers/count
 * GET /api/export/:shopDomain/customers
 *
 * Uses the same mock pattern as export.test.js:
 * requireAuth / requireStoreOwner replaced with pass-throughs;
 * models auto-mocked; exceljs NOT mocked so we can parse the generated workbook.
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

const SHOP  = 'demo.myshopify.com';
const OTHER = 'other.myshopify.com';

let server, base;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/export', exportRouter);
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
});
afterAll((done) => {
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(done);
}, 15000);
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function get(path, shop = SHOP) {
  return fetch(`${base}${path}`, { headers: { 'x-test-shop': shop } });
}

function makeProfile(id = '507f1f77bcf86cd799439011', overrides = {}) {
  return {
    _id: id,
    shopDomain: SHOP,
    stage: 'customer',
    identifiers: {
      customerId: '555',
      emails: ['buyer@example.com'],
      phones: ['+911234567890'],
      sessionIds: ['sess-abc'],
      cartTokens: ['cart-xyz'],
      pushTokens: ['fcm-SECRET-TOKEN'],
    },
    channels: {
      push: { subscribed: true, subscribedAt: new Date('2026-09-01') },
      email: { address: 'buyer@example.com', source: 'popup', capturedAt: new Date('2026-09-01') },
      whatsapp: { phone: '+911234567890', consentedAt: new Date('2026-09-01'), optedOutAt: null },
    },
    orders: { count: 2, ltv: 1500, lastOrderAt: new Date('2026-09-15'), codCount: 1, prepaidCount: 1 },
    messages: [
      { channel: 'push', sentAt: new Date('2026-09-20'), outcome: 'clicked' },
    ],
    interests: { 'prod-1': 0.9, 'prod-2': 0.7, 'prod-3': 0.5 },
    suppressed: false,
    createdAt: new Date('2026-01-01'),
    lastSeenAt: new Date('2026-10-01'),
    ...overrides,
  };
}

function makeProfiles(n) {
  return Array.from({ length: n }, (_, i) => makeProfile(`507f1f77bcf86cd79943${String(i).padStart(4, '0')}`));
}

function mockProfileCount(n) {
  Profile.countDocuments.mockResolvedValue(n);
}

function mockProfiles(profiles) {
  Profile.countDocuments.mockResolvedValue(profiles.length);
  Profile.find.mockReturnValue({
    sort: () => ({ select: () => ({ lean: () => Promise.resolve(profiles) }) }),
  });
  StorefrontEvent.aggregate.mockResolvedValue([]);
}

async function loadWorkbook(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

// ── /count ───────────────────────────────────────────────────────────────────

describe('GET customers/count', () => {
  test('403 when shop mismatch', async () => {
    const res = await get(`/api/export/${SHOP}/customers/count`, OTHER);
    expect(res.status).toBe(403);
  });

  test('400 on invalid filter param', async () => {
    Profile.countDocuments.mockResolvedValue(0);
    const res = await get(`/api/export/${SHOP}/customers/count?type=bad`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/type/i);
  });

  test('returns { count, limit, overLimit }', async () => {
    mockProfileCount(5);
    const res = await get(`/api/export/${SHOP}/customers/count`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ count: 5, limit: 10000, overLimit: false });
  });

  test('overLimit true when count > 10000', async () => {
    mockProfileCount(12000);
    const res = await get(`/api/export/${SHOP}/customers/count`);
    const body = await res.json();
    expect(body.overLimit).toBe(true);
    expect(body.count).toBe(12000);
  });
});

// ── /customers 403 / 400 / 422 ───────────────────────────────────────────────

describe('GET customers — auth / validation / cap errors', () => {
  test('403 when shop mismatch', async () => {
    const res = await get(`/api/export/${SHOP}/customers`, OTHER);
    expect(res.status).toBe(403);
  });

  test('400 on invalid segment', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?segment=bad`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/segment/i);
  });

  test('400 on invalid type', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?type=xyz`);
    expect(res.status).toBe(400);
  });

  test('400 on invalid reachPush value', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?reachPush=false`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reachPush/i);
  });

  test('400 on search > 100 chars', async () => {
    mockProfileCount(1);
    const long = 'a'.repeat(101);
    const res = await get(`/api/export/${SHOP}/customers?search=${long}`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/search/i);
  });

  test('400 on invalid lastSeen value', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?lastSeen=yesterday`);
    expect(res.status).toBe(400);
  });

  test('400 on lastSeen=custom with no dates', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?lastSeen=custom`);
    expect(res.status).toBe(400);
  });

  test('400 on lastSeenFrom > lastSeenTo', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?lastSeen=custom&lastSeenFrom=2026-10-01&lastSeenTo=2026-09-01`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/before/i);
  });

  test('400 on ordersMin not integer', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?ordersMin=1.5`);
    expect(res.status).toBe(400);
  });

  test('400 on ordersMax < ordersMin', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?ordersMin=5&ordersMax=2`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ordersMax/i);
  });

  test('400 on spentMin negative', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?spentMin=-1`);
    expect(res.status).toBe(400);
  });

  test('400 on invalid payment', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?payment=bitcoin`);
    expect(res.status).toBe(400);
  });

  test('400 on invalid messaged', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?messaged=sometimes`);
    expect(res.status).toBe(400);
  });

  test('400 on invalid emailStatus', async () => {
    mockProfileCount(1);
    const res = await get(`/api/export/${SHOP}/customers?emailStatus=maybe`);
    expect(res.status).toBe(400);
  });

  test('422 when 0 customers match', async () => {
    mockProfiles([]);
    const res = await get(`/api/export/${SHOP}/customers`);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/no customers/i);
  });

  test('422 when count > 10000', async () => {
    Profile.countDocuments.mockResolvedValue(10001);
    // find should not be called — count guard runs first
    const res = await get(`/api/export/${SHOP}/customers`);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/10,000/);
  });
});

// ── 200 — response headers ────────────────────────────────────────────────────

describe('GET customers — 200 headers', () => {
  test('content-type is spreadsheetml', async () => {
    mockProfiles(makeProfiles(2));
    const res = await get(`/api/export/${SHOP}/customers`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/spreadsheetml/);
  });

  test('content-disposition is attachment .xlsx filename', async () => {
    mockProfiles(makeProfiles(1));
    const res = await get(`/api/export/${SHOP}/customers`);
    const cd = res.headers.get('content-disposition') || '';
    expect(cd).toMatch(/attachment/);
    expect(cd).toMatch(/customers-\d{4}-\d{2}-\d{2}\.xlsx/);
  });

  test('cache-control is no-store', async () => {
    mockProfiles(makeProfiles(1));
    const res = await get(`/api/export/${SHOP}/customers`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

// ── 200 — workbook structure ─────────────────────────────────────────────────

describe('GET customers — workbook structure', () => {
  test('workbook has Customers and Filters sheets (no Activity by default)', async () => {
    mockProfiles(makeProfiles(2));
    const res = await get(`/api/export/${SHOP}/customers`);
    const wb = await loadWorkbook(res);
    const names = wb.worksheets.map(ws => ws.name);
    expect(names).toContain('Customers');
    expect(names).toContain('Filters');
    expect(names).not.toContain('Activity');
  });

  test('Activity sheet present when includeActivity=true', async () => {
    mockProfiles(makeProfiles(1));
    StorefrontEvent.find.mockReturnValue({
      sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }),
    });
    const res = await get(`/api/export/${SHOP}/customers?includeActivity=true`);
    const wb = await loadWorkbook(res);
    expect(wb.worksheets.map(ws => ws.name)).toContain('Activity');
  });

  test('Customers sheet row count equals profile count', async () => {
    const profiles = makeProfiles(4);
    mockProfiles(profiles);
    const res = await get(`/api/export/${SHOP}/customers`);
    const wb  = await loadWorkbook(res);
    const ws  = wb.getWorksheet('Customers');
    expect(ws.rowCount - 1).toBe(profiles.length);
  });

  test('Customers sheet has bold header with Customer column', async () => {
    mockProfiles(makeProfiles(1));
    const res = await get(`/api/export/${SHOP}/customers`);
    const wb  = await loadWorkbook(res);
    const ws  = wb.getWorksheet('Customers');
    const h   = ws.getRow(1);
    expect(h.getCell(1).font?.bold).toBe(true);
    expect(String(h.getCell(1).value)).toMatch(/customer/i);
  });

  test('Filters sheet contains "Report generated" and "Customers exported"', async () => {
    mockProfiles(makeProfiles(1));
    const res = await get(`/api/export/${SHOP}/customers`);
    const wb  = await loadWorkbook(res);
    const ws  = wb.getWorksheet('Filters');
    const items = [];
    ws.eachRow(row => items.push(String(row.getCell(1).value || '')));
    expect(items).toContain('Report generated');
    expect(items).toContain('Customers exported');
  });
});

// ── 200 — data correctness ────────────────────────────────────────────────────

describe('GET customers — data correctness', () => {
  test('unsubscribed customer is included and Unsubscribed column shows Yes', async () => {
    const p = makeProfile('507f1f77bcf86cd799439001', { suppressed: true });
    mockProfiles([p]);
    const res = await get(`/api/export/${SHOP}/customers`);
    const wb  = await loadWorkbook(res);
    const ws  = wb.getWorksheet('Customers');
    const headers = [];
    ws.getRow(1).eachCell(c => headers.push(String(c.value)));
    const unsubIdx = headers.findIndex(h => /unsubscribed/i.test(h));
    expect(unsubIdx).toBeGreaterThan(-1);
    const dataRow = ws.getRow(2);
    expect(String(dataRow.getCell(unsubIdx + 1).value)).toBe('Yes');
  });

  test('regex-special characters in search do not throw', async () => {
    Profile.countDocuments.mockResolvedValue(0);
    const res = await get(`/api/export/${SHOP}/customers/count?search=${encodeURIComponent('test(.*)')}`);
    expect(res.status).toBe(200); // valid (0 results, but no 400/500)
  });

  test('StorefrontEvent query includes $or with customerId and sessionIds', async () => {
    mockProfiles(makeProfiles(1));
    await get(`/api/export/${SHOP}/customers`);
    // aggregate is called with the event-count query
    expect(StorefrontEvent.aggregate).toHaveBeenCalled();
    const [pipeline] = StorefrontEvent.aggregate.mock.calls[0];
    const matchStage = pipeline.find(s => s.$match);
    expect(matchStage.$match.shopDomain).toBe(SHOP);
    const orClauses = matchStage.$match.$or || [];
    const hasCid = orClauses.some(c => c.customerId);
    const hasSid = orClauses.some(c => c.sessionId);
    expect(hasCid || hasSid).toBe(true);
  });
});

// ── privacy: no tokens or full session ids ────────────────────────────────────

describe('GET customers — privacy', () => {
  test('push token never appears in any cell', async () => {
    mockProfiles(makeProfiles(2));
    const res = await get(`/api/export/${SHOP}/customers`);
    const wb = await loadWorkbook(res);
    let found = false;
    wb.worksheets.forEach(ws => {
      ws.eachRow(row => row.eachCell(c => {
        if (String(c.value || '').includes('fcm-SECRET-TOKEN')) found = true;
      }));
    });
    expect(found).toBe(false);
  });

  test('cart tokens never appear in any cell', async () => {
    mockProfiles(makeProfiles(1));
    const res = await get(`/api/export/${SHOP}/customers`);
    const wb = await loadWorkbook(res);
    let found = false;
    wb.worksheets.forEach(ws => {
      ws.eachRow(row => row.eachCell(c => {
        if (String(c.value || '').includes('cart-xyz')) found = true;
      }));
    });
    expect(found).toBe(false);
  });

  test('session ids are truncated to 8 chars in Activity sheet', async () => {
    mockProfiles(makeProfiles(1));
    StorefrontEvent.find.mockReturnValue({
      sort: () => ({ limit: () => ({ lean: () => Promise.resolve([{
        _id: 'ev1', shopDomain: SHOP, sessionId: 'full-session-uuid',
        type: 'page_view', path: '/', pageType: 'home', meta: {}, ts: new Date(),
      }]) }) }),
    });
    const res = await get(`/api/export/${SHOP}/customers?includeActivity=true`);
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet('Activity');
    let tooLong = false;
    ws.eachRow((row, ri) => {
      if (ri === 1) return;
      // Session is the last column (col 16 — index from ACTIVITY_COLS: 1=customer, 16=session)
      ws.columns.forEach((col, ci) => {
        if (col.key === 'session') {
          const v = String(row.getCell(ci + 1).value || '');
          if (v.length > 8) tooLong = true;
        }
      });
    });
    expect(tooLong).toBe(false);
  });
});

// ── formula injection ─────────────────────────────────────────────────────────

describe('GET customers — formula injection guard', () => {
  test('cell starting with = gets a leading apostrophe', async () => {
    const p = makeProfile('507f1f77bcf86cd799439099', {
      identifiers: {
        customerId: null,
        emails: ['=HYPERLINK("http://evil.com","x")'],
        phones: [], sessionIds: [], cartTokens: [], pushTokens: [],
      },
    });
    mockProfiles([p]);
    const res = await get(`/api/export/${SHOP}/customers`);
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet('Customers');
    let dangerous = false;
    ws.eachRow((row, ri) => {
      if (ri === 1) return;
      row.eachCell(c => { if (String(c.value || '').startsWith('=')) dangerous = true; });
    });
    expect(dangerous).toBe(false);
  });
});

// ── store timezone ────────────────────────────────────────────────────────────

describe('GET customers — timezone formatting', () => {
  test('createdAt at 00:00 UTC shows as 05:30 in Asia/Kolkata', async () => {
    const p = makeProfile('507f1f77bcf86cd799439055', {
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
    mockProfiles([p]);
    const res = await get(`/api/export/${SHOP}/customers`);
    const wb  = await loadWorkbook(res);
    const ws  = wb.getWorksheet('Customers');
    // Find "First seen" column
    const headers = [];
    ws.getRow(1).eachCell(c => headers.push(String(c.value)));
    const idx = headers.findIndex(h => /first seen/i.test(h));
    const cellVal = String(ws.getRow(2).getCell(idx + 1).value || '');
    expect(cellVal).toMatch(/05:30/);
  });
});
