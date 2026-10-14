'use strict';

const Store        = require('../models/Store');
const ScheduledJob = require('../models/ScheduledJob');
const FestivalQueue = require('../models/FestivalQueue');
const { logAudit } = require('../utils/auditLog');

/**
 * Suspend a store. Sets Store.suspended=true and records who did it.
 *
 * @param {string} shopDomain
 * @param {{ reason?: string, note?: string, staffEmail: string }} opts
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function suspendStore(shopDomain, { reason, note, staffEmail }) {
  const store = await Store.findOneAndUpdate(
    { shopDomain },
    {
      $set: {
        suspended:       true,
        suspendedAt:     new Date(),
        suspendedReason: reason  || null,
        suspendedNote:   note    || null,
        suspendedBy:     staffEmail || null,
      },
    },
    { new: true }
  );
  if (!store) return { ok: false, error: 'Store not found' };

  await logAudit({
    staff: { email: staffEmail, role: '' },
    action: 'store_suspended',
    shopDomain,
    meta: { reason: reason || null },
  });

  return { ok: true };
}

/**
 * Unsuspend a store. Clears suspended flag, then:
 *   1. Moves every FestivalQueue item with status='approved' and scheduledAt
 *      in the past back to 'draft' (stale messages must not auto-flush).
 *   2. Marks every ScheduledJob with status='pending' and runAt in the past
 *      as 'skipped' with error='store_suspended'.
 * Future-dated items are left untouched.
 *
 * @param {string} shopDomain
 * @param {{ staffEmail: string }} opts
 * @returns {Promise<{ ok: boolean, festivalDrafted: number, jobsSkipped: number, error?: string }>}
 */
async function unsuspendStore(shopDomain, { staffEmail }) {
  const store = await Store.findOneAndUpdate(
    { shopDomain },
    {
      $set: {
        suspended:       false,
        suspendedAt:     null,
        suspendedReason: null,
        suspendedNote:   null,
        suspendedBy:     null,
      },
    },
    { new: true }
  );
  if (!store) return { ok: false, festivalDrafted: 0, jobsSkipped: 0, error: 'Store not found' };

  const now = new Date();

  // 1. Past-due approved festival items → draft (prevents burst sends).
  const festivalResult = await FestivalQueue.updateMany(
    { shopDomain, status: 'approved', scheduledAt: { $lt: now } },
    { $set: { status: 'draft' } }
  );
  const festivalDrafted = festivalResult.modifiedCount ?? 0;

  // 2. Past-due pending jobs → skipped.
  const jobResult = await ScheduledJob.updateMany(
    { shopDomain, status: 'pending', runAt: { $lt: now } },
    { $set: { status: 'skipped', error: 'store_suspended' } }
  );
  const jobsSkipped = jobResult.modifiedCount ?? 0;

  await logAudit({
    staff: { email: staffEmail, role: '' },
    action: 'store_unsuspended',
    shopDomain,
    meta: { festivalDrafted, jobsSkipped },
  });

  return { ok: true, festivalDrafted, jobsSkipped };
}

module.exports = { suspendStore, unsuspendStore };
