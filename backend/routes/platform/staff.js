'use strict';

/**
 * Platform admin — staff management routes (owner only).
 * Mounted at /api/platform/staff by index.js.
 * No DELETE route: staff are deactivated, never removed, so the audit trail
 * keeps its meaning.
 */

const express = require('express');
const Staff   = require('../../models/Staff');
const { requireStaff, requireRole } = require('../../middleware/requireStaff');
const { logAudit } = require('../../utils/auditLog');

const router = express.Router();

const VALID_ROLES = ['owner', 'admin', 'support'];
const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── GET / (list all staff) ────────────────────────────────────────────────────

router.get('/', requireStaff, requireRole('owner'), async (req, res) => {
  try {
    const allStaff = await Staff.find({}, 'email name role active lastLoginAt').lean();
    const rows = allStaff.map(s => ({
      id:          String(s._id),
      email:       s.email,
      name:        s.name || '',
      role:        s.role,
      active:      s.active,
      lastLoginAt: s.lastLoginAt,
    }));
    return res.json({ staff: rows });
  } catch (err) {
    console.error('[platform/staff] list error:', err.message);
    return res.status(500).json({ error: 'Failed to load staff' });
  }
});

// ── POST / (add staff member) ─────────────────────────────────────────────────

router.post('/', requireStaff, requireRole('owner'), async (req, res) => {
  const { name, role } = req.body || {};
  const rawEmail = req.body?.email;

  if (!rawEmail || typeof rawEmail !== 'string' || !EMAIL_RE.test(rawEmail.trim())) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const email = rawEmail.trim().toLowerCase();

  try {
    const existing = await Staff.findOne({ email }).lean();
    if (existing) return res.status(409).json({ error: 'A staff member with this email already exists' });

    const newStaff = await Staff.create({
      email,
      name: (name || '').trim(),
      role,
      active: true,
      createdBy: req.staff.email,
    });

    await logAudit({
      staff:  req.staff,
      action: 'staff_added',
      meta:   { targetStaffId: String(newStaff._id) },
      req,
    });

    return res.status(201).json({
      id:     String(newStaff._id),
      email:  newStaff.email,
      name:   newStaff.name,
      role:   newStaff.role,
      active: newStaff.active,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A staff member with this email already exists' });
    }
    console.error('[platform/staff] create error:', err.message);
    return res.status(500).json({ error: 'Failed to create staff member' });
  }
});

// ── PATCH /:id (update role or active flag) ───────────────────────────────────

router.patch('/:id', requireStaff, requireRole('owner'), async (req, res) => {
  const { id } = req.params;
  const { role, active } = req.body || {};

  if (role === undefined && active === undefined) {
    return res.status(400).json({ error: 'Provide role and/or active to update' });
  }
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  if (active !== undefined && typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be a boolean' });
  }

  try {
    let existing;
    try {
      existing = await Staff.findById(id).lean();
    } catch {
      return res.status(400).json({ error: 'Invalid staff id' });
    }
    if (!existing) return res.status(404).json({ error: 'Staff member not found' });

    // An owner cannot change their own role or active flag.
    if (String(existing._id) === req.staff.id) {
      return res.status(400).json({ error: 'You cannot change your own role or active status' });
    }

    // Safeguard: must always remain at least one active owner.
    if (existing.role === 'owner') {
      const wouldLoseOwner = (role !== undefined && role !== 'owner') ||
                             (active === false);
      if (wouldLoseOwner) {
        const activeOwners = await Staff.countDocuments({ role: 'owner', active: true });
        if (activeOwners <= 1) {
          return res.status(400).json({ error: 'Cannot change the last active owner' });
        }
      }
    }

    const update = {};
    const auditActions = [];

    if (role !== undefined && role !== existing.role) {
      update.role = role;
      auditActions.push(logAudit({
        staff:  req.staff,
        action: 'staff_role_changed',
        meta:   { targetStaffId: String(existing._id), from: existing.role, to: role },
        req,
      }));
    }
    if (active !== undefined && active !== existing.active) {
      update.active = active;
      auditActions.push(logAudit({
        staff:  req.staff,
        action: active ? 'staff_reactivated' : 'staff_deactivated',
        meta:   { targetStaffId: String(existing._id) },
        req,
      }));
    }

    if (Object.keys(update).length === 0) {
      return res.json({ ok: true, message: 'No changes needed' });
    }

    await Staff.updateOne({ _id: existing._id }, { $set: update });
    await Promise.all(auditActions);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[platform/staff] update error:', err.message);
    return res.status(500).json({ error: 'Failed to update staff member' });
  }
});

module.exports = router;
