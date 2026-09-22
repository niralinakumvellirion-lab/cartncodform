const express = require('express');
const router = express.Router();
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const ScheduledJob = require('../models/ScheduledJob');
const Profile = require('../models/Profile');

// GET /api/queue/:shopDomain
// Returns paginated job list with filters
router.get('/:shopDomain', requireAuth, requireStoreOwner,
  async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page || '0', 10);
    const limit = 20;

    const query = { shopDomain: shop };
    if (status !== 'all') query.status = status;

    const [jobs, total] = await Promise.all([
      ScheduledJob.find(query)
        .sort({ updatedAt: -1 })
        .skip(page * limit)
        .limit(limit)
        .lean(),
      ScheduledJob.countDocuments(query),
    ]);

    // Enrich with profile email
    const profileIds = jobs
      .map(j => j.profileId)
      .filter(Boolean)
      .map(String);

    const profiles = await Profile.find({
      _id: { $in: profileIds }
    }).select('identifiers.emails channels.email.address').lean();

    const profileMap = {};
    profiles.forEach(p => {
      profileMap[p._id.toString()] =
        p.channels?.email?.address ||
        p.identifiers?.emails?.[0] || null;
    });

    const enriched = jobs.map(j => ({
      ...j,
      email: profileMap[j.profileId?.toString()] || null,
    }));

    return res.json({ jobs: enriched, total, page, limit });
  } catch (err) {
    console.error('[queue] GET error:', err.message);
    return res.status(500).json({ error: 'Failed to load queue' });
  }
});

// POST /api/queue/:shopDomain/:jobId/send-now
// Force a pending job to run immediately
router.post('/:shopDomain/:jobId/send-now', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const job = await ScheduledJob.findOne({
      _id: req.params.jobId,
      shopDomain: shop,
      status: 'pending',
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found or not pending' });
    }

    job.runAt = new Date();
    await job.save();

    return res.json({ success: true, message: 'Job will run within 30 seconds' });
  } catch (err) {
    console.error('[queue] send-now error:', err.message);
    return res.status(500).json({ error: 'Failed to update job' });
  }
});

// POST /api/queue/:shopDomain/:jobId/cancel
// Cancel a pending job
router.post('/:shopDomain/:jobId/cancel', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const job = await ScheduledJob.findOne({
      _id: req.params.jobId,
      shopDomain: shop,
      status: 'pending',
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found or not pending' });
    }

    job.status = 'cancelled';
    await job.save();

    return res.json({ success: true });
  } catch (err) {
    console.error('[queue] cancel error:', err.message);
    return res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// POST /api/queue/:shopDomain/festival
// Save (or queue) a festival-suggestion notification from the Dashboard's
// notification editor. Powers "Approve" (status: 'approved') and "Add to
// Queue" (status: 'draft') — see audits/dashboard-phase1-audit.txt.
//
// DEVIATION FROM THE GIVEN SPEC: the task's own route was `router.post(
// '/festival', requireAuth, requireStoreOwner, ...)` — a path with NO
// :shopDomain segment. requireStoreOwner (backend/middleware/
// requireOwner.js) unconditionally compares `req.shopDomain !==
// req.params.shopDomain` and 403s if they differ; with no :shopDomain in
// the route path, req.params.shopDomain is always undefined, which never
// equals a real shop string — so EVERY request to that route would have
// been rejected with 403, no matter who called it. Every other route in
// this file already uses the `/:shopDomain/...` shape for exactly this
// reason. Added `:shopDomain` to the path to match, and dropped the
// (unread) `shop` field from the request body accordingly — the
// handler below already takes shop from the verified req.shopDomain
// token, never the body, same as every other route here.
router.post('/:shopDomain/festival', requireAuth, requireStoreOwner,
  async (req, res) => {
  try {
    const shop = req.shopDomain;
    const { title, body, imageUrl, scheduledAt, festival,
            status, mobileImageUrl, desktopImageUrl,
            targetType, productId, productHandle, productTitle } = req.body;

    if (!title || !scheduledAt) {
      return res.status(400).json({
        error: 'title and scheduledAt required'
      });
    }

    const FestivalQueue = require('../models/FestivalQueue');
    const fields = {
      shopDomain: shop,
      title,
      body: body || '',
      imageUrl: imageUrl || '',
      mobileImageUrl: mobileImageUrl || '',
      desktopImageUrl: desktopImageUrl || '',
      scheduledAt: new Date(scheduledAt),
      festival: festival || '',
      targetType: targetType || 'home',
      productId: productId || '',
      productHandle: productHandle || '',
      productTitle: productTitle || '',
      status: status || 'draft',
    };

    // Idempotent per festival: a repeat Approve/Add-to-Queue for the same
    // shop+festival (e.g. re-clicking, or Add-to-Queue after an earlier
    // Approve) updates the existing draft/approved item instead of
    // creating a second one. A festival that's already 'sent' or
    // 'cancelled' doesn't match here, so it can be queued fresh — same
    // rule the Suggestions sidebar uses to decide what's re-suggestible.
    let item = null;
    if (festival) {
      item = await FestivalQueue.findOneAndUpdate(
        { shopDomain: shop, festival, status: { $in: ['draft', 'approved'] } },
        { $set: fields },
        { new: true }
      );
    }
    if (!item) {
      item = await FestivalQueue.create(fields);
    }

    return res.json({ success: true, id: item._id });
  } catch (err) {
    console.error('[queue] festival error:', err.message);
    return res.status(500).json({ error: 'Failed to save' });
  }
});

// GET /api/queue/:shopDomain/festival
// Returns every FestivalQueue item for this shop (draft + approved +
// sent + cancelled), oldest scheduledAt first — powers the Phase 2
// Queue calendar/planning views. See audits/queue-phase2-audit.txt.
router.get('/:shopDomain/festival', requireAuth, requireStoreOwner,
  async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const FestivalQueue = require('../models/FestivalQueue');

    const items = await FestivalQueue.find({ shopDomain: shop })
      .sort({ scheduledAt: 1 })
      .lean();

    return res.json({ items });
  } catch (err) {
    console.error('[queue] festival GET error:', err.message);
    return res.status(500).json({ error: 'Failed to load' });
  }
});

// PATCH /api/queue/:shopDomain/festival/:id
// Partial update — used by the Planning List's "Approve" button (sets
// status: 'approved') and its "Edit" modal (title/body/images/
// scheduledAt).
//
// Previously did `{ $set: req.body }` with no field whitelist at all —
// not "only some of the needed fields", but the opposite: every field in
// the request body was blindly persisted, including ones that should
// never be client-writable (e.g. shopDomain — since the query filter
// only uses shopDomain to find the doc, a body containing a different
// shopDomain would still match-then-reassign it, silently moving the
// item off this shop). Replaced with an explicit whitelist covering
// exactly the fields the Edit modal and Approve button need
// (title, body, mobileImageUrl, desktopImageUrl, scheduledAt, status,
// plus targetType/productId/productHandle/productTitle for the
// click-URL target — see buildClickUrl in utils/pushNotification.js);
// everything else in the body is now ignored.
const FESTIVAL_PATCH_FIELDS = [
  'title', 'body', 'mobileImageUrl', 'desktopImageUrl', 'scheduledAt', 'status',
  'targetType', 'productId', 'productHandle', 'productTitle',
];
router.patch('/:shopDomain/festival/:id', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const FestivalQueue = require('../models/FestivalQueue');

    const updates = {};
    for (const key of FESTIVAL_PATCH_FIELDS) {
      if (req.body[key] !== undefined) {
        updates[key] = key === 'scheduledAt' ? new Date(req.body[key]) : req.body[key];
      }
    }

    const item = await FestivalQueue.findOneAndUpdate(
      { _id: req.params.id, shopDomain: shop },
      { $set: updates },
      { new: true }
    );
    return res.json({ success: true, item });
  } catch (err) {
    console.error('[queue] festival PATCH error:', err.message);
    return res.status(500).json({ error: 'Failed to update' });
  }
});

// DELETE /api/queue/:shopDomain/festival/:id
router.delete('/:shopDomain/festival/:id', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const FestivalQueue = require('../models/FestivalQueue');

    await FestivalQueue.findOneAndDelete({
      _id: req.params.id,
      shopDomain: shop,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[queue] festival DELETE error:', err.message);
    return res.status(500).json({ error: 'Failed to delete' });
  }
});

// TEMPORARY DEBUG ROUTE — read-only, does not modify anything.
// GET /api/queue/:shopDomain/festival/_duplicates
// Groups this shop's FestivalQueue items by (festival, scheduledAt DAY) and
// returns only groups with more than one item, to help track down duplicate
// festival-suggestion rows. Remove once the dedupe investigation is done.
router.get('/:shopDomain/festival/_duplicates', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const FestivalQueue = require('../models/FestivalQueue');

    const groups = await FestivalQueue.aggregate([
      { $match: { shopDomain: shop } },
      {
        $group: {
          _id: {
            festival: '$festival',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledAt' } },
          },
          count: { $sum: 1 },
          items: {
            $push: {
              _id: '$_id',
              title: '$title',
              status: '$status',
              createdAt: '$createdAt',
              updatedAt: '$updatedAt',
              targetType: '$targetType',
            },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { '_id.date': 1 } },
    ]);

    return res.json({
      duplicateGroups: groups.map((g) => ({
        festival: g._id.festival,
        date: g._id.date,
        count: g.count,
        items: g.items,
      })),
    });
  } catch (err) {
    console.error('[queue] festival _duplicates error:', err.message);
    return res.status(500).json({ error: 'Failed to load duplicates' });
  }
});

module.exports = router;
