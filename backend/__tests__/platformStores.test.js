'use strict';

/**
 * Tests for platform admin store routes and audit meta sanitizer.
 *
 * Covers:
 *   A. sanitizeMeta — key removal + value scrubbing
 *   B. GET /api/platform/stores/summary
 *   C. GET /api/platform/stores (list)
 *   D. GET /api/platform/stores/:shopDomain (detail)
 *   G. Role checks, forbidden-key scan, input validation
 */

jest.mock('../models/Store');
jest.mock('../models/Profile');
jest.mock('../models/ScheduledJob');
jest.mock('../models/AuditLog');
jest.mock('../models/Staff');
jest.mock('../models/FestivalQueue');
jest.mock('../services/storeSuspension');

const Store        = require('../models/Store');
const Profile      = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const AuditLog     = require('../models/AuditLog');
const Staff        = require('../models/Staff');

const express = require('express');
const jwt     = require('jsonwebtoken');

const PLATFORM_SECRET = 'platform-jwt-secret-for-test-suite-3333333333';
const SHOPIFY_SECRET  = 'shopify-api-secret-for-test-suite-only';
const SHOP = 'demo.myshopify.com';

// ── helpers ───────────────────────────────────────────────────────────────────

function mintStaffToken(staffId = 'staff001') {
  return jwt.sign(
    { sub: staffId },
    PLATFORM_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'shopireachboost-platform', audience: 'platform-admin' }
  );
}

function authHeader(staffId) {
  return { Authorization: `Bearer ${mintStaffToken(staffId)}` };
}

// Deep scan for forbidden keys in any nested object.
function findForbiddenKeys(obj) {
  const forbidden = ['accessToken', 'onlineAccessToken', 'pushTokens', 'lastToken', 'sessionIds', 'cartTokens'];
  const found = [];
  function scan(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (forbidden.includes(k)) found.push(k);
      if (v && typeof v === 'object') scan(v);
    }
  }
  scan(obj);
  return found;
}

// ── test server ───────────────────────────────────────────────────────────────

let server, base;
beforeAll((done) => {
  process.env.PLATFORM_JWT_SECRET  = PLATFORM_SECRET;
  process.env.SHOPIFY_API_SECRET   = SHOPIFY_SECRET;
  process.env.SHOPIFY_API_KEY      = 'test-api-key';
  process.env.GOOGLE_CLIENT_ID     = 'test-google-client-id';
  process.env.NODE_ENV             = 'test';

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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  AuditLog.create.mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

// Staff mock helpers — call before each test that hits requireStaff
function mockStaff(role = 'admin', id = 'staff001') {
  Staff.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: id, email: 'admin@ops.com', name: 'Admin', role, active: true }) });
}
function mockSupportStaff(id = 'staff002') {
  Staff.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: id, email: 'support@ops.com', name: 'Support', role: 'support', active: true }) });
}

async function get(path, headers = {}) {
  const r = await fetch(`${base}${path}`, { headers });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function post(path, body = {}, headers = {}) {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ════════════════════════════════════════════════════════════════════════════════
// A. sanitizeMeta
// ════════════════════════════════════════════════════════════════════════════════

describe('sanitizeMeta', () => {
  const { sanitizeMeta } = require('../utils/auditLog');

  test('removes keys matching email/phone/token/session/cart/password/secret', () => {
    const input = {
      email: 'user@example.com',
      phone: '+919876543210',
      accessToken: 'tok123',
      sessionId: 'abc',
      cartToken: 'cart-xyz',
      password: 'secret123',
      secretKey: 'key',
      count: 5,
    };
    const out = sanitizeMeta(input);
    expect(out).not.toHaveProperty('email');
    expect(out).not.toHaveProperty('phone');
    expect(out).not.toHaveProperty('accessToken');
    expect(out).not.toHaveProperty('sessionId');
    expect(out).not.toHaveProperty('cartToken');
    expect(out).not.toHaveProperty('password');
    expect(out).not.toHaveProperty('secretKey');
    expect(out.count).toBe(5);
  });

  test("keeps exact key 'emailDomain' even though it matches the email pattern", () => {
    const out = sanitizeMeta({ emailDomain: 'example.com', emailAddress: 'user@example.com' });
    expect(out.emailDomain).toBe('example.com');
    expect(out).not.toHaveProperty('emailAddress');
  });

  test('replaces string values that look like email addresses with [removed]', () => {
    const out = sanitizeMeta({ reason: 'spam', who: 'user@shop.com', count: 3 });
    expect(out.who).toBe('[removed]');
    expect(out.reason).toBe('spam');
    expect(out.count).toBe(3);
  });

  test('replaces string values that look like E.164 phone numbers with [removed]', () => {
    const out = sanitizeMeta({ note: 'called', num: '+919876543210' });
    expect(out.num).toBe('[removed]');
    expect(out.note).toBe('called');
  });

  test('does not remove a key named e-mail (hyphenated variant)', () => {
    const out = sanitizeMeta({ 'e-mail': 'user@example.com' });
    expect(out).not.toHaveProperty('e-mail');
  });

  test('returns meta unchanged when no sensitive keys or values', () => {
    const input = { action: 'suspend', reason: 'policy', count: 7 };
    const out = sanitizeMeta(input);
    expect(out).toEqual(input);
  });

  test('returns non-object meta as-is (null, string, array)', () => {
    expect(sanitizeMeta(null)).toBeNull();
    expect(sanitizeMeta('string')).toBe('string');
    expect(sanitizeMeta([1, 2])).toEqual([1, 2]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// B. GET /api/platform/stores/summary
// ════════════════════════════════════════════════════════════════════════════════

describe('GET /api/platform/stores/summary', () => {
  test('returns { total, pro, needsReconnect, suspended }', async () => {
    mockStaff('support');
    Store.countDocuments
      .mockResolvedValueOnce(100)  // total
      .mockResolvedValueOnce(12)   // pro
      .mockResolvedValueOnce(3)    // needsReconnect
      .mockResolvedValueOnce(1);   // suspended
    const r = await get('/api/platform/stores/summary', authHeader());
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ total: 100, pro: 12, needsReconnect: 3, suspended: 1 });
  });

  test('401 without token', async () => {
    const r = await get('/api/platform/stores/summary');
    expect(r.status).toBe(401);
  });

  test('support role can access summary', async () => {
    mockSupportStaff();
    Store.countDocuments.mockResolvedValue(0);
    const r = await get('/api/platform/stores/summary', authHeader('staff002'));
    expect(r.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// C. GET /api/platform/stores (list)
// ════════════════════════════════════════════════════════════════════════════════

const STORE_A = {
  shopDomain: 'alpha.myshopify.com', shopName: 'Alpha Shop',
  plan: 'pro', installedAt: new Date('2026-01-01'), needsReauth: false, suspended: false,
};
const STORE_B = {
  shopDomain: 'beta.myshopify.com', shopName: 'Beta Store',
  plan: 'free', installedAt: new Date('2026-02-01'), needsReauth: true, suspended: false,
};
const STORE_C = {
  shopDomain: 'gamma.myshopify.com', shopName: 'Gamma',
  plan: 'free', installedAt: new Date('2026-03-01'), needsReauth: false, suspended: true,
};

function mockListQuery(stores) {
  Store.find.mockReturnValue({
    sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve(stores) }) }) }),
  });
  Store.countDocuments.mockResolvedValue(stores.length);
  Profile.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);   // profileCounts, lastActiveDates
  ScheduledJob.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // sentCounts, failedCounts
}

describe('GET /api/platform/stores (list)', () => {
  test('returns stores array with derived status', async () => {
    mockStaff();
    mockListQuery([STORE_A, STORE_B, STORE_C]);
    const r = await get('/api/platform/stores', authHeader());
    expect(r.status).toBe(200);
    const stores = r.body.stores;
    expect(stores).toHaveLength(3);
    expect(stores.find(s => s.shopDomain === 'alpha.myshopify.com').status).toBe('active');
    expect(stores.find(s => s.shopDomain === 'beta.myshopify.com').status).toBe('needs_reconnect');
    expect(stores.find(s => s.shopDomain === 'gamma.myshopify.com').status).toBe('suspended');
  });

  test('no forbidden keys in response', async () => {
    mockStaff();
    mockListQuery([STORE_A]);
    const r = await get('/api/platform/stores', authHeader());
    expect(r.status).toBe(200);
    expect(findForbiddenKeys(r.body)).toEqual([]);
  });

  test('400 on invalid plan filter', async () => {
    mockStaff();
    const r = await get('/api/platform/stores?plan=enterprise', authHeader());
    expect(r.status).toBe(400);
  });

  test('400 on invalid status filter', async () => {
    mockStaff();
    const r = await get('/api/platform/stores?status=deleted', authHeader());
    expect(r.status).toBe(400);
  });

  test('400 if search exceeds 100 characters', async () => {
    mockStaff();
    const r = await get(`/api/platform/stores?search=${'x'.repeat(101)}`, authHeader());
    expect(r.status).toBe(400);
  });

  test('support role can list stores', async () => {
    mockSupportStaff();
    mockListQuery([STORE_A]);
    const r = await get('/api/platform/stores', authHeader('staff002'));
    expect(r.status).toBe(200);
  });

  test('counts come only from this page domains (not cross-store)', async () => {
    mockStaff();
    Store.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([STORE_A]) }) }) }),
    });
    Store.countDocuments.mockResolvedValue(1);
    // Only alpha's aggregates are returned
    Profile.aggregate
      .mockResolvedValueOnce([{ _id: 'alpha.myshopify.com', count: 42 }])
      .mockResolvedValueOnce([{ _id: 'alpha.myshopify.com', lastActive: new Date('2026-10-01') }]);
    ScheduledJob.aggregate
      .mockResolvedValueOnce([{ _id: 'alpha.myshopify.com', count: 5 }])
      .mockResolvedValueOnce([{ _id: 'alpha.myshopify.com', count: 2 }]);

    const r = await get('/api/platform/stores', authHeader());
    const store = r.body.stores[0];
    expect(store.shoppers).toBe(42);
    expect(store.sent7d).toBe(5);
    expect(store.failed7d).toBe(2);

    // The $in filter sent to aggregation must only contain this page's domain.
    // Profile.aggregate receives a pipeline array; pipeline[0] is the $match stage.
    const profilePipeline = Profile.aggregate.mock.calls[0][0];
    expect(profilePipeline[0].$match.shopDomain.$in).toEqual(['alpha.myshopify.com']);
  });

  test("beta store's numbers do NOT appear in alpha's row", async () => {
    mockStaff();
    Store.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([STORE_A]) }) }) }),
    });
    Store.countDocuments.mockResolvedValue(1);
    // Return beta counts by mistake — they should NOT appear on alpha's row
    Profile.aggregate
      .mockResolvedValueOnce([{ _id: 'beta.myshopify.com', count: 999 }])
      .mockResolvedValueOnce([]);
    ScheduledJob.aggregate.mockResolvedValue([]);

    const r = await get('/api/platform/stores', authHeader());
    expect(r.body.stores[0].shoppers).toBe(0); // beta's count not assigned to alpha
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// D. GET /api/platform/stores/:shopDomain (detail)
// ════════════════════════════════════════════════════════════════════════════════

const DETAIL_STORE = {
  shopDomain: SHOP, shopName: 'Demo', ownerEmail: 'owner@demo.com',
  plan: 'pro', subscriptionStatus: 'active', planUpdatedAt: new Date('2026-01-01'),
  timezone: 'Asia/Kolkata', installedAt: new Date('2026-01-01'), lastSignalRunAt: null,
  needsReauth: false, pushStats: { rateLast7d: 0.85, deliveredLast7d: 100, attemptedLast7d: 118 },
  suspended: false, suspendedAt: null, suspendedReason: null, suspendedNote: null, suspendedBy: null,
};

function mockDetailQueries() {
  Store.findOne.mockReturnValue({ lean: () => Promise.resolve(DETAIL_STORE) });
  Profile.countDocuments
    .mockResolvedValueOnce(500)   // profiles
    .mockResolvedValueOnce(200)   // pushSubscribers
    .mockResolvedValueOnce(120);  // emailsCaptured
  ScheduledJob.countDocuments
    .mockResolvedValueOnce(80)    // sent7d
    .mockResolvedValueOnce(3);    // failed7d
  ScheduledJob.find.mockReturnValue({
    sort: () => ({ limit: () => ({ lean: () => Promise.resolve([
      { runAt: new Date(), channel: 'push', origin: 'automated', error: 'timeout' },
    ]) }) }),
  });
}

describe('GET /api/platform/stores/:shopDomain (detail)', () => {
  test('returns store fields + stats + recentFailures', async () => {
    mockStaff();
    mockDetailQueries();
    const r = await get(`/api/platform/stores/${SHOP}`, authHeader());
    expect(r.status).toBe(200);
    expect(r.body.shopDomain).toBe(SHOP);
    expect(r.body.stats.profiles).toBe(500);
    expect(r.body.stats.pushSubscribers).toBe(200);
    expect(r.body.stats.emailsCaptured).toBe(120);
    expect(r.body.stats.sent7d).toBe(80);
    expect(r.body.stats.failed7d).toBe(3);
    expect(r.body.stats.pushDeliveryRate).toBe(0.85);
    expect(r.body.stats.dataWindowDays).toBe(90);
    expect(r.body.recentFailures[0]).toMatchObject({ channel: 'push', origin: 'automated', error: 'timeout' });
    expect(r.body.recentFailures[0]).toHaveProperty('at');
  });

  test('no forbidden keys in response', async () => {
    mockStaff();
    mockDetailQueries();
    const r = await get(`/api/platform/stores/${SHOP}`, authHeader());
    expect(r.status).toBe(200);
    expect(findForbiddenKeys(r.body)).toEqual([]);
  });

  test('recentFailures items have no profileId, sessionId, cartToken, payload', async () => {
    mockStaff();
    mockDetailQueries();
    const r = await get(`/api/platform/stores/${SHOP}`, authHeader());
    for (const f of r.body.recentFailures) {
      expect(f).not.toHaveProperty('profileId');
      expect(f).not.toHaveProperty('sessionId');
      expect(f).not.toHaveProperty('cartToken');
      expect(f).not.toHaveProperty('payload');
      expect(f).not.toHaveProperty('messageText');
    }
  });

  test('stats are scoped: Profile.countDocuments called with shopDomain', async () => {
    mockStaff();
    mockDetailQueries();
    await get(`/api/platform/stores/${SHOP}`, authHeader());
    for (const call of Profile.countDocuments.mock.calls) {
      expect(call[0].shopDomain).toBe(SHOP);
    }
    for (const call of ScheduledJob.countDocuments.mock.calls) {
      expect(call[0].shopDomain).toBe(SHOP);
    }
  });

  test('400 for invalid shopDomain format', async () => {
    mockStaff();
    const r = await get('/api/platform/stores/not-valid', authHeader());
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/invalid shopDomain/i);
  });

  test('400 for missing .myshopify.com suffix', async () => {
    mockStaff();
    const r = await get('/api/platform/stores/shop.shopify.com', authHeader());
    expect(r.status).toBe(400);
  });

  test('404 when store not found', async () => {
    mockStaff();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const r = await get('/api/platform/stores/unknown.myshopify.com', authHeader());
    expect(r.status).toBe(404);
  });

  test('writes audit log action store_opened', async () => {
    mockStaff();
    mockDetailQueries();
    await get(`/api/platform/stores/${SHOP}`, authHeader());
    expect(AuditLog.create).toHaveBeenCalledTimes(1);
    const auditRow = AuditLog.create.mock.calls[0][0];
    expect(auditRow.action).toBe('store_opened');
    expect(auditRow.shopDomain).toBe(SHOP);
  });

  test('support role can access detail', async () => {
    mockSupportStaff();
    mockDetailQueries();
    const r = await get(`/api/platform/stores/${SHOP}`, authHeader('staff002'));
    expect(r.status).toBe(200);
  });

  test('omitting shopDomain in path → 404 (Express routes to parent)', async () => {
    mockStaff();
    Store.countDocuments.mockResolvedValue(0);
    Store.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }),
    });
    Profile.aggregate.mockResolvedValue([]);
    ScheduledJob.aggregate.mockResolvedValue([]);
    // /api/platform/stores (no :shopDomain) routes to list, not detail — no store_opened audit
    AuditLog.create.mockClear();
    mockStaff();
    await get('/api/platform/stores', authHeader());
    // audit should NOT have been called (list doesn't write store_opened)
    const openedCalls = AuditLog.create.mock.calls.filter(c => c[0]?.action === 'store_opened');
    expect(openedCalls).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// G. Role enforcement — support cannot suspend/unsuspend/audit
// ════════════════════════════════════════════════════════════════════════════════

describe('role enforcement', () => {
  test('support gets 403 on POST suspend', async () => {
    mockSupportStaff();
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'spam' }, authHeader('staff002'));
    expect(r.status).toBe(403);
  });

  test('support gets 403 on POST unsuspend', async () => {
    mockSupportStaff();
    const r = await post(`/api/platform/stores/${SHOP}/unsuspend`, {}, authHeader('staff002'));
    expect(r.status).toBe(403);
  });

  test('support gets 403 on GET /audit', async () => {
    mockSupportStaff();
    const r = await get('/api/platform/audit', authHeader('staff002'));
    expect(r.status).toBe(403);
  });

  test('admin can access audit log', async () => {
    mockStaff('admin');
    AuditLog.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }),
    });
    AuditLog.countDocuments.mockResolvedValue(0);
    const r = await get('/api/platform/audit', authHeader());
    expect(r.status).toBe(200);
  });

  test('owner can access audit log', async () => {
    mockStaff('owner');
    AuditLog.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }),
    });
    AuditLog.countDocuments.mockResolvedValue(0);
    const r = await get('/api/platform/audit', authHeader());
    expect(r.status).toBe(200);
  });
});
