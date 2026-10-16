'use strict';

/**
 * Platform admin — finance routes.
 * Mounted at /api/platform/finance by index.js.
 * ALL routes require requireStaff + requireRole('owner').
 * Admin and Support receive 403.
 * Never returns shopper or contact data.
 */

const express = require('express');
const Store             = require('../../models/Store');
const SubscriptionEvent = require('../../models/SubscriptionEvent');
const { requireStaff, requireRole } = require('../../middleware/requireStaff');
const { logAudit }  = require('../../utils/auditLog');
const {
  computeSummary,
  computeActivity,
  computeStoresGroup,
} = require('../../utils/financeStats');

const router = express.Router();

const OWNER_ONLY = [requireStaff, requireRole('owner')];

// ─── shopDomain validation ────────────────────────────────────────────────────

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function validDomain(d) {
  return typeof d === 'string' && SHOP_DOMAIN_RE.test(d.trim().toLowerCase());
}

// ─── GET /api/platform/finance/summary ───────────────────────────────────────

router.get('/summary', ...OWNER_ONLY, async (req, res) => {
  try {
    const tzOffset = parseInt(req.query.tzOffsetMinutes, 10);
    const tz = Number.isFinite(tzOffset) ? tzOffset : 330;

    const [stores, events] = await Promise.all([
      Store.find({}, 'shopDomain shopName plan subscriptionStatus planUpdatedAt isTest isInternal').lean(),
      SubscriptionEvent.find({}).lean(),
    ]);

    const result = computeSummary({ stores, events, now: new Date(), tzOffsetMinutes: tz });

    return res.json(result);
  } catch (err) {
    console.error('[platform/finance/summary] error:', err.message);
    return res.status(500).json({ error: 'Failed to load finance summary' });
  }
});

// ─── GET /api/platform/finance/activity ──────────────────────────────────────

router.get('/activity', ...OWNER_ONLY, async (req, res) => {
  try {
    const { range: rawRange } = req.query;
    const range = ['today', 'week', 'month'].includes(rawRange) ? rawRange : 'week';
    const tzOffset = parseInt(req.query.tzOffsetMinutes, 10);
    const tz = Number.isFinite(tzOffset) ? tzOffset : 330;

    const [stores, events] = await Promise.all([
      Store.find({}, 'shopDomain shopName plan subscriptionStatus isTest isInternal').lean(),
      SubscriptionEvent.find({}).lean(),
    ]);

    const result = computeActivity({ stores, events, range, now: new Date(), tzOffsetMinutes: tz });

    return res.json(result);
  } catch (err) {
    console.error('[platform/finance/activity] error:', err.message);
    return res.status(500).json({ error: 'Failed to load finance activity' });
  }
});

// ─── GET /api/platform/finance/stores ────────────────────────────────────────

const VALID_GROUPS = ['paying', 'trial', 'lapsed', 'excluded'];

router.get('/stores', ...OWNER_ONLY, async (req, res) => {
  try {
    const { group } = req.query;
    if (!VALID_GROUPS.includes(group)) {
      return res.status(400).json({ error: 'group must be paying|trial|lapsed|excluded' });
    }

    const page  = Math.max(0, parseInt(req.query.page, 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const [stores, events] = await Promise.all([
      Store.find({}, 'shopDomain shopName plan subscriptionStatus planUpdatedAt isTest isInternal').lean(),
      SubscriptionEvent.find({}).lean(),
    ]);

    const result = computeStoresGroup({ stores, events, group, now: new Date(), page, limit });

    return res.json(result);
  } catch (err) {
    console.error('[platform/finance/stores] error:', err.message);
    return res.status(500).json({ error: 'Failed to load store group' });
  }
});

// ─── PATCH /api/platform/finance/stores/:shopDomain/internal ─────────────────

router.patch('/stores/:shopDomain/internal', ...OWNER_ONLY, async (req, res) => {
  try {
    const raw = (req.params.shopDomain || '').trim().toLowerCase();
    if (!validDomain(raw)) {
      return res.status(400).json({ error: 'Invalid shopDomain format' });
    }

    const { internal } = req.body || {};
    if (typeof internal !== 'boolean') {
      return res.status(400).json({ error: 'internal must be a boolean' });
    }

    const store = await Store.findOne({ shopDomain: raw }).lean();
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    if (store.isTest) {
      return res.status(400).json({ error: 'Cannot mark a test store as internal' });
    }

    await Store.updateOne({ shopDomain: raw }, { isInternal: internal });

    await logAudit({
      staff:      req.staff,
      action:     'store_internal_changed',
      shopDomain: raw,
      meta:       { internal },
      req,
    });

    return res.json({ shopDomain: raw, isInternal: internal });
  } catch (err) {
    console.error('[platform/finance/internal] error:', err.message);
    return res.status(500).json({ error: 'Failed to update store' });
  }
});

module.exports = router;
