'use strict';

/**
 * Tests for step 4, commit 2:
 *   GET /api/platform/stores/:shopDomain/report
 *   safeStr utility
 */

jest.mock('../models/Store');
jest.mock('../models/Profile');
jest.mock('../models/ScheduledJob');
jest.mock('../models/AuditLog');
jest.mock('../models/Staff');
jest.mock('../models/FestivalQueue');
jest.mock('../services/storeSuspension');

const mongoose     = require('mongoose');
const Store        = require('../models/Store');
const Profile      = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const AuditLog     = require('../models/AuditLog');
const Staff        = require('../models/Staff');
const express      = require('express');
const jwt          = require('jsonwebtoken');
const ExcelJS      = require('exceljs');

const { safeStr } = require('../utils/safeStr');

const PLATFORM_SECRET = 'platform-jwt-secret-for-test-suite-3333333333';
const SHOPIFY_SECRET  = 'shopify-api-secret-for-test-suite-only';
const SHOP = 'demo.myshopify.com';

function mintToken(staffId) {
  return jwt.sign(
    { sub: staffId },
    PLATFORM_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'shopireachboost-platform', audience: 'platform-admin' }
  );
}

const ownerId   = new mongoose.Types.ObjectId().toString();
const adminId   = new mongoose.Types.ObjectId().toString();
const supportId = new mongoose.Types.ObjectId().toString();

const ownerStaff   = { _id: ownerId,   email: 'owner@p.test',   role: 'owner',   active: true };
const adminStaff   = { _id: adminId,   email: 'admin@p.test',   role: 'admin',   active: true };
const supportStaff = { _id: supportId, email: 'support@p.test', role: 'support', active: true };

const storeDoc = {
  shopDomain: SHOP,
  shopName: 'Demo Store',
  ownerEmail: 'merchant@demo.test',
  plan: 'growth',
  subscriptionStatus: 'active',
  planUpdatedAt: new Date('2026-01-01'),
  timezone: 'Asia/Kolkata',
  installedAt: new Date('2026-01-01'),
  lastSignalRunAt: new Date('2026-10-01'),
  needsReauth: false,
  pushStats: { rateLast7d: 0.85 },
  suspended: false,
  suspendedAt: null,
  suspendedReason: null,
  suspendedNote: null,
  suspendedBy: null,
};

const profilesForReport = [
  {
    _id: new mongoose.Types.ObjectId(),
    stage: 'customer',
    orders: { count: 3 },
    channels: {
      email:    { address: 'user@example.com' },
      push:     { subscribed: true },
      whatsapp: { phone: '+919800000001' },
    },
    identifiers: { emails: ['user@example.com'], phones: ['+919800000001'] },
    lastSeenAt: new Date('2026-10-01'),
  },
  {
    _id: new mongoose.Types.ObjectId(),
    stage: 'anonymous',
    orders: { count: 0 },
    channels: { email: {}, push: {}, whatsapp: {} },
    identifiers: { emails: [], phones: [] },
    lastSeenAt: null,
  },
];

let server, base;

beforeAll((done) => {
  process.env.PLATFORM_JWT_SECRET = PLATFORM_SECRET;
  process.env.SHOPIFY_API_SECRET  = SHOPIFY_SECRET;
  process.env.SHOPIFY_API_KEY     = 'test-api-key';
  process.env.NODE_ENV            = 'test';

  const { _resetConfigCache } = require('../routes/platform/index');
  _resetConfigCache();

  const app = express();
  app.use(express.json());
  app.use('/api/platform', require('../routes/platform/index'));
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(done);
}, 15000);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  AuditLog.create.mockResolvedValue({});

  Store.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(storeDoc) });
  Profile.countDocuments = jest.fn().mockResolvedValue(42);
  ScheduledJob.countDocuments = jest.fn().mockResolvedValue(10);
  ScheduledJob.find = jest.fn().mockReturnValue({
    sort:  jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean:  jest.fn().mockResolvedValue([{ runAt: new Date(), channel: 'push', origin: 'scheduled', error: 'FCM expired' }]),
  });
  Profile.find = jest.fn().mockReturnValue({
    sort:  jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean:  jest.fn().mockResolvedValue(profilesForReport),
  });
  Staff.findById = jest.fn().mockImplementation((id) => ({
    lean: jest.fn().mockResolvedValue(
      id === supportId ? supportStaff :
      id === adminId   ? adminStaff   : ownerStaff
    ),
  }));
});

afterEach(() => jest.restoreAllMocks());

async function getReport(staffId) {
  const r = await fetch(`${base}/api/platform/stores/${SHOP}/report`, {
    headers: { Authorization: `Bearer ${mintToken(staffId)}` },
  });
  return r;
}

async function loadWb(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  return wb;
}

// ── safeStr ───────────────────────────────────────────────────────────────────

describe('safeStr', () => {
  test('null → empty string', () => expect(safeStr(null)).toBe(''));
  test('undefined → empty string', () => expect(safeStr(undefined)).toBe(''));
  test('empty string → empty string', () => expect(safeStr('')).toBe(''));
  test('normal string unchanged', () => expect(safeStr('hello')).toBe('hello'));
  test('= prefix guarded', () => expect(safeStr('=SUM(A1)')).toBe("'=SUM(A1)"));
  test('+ prefix guarded', () => expect(safeStr('+cmd|')).toBe("'+cmd|"));
  test('- prefix guarded', () => expect(safeStr('-1+1')).toBe("'-1+1"));
  test('@ prefix guarded', () => expect(safeStr('@SUM')).toBe("'@SUM"));
  test('number → string passthrough', () => expect(safeStr(42)).toBe('42'));
});

// ── report route ──────────────────────────────────────────────────────────────

describe('GET /api/platform/stores/:shopDomain/report', () => {
  test('owner receives xlsx file with correct headers', async () => {
    const r = await getReport(ownerId);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/spreadsheetml/);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  test('admin can download report', async () => {
    const r = await getReport(adminId);
    expect(r.status).toBe(200);
  });

  test('support gets 403', async () => {
    const r = await getReport(supportId);
    expect(r.status).toBe(403);
  });

  test('workbook has exactly 3 sheets', async () => {
    const r = await getReport(ownerId);
    const buf = Buffer.from(await r.arrayBuffer());
    const wb = await loadWb(buf);
    expect(wb.worksheets).toHaveLength(3);
  });

  test('sheet names are Summary, Failures, Shoppers', async () => {
    const r = await getReport(ownerId);
    const wb = await loadWb(Buffer.from(await r.arrayBuffer()));
    const names = wb.worksheets.map(ws => ws.name);
    expect(names).toContain('Summary');
    expect(names).toContain('Failures');
    expect(names).toContain('Shoppers');
  });

  test('Shoppers sheet contains no raw email addresses', async () => {
    const r = await getReport(ownerId);
    const wb = await loadWb(Buffer.from(await r.arrayBuffer()));
    const sheet = wb.getWorksheet('Shoppers');
    const values = [];
    sheet.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value ?? ''))));
    const rawEmails = values.filter(v => /^[a-zA-Z0-9._%+!-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v));
    expect(rawEmails).toHaveLength(0);
  });

  test('Shoppers sheet contains no raw E.164 phone numbers', async () => {
    const r = await getReport(ownerId);
    const wb = await loadWb(Buffer.from(await r.arrayBuffer()));
    const sheet = wb.getWorksheet('Shoppers');
    const values = [];
    sheet.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value ?? ''))));
    const rawPhones = values.filter(v => /^\+\d{10,}$/.test(v));
    expect(rawPhones).toHaveLength(0);
  });

  test('formula-injection cells in Failures sheet are guarded', async () => {
    ScheduledJob.find = jest.fn().mockReturnValue({
      sort:  jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean:  jest.fn().mockResolvedValue([
        { runAt: new Date(), channel: '=HYPERLINK("evil")', origin: '+inject', error: '@formula' },
      ]),
    });

    const r = await getReport(ownerId);
    const wb = await loadWb(Buffer.from(await r.arrayBuffer()));
    const sheet = wb.getWorksheet('Failures');
    const values = [];
    sheet.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value ?? ''))));

    const dangerous = values.filter(v =>
      (v.startsWith('=') || v.startsWith('+') || v.startsWith('@')) && !v.startsWith("'")
    );
    expect(dangerous).toHaveLength(0);
  });

  test('404 when store not found', async () => {
    Store.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const r = await getReport(ownerId);
    expect(r.status).toBe(404);
  });

  test('audit row written with shopDomain and row counts', async () => {
    const r = await getReport(ownerId);
    await r.arrayBuffer(); // consume body
    expect(AuditLog.create).toHaveBeenCalled();
    const call = AuditLog.create.mock.calls[0][0];
    expect(call.action).toBe('store_report');
    expect(call.shopDomain).toBe(SHOP);
    expect(typeof call.meta.shoppersRows).toBe('number');
    expect(typeof call.meta.failuresRows).toBe('number');
    expect(JSON.stringify(call.meta)).not.toMatch(/@/);
  });

  test('Content-Disposition filename contains shopDomain slug and date', async () => {
    const r = await getReport(ownerId);
    const cd = r.headers.get('content-disposition') || '';
    expect(cd).toMatch(/store-report-demo/);
    expect(cd).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(cd).toMatch(/\.xlsx/);
  });
});
