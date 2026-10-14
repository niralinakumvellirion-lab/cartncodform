'use strict';

/**
 * Tests for:
 *   E. POST /api/platform/stores/:shopDomain/suspend and /unsuspend
 *   F. GET /api/platform/audit
 *   G. Input validation, role enforcement, round-trip, forbidden-key scan
 *   G (strengthened): unsuspendStore model-level assertions
 */

jest.mock('../models/Store');
jest.mock('../models/Profile');
jest.mock('../models/ScheduledJob');
jest.mock('../models/FestivalQueue');
jest.mock('../models/AuditLog');
jest.mock('../models/Staff');
jest.mock('../services/storeSuspension');

const Store        = require('../models/Store');
const ScheduledJob = require('../models/ScheduledJob');
const FestivalQueue = require('../models/FestivalQueue');
const AuditLog     = require('../models/AuditLog');
const Staff        = require('../models/Staff');
const { suspendStore, unsuspendStore } = require('../services/storeSuspension');

const express = require('express');
const jwt     = require('jsonwebtoken');

const PLATFORM_SECRET = 'platform-jwt-secret-for-test-suite-4444444444';
const SHOPIFY_SECRET  = 'shopify-api-secret-for-test-suite-only';
const SHOP = 'demo.myshopify.com';

function mintStaffToken(staffId = 'staff001') {
  return jwt.sign(
    { sub: staffId },
    PLATFORM_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'shopireachboost-platform', audience: 'platform-admin' }
  );
}
function authHeader(staffId) { return { Authorization: `Bearer ${mintStaffToken(staffId)}` }; }

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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  AuditLog.create.mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());

function mockAdmin(id = 'staff001') {
  Staff.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: id, email: 'admin@ops.com', name: 'Admin', role: 'admin', active: true }) });
}
function mockOwner(id = 'staff001') {
  Staff.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: id, email: 'owner@ops.com', name: 'Owner', role: 'owner', active: true }) });
}
function mockSupport(id = 'staff002') {
  Staff.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: id, email: 'sup@ops.com', name: 'Support', role: 'support', active: true }) });
}

async function post(path, body = {}, headers = {}) {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function get(path, headers = {}) {
  const r = await fetch(`${base}${path}`, { headers });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ════════════════════════════════════════════════════════════════════════════════
// E. POST /suspend
// ════════════════════════════════════════════════════════════════════════════════

describe('POST /api/platform/stores/:shopDomain/suspend', () => {
  test('200 — admin suspends an active store', async () => {
    mockAdmin();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: SHOP, suspended: false }) });
    suspendStore.mockResolvedValue({ ok: true });
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'spam' }, authHeader());
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(suspendStore).toHaveBeenCalledWith(SHOP, expect.objectContaining({ reason: 'spam', staffEmail: 'admin@ops.com' }));
  });

  test('200 — owner suspends with note', async () => {
    mockOwner();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: SHOP, suspended: false }) });
    suspendStore.mockResolvedValue({ ok: true });
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'policy', note: 'Terms violation' }, authHeader());
    expect(r.status).toBe(200);
    expect(suspendStore).toHaveBeenCalledWith(SHOP, expect.objectContaining({ note: 'Terms violation' }));
  });

  test('409 if already suspended', async () => {
    mockAdmin();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: SHOP, suspended: true }) });
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'spam' }, authHeader());
    expect(r.status).toBe(409);
    expect(suspendStore).not.toHaveBeenCalled();
  });

  test('404 if store not found', async () => {
    mockAdmin();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'spam' }, authHeader());
    expect(r.status).toBe(404);
  });

  test('400 on invalid reason', async () => {
    mockAdmin();
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'invalid_reason' }, authHeader());
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/reason must be one of/i);
  });

  test('400 on missing reason', async () => {
    mockAdmin();
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, {}, authHeader());
    expect(r.status).toBe(400);
  });

  test('400 on note exceeding 500 chars', async () => {
    mockAdmin();
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'spam', note: 'x'.repeat(501) }, authHeader());
    expect(r.status).toBe(400);
  });

  test('400 on invalid shopDomain', async () => {
    mockAdmin();
    const r = await post('/api/platform/stores/not-a-valid-domain/suspend', { reason: 'spam' }, authHeader());
    expect(r.status).toBe(400);
  });

  test('403 for support role', async () => {
    mockSupport();
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'spam' }, authHeader('staff002'));
    expect(r.status).toBe(403);
    expect(suspendStore).not.toHaveBeenCalled();
  });

  test('no forbidden keys in 200 response', async () => {
    mockAdmin();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: SHOP, suspended: false }) });
    suspendStore.mockResolvedValue({ ok: true });
    const r = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'other' }, authHeader());
    expect(findForbiddenKeys(r.body)).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// E. POST /unsuspend
// ════════════════════════════════════════════════════════════════════════════════

describe('POST /api/platform/stores/:shopDomain/unsuspend', () => {
  test('200 — admin unsuspends a suspended store', async () => {
    mockAdmin();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: SHOP, suspended: true }) });
    unsuspendStore.mockResolvedValue({ ok: true, festivalDrafted: 2, jobsSkipped: 5 });
    const r = await post(`/api/platform/stores/${SHOP}/unsuspend`, {}, authHeader());
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.festivalDrafted).toBe(2);
    expect(r.body.jobsSkipped).toBe(5);
    expect(unsuspendStore).toHaveBeenCalledWith(SHOP, expect.objectContaining({ staffEmail: 'admin@ops.com' }));
  });

  test('409 if store is NOT suspended', async () => {
    mockAdmin();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: SHOP, suspended: false }) });
    const r = await post(`/api/platform/stores/${SHOP}/unsuspend`, {}, authHeader());
    expect(r.status).toBe(409);
    expect(unsuspendStore).not.toHaveBeenCalled();
  });

  test('404 if store not found', async () => {
    mockAdmin();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const r = await post(`/api/platform/stores/${SHOP}/unsuspend`, {}, authHeader());
    expect(r.status).toBe(404);
  });

  test('400 on invalid shopDomain', async () => {
    mockAdmin();
    const r = await post('/api/platform/stores/bad-domain/unsuspend', {}, authHeader());
    expect(r.status).toBe(400);
  });

  test('403 for support role', async () => {
    mockSupport();
    const r = await post(`/api/platform/stores/${SHOP}/unsuspend`, {}, authHeader('staff002'));
    expect(r.status).toBe(403);
    expect(unsuspendStore).not.toHaveBeenCalled();
  });

  test('no forbidden keys in 200 response', async () => {
    mockAdmin();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: SHOP, suspended: true }) });
    unsuspendStore.mockResolvedValue({ ok: true, festivalDrafted: 0, jobsSkipped: 0 });
    const r = await post(`/api/platform/stores/${SHOP}/unsuspend`, {}, authHeader());
    expect(findForbiddenKeys(r.body)).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// G. Suspend → unsuspend round trip (service layer mocked)
// ════════════════════════════════════════════════════════════════════════════════

describe('suspend → unsuspend round trip', () => {
  test('calling suspend then unsuspend reaches both service functions', async () => {
    mockAdmin();

    // First: suspend
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: SHOP, suspended: false }) });
    suspendStore.mockResolvedValue({ ok: true });
    const r1 = await post(`/api/platform/stores/${SHOP}/suspend`, { reason: 'payment' }, authHeader());
    expect(r1.status).toBe(200);

    // Second: unsuspend — store is now "suspended: true" (from a fresh mock)
    mockAdmin();
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: SHOP, suspended: true }) });
    unsuspendStore.mockResolvedValue({ ok: true, festivalDrafted: 1, jobsSkipped: 3 });
    const r2 = await post(`/api/platform/stores/${SHOP}/unsuspend`, {}, authHeader());
    expect(r2.status).toBe(200);
    expect(r2.body.festivalDrafted).toBe(1);
    expect(r2.body.jobsSkipped).toBe(3);

    expect(suspendStore).toHaveBeenCalledTimes(1);
    expect(unsuspendStore).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// F. GET /api/platform/audit
// ════════════════════════════════════════════════════════════════════════════════

describe('GET /api/platform/audit', () => {
  function mockAuditLog(rows = []) {
    AuditLog.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve(rows) }) }) }),
    });
    AuditLog.countDocuments.mockResolvedValue(rows.length);
  }

  test('200 — returns logs without ip', async () => {
    mockAdmin();
    const row = { at: new Date(), staffEmail: 'admin@ops.com', staffRole: 'admin', action: 'store_opened', shopDomain: SHOP, meta: { reason: 'test' } };
    mockAuditLog([row]);
    const r = await get('/api/platform/audit', authHeader());
    expect(r.status).toBe(200);
    expect(r.body.logs).toHaveLength(1);
    expect(r.body.logs[0]).not.toHaveProperty('ip');
    expect(r.body.logs[0].action).toBe('store_opened');
  });

  test('supports filtering by shopDomain', async () => {
    mockAdmin();
    mockAuditLog([]);
    await get(`/api/platform/audit?shopDomain=${SHOP}`, authHeader());
    const filterArg = AuditLog.find.mock.calls[0][0];
    expect(filterArg.shopDomain).toBe(SHOP);
  });

  test('supports filtering by action', async () => {
    mockAdmin();
    mockAuditLog([]);
    await get('/api/platform/audit?action=store_suspended', authHeader());
    const filterArg = AuditLog.find.mock.calls[0][0];
    expect(filterArg.action).toBe('store_suspended');
  });

  test('respects limit (max 200)', async () => {
    mockAdmin();
    mockAuditLog([]);
    await get('/api/platform/audit?limit=9999', authHeader());
    const limitCall = AuditLog.find.mock.calls[0];
    // limit is enforced inside the route — we check the clamped limit in the response
    const r = await (async () => {
      mockAdmin();
      mockAuditLog([]);
      return get('/api/platform/audit?limit=9999', authHeader());
    })();
    expect(r.body.limit).toBe(200);
  });

  test('403 for support role', async () => {
    mockSupport();
    const r = await get('/api/platform/audit', authHeader('staff002'));
    expect(r.status).toBe(403);
  });

  test('no forbidden keys in response', async () => {
    mockAdmin();
    mockAuditLog([{ at: new Date(), staffEmail: 'a@b.com', staffRole: 'admin', action: 'login', shopDomain: null, meta: {} }]);
    const r = await get('/api/platform/audit', authHeader());
    expect(findForbiddenKeys(r.body)).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// G (strengthened). unsuspendStore with mocked models — service-level assertions
// ════════════════════════════════════════════════════════════════════════════════

describe('unsuspendStore (strengthened) — model-level assertions', () => {
  // Use the real service, mock the models it calls.
  let realUnsuspendStore;

  beforeAll(() => {
    jest.unmock('../services/storeSuspension');
    // Reload with real implementation
    jest.resetModules();
    jest.mock('../models/Store');
    jest.mock('../models/ScheduledJob');
    jest.mock('../models/FestivalQueue');
    jest.mock('../models/AuditLog');
    realUnsuspendStore = require('../services/storeSuspension').unsuspendStore;
  });

  afterAll(() => {
    jest.mock('../services/storeSuspension');
  });

  beforeEach(() => {
    const S  = require('../models/Store');
    const SJ = require('../models/ScheduledJob');
    const FQ = require('../models/FestivalQueue');
    const AL = require('../models/AuditLog');
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    AL.create.mockResolvedValue({});
    S.findOneAndUpdate.mockResolvedValue({ shopDomain: SHOP });
    SJ.updateMany.mockResolvedValue({ modifiedCount: 0 });
    FQ.updateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  test('(i) moves approved past-due FestivalQueue items to status draft', async () => {
    const FQ = require('../models/FestivalQueue');
    FQ.updateMany.mockResolvedValue({ modifiedCount: 3 });
    const result = await realUnsuspendStore(SHOP, { staffEmail: 'ops@co.com' });
    const fqFilter = FQ.updateMany.mock.calls[0][0];
    const fqUpdate = FQ.updateMany.mock.calls[0][1];
    expect(fqFilter.shopDomain).toBe(SHOP);
    expect(fqFilter.status).toBe('approved');
    expect(fqFilter.scheduledAt.$lt).toBeInstanceOf(Date);
    expect(fqUpdate.$set.status).toBe('draft');
    expect(result.festivalDrafted).toBe(3);
  });

  test('(ii) marks pending past-due ScheduledJobs as skipped with error store_suspended', async () => {
    const SJ = require('../models/ScheduledJob');
    SJ.updateMany.mockResolvedValue({ modifiedCount: 7 });
    const result = await realUnsuspendStore(SHOP, { staffEmail: 'ops@co.com' });
    const sjFilter = SJ.updateMany.mock.calls[0][0];
    const sjUpdate = SJ.updateMany.mock.calls[0][1];
    expect(sjFilter.shopDomain).toBe(SHOP);
    expect(sjFilter.status).toBe('pending');
    expect(sjFilter.runAt.$lt).toBeInstanceOf(Date);
    expect(sjUpdate.$set.status).toBe('skipped');
    expect(sjUpdate.$set.error).toBe('store_suspended');
    expect(result.jobsSkipped).toBe(7);
  });

  test('(iii) leaves future items alone: $lt filter is set to roughly now', async () => {
    const SJ = require('../models/ScheduledJob');
    const FQ = require('../models/FestivalQueue');
    const before = Date.now();
    await realUnsuspendStore(SHOP, { staffEmail: 'ops@co.com' });
    const after = Date.now();

    const fqTime = FQ.updateMany.mock.calls[0][0].scheduledAt.$lt.getTime();
    const sjTime = SJ.updateMany.mock.calls[0][0].runAt.$lt.getTime();
    expect(fqTime).toBeGreaterThanOrEqual(before);
    expect(fqTime).toBeLessThanOrEqual(after);
    expect(sjTime).toBeGreaterThanOrEqual(before);
    expect(sjTime).toBeLessThanOrEqual(after);
  });

  test('(iv) returns correct counts from modifiedCount', async () => {
    const SJ = require('../models/ScheduledJob');
    const FQ = require('../models/FestivalQueue');
    FQ.updateMany.mockResolvedValue({ modifiedCount: 4 });
    SJ.updateMany.mockResolvedValue({ modifiedCount: 9 });
    const result = await realUnsuspendStore(SHOP, { staffEmail: 'ops@co.com' });
    expect(result.ok).toBe(true);
    expect(result.festivalDrafted).toBe(4);
    expect(result.jobsSkipped).toBe(9);
  });

  test('festival items with status other than approved are NOT touched', async () => {
    const FQ = require('../models/FestivalQueue');
    await realUnsuspendStore(SHOP, { staffEmail: 'ops@co.com' });
    const fqFilter = FQ.updateMany.mock.calls[0][0];
    // The filter targets only status:approved — sent/draft/cancelled left alone
    expect(fqFilter.status).toBe('approved');
    expect(fqFilter.status).not.toBe('sent');
    expect(fqFilter.status).not.toBe('draft');
  });

  test('pending jobs with runAt in the future are NOT touched (separate query confirms)', async () => {
    const SJ = require('../models/ScheduledJob');
    await realUnsuspendStore(SHOP, { staffEmail: 'ops@co.com' });
    const sjFilter = SJ.updateMany.mock.calls[0][0];
    // $lt: now means only past-due items are targeted; future items have runAt > now
    expect(sjFilter.runAt.$lt).toBeInstanceOf(Date);
    // No $gte — there is no upper bound; only items BEFORE now are touched
    expect(sjFilter.runAt.$gte).toBeUndefined();
  });
});
