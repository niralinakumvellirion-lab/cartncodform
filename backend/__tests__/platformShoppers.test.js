'use strict';

/**
 * Tests for step 4, commit 1:
 *   A. maskEmail, maskPhone, anonymousLabel
 *   B. GET /api/platform/stores/:shopDomain/shoppers
 *   C. POST /api/platform/stores/:shopDomain/shoppers/:profileId/reveal
 *   D. Rate-limiter constants
 *   E. Model indexes added
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
const AuditLog     = require('../models/AuditLog');
const Staff        = require('../models/Staff');
const express      = require('express');
const jwt          = require('jsonwebtoken');

const { maskEmail, maskPhone, anonymousLabel } = require('../utils/maskContact');
const { REVEAL_WINDOW_MS, REVEAL_MAX }         = require('../routes/platform/stores');

const PLATFORM_SECRET = 'platform-jwt-secret-for-test-suite-3333333333';
const SHOPIFY_SECRET  = 'shopify-api-secret-for-test-suite-only';
const SHOP = 'demo.myshopify.com';

function mintToken(staffId = 'staff001') {
  return jwt.sign(
    { sub: staffId },
    PLATFORM_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'shopireachboost-platform', audience: 'platform-admin' }
  );
}

// Scan a JSON body for unmasked email addresses (ASCII-only local-part, no bullets).
function findRawEmails(obj) {
  const found = [];
  // Only match emails whose local part contains only standard ASCII email characters
  // (a-z, 0-9, ., _, %, +, -). Masked emails like 'p••••@gmail.com' are excluded.
  const EMAIL_RE = /^[a-zA-Z0-9._%+!-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  function scan(v) {
    if (typeof v === 'string' && EMAIL_RE.test(v)) found.push(v);
    if (Array.isArray(v)) v.forEach(scan);
    if (v && typeof v === 'object') Object.values(v).forEach(scan);
  }
  scan(obj);
  return found;
}

// Scan for raw E.164 phone numbers (+ followed by 10+ digits).
function findRawPhones(obj) {
  const found = [];
  function scan(v) {
    if (typeof v === 'string' && /^\+\d{10,}$/.test(v)) found.push(v);
    if (Array.isArray(v)) v.forEach(scan);
    if (v && typeof v === 'object') Object.values(v).forEach(scan);
  }
  scan(obj);
  return found;
}

// Deep scan for token-like or id-collection keys.
function findForbiddenKeys(obj) {
  const forbidden = ['pushTokens', 'lastToken', 'sessionIds', 'cartTokens', 'customerId'];
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
    server.unref();
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
});
afterEach(() => jest.restoreAllMocks());

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

function bearerHeader(id) { return { Authorization: `Bearer ${mintToken(id)}` }; }

// ── A. maskEmail ──────────────────────────────────────────────────────────────

describe('maskEmail', () => {
  const B = '•';
  test('canonical example', () => {
    expect(maskEmail('priya.shah@gmail.com')).toBe(`p${B}${B}${B}${B}@gmail.com`);
  });
  test('keeps first char and domain', () => {
    const r = maskEmail('test@example.com');
    expect(r[0]).toBe('t');
    expect(r).toContain('@example.com');
    expect(r).not.toBe('test@example.com');
  });
  test('null → empty string', () => { expect(maskEmail(null)).toBe(''); });
  test('empty string → empty string', () => { expect(maskEmail('')).toBe(''); });
  test('non-string → empty string', () => { expect(maskEmail(42)).toBe(''); });
});

// ── A. maskPhone ──────────────────────────────────────────────────────────────

describe('maskPhone', () => {
  const B = '•';
  test('canonical example', () => {
    expect(maskPhone('+919800000214')).toBe(`+91 ${B}${B}${B}${B}${B} ${B}${B}214`);
  });
  test('never returns the full raw number', () => {
    const r = maskPhone('+919800000214');
    expect(r).not.toContain('9800000214');
  });
  test('null → empty string', () => { expect(maskPhone(null)).toBe(''); });
  test('empty → empty string', () => { expect(maskPhone('')).toBe(''); });
  test('no leading + → fully masked', () => {
    const r = maskPhone('9800000214');
    expect(r).not.toContain('9800000214');
  });
  test('non-string → empty string', () => { expect(maskPhone(42)).toBe(''); });
});

// ── A. anonymousLabel ─────────────────────────────────────────────────────────

describe('anonymousLabel', () => {
  test('canonical: last 5 chars of id', () => {
    expect(anonymousLabel('507f1f77bcf86cd799439011')).toBe('Anonymous · #39011');
  });
  test('null → Anonymous', () => { expect(anonymousLabel(null)).toBe('Anonymous'); });
  test('short id uses full string', () => {
    expect(anonymousLabel('abc')).toContain('#abc');
  });
});

// ── B. GET shoppers list ──────────────────────────────────────────────────────

describe('GET /api/platform/stores/:shopDomain/shoppers', () => {
  const ownerId   = 'owner001';
  const supportId = 'support001';

  const ownerStaff   = { _id: ownerId,   email: 'owner@p.test',   role: 'owner',   active: true };
  const supportStaff = { _id: supportId, email: 'support@p.test', role: 'support', active: true };

  const profiles = [
    {
      _id: new mongoose.Types.ObjectId(),
      stage: 'customer',
      orders: { count: 3 },
      channels: {
        email:    { address: 'priya.shah@gmail.com' },
        push:     { subscribed: true },
        whatsapp: { phone: '+919800000214' },
      },
      identifiers: { emails: ['priya.shah@gmail.com'], phones: ['+919800000214'] },
      lastSeenAt: new Date('2026-10-01'),
    },
    {
      _id: new mongoose.Types.ObjectId(),
      stage: 'identified',
      orders: { count: 0 },
      channels: { email: {}, push: { subscribed: false }, whatsapp: {} },
      identifiers: { emails: [], phones: ['+919800000001'] },
      lastSeenAt: new Date('2026-09-28'),
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

  beforeEach(() => {
    Store.exists = jest.fn().mockResolvedValue(true);
    Profile.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(profiles),
    });
    Profile.countDocuments = jest.fn().mockResolvedValue(3);
    Staff.findById = jest.fn().mockImplementation((id) => ({
      lean: jest.fn().mockResolvedValue(id === supportId ? supportStaff : ownerStaff),
    }));
  });

  test('200 with masked contacts — no raw emails', async () => {
    const { status, body } = await get(`/api/platform/stores/${SHOP}/shoppers`, bearerHeader(ownerId));
    expect(status).toBe(200);
    expect(body.shoppers).toHaveLength(3);
    expect(findRawEmails(body)).toHaveLength(0);
  });

  test('no raw phones in response', async () => {
    const { body } = await get(`/api/platform/stores/${SHOP}/shoppers`, bearerHeader(ownerId));
    expect(findRawPhones(body)).toHaveLength(0);
  });

  test('no forbidden keys in response', async () => {
    const { body } = await get(`/api/platform/stores/${SHOP}/shoppers`, bearerHeader(ownerId));
    expect(findForbiddenKeys(body)).toHaveLength(0);
  });

  test('email profile first char + bullets + domain', async () => {
    const { body } = await get(`/api/platform/stores/${SHOP}/shoppers`, bearerHeader(ownerId));
    const row = body.shoppers[0];
    expect(row.contact).toMatch(/^p/);
    expect(row.contact).toContain('@gmail.com');
    expect(row.contact).not.toContain('priya.shah');
  });

  test('phone-only profile does not expose raw number', async () => {
    const { body } = await get(`/api/platform/stores/${SHOP}/shoppers`, bearerHeader(ownerId));
    const row = body.shoppers[1];
    expect(row.contact).not.toContain('+919800000001');
  });

  test('anonymous profile shows Anonymous label', async () => {
    const { body } = await get(`/api/platform/stores/${SHOP}/shoppers`, bearerHeader(ownerId));
    const row = body.shoppers[2];
    expect(row.contact).toMatch(/^Anonymous/);
  });

  test('response shape: id, contact, stage, orders, reach, lastSeenAt', async () => {
    const { body } = await get(`/api/platform/stores/${SHOP}/shoppers`, bearerHeader(ownerId));
    const row = body.shoppers[0];
    expect(typeof row.id).toBe('string');
    expect(typeof row.contact).toBe('string');
    expect(typeof row.stage).toBe('string');
    expect(typeof row.orders).toBe('number');
    expect(typeof row.reach.email).toBe('boolean');
    expect(typeof row.reach.push).toBe('boolean');
    expect(typeof row.reach.whatsapp).toBe('boolean');
  });

  test('support role is allowed (200)', async () => {
    const { status } = await get(`/api/platform/stores/${SHOP}/shoppers`, bearerHeader(supportId));
    expect(status).toBe(200);
  });

  test('404 when store not found', async () => {
    Store.exists = jest.fn().mockResolvedValue(null);
    const { status } = await get(`/api/platform/stores/${SHOP}/shoppers`, bearerHeader(ownerId));
    expect(status).toBe(404);
  });

  test('400 for invalid shopDomain', async () => {
    const { status } = await get('/api/platform/stores/not-a-shopify-domain/shoppers', bearerHeader(ownerId));
    expect(status).toBe(400);
  });

  test('audit row written with page only (no contact)', async () => {
    await get(`/api/platform/stores/${SHOP}/shoppers?page=2`, bearerHeader(ownerId));
    expect(AuditLog.create).toHaveBeenCalled();
    const call = AuditLog.create.mock.calls[0][0];
    expect(call.action).toBe('shoppers_listed');
    expect(call.shopDomain).toBe(SHOP);
    expect(call.meta.page).toBe(2);
    const metaStr = JSON.stringify(call.meta);
    expect(metaStr).not.toMatch(/@/);
    expect(metaStr).not.toMatch(/\+\d{10}/);
  });
});

// ── C. POST reveal ────────────────────────────────────────────────────────────

describe('POST /api/platform/stores/:shopDomain/shoppers/:profileId/reveal', () => {
  const ownerId   = new mongoose.Types.ObjectId().toString();
  const adminId   = new mongoose.Types.ObjectId().toString();
  const supportId = new mongoose.Types.ObjectId().toString();
  const profileId = new mongoose.Types.ObjectId();

  const ownerStaff   = { _id: ownerId,   email: 'owner@p.test',   role: 'owner',   active: true };
  const adminStaff   = { _id: adminId,   email: 'admin@p.test',   role: 'admin',   active: true };
  const supportStaff = { _id: supportId, email: 'support@p.test', role: 'support', active: true };

  const profileDoc = {
    _id: profileId,
    shopDomain: SHOP,
    channels: {
      email:    { address: 'priya.shah@gmail.com' },
      whatsapp: { phone: '+919800000214' },
    },
    identifiers: {
      emails: ['priya.shah@gmail.com'],
      phones: ['+919800000214'],
    },
  };

  beforeEach(() => {
    Profile.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(profileDoc) });
    Staff.findById = jest.fn().mockImplementation((id) => ({
      lean: jest.fn().mockResolvedValue(
        id === supportId ? supportStaff :
        id === adminId   ? adminStaff   : ownerStaff
      ),
    }));
  });

  test('owner gets contact data', async () => {
    const { status, body } = await post(
      `/api/platform/stores/${SHOP}/shoppers/${profileId}/reveal`,
      {},
      bearerHeader(ownerId)
    );
    expect(status).toBe(200);
    expect(body.email).toBe('priya.shah@gmail.com');
    expect(body.phone).toBe('+919800000214');
  });

  test('admin gets contact data', async () => {
    const { status } = await post(
      `/api/platform/stores/${SHOP}/shoppers/${profileId}/reveal`,
      {},
      bearerHeader(adminId)
    );
    expect(status).toBe(200);
  });

  test('support gets 403', async () => {
    const { status } = await post(
      `/api/platform/stores/${SHOP}/shoppers/${profileId}/reveal`,
      {},
      bearerHeader(supportId)
    );
    expect(status).toBe(403);
  });

  test('another store profile → 404 (IDOR)', async () => {
    Profile.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const { status } = await post(
      `/api/platform/stores/${SHOP}/shoppers/${profileId}/reveal`,
      {},
      bearerHeader(ownerId)
    );
    expect(status).toBe(404);
  });

  test('invalid profileId → 400', async () => {
    const { status } = await post(
      `/api/platform/stores/${SHOP}/shoppers/not-an-objectid/reveal`,
      {},
      bearerHeader(ownerId)
    );
    expect(status).toBe(400);
  });

  test('audit row has profileId but no contact data', async () => {
    await post(
      `/api/platform/stores/${SHOP}/shoppers/${profileId}/reveal`,
      {},
      bearerHeader(ownerId)
    );
    expect(AuditLog.create).toHaveBeenCalled();
    const call = AuditLog.create.mock.calls[0][0];
    expect(call.action).toBe('shopper_revealed');
    expect(call.meta.profileId).toBe(String(profileId));
    const metaStr = JSON.stringify(call.meta);
    expect(metaStr).not.toMatch(/@/);
    expect(metaStr).not.toMatch(/\+\d/);
  });

  test('audit meta contains only profileId key', async () => {
    await post(
      `/api/platform/stores/${SHOP}/shoppers/${profileId}/reveal`,
      {},
      bearerHeader(ownerId)
    );
    const call = AuditLog.create.mock.calls[0][0];
    expect(Object.keys(call.meta)).toEqual(['profileId']);
  });
});

// ── D. Rate limiter constants ─────────────────────────────────────────────────

describe('Reveal rate limiter constants', () => {
  test('REVEAL_MAX is 30', () => { expect(REVEAL_MAX).toBe(30); });
  test('REVEAL_WINDOW_MS is 1 hour', () => { expect(REVEAL_WINDOW_MS).toBe(60 * 60 * 1000); });
});

// ── E. Model indexes ──────────────────────────────────────────────────────────
// Use jest.requireActual to bypass the jest.mock at the top and get real schemas.

describe('Model indexes', () => {
  test('ScheduledJob has compound {shopDomain, status, runAt} index', () => {
    const SJ = jest.requireActual('../models/ScheduledJob');
    const has = SJ.schema.indexes().some(([spec]) =>
      spec.shopDomain === 1 && spec.status === 1 && spec.runAt === 1
    );
    expect(has).toBe(true);
  });

  test('Profile has compound {shopDomain, lastSeenAt} index', () => {
    const P = jest.requireActual('../models/Profile');
    const has = P.schema.indexes().some(([spec]) =>
      spec.shopDomain === 1 && spec.lastSeenAt === 1
    );
    expect(has).toBe(true);
  });
});
