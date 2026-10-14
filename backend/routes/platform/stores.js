'use strict';

/**
 * Platform admin — store management routes.
 * Mounted at /api/platform/stores by index.js.
 * All routes use requireStaff; write routes additionally use requireRole.
 * Never uses requireAuth or requireStoreOwner.
 * Never returns accessToken, onlineAccessToken, pushTokens, sessionIds, cartTokens.
 */

const express       = require('express');
const Profile       = require('../../models/Profile');
const ScheduledJob  = require('../../models/ScheduledJob');
const Store         = require('../../models/Store');
const { requireStaff, requireRole } = require('../../middleware/requireStaff');
const { logAudit }  = require('../../utils/auditLog');
const { suspendStore, unsuspendStore } = require('../../services/storeSuspension');

const router = express.Router();

const SHOP_DOMAIN_RE  = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const VALID_REASONS   = ['spam', 'policy', 'payment', 'request', 'other'];

// Allow-list projections — defined once, used in every query on Store.
const LIST_PROJECTION   = 'shopDomain shopName plan installedAt needsReauth suspended';
const DETAIL_PROJECTION = 'shopDomain shopName ownerEmail plan subscriptionStatus planUpdatedAt ' +
                          'timezone installedAt lastSignalRunAt needsReauth pushStats ' +
                          'suspended suspendedAt suspendedReason suspendedNote suspendedBy';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── GET /summary ─────────────────────────────────────────────────────────────

router.get('/summary', requireStaff, async (req, res) => {
  try {
    const [total, pro, needsReconnect, suspended] = await Promise.all([
      Store.countDocuments({}),
      Store.countDocuments({ plan: 'pro' }),
      Store.countDocuments({ needsReauth: true, suspended: { $ne: true } }),
      Store.countDocuments({ suspended: true }),
    ]);
    return res.json({ total, pro, needsReconnect, suspended });
  } catch (err) {
    console.error('[platform/stores] summary error:', err.message);
    return res.status(500).json({ error: 'Failed to load summary' });
  }
});

// ── GET / (list) ─────────────────────────────────────────────────────────────

router.get('/', requireStaff, async (req, res) => {
  try {
    const { search, plan, status } = req.query;

    // Input validation
    if (search !== undefined && (typeof search !== 'string' || search.length > 100)) {
      return res.status(400).json({ error: 'search must be a string of at most 100 characters' });
    }
    if (plan !== undefined && !['free', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'plan must be free or pro' });
    }
    if (status !== undefined && !['active', 'needs_reconnect', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'status must be active, needs_reconnect, or suspended' });
    }

    const pageNum = Math.max(0, parseInt(req.query.page, 10) || 0);
    const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip    = pageNum * limit;

    // Build Mongo filter
    const filter = {};
    if (search && search.trim()) {
      const esc = escapeRegex(search.trim());
      filter.$or = [
        { shopName:   { $regex: esc, $options: 'i' } },
        { shopDomain: { $regex: esc, $options: 'i' } },
      ];
    }
    if (plan) filter.plan = plan;
    if (status === 'suspended')       { filter.suspended  = true; }
    else if (status === 'needs_reconnect') { filter.needsReauth = true; filter.suspended = { $ne: true }; }
    else if (status === 'active')     { filter.suspended = { $ne: true }; filter.needsReauth = { $ne: true }; }

    const [stores, total] = await Promise.all([
      Store.find(filter, LIST_PROJECTION).sort({ installedAt: -1 }).skip(skip).limit(limit).lean(),
      Store.countDocuments(filter),
    ]);

    const domains = stores.map(s => s.shopDomain);

    let profileCounts   = [];
    let sentCounts      = [];
    let failedCounts    = [];
    let lastActiveDates = [];

    if (domains.length) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      [profileCounts, sentCounts, failedCounts, lastActiveDates] = await Promise.all([
        // Grouped aggregates: one query per metric, scoped to this page's domains only.
        Profile.aggregate([
          { $match: { shopDomain: { $in: domains } } },
          { $group: { _id: '$shopDomain', count: { $sum: 1 } } },
        ]),
        ScheduledJob.aggregate([
          { $match: { shopDomain: { $in: domains }, status: 'sent', runAt: { $gte: cutoff } } },
          { $group: { _id: '$shopDomain', count: { $sum: 1 } } },
        ]),
        ScheduledJob.aggregate([
          { $match: { shopDomain: { $in: domains }, status: 'failed', runAt: { $gte: cutoff } } },
          { $group: { _id: '$shopDomain', count: { $sum: 1 } } },
        ]),
        Profile.aggregate([
          { $match: { shopDomain: { $in: domains }, lastSeenAt: { $ne: null } } },
          { $group: { _id: '$shopDomain', lastActive: { $max: '$lastSeenAt' } } },
        ]),
      ]);
    }

    const profileMap    = Object.fromEntries(profileCounts.map(r => [r._id, r.count]));
    const sentMap       = Object.fromEntries(sentCounts.map(r => [r._id, r.count]));
    const failedMap     = Object.fromEntries(failedCounts.map(r => [r._id, r.count]));
    const lastActiveMap = Object.fromEntries(lastActiveDates.map(r => [r._id, r.lastActive]));

    const rows = stores.map(s => {
      let derivedStatus = 'active';
      if (s.suspended) derivedStatus = 'suspended';
      else if (s.needsReauth) derivedStatus = 'needs_reconnect';
      return {
        shopDomain:  s.shopDomain,
        shopName:    s.shopName || '',
        plan:        s.plan,
        status:      derivedStatus,
        installedAt: s.installedAt,
        shoppers:    profileMap[s.shopDomain]    ?? 0,
        sent7d:      sentMap[s.shopDomain]       ?? 0,
        failed7d:    failedMap[s.shopDomain]     ?? 0,
        lastActive:  lastActiveMap[s.shopDomain] ?? s.installedAt,
      };
    });

    return res.json({ total, page: pageNum, limit, stores: rows });
  } catch (err) {
    console.error('[platform/stores] list error:', err.message);
    return res.status(500).json({ error: 'Failed to load stores' });
  }
});

// ── GET /:shopDomain (detail) ─────────────────────────────────────────────────
// NOTE: define before POST /:shopDomain/suspend so Express can route correctly.

router.get('/:shopDomain', requireStaff, async (req, res) => {
  const { shopDomain } = req.params;
  if (!SHOP_DOMAIN_RE.test(shopDomain)) {
    return res.status(400).json({ error: 'Invalid shopDomain' });
  }

  try {
    const store = await Store.findOne({ shopDomain }, DETAIL_PROJECTION).lean();
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [profiles, pushSubscribers, emailsCaptured, sent7d, failed7d, recentFailuresDocs] =
      await Promise.all([
        Profile.countDocuments({ shopDomain }),
        Profile.countDocuments({ shopDomain, 'channels.push.subscribed': true }),
        Profile.countDocuments({ shopDomain, 'channels.email.address': { $exists: true, $nin: [null, ''] } }),
        ScheduledJob.countDocuments({ shopDomain, status: 'sent',   runAt: { $gte: cutoff7d } }),
        ScheduledJob.countDocuments({ shopDomain, status: 'failed', runAt: { $gte: cutoff7d } }),
        // Allow-list projection: never return profileId, sessionId, cartToken,
        // subscriptionToken, payload, or messageText.
        ScheduledJob.find(
          { shopDomain, status: 'failed' },
          'runAt channel origin error -_id'
        ).sort({ _id: -1 }).limit(20).lean(),
      ]);

    const recentFailures = recentFailuresDocs.map(j => ({
      at:      j.runAt,
      channel: j.channel,
      origin:  j.origin,
      error:   j.error,
    }));

    await logAudit({ staff: req.staff, action: 'store_opened', shopDomain, req });

    // pushStats is in the allow-list; extract it then spread remaining fields
    // so the shape is explicit and no surprises sneak through.
    const {
      pushStats,
      shopDomain:     _sd,
      shopName:       _sn,
      ownerEmail:     _oe,
      plan:           _pl,
      subscriptionStatus:  _ss,
      planUpdatedAt:  _pu,
      timezone:       _tz,
      installedAt:    _ia,
      lastSignalRunAt: _lr,
      needsReauth:    _nr,
      suspended:      _su,
      suspendedAt:    _sat,
      suspendedReason: _sr,
      suspendedNote:  _sn2,
      suspendedBy:    _sb,
      ...rest // must be empty; catches any accidental extra fields
    } = store;

    // Build explicit response — no token fields can slip through.
    const storeFields = {
      shopDomain,
      shopName:        store.shopName,
      ownerEmail:      store.ownerEmail,
      plan:            store.plan,
      subscriptionStatus: store.subscriptionStatus,
      planUpdatedAt:   store.planUpdatedAt,
      timezone:        store.timezone,
      installedAt:     store.installedAt,
      lastSignalRunAt: store.lastSignalRunAt,
      needsReauth:     store.needsReauth,
      pushStats:       store.pushStats,
      suspended:       store.suspended,
      suspendedAt:     store.suspendedAt,
      suspendedReason: store.suspendedReason,
      suspendedNote:   store.suspendedNote,
      suspendedBy:     store.suspendedBy,
    };

    return res.json({
      ...storeFields,
      stats: {
        profiles,
        pushSubscribers,
        emailsCaptured,
        sent7d,
        failed7d,
        pushDeliveryRate: store.pushStats?.rateLast7d ?? 0,
        dataWindowDays:   90,
      },
      recentFailures,
    });
  } catch (err) {
    console.error('[platform/stores] detail error:', err.message);
    return res.status(500).json({ error: 'Failed to load store' });
  }
});

// ── POST /:shopDomain/suspend ─────────────────────────────────────────────────

router.post('/:shopDomain/suspend', requireStaff, requireRole('owner', 'admin'), async (req, res) => {
  const { shopDomain } = req.params;
  if (!SHOP_DOMAIN_RE.test(shopDomain)) {
    return res.status(400).json({ error: 'Invalid shopDomain' });
  }

  const { reason, note } = req.body || {};
  if (!VALID_REASONS.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${VALID_REASONS.join(', ')}` });
  }
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string' || note.length > 500) {
      return res.status(400).json({ error: 'note must be a string of at most 500 characters' });
    }
  }

  try {
    const existing = await Store.findOne({ shopDomain }, 'suspended').lean();
    if (!existing) return res.status(404).json({ error: 'Store not found' });
    if (existing.suspended) return res.status(409).json({ error: 'Store is already suspended' });

    await suspendStore(shopDomain, { reason, note: note || '', staffEmail: req.staff.email });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[platform/stores] suspend error:', err.message);
    return res.status(500).json({ error: 'Failed to suspend store' });
  }
});

// ── POST /:shopDomain/unsuspend ───────────────────────────────────────────────

router.post('/:shopDomain/unsuspend', requireStaff, requireRole('owner', 'admin'), async (req, res) => {
  const { shopDomain } = req.params;
  if (!SHOP_DOMAIN_RE.test(shopDomain)) {
    return res.status(400).json({ error: 'Invalid shopDomain' });
  }

  try {
    const existing = await Store.findOne({ shopDomain }, 'suspended').lean();
    if (!existing) return res.status(404).json({ error: 'Store not found' });
    if (!existing.suspended) return res.status(409).json({ error: 'Store is not suspended' });

    const result = await unsuspendStore(shopDomain, { staffEmail: req.staff.email });
    return res.json({ ok: true, festivalDrafted: result.festivalDrafted, jobsSkipped: result.jobsSkipped });
  } catch (err) {
    console.error('[platform/stores] unsuspend error:', err.message);
    return res.status(500).json({ error: 'Failed to unsuspend store' });
  }
});

module.exports = router;
