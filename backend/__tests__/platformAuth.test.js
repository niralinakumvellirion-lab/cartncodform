'use strict';

/**
 * Tests for /api/platform/auth/google, /api/platform/me,
 * requireStaff middleware, requireRole, AuditLog immutability,
 * and the 503 guard when PLATFORM_JWT_SECRET is not configured.
 */

// ── Mock google-auth-library BEFORE requiring anything else ──────────────────

const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

// ── Mock models ──────────────────────────────────────────────────────────────

jest.mock('../models/Staff');
jest.mock('../models/AuditLog');

const Staff    = require('../models/Staff');
const AuditLog = require('../models/AuditLog');

// ── App + constants ──────────────────────────────────────────────────────────

const express = require('express');
const jwt     = require('jsonwebtoken');

const VALID_SECRET     = 'a-sufficiently-long-platform-secret-32-chars-min!!';
const SHOPIFY_SECRET   = 'shopify-secret-different-from-platform-abcdef';
const GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

// Helper: mock Staff.findOne to return a value with a .lean() chainable.
function mockFindOne(val) {
  Staff.findOne.mockReturnValue({ lean: () => Promise.resolve(val) });
}

function makeTicket(overrides = {}) {
  return {
    getPayload: () => ({
      email: 'alice@example.com',
      email_verified: true,
      name: 'Alice',
      ...overrides,
    }),
  };
}

function mintToken(staffId, opts = {}) {
  return jwt.sign(
    { sub: String(staffId) },
    opts.secret || VALID_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: opts.expiresIn || '8h',
      issuer:    opts.issuer   || 'shopireachboost-platform',
      audience:  opts.audience || 'platform-admin',
    }
  );
}

function mintShopifyToken() {
  return jwt.sign(
    { sub: 'shop', dest: 'https://example.myshopify.com' },
    SHOPIFY_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '1m',
      issuer:   'https://example.myshopify.com/admin',
      audience: 'test-api-key',
    }
  );
}

// ── App factory ──────────────────────────────────────────────────────────────

function getApp() {
  require('../routes/platform/index')._resetConfigCache();
  const app = express();
  app.use(express.json());
  app.use('/api/platform', require('../routes/platform/index'));
  const { requireStaff, requireRole } = require('../middleware/requireStaff');
  app.get('/test/admin-only', requireStaff, requireRole('owner', 'admin'), (_req, res) => res.json({ ok: true }));
  app.get('/test/me-staff', requireStaff, (req, res) => res.json(req.staff));
  return app;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

let server, base;

beforeAll((done) => {
  server = getApp().listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(done);
}, 15000);

// ── Global env + mock reset ───────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  process.env.PLATFORM_JWT_SECRET  = VALID_SECRET;
  process.env.SHOPIFY_API_SECRET   = SHOPIFY_SECRET;
  process.env.GOOGLE_CLIENT_ID     = GOOGLE_CLIENT_ID;
  process.env.PLATFORM_OWNER_EMAIL = 'owner@example.com';

  AuditLog.create.mockResolvedValue({});
  Staff.updateOne.mockResolvedValue({});

  require('../routes/platform/index')._resetConfigCache();
});

afterEach(() => {
  jest.restoreAllMocks();
  require('../routes/platform/index')._resetConfigCache();
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function httpPost(path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function httpGet(path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// ════════════════════════════════════════════════════════════════════════════════
// 503 guard
// ════════════════════════════════════════════════════════════════════════════════

describe('503 guard — PLATFORM_JWT_SECRET missing or invalid', () => {
  test('returns 503 when secret is absent', async () => {
    delete process.env.PLATFORM_JWT_SECRET;
    require('../routes/platform/index')._resetConfigCache();
    const r = await httpPost('/api/platform/auth/google', { idToken: 'x' });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/not configured/i);
  });

  test('returns 503 when secret is shorter than 32 chars', async () => {
    process.env.PLATFORM_JWT_SECRET = 'tooshort';
    require('../routes/platform/index')._resetConfigCache();
    const r = await httpPost('/api/platform/auth/google', { idToken: 'x' });
    expect(r.status).toBe(503);
  });

  test('returns 503 when secret equals SHOPIFY_API_SECRET', async () => {
    process.env.PLATFORM_JWT_SECRET = SHOPIFY_SECRET;
    require('../routes/platform/index')._resetConfigCache();
    const r = await httpPost('/api/platform/auth/google', { idToken: 'x' });
    expect(r.status).toBe(503);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// POST /api/platform/auth/google — input validation
// ════════════════════════════════════════════════════════════════════════════════

describe('POST /api/platform/auth/google — input validation', () => {
  test('400 when idToken is missing', async () => {
    const r = await httpPost('/api/platform/auth/google', {});
    expect(r.status).toBe(400);
  });

  test('401 when Google rejects the token (wrong audience / bad signature)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Wrong recipient'));
    const r = await httpPost('/api/platform/auth/google', { idToken: 'bad' });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/invalid google token/i);
  });

  test('403 when email_verified is false', async () => {
    mockVerifyIdToken.mockResolvedValue(makeTicket({ email_verified: false }));
    Staff.countDocuments.mockResolvedValue(1);
    const r = await httpPost('/api/platform/auth/google', { idToken: 'tok' });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/not verified/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// POST /api/platform/auth/google — access control
// ════════════════════════════════════════════════════════════════════════════════

describe('POST /api/platform/auth/google — unknown / inactive email', () => {
  test('403 and audit row for unknown email; meta has only emailDomain, not full email', async () => {
    mockVerifyIdToken.mockResolvedValue(makeTicket({ email: 'stranger@evil.com' }));
    Staff.countDocuments.mockResolvedValue(2);
    mockFindOne(null);

    const r = await httpPost('/api/platform/auth/google', { idToken: 'tok' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('This account is not allowed');

    expect(AuditLog.create).toHaveBeenCalledTimes(1);
    const row = AuditLog.create.mock.calls[0][0];
    expect(row.action).toBe('login_refused');
    expect(JSON.stringify(row.meta)).not.toContain('stranger@evil.com');
    expect(row.meta.emailDomain).toBe('evil.com');
  });

  test('403 for inactive staff — same message, no info leak', async () => {
    mockVerifyIdToken.mockResolvedValue(makeTicket({ email: 'bob@example.com' }));
    Staff.countDocuments.mockResolvedValue(2);
    mockFindOne(null);

    const r = await httpPost('/api/platform/auth/google', { idToken: 'tok' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('This account is not allowed');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// POST /api/platform/auth/google — bootstrap
// ════════════════════════════════════════════════════════════════════════════════

describe('POST /api/platform/auth/google — bootstrap', () => {
  test('creates owner when collection is empty and email matches PLATFORM_OWNER_EMAIL', async () => {
    mockVerifyIdToken.mockResolvedValue(makeTicket({ email: 'owner@example.com' }));
    Staff.countDocuments.mockResolvedValue(0);
    const fakeOwner = { _id: 'oid1', email: 'owner@example.com', name: 'Owner', role: 'owner' };
    Staff.create.mockResolvedValue(fakeOwner);

    const r = await httpPost('/api/platform/auth/google', { idToken: 'tok' });
    expect(r.status).toBe(200);
    expect(r.body.staff.role).toBe('owner');
    expect(r.body.token).toBeTruthy();

    const row = AuditLog.create.mock.calls[0][0];
    expect(row.action).toBe('login');
  });

  test('403 bootstrap refused when email does not match PLATFORM_OWNER_EMAIL', async () => {
    mockVerifyIdToken.mockResolvedValue(makeTicket({ email: 'random@example.com' }));
    Staff.countDocuments.mockResolvedValue(0);

    const r = await httpPost('/api/platform/auth/google', { idToken: 'tok' });
    expect(r.status).toBe(403);
    expect(Staff.create).not.toHaveBeenCalled();
  });

  test('403 bootstrap refused when any Staff row already exists', async () => {
    mockVerifyIdToken.mockResolvedValue(makeTicket({ email: 'owner@example.com' }));
    Staff.countDocuments.mockResolvedValue(1);
    mockFindOne(null);

    const r = await httpPost('/api/platform/auth/google', { idToken: 'tok' });
    expect(r.status).toBe(403);
    expect(Staff.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// POST /api/platform/auth/google — successful login
// ════════════════════════════════════════════════════════════════════════════════

describe('POST /api/platform/auth/google — successful login', () => {
  test('200 returns token and staff object, writes login audit row, updates lastLoginAt', async () => {
    mockVerifyIdToken.mockResolvedValue(makeTicket({ email: 'alice@example.com' }));
    Staff.countDocuments.mockResolvedValue(1);
    const alice = { _id: 'aid1', email: 'alice@example.com', name: 'Alice', role: 'admin', active: true };
    mockFindOne(alice);

    const r = await httpPost('/api/platform/auth/google', { idToken: 'tok' });
    expect(r.status).toBe(200);
    expect(r.body.staff).toMatchObject({ email: 'alice@example.com', role: 'admin' });
    expect(r.body.token).toBeTruthy();

    const decoded = jwt.verify(r.body.token, VALID_SECRET, {
      algorithms: ['HS256'],
      issuer:   'shopireachboost-platform',
      audience: 'platform-admin',
    });
    expect(decoded.sub).toBe('aid1');

    expect(Staff.updateOne).toHaveBeenCalledWith({ _id: 'aid1' }, { lastLoginAt: expect.any(Date) });

    const row = AuditLog.create.mock.calls[0][0];
    expect(row.action).toBe('login');
  });

  test('token does not contain role claim', async () => {
    mockVerifyIdToken.mockResolvedValue(makeTicket({ email: 'alice@example.com' }));
    Staff.countDocuments.mockResolvedValue(1);
    mockFindOne({ _id: 'aid2', email: 'alice@example.com', name: 'Alice', role: 'owner', active: true });

    const r = await httpPost('/api/platform/auth/google', { idToken: 'tok' });
    const decoded = jwt.decode(r.body.token);
    expect(decoded.role).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/platform/me — requireStaff token verification
// ════════════════════════════════════════════════════════════════════════════════

describe('GET /api/platform/me — requireStaff', () => {
  test('401 with no Authorization header', async () => {
    const r = await httpGet('/api/platform/me');
    expect(r.status).toBe(401);
  });

  test('401 with expired token', async () => {
    const expired = mintToken('sid1', { expiresIn: '-1s' });
    Staff.findById = jest.fn().mockReturnValue({ lean: () => Promise.resolve(null) });
    const r = await httpGet('/api/platform/me', authHeader(expired));
    expect(r.status).toBe(401);
  });

  test('401 with wrong secret', async () => {
    const wrongSecret = mintToken('sid1', { secret: 'completely-different-secret-long-enough!!' });
    Staff.findById = jest.fn().mockReturnValue({ lean: () => Promise.resolve(null) });
    const r = await httpGet('/api/platform/me', authHeader(wrongSecret));
    expect(r.status).toBe(401);
  });

  test('401 with wrong aud', async () => {
    const wrongAud = mintToken('sid1', { audience: 'wrong-audience' });
    Staff.findById = jest.fn().mockReturnValue({ lean: () => Promise.resolve(null) });
    const r = await httpGet('/api/platform/me', authHeader(wrongAud));
    expect(r.status).toBe(401);
  });

  test('401 with a Shopify-style session token', async () => {
    const shopifyTok = mintShopifyToken();
    const r = await httpGet('/api/platform/me', authHeader(shopifyTok));
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/shopify session tokens/i);
  });

  test('401 when staff record no longer exists in DB', async () => {
    const tok = mintToken('gone-id');
    Staff.findById = jest.fn().mockReturnValue({ lean: () => Promise.resolve(null) });
    const r = await httpGet('/api/platform/me', authHeader(tok));
    expect(r.status).toBe(401);
  });

  test('401 when staff is deactivated (valid token but active=false in DB)', async () => {
    const tok = mintToken('deact-id');
    Staff.findById = jest.fn().mockReturnValue({
      lean: () => Promise.resolve({ _id: 'deact-id', email: 'x@x.com', name: 'X', role: 'support', active: false }),
    });
    const r = await httpGet('/api/platform/me', authHeader(tok));
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/deactivated/i);
  });

  test('200 returns email, name, role', async () => {
    const tok = mintToken('ok-id');
    Staff.findById = jest.fn().mockReturnValue({
      lean: () => Promise.resolve({ _id: 'ok-id', email: 'ok@example.com', name: 'OK', role: 'admin', active: true }),
    });
    const r = await httpGet('/api/platform/me', authHeader(tok));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ email: 'ok@example.com', name: 'OK', role: 'admin' });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Role always read from DB, never from token
// ════════════════════════════════════════════════════════════════════════════════

describe('requireRole — role read from DB on every request', () => {
  test('403 on admin-only route when DB says support', async () => {
    const tok = mintToken('role-change-id');
    Staff.findById = jest.fn().mockReturnValue({
      lean: () => Promise.resolve({ _id: 'role-change-id', email: 'c@c.com', name: 'C', role: 'support', active: true }),
    });
    const r = await httpGet('/test/admin-only', authHeader(tok));
    expect(r.status).toBe(403);
  });

  test('200 on admin-only route when DB says admin', async () => {
    const tok = mintToken('admin-id');
    Staff.findById = jest.fn().mockReturnValue({
      lean: () => Promise.resolve({ _id: 'admin-id', email: 'd@d.com', name: 'D', role: 'admin', active: true }),
    });
    const r = await httpGet('/test/admin-only', authHeader(tok));
    expect(r.status).toBe(200);
  });

  test('200 on admin-only route when DB says owner', async () => {
    const tok = mintToken('owner-id');
    Staff.findById = jest.fn().mockReturnValue({
      lean: () => Promise.resolve({ _id: 'owner-id', email: 'e@e.com', name: 'E', role: 'owner', active: true }),
    });
    const r = await httpGet('/test/admin-only', authHeader(tok));
    expect(r.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// AuditLog model — pre-hooks registered for all mutation operations
// ════════════════════════════════════════════════════════════════════════════════

describe('AuditLog — immutability hooks registered on schema', () => {
  const MUTATING_OPS = [
    'updateOne', 'updateMany', 'findOneAndUpdate',
    'deleteOne', 'deleteMany', 'findOneAndDelete',
  ];

  test('pre-hooks are registered for all mutating operations', () => {
    // Use the real (un-mocked) model directly via a fresh require.
    jest.unmock('../models/AuditLog');
    const RealAuditLog = jest.requireActual('../models/AuditLog');
    const pres = RealAuditLog.schema.s?.hooks?._pres;
    expect(pres).toBeTruthy();
    for (const op of MUTATING_OPS) {
      const hooks = pres.get ? pres.get(op) : (pres[op] || []);
      expect(hooks.length > 0).toBe(true);
    }
    jest.mock('../models/AuditLog');
  });
});
