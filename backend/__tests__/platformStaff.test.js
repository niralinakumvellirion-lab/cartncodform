'use strict';

/**
 * Tests for step 4, commit 3:
 *   GET  /api/platform/staff
 *   POST /api/platform/staff
 *   PATCH /api/platform/staff/:id
 *
 *   Safeguards verified:
 *   - support/admin → 403 on all routes
 *   - owner cannot change own role/active
 *   - cannot deactivate last active owner
 *   - duplicate email → 409
 *   - bad role → 400
 *   - audit actions logged with correct meta
 */

jest.mock('../models/Store');
jest.mock('../models/Profile');
jest.mock('../models/ScheduledJob');
jest.mock('../models/AuditLog');
jest.mock('../models/Staff');
jest.mock('../models/FestivalQueue');
jest.mock('../services/storeSuspension');

const mongoose = require('mongoose');
const Staff    = require('../models/Staff');
const AuditLog = require('../models/AuditLog');
const express  = require('express');
const jwt      = require('jsonwebtoken');

const PLATFORM_SECRET = 'platform-jwt-secret-for-test-suite-3333333333';
const SHOPIFY_SECRET  = 'shopify-api-secret-for-test-suite-only';

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
const targetId  = new mongoose.Types.ObjectId().toString();

const ownerStaff   = { _id: ownerId,   email: 'owner@p.test',   role: 'owner',   active: true, name: 'Owner' };
const adminStaff   = { _id: adminId,   email: 'admin@p.test',   role: 'admin',   active: true, name: 'Admin' };
const supportStaff = { _id: supportId, email: 'support@p.test', role: 'support', active: true, name: 'Support' };
const targetStaff  = { _id: targetId,  email: 'target@p.test',  role: 'admin',   active: true, name: 'Target' };

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
  // Default acting user
  Staff.findById = jest.fn().mockImplementation((id) => ({
    lean: jest.fn().mockResolvedValue(
      id === supportId ? supportStaff :
      id === adminId   ? adminStaff   :
      id === targetId  ? targetStaff  : ownerStaff
    ),
  }));
  Staff.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([ownerStaff, targetStaff]) });
  Staff.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  Staff.create = jest.fn().mockResolvedValue({
    _id: new mongoose.Types.ObjectId(),
    email: 'new@p.test', name: 'New', role: 'support', active: true,
  });
  Staff.countDocuments = jest.fn().mockResolvedValue(2);
  Staff.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
});
afterEach(() => jest.restoreAllMocks());

async function get(path, staffId) {
  const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${mintToken(staffId)}` } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function post(path, body, staffId) {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken(staffId)}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function patch(path, body, staffId) {
  const r = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken(staffId)}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── GET /staff ────────────────────────────────────────────────────────────────

describe('GET /api/platform/staff', () => {
  test('owner can list staff', async () => {
    const { status, body } = await get('/api/platform/staff', ownerId);
    expect(status).toBe(200);
    expect(Array.isArray(body.staff)).toBe(true);
  });

  test('admin gets 403', async () => {
    const { status } = await get('/api/platform/staff', adminId);
    expect(status).toBe(403);
  });

  test('support gets 403', async () => {
    const { status } = await get('/api/platform/staff', supportId);
    expect(status).toBe(403);
  });

  test('response row has id, email, name, role, active fields', async () => {
    const { body } = await get('/api/platform/staff', ownerId);
    const row = body.staff[0];
    expect(typeof row.id).toBe('string');
    expect(typeof row.email).toBe('string');
    expect(typeof row.role).toBe('string');
    expect(typeof row.active).toBe('boolean');
  });
});

// ── POST /staff ───────────────────────────────────────────────────────────────

describe('POST /api/platform/staff', () => {
  test('owner can create a staff member', async () => {
    const { status, body } = await post('/api/platform/staff', { email: 'new@p.test', name: 'New', role: 'support' }, ownerId);
    expect(status).toBe(201);
    expect(body.email).toBe('new@p.test');
  });

  test('admin gets 403', async () => {
    const { status } = await post('/api/platform/staff', { email: 'x@p.test', role: 'support' }, adminId);
    expect(status).toBe(403);
  });

  test('support gets 403', async () => {
    const { status } = await post('/api/platform/staff', { email: 'x@p.test', role: 'support' }, supportId);
    expect(status).toBe(403);
  });

  test('bad role → 400', async () => {
    const { status } = await post('/api/platform/staff', { email: 'x@p.test', role: 'superadmin' }, ownerId);
    expect(status).toBe(400);
  });

  test('missing email → 400', async () => {
    const { status } = await post('/api/platform/staff', { role: 'support' }, ownerId);
    expect(status).toBe(400);
  });

  test('invalid email format → 400', async () => {
    const { status } = await post('/api/platform/staff', { email: 'notanemail', role: 'support' }, ownerId);
    expect(status).toBe(400);
  });

  test('duplicate email → 409', async () => {
    Staff.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(adminStaff) });
    const { status } = await post('/api/platform/staff', { email: 'admin@p.test', role: 'support' }, ownerId);
    expect(status).toBe(409);
  });

  test('audit row written with targetStaffId', async () => {
    await post('/api/platform/staff', { email: 'new@p.test', role: 'support' }, ownerId);
    expect(AuditLog.create).toHaveBeenCalled();
    const call = AuditLog.create.mock.calls[0][0];
    expect(call.action).toBe('staff_added');
    expect(typeof call.meta.targetStaffId).toBe('string');
  });
});

// ── PATCH /staff/:id ──────────────────────────────────────────────────────────

describe('PATCH /api/platform/staff/:id', () => {
  test('owner can change another member\'s role', async () => {
    const { status, body } = await patch(`/api/platform/staff/${targetId}`, { role: 'support' }, ownerId);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('owner can deactivate another member', async () => {
    const { status } = await patch(`/api/platform/staff/${targetId}`, { active: false }, ownerId);
    expect(status).toBe(200);
  });

  test('admin gets 403', async () => {
    const { status } = await patch(`/api/platform/staff/${targetId}`, { role: 'support' }, adminId);
    expect(status).toBe(403);
  });

  test('support gets 403', async () => {
    const { status } = await patch(`/api/platform/staff/${targetId}`, { role: 'support' }, supportId);
    expect(status).toBe(403);
  });

  test('owner cannot change own role', async () => {
    Staff.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(ownerStaff) });
    const { status, body } = await patch(`/api/platform/staff/${ownerId}`, { role: 'admin' }, ownerId);
    expect(status).toBe(400);
    expect(body.error).toMatch(/own/i);
  });

  test('owner cannot deactivate own account', async () => {
    Staff.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(ownerStaff) });
    const { status } = await patch(`/api/platform/staff/${ownerId}`, { active: false }, ownerId);
    expect(status).toBe(400);
  });

  test('cannot demote the last active owner', async () => {
    const lastOwnerDoc = { _id: targetId, email: 'owner2@p.test', role: 'owner', active: true };
    // requireStaff calls findById(ownerId) → return ownerStaff; handler calls findById(targetId) → last owner
    Staff.findById = jest.fn().mockImplementation((id) => ({
      lean: jest.fn().mockResolvedValue(id === ownerId ? ownerStaff : lastOwnerDoc),
    }));
    Staff.countDocuments = jest.fn().mockResolvedValue(1);
    const { status, body } = await patch(`/api/platform/staff/${targetId}`, { role: 'admin' }, ownerId);
    expect(status).toBe(400);
    expect(body.error).toMatch(/last active owner/i);
  });

  test('cannot deactivate the last active owner', async () => {
    const lastOwnerDoc = { _id: targetId, email: 'owner2@p.test', role: 'owner', active: true };
    Staff.findById = jest.fn().mockImplementation((id) => ({
      lean: jest.fn().mockResolvedValue(id === ownerId ? ownerStaff : lastOwnerDoc),
    }));
    Staff.countDocuments = jest.fn().mockResolvedValue(1);
    const { status } = await patch(`/api/platform/staff/${targetId}`, { active: false }, ownerId);
    expect(status).toBe(400);
  });

  test('second owner can be demoted when another owner exists', async () => {
    const secondOwnerDoc = { _id: targetId, email: 'owner2@p.test', role: 'owner', active: true };
    Staff.findById = jest.fn().mockImplementation((id) => ({
      lean: jest.fn().mockResolvedValue(id === ownerId ? ownerStaff : secondOwnerDoc),
    }));
    Staff.countDocuments = jest.fn().mockResolvedValue(2);
    const { status } = await patch(`/api/platform/staff/${targetId}`, { role: 'admin' }, ownerId);
    expect(status).toBe(200);
  });

  test('bad role → 400', async () => {
    const { status } = await patch(`/api/platform/staff/${targetId}`, { role: 'superuser' }, ownerId);
    expect(status).toBe(400);
  });

  test('no fields provided → 400', async () => {
    const { status } = await patch(`/api/platform/staff/${targetId}`, {}, ownerId);
    expect(status).toBe(400);
  });

  test('staff_role_changed audit contains from/to', async () => {
    await patch(`/api/platform/staff/${targetId}`, { role: 'support' }, ownerId);
    expect(AuditLog.create).toHaveBeenCalled();
    const call = AuditLog.create.mock.calls[0][0];
    expect(call.action).toBe('staff_role_changed');
    expect(call.meta.from).toBe('admin');
    expect(call.meta.to).toBe('support');
    expect(typeof call.meta.targetStaffId).toBe('string');
  });

  test('staff_deactivated audit written', async () => {
    await patch(`/api/platform/staff/${targetId}`, { active: false }, ownerId);
    expect(AuditLog.create).toHaveBeenCalled();
    expect(AuditLog.create.mock.calls[0][0].action).toBe('staff_deactivated');
  });

  test('staff_reactivated audit written', async () => {
    const inactiveTarget = { ...targetStaff, active: false };
    Staff.findById = jest.fn().mockImplementation((id) => ({
      lean: jest.fn().mockResolvedValue(id === ownerId ? ownerStaff : inactiveTarget),
    }));
    await patch(`/api/platform/staff/${targetId}`, { active: true }, ownerId);
    expect(AuditLog.create).toHaveBeenCalled();
    expect(AuditLog.create.mock.calls[0][0].action).toBe('staff_reactivated');
  });
});
