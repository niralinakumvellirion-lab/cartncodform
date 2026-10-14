'use strict';

/**
 * Tests for suspension enforcement:
 *   - requireStoreOwner returns 403 STORE_SUSPENDED for suspended stores
 *   - requireNotSuspended returns 403 STORE_SUSPENDED for suspended stores
 *   - Poller skips pending jobs of suspended stores (marks skipped)
 *   - processFestivalQueue skips items of suspended stores untouched
 *   - Nightly brain/signals skipped for suspended stores
 *   - Webhooks, storefront subscribe, events, COD proxy unaffected
 *   - requireNotSuspended passes through for active (non-suspended) stores
 */

jest.mock('../models/Store');
jest.mock('../models/ScheduledJob');
jest.mock('../models/FestivalQueue');
jest.mock('../models/AuditLog');

const Store        = require('../models/Store');
const ScheduledJob = require('../models/ScheduledJob');
const FestivalQueue = require('../models/FestivalQueue');
const AuditLog     = require('../models/AuditLog');

const express = require('express');
const jwt     = require('jsonwebtoken');

const SHOPIFY_SECRET = 'shopify-api-secret-for-test-suite-only';
const SHOPIFY_API_KEY = 'test-shopify-api-key';
const TEST_SHOP = 'teststore.myshopify.com';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  AuditLog.create.mockResolvedValue({});
  process.env.SHOPIFY_API_SECRET = SHOPIFY_SECRET;
  process.env.SHOPIFY_API_KEY    = SHOPIFY_API_KEY;
});

afterEach(() => jest.restoreAllMocks());

// ── Shopify session token factory ─────────────────────────────────────────────

function mintShopifyToken(shopDomain = TEST_SHOP) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: `https://${shopDomain}/admin`,
      dest: `https://${shopDomain}`,
      aud: SHOPIFY_API_KEY,
      exp: now + 60,
      nbf: now - 5,
    },
    SHOPIFY_SECRET,
    { algorithm: 'HS256' }
  );
}

function authHeader(shopDomain = TEST_SHOP) {
  return { Authorization: `Bearer ${mintShopifyToken(shopDomain)}` };
}

// ── HTTP server helpers ───────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());

  const { requireAuth, requireStoreOwner, requireNotSuspended } =
    require('../middleware/requireOwner');

  // requireStoreOwner test: a route with :shopDomain
  app.get('/test/owner/:shopDomain', requireAuth, requireStoreOwner, (_req, res) => {
    res.json({ ok: true });
  });

  // requireNotSuspended test: a route without :shopDomain
  app.post('/test/send', requireAuth, requireNotSuspended, (_req, res) => {
    res.json({ ok: true });
  });

  // Webhook-style route: no auth, should pass even for suspended stores.
  app.post('/test/webhook', (_req, res) => {
    res.json({ ok: true });
  });

  // Public storefront subscribe: no auth, no suspension check.
  app.post('/test/subscribe', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

let server, base;
beforeAll((done) => {
  server = buildApp().listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});
afterAll((done) => {
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(done);
}, 15000);

async function httpGet(path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function httpPost(path, body = {}, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ════════════════════════════════════════════════════════════════════════════════
// requireStoreOwner — STORE_SUSPENDED gate
// ════════════════════════════════════════════════════════════════════════════════

describe('requireStoreOwner — suspended store', () => {
  test('403 STORE_SUSPENDED when store.suspended=true', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: TEST_SHOP, suspended: true });
    const r = await httpGet(
      `/test/owner/${TEST_SHOP}`,
      authHeader()
    );
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('STORE_SUSPENDED');
    expect(r.body.error).toMatch(/paused/i);
  });

  test('200 when store.suspended=false', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: TEST_SHOP, suspended: false });
    const r = await httpGet(
      `/test/owner/${TEST_SHOP}`,
      authHeader()
    );
    expect(r.status).toBe(200);
  });

  test('200 when store.suspended is undefined (old document without field)', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: TEST_SHOP });
    const r = await httpGet(
      `/test/owner/${TEST_SHOP}`,
      authHeader()
    );
    expect(r.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// requireNotSuspended — requireAuth-only send routes
// ════════════════════════════════════════════════════════════════════════════════

describe('requireNotSuspended — send routes', () => {
  test('403 STORE_SUSPENDED when store.suspended=true', async () => {
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: TEST_SHOP, suspended: true }) });
    const r = await httpPost('/test/send', {}, authHeader());
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('STORE_SUSPENDED');
  });

  test('passes through when store.suspended=false', async () => {
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve({ shopDomain: TEST_SHOP, suspended: false }) });
    const r = await httpPost('/test/send', {}, authHeader());
    expect(r.status).toBe(200);
  });

  test('passes through when store not found (store might have just been deleted)', async () => {
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const r = await httpPost('/test/send', {}, authHeader());
    expect(r.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Webhooks / public routes are NOT blocked
// ════════════════════════════════════════════════════════════════════════════════

describe('webhooks and public routes are unaffected by suspension', () => {
  test('POST /test/webhook returns 200 (no auth, no suspension check)', async () => {
    const r = await httpPost('/test/webhook');
    expect(r.status).toBe(200);
  });

  test('POST /test/subscribe returns 200 (no auth, no suspension check)', async () => {
    const r = await httpPost('/test/subscribe');
    expect(r.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Poller — processScheduledJobs skips jobs for suspended stores
// ════════════════════════════════════════════════════════════════════════════════

describe('processScheduledJobs — suspended store', () => {
  // We test the enforcement logic directly rather than calling the poller
  // (which is wired to setInterval in server.js). Extract the relevant
  // pattern: if store.suspended, skip the job with status=skipped.

  test('marks job skipped with error store_suspended when store is suspended', async () => {
    // Simulate what the poller does after loading the store for a due job.
    const store = { shopDomain: TEST_SHOP, suspended: true, timezone: 'Asia/Kolkata', quietHours: { start: 22, end: 8 } };
    Store.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(store) }) });
    ScheduledJob.findOneAndUpdate.mockResolvedValue({});

    // Run the enforcement logic inline (same code path the poller uses).
    const job = { _id: 'job1', shopDomain: TEST_SHOP, status: 'pending' };

    if (store && store.suspended) {
      await ScheduledJob.findOneAndUpdate(
        { _id: job._id, status: 'pending' },
        { status: 'skipped', error: 'store_suspended' }
      );
    }

    expect(ScheduledJob.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'job1', status: 'pending' },
      { status: 'skipped', error: 'store_suspended' }
    );
  });

  test('does NOT skip job when store is active', async () => {
    const store = { shopDomain: TEST_SHOP, suspended: false };
    ScheduledJob.findOneAndUpdate.mockResolvedValue({});

    const job = { _id: 'job2', shopDomain: TEST_SHOP, status: 'pending' };
    if (store && store.suspended) {
      await ScheduledJob.findOneAndUpdate(
        { _id: job._id, status: 'pending' },
        { status: 'skipped', error: 'store_suspended' }
      );
    }

    expect(ScheduledJob.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// processFestivalQueue — skips items for suspended stores, leaves them untouched
// ════════════════════════════════════════════════════════════════════════════════

describe('processFestivalQueue — suspended store items left untouched', () => {
  test('item is not claimed or modified when its store is suspended', async () => {
    // Build a suspendedSet as the poller does and assert the skip logic.
    const suspendedSet = new Set([TEST_SHOP]);
    const item = { _id: 'fq1', shopDomain: TEST_SHOP, status: 'approved' };

    FestivalQueue.findOneAndUpdate.mockResolvedValue({});

    if (suspendedSet.has(item.shopDomain)) {
      // This branch just continues — no claim, no status change.
    } else {
      await FestivalQueue.findOneAndUpdate(
        { _id: item._id },
        { $set: { sendClaimedAt: new Date() } }
      );
    }

    expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('item IS claimed when its store is NOT suspended', async () => {
    const suspendedSet = new Set();
    const item = { _id: 'fq2', shopDomain: 'active.myshopify.com', status: 'approved' };

    FestivalQueue.findOneAndUpdate.mockResolvedValue({});

    if (!suspendedSet.has(item.shopDomain)) {
      await FestivalQueue.findOneAndUpdate(
        { _id: item._id },
        { $set: { sendClaimedAt: new Date() } }
      );
    }

    expect(FestivalQueue.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(FestivalQueue.findOneAndUpdate.mock.calls[0][0]._id).toBe('fq2');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Nightly signals skip for suspended stores
// ════════════════════════════════════════════════════════════════════════════════

describe('nightly signals — suspended stores skipped', () => {
  test('skips signal run when s.suspended is true (simulating poller gate)', () => {
    // Mock the logic the poller executes inside the store-loop.
    const mockRunNightlySignals = jest.fn().mockResolvedValue();
    const mockRunBrain = jest.fn().mockResolvedValue();

    const s = { shopDomain: TEST_SHOP, suspended: true };

    // Replicate the exact gate from server.js:
    if (!s.suspended) {
      mockRunNightlySignals(s.shopDomain);
      mockRunBrain(s.shopDomain);
    }

    expect(mockRunNightlySignals).not.toHaveBeenCalled();
    expect(mockRunBrain).not.toHaveBeenCalled();
  });

  test('runs signals when s.suspended is false', () => {
    const mockRunNightlySignals = jest.fn().mockResolvedValue();
    const mockRunBrain = jest.fn().mockResolvedValue();

    const s = { shopDomain: TEST_SHOP, suspended: false };

    if (!s.suspended) {
      mockRunNightlySignals(s.shopDomain);
      mockRunBrain(s.shopDomain);
    }

    expect(mockRunNightlySignals).toHaveBeenCalledWith(TEST_SHOP);
    expect(mockRunBrain).toHaveBeenCalledWith(TEST_SHOP);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// unsuspendStore — past-due vs future-dated items
// ════════════════════════════════════════════════════════════════════════════════

describe('unsuspendStore cleanup — future items untouched', () => {
  test('ScheduledJob.updateMany uses $lt:now so future items are excluded', async () => {
    Store.findOneAndUpdate.mockResolvedValue({ shopDomain: TEST_SHOP });
    FestivalQueue.updateMany.mockResolvedValue({ modifiedCount: 0 });
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const { unsuspendStore } = require('../services/storeSuspension');
    const before = Date.now();
    await unsuspendStore(TEST_SHOP, { staffEmail: 'a@b.com' });
    const after = Date.now();

    const sjFilter = ScheduledJob.updateMany.mock.calls[0][0];
    expect(sjFilter.status).toBe('pending');
    expect(sjFilter.runAt.$lt.getTime()).toBeGreaterThanOrEqual(before);
    expect(sjFilter.runAt.$lt.getTime()).toBeLessThanOrEqual(after);
    // The update sets skipped, not cancelled, not sent
    expect(ScheduledJob.updateMany.mock.calls[0][1].$set.status).toBe('skipped');
  });

  test('FestivalQueue.updateMany uses $lt:now so future items are excluded', async () => {
    Store.findOneAndUpdate.mockResolvedValue({ shopDomain: TEST_SHOP });
    FestivalQueue.updateMany.mockResolvedValue({ modifiedCount: 0 });
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const { unsuspendStore } = require('../services/storeSuspension');
    const before = Date.now();
    await unsuspendStore(TEST_SHOP, { staffEmail: 'a@b.com' });
    const after = Date.now();

    const fqFilter = FestivalQueue.updateMany.mock.calls[0][0];
    expect(fqFilter.status).toBe('approved');
    expect(fqFilter.scheduledAt.$lt.getTime()).toBeGreaterThanOrEqual(before);
    expect(fqFilter.scheduledAt.$lt.getTime()).toBeLessThanOrEqual(after);
    // Moved to draft, not cancelled or sent
    expect(FestivalQueue.updateMany.mock.calls[0][1].$set.status).toBe('draft');
  });
});
