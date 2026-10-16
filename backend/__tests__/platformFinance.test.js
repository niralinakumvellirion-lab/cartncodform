'use strict';

/**
 * Tests for /api/platform/finance/* routes.
 * Covers: role guards (owner 200, admin 403, support 403, no token 401),
 * mark internal: writes audit entry, test store 400, unknown store 404,
 * bad domain 400.
 */

jest.mock('../models/Store');
jest.mock('../models/SubscriptionEvent');
jest.mock('../models/AuditLog');
jest.mock('../models/Staff');

const Store             = require('../models/Store');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const AuditLog          = require('../models/AuditLog');
const Staff             = require('../models/Staff');

const express = require('express');
const jwt     = require('jsonwebtoken');

const PLATFORM_SECRET = 'platform-jwt-secret-for-test-suite-finance-333';
const SHOPIFY_SECRET  = 'shopify-api-secret-for-test-suite-only-finance';
const SHOP = 'finance-test.myshopify.com';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mintToken(role = 'owner', id = 'staff001') {
  return jwt.sign(
    { sub: id },
    PLATFORM_SECRET,
    { algorithm: 'HS256', expiresIn: '1h',
      issuer: 'shopireachboost-platform', audience: 'platform-admin' }
  );
}

function authHeader(role, id) {
  return { Authorization: `Bearer ${mintToken(role, id)}` };
}

function mockStaff(role = 'owner', id = 'staff001') {
  Staff.findById.mockReturnValue({
    lean: () => Promise.resolve({
      _id: id, email: `${role}@ops.com`, name: 'Test Staff',
      role, active: true,
    }),
  });
}

// ── Test server ───────────────────────────────────────────────────────────────

let server, base;

beforeAll((done) => {
  process.env.PLATFORM_JWT_SECRET = PLATFORM_SECRET;
  process.env.SHOPIFY_API_SECRET  = SHOPIFY_SECRET;
  process.env.SHOPIFY_API_KEY     = 'test-api-key';
  process.env.GOOGLE_CLIENT_ID    = 'test-google-client-id';
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

async function get(path, headers = {}) {
  const r = await fetch(`${base}${path}`, { headers });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function patch(path, body = {}, headers = {}) {
  const r = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// Mock Store and SubscriptionEvent for read routes
function setupReadMocks() {
  Store.find.mockReturnValue({ lean: () => Promise.resolve([]) });
  SubscriptionEvent.find.mockReturnValue({ lean: () => Promise.resolve([]) });
}

// ════════════════════════════════════════════════════════════════════════════
// GET /api/platform/finance/summary
// ════════════════════════════════════════════════════════════════════════════

describe('GET /finance/summary', () => {
  test('owner: 200 with expected shape', async () => {
    mockStaff('owner');
    setupReadMocks();
    const { status, body } = await get('/api/platform/finance/summary', authHeader('owner'));
    expect(status).toBe(200);
    expect(body).toHaveProperty('priceUsd');
    expect(body).toHaveProperty('currency');
    expect(body).toHaveProperty('estimatedMrrUsd');
    expect(body).toHaveProperty('counts');
    expect(body.counts).toHaveProperty('paying');
    expect(body.counts).toHaveProperty('trial');
    expect(body.counts).toHaveProperty('lapsed30');
    expect(body.counts).toHaveProperty('free');
    expect(body.counts).toHaveProperty('excluded');
    expect(body).toHaveProperty('months');
    expect(Array.isArray(body.months)).toBe(true);
    expect(body.months).toHaveLength(6);
  });

  test('admin: 403', async () => {
    mockStaff('admin');
    const { status } = await get('/api/platform/finance/summary', authHeader('admin'));
    expect(status).toBe(403);
  });

  test('support: 403', async () => {
    mockStaff('support');
    const { status } = await get('/api/platform/finance/summary', authHeader('support'));
    expect(status).toBe(403);
  });

  test('no token: 401', async () => {
    const { status } = await get('/api/platform/finance/summary');
    expect(status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/platform/finance/activity
// ════════════════════════════════════════════════════════════════════════════

describe('GET /finance/activity', () => {
  test('owner: 200 with expected shape', async () => {
    mockStaff('owner');
    setupReadMocks();
    const { status, body } = await get('/api/platform/finance/activity?range=week', authHeader('owner'));
    expect(status).toBe(200);
    expect(body).toHaveProperty('range', 'week');
    expect(body).toHaveProperty('counts');
    expect(body.counts).toHaveProperty('trials');
    expect(body.counts).toHaveProperty('paying');
    expect(body.counts).toHaveProperty('lost');
    expect(body).toHaveProperty('netMrrUsd');
    expect(body).toHaveProperty('events');
    expect(Array.isArray(body.events)).toBe(true);
  });

  test('defaults to week range when param omitted', async () => {
    mockStaff('owner');
    setupReadMocks();
    const { status, body } = await get('/api/platform/finance/activity', authHeader('owner'));
    expect(status).toBe(200);
    expect(body.range).toBe('week');
  });

  test('admin: 403', async () => {
    mockStaff('admin');
    const { status } = await get('/api/platform/finance/activity', authHeader('admin'));
    expect(status).toBe(403);
  });

  test('support: 403', async () => {
    mockStaff('support');
    const { status } = await get('/api/platform/finance/activity', authHeader('support'));
    expect(status).toBe(403);
  });

  test('no token: 401', async () => {
    const { status } = await get('/api/platform/finance/activity');
    expect(status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/platform/finance/stores
// ════════════════════════════════════════════════════════════════════════════

describe('GET /finance/stores', () => {
  test('owner: 200 for group=paying', async () => {
    mockStaff('owner');
    setupReadMocks();
    const { status, body } = await get('/api/platform/finance/stores?group=paying', authHeader('owner'));
    expect(status).toBe(200);
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('rows');
    expect(Array.isArray(body.rows)).toBe(true);
  });

  test('400 when group param missing or invalid', async () => {
    mockStaff('owner');
    const { status } = await get('/api/platform/finance/stores?group=invalid', authHeader('owner'));
    expect(status).toBe(400);
  });

  test('admin: 403', async () => {
    mockStaff('admin');
    const { status } = await get('/api/platform/finance/stores?group=paying', authHeader('admin'));
    expect(status).toBe(403);
  });

  test('support: 403', async () => {
    mockStaff('support');
    const { status } = await get('/api/platform/finance/stores?group=paying', authHeader('support'));
    expect(status).toBe(403);
  });

  test('no token: 401', async () => {
    const { status } = await get('/api/platform/finance/stores?group=paying');
    expect(status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/platform/finance/stores/:shopDomain/internal
// ════════════════════════════════════════════════════════════════════════════

describe('PATCH /finance/stores/:shopDomain/internal', () => {
  function mockFoundStore(overrides = {}) {
    Store.findOne.mockReturnValue({
      lean: () => Promise.resolve({
        shopDomain: SHOP,
        shopName: 'Finance Test Shop',
        isTest: false,
        isInternal: false,
        ...overrides,
      }),
    });
    Store.updateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
  }

  test('owner: 200, updates store and writes audit entry', async () => {
    mockStaff('owner');
    mockFoundStore();

    const { status, body } = await patch(
      `/api/platform/finance/stores/${SHOP}/internal`,
      { internal: true },
      authHeader('owner')
    );

    expect(status).toBe(200);
    expect(body.shopDomain).toBe(SHOP);
    expect(body.isInternal).toBe(true);

    expect(Store.updateOne).toHaveBeenCalledWith(
      { shopDomain: SHOP },
      { isInternal: true }
    );
    expect(AuditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = AuditLog.create.mock.calls[0][0];
    expect(auditCall.action).toBe('store_internal_changed');
    expect(auditCall.shopDomain).toBe(SHOP);
    expect(auditCall.meta).toEqual(expect.objectContaining({ internal: true }));
  });

  test('owner: set internal=false also works', async () => {
    mockStaff('owner');
    mockFoundStore({ isInternal: true });

    const { status, body } = await patch(
      `/api/platform/finance/stores/${SHOP}/internal`,
      { internal: false },
      authHeader('owner')
    );

    expect(status).toBe(200);
    expect(body.isInternal).toBe(false);
    expect(AuditLog.create).toHaveBeenCalledTimes(1);
  });

  test('400 if store is a test store', async () => {
    mockStaff('owner');
    mockFoundStore({ isTest: true });

    const { status } = await patch(
      `/api/platform/finance/stores/${SHOP}/internal`,
      { internal: true },
      authHeader('owner')
    );

    expect(status).toBe(400);
    expect(Store.updateOne).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  test('404 if store not found', async () => {
    mockStaff('owner');
    Store.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const { status } = await patch(
      '/api/platform/finance/stores/notfound.myshopify.com/internal',
      { internal: true },
      authHeader('owner')
    );

    expect(status).toBe(404);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  test('400 for bad shopDomain format', async () => {
    mockStaff('owner');

    const { status } = await patch(
      '/api/platform/finance/stores/not-a-shopify-domain/internal',
      { internal: true },
      authHeader('owner')
    );

    expect(status).toBe(400);
    expect(Store.findOne).not.toHaveBeenCalled();
  });

  test('400 for non-boolean internal value', async () => {
    mockStaff('owner');
    mockFoundStore();

    const { status } = await patch(
      `/api/platform/finance/stores/${SHOP}/internal`,
      { internal: 'yes' },
      authHeader('owner')
    );

    expect(status).toBe(400);
  });

  test('admin: 403', async () => {
    mockStaff('admin');
    const { status } = await patch(
      `/api/platform/finance/stores/${SHOP}/internal`,
      { internal: true },
      authHeader('admin')
    );
    expect(status).toBe(403);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  test('support: 403', async () => {
    mockStaff('support');
    const { status } = await patch(
      `/api/platform/finance/stores/${SHOP}/internal`,
      { internal: true },
      authHeader('support')
    );
    expect(status).toBe(403);
  });

  test('no token: 401', async () => {
    const { status } = await patch(
      `/api/platform/finance/stores/${SHOP}/internal`,
      { internal: true }
    );
    expect(status).toBe(401);
  });
});
