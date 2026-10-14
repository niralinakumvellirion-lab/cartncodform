'use strict';

/**
 * Tests for backend/services/storeSuspension.js
 * (Store model fields + suspendStore / unsuspendStore logic).
 */

jest.mock('../models/Store');
jest.mock('../models/ScheduledJob');
jest.mock('../models/FestivalQueue');
jest.mock('../models/AuditLog');

const Store        = require('../models/Store');
const ScheduledJob = require('../models/ScheduledJob');
const FestivalQueue = require('../models/FestivalQueue');
const AuditLog     = require('../models/AuditLog');

const { suspendStore, unsuspendStore } = require('../services/storeSuspension');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  AuditLog.create.mockResolvedValue({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── suspendStore ─────────────────────────────────────────────────────────────

describe('suspendStore', () => {
  test('returns { ok: false, error } when store not found', async () => {
    Store.findOneAndUpdate.mockResolvedValue(null);
    const r = await suspendStore('unknown.myshopify.com', { staffEmail: 'admin@ops.com' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/i);
  });

  test('sets suspended fields and writes audit row', async () => {
    const fakeStore = { shopDomain: 'test.myshopify.com', suspended: true };
    Store.findOneAndUpdate.mockResolvedValue(fakeStore);

    const r = await suspendStore('test.myshopify.com', {
      reason: 'fraud',
      note: 'Multiple chargebacks',
      staffEmail: 'admin@ops.com',
    });

    expect(r.ok).toBe(true);

    const call = Store.findOneAndUpdate.mock.calls[0];
    expect(call[0]).toEqual({ shopDomain: 'test.myshopify.com' });
    const setOp = call[1].$set;
    expect(setOp.suspended).toBe(true);
    expect(setOp.suspendedBy).toBe('admin@ops.com');
    expect(setOp.suspendedReason).toBe('fraud');
    expect(setOp.suspendedNote).toBe('Multiple chargebacks');
    expect(setOp.suspendedAt).toBeInstanceOf(Date);

    expect(AuditLog.create).toHaveBeenCalledTimes(1);
    const auditRow = AuditLog.create.mock.calls[0][0];
    expect(auditRow.action).toBe('store_suspended');
    expect(auditRow.shopDomain).toBe('test.myshopify.com');
    expect(auditRow.meta.reason).toBe('fraud');
  });

  test('note and reason default to null when not provided', async () => {
    Store.findOneAndUpdate.mockResolvedValue({ shopDomain: 'x.myshopify.com' });
    await suspendStore('x.myshopify.com', { staffEmail: 's@s.com' });
    const setOp = Store.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setOp.suspendedNote).toBeNull();
    expect(setOp.suspendedReason).toBeNull();
  });
});

// ── unsuspendStore ────────────────────────────────────────────────────────────

describe('unsuspendStore', () => {
  test('returns { ok: false, error } when store not found', async () => {
    Store.findOneAndUpdate.mockResolvedValue(null);
    FestivalQueue.updateMany.mockResolvedValue({ modifiedCount: 0 });
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 0 });
    const r = await unsuspendStore('ghost.myshopify.com', { staffEmail: 'a@b.com' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/i);
  });

  test('clears suspended fields, moves past-due festival items to draft, skips past-due jobs', async () => {
    Store.findOneAndUpdate.mockResolvedValue({ shopDomain: 's.myshopify.com', suspended: false });
    FestivalQueue.updateMany.mockResolvedValue({ modifiedCount: 3 });
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 7 });

    const r = await unsuspendStore('s.myshopify.com', { staffEmail: 'ops@company.com' });
    expect(r.ok).toBe(true);
    expect(r.festivalDrafted).toBe(3);
    expect(r.jobsSkipped).toBe(7);

    // Store cleared correctly
    const setOp = Store.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setOp.suspended).toBe(false);
    expect(setOp.suspendedAt).toBeNull();
    expect(setOp.suspendedBy).toBeNull();

    // FestivalQueue query: status approved + past-due → draft
    const fqCall = FestivalQueue.updateMany.mock.calls[0];
    expect(fqCall[0]).toMatchObject({ shopDomain: 's.myshopify.com', status: 'approved' });
    expect(fqCall[0].scheduledAt.$lt).toBeInstanceOf(Date);
    expect(fqCall[1].$set.status).toBe('draft');

    // ScheduledJob query: status pending + past-due → skipped
    const sjCall = ScheduledJob.updateMany.mock.calls[0];
    expect(sjCall[0]).toMatchObject({ shopDomain: 's.myshopify.com', status: 'pending' });
    expect(sjCall[0].runAt.$lt).toBeInstanceOf(Date);
    expect(sjCall[1].$set.status).toBe('skipped');
    expect(sjCall[1].$set.error).toBe('store_suspended');
  });

  test('future-dated items are NOT touched (query uses $lt now)', async () => {
    Store.findOneAndUpdate.mockResolvedValue({ shopDomain: 'y.myshopify.com' });
    FestivalQueue.updateMany.mockResolvedValue({ modifiedCount: 0 });
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const before = Date.now();
    await unsuspendStore('y.myshopify.com', { staffEmail: 'a@b.com' });
    const after = Date.now();

    // Both queries use $lt: <current time>, so future items are excluded.
    const fqTime = FestivalQueue.updateMany.mock.calls[0][0].scheduledAt.$lt.getTime();
    expect(fqTime).toBeGreaterThanOrEqual(before);
    expect(fqTime).toBeLessThanOrEqual(after);

    const sjTime = ScheduledJob.updateMany.mock.calls[0][0].runAt.$lt.getTime();
    expect(sjTime).toBeGreaterThanOrEqual(before);
    expect(sjTime).toBeLessThanOrEqual(after);
  });

  test('writes audit row with counts; no shopper PII in meta', async () => {
    Store.findOneAndUpdate.mockResolvedValue({ shopDomain: 'z.myshopify.com' });
    FestivalQueue.updateMany.mockResolvedValue({ modifiedCount: 2 });
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 5 });

    await unsuspendStore('z.myshopify.com', { staffEmail: 'sup@ops.com' });

    const auditRow = AuditLog.create.mock.calls[0][0];
    expect(auditRow.action).toBe('store_unsuspended');
    expect(auditRow.meta.festivalDrafted).toBe(2);
    expect(auditRow.meta.jobsSkipped).toBe(5);
    // No shopper email/phone in meta
    expect(JSON.stringify(auditRow.meta)).not.toMatch(/@/);
  });
});

// ── Store model field presence ────────────────────────────────────────────────

describe('Store model — suspension fields', () => {
  test('suspended, suspendedAt, suspendedReason, suspendedNote, suspendedBy are defined on schema', () => {
    jest.unmock('../models/Store');
    const RealStore = jest.requireActual('../models/Store');
    const paths = RealStore.schema.paths;
    expect(paths.suspended).toBeDefined();
    expect(paths.suspendedAt).toBeDefined();
    expect(paths.suspendedReason).toBeDefined();
    expect(paths.suspendedNote).toBeDefined();
    expect(paths.suspendedBy).toBeDefined();
    // Default for suspended is false
    expect(paths.suspended.defaultValue).toBe(false);
    // suspendedNote has maxlength 500
    const noteValidators = paths.suspendedNote.validators || [];
    const maxlengthValidator = noteValidators.find((v) => v.type === 'maxlength');
    expect(maxlengthValidator).toBeDefined();
    jest.mock('../models/Store');
  });
});
