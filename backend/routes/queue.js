const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const ScheduledJob = require('../models/ScheduledJob');
const Profile = require('../models/Profile');
const Store = require('../models/Store');
const { zonedTimeToUtc, resolveTz } = require('../utils/timezone');

const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// The Schedule Date & Time input sends a "YYYY-MM-DDTHH:mm" string with no
// timezone when the merchant actually picks a value — it represents the
// STORE's wall-clock time (entering 19:31 means 19:31 in the store's own
// timezone), so THAT shape is converted with the store's real IANA
// timezone via zonedTimeToUtc. `new Date(str)` on that same shape would
// instead use the server PROCESS's own local zone (whatever Node/Render
// happens to be running as) — unrelated to any shop's configured timezone.
//
// The Edit modal's Save button always sends `scheduledAt`, even when the
// merchant never touched the date field — in that case it's still holding
// the value the modal was opened with (the item's existing full ISO string
// from the database, e.g. "2026-09-29T14:01:00.000Z"), not a freshly-typed
// local string. That shape is already an unambiguous instant, so it's
// passed straight to `new Date()` — no store-timezone conversion needed or
// wanted, since it isn't a local wall-clock value at all. Treating it as
// "not the expected shape -> reject" (an earlier version of this function)
// broke every PATCH that didn't touch the date field, since it 400s with
// no console.error — silent from the server's own logs, "Failed to save
// changes" from the frontend. Returns null only when `raw` is neither
// shape (i.e. genuinely unparseable).
// `knownTz` lets a caller that already looked up the store's timezone once
// (e.g. converting an array of dates for one shop) skip a repeat DB lookup
// per date — every existing single-date caller omits it and behaves exactly
// as before.
async function resolveScheduledAt(shopDomain, raw, knownTz) {
  const s = String(raw || '').trim();
  const m = LOCAL_DATETIME_RE.exec(s);
  if (m) {
    const tz = knownTz || resolveTz(
      (await Store.findOne({ shopDomain }).select('timezone').lean())?.timezone
    );
    return zonedTimeToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
    const baseFields = {
      shopDomain: shop,
      title,
      body: body || '',
      imageUrl: imageUrl || '',
      mobileImageUrl: mobileImageUrl || '',
      desktopImageUrl: desktopImageUrl || '',
      festival: festival || '',
      targetType: targetType || 'home',
      productId: productId || '',
      productHandle: productHandle || '',
      productTitle: productTitle || '',
      status: status || 'draft',
    };

    // Multi-date: scheduledAt as an array of local datetime strings —
    // audits/multi-date-festival-audit.txt's design (a). Creates one
    // document per date. Unlike the single-date path below, this never
    // matches against/overwrites an existing draft or approved document
    // by (festival, date) — doing per-date dedupe here would mean
    // deciding whether a resubmitted date joins the OLD group or a new
    // one, which risks silently merging two campaigns; always-create is
    // the unambiguous, predictable behaviour.
    //
    // Group membership (audits/queue-multi-date-audit.txt — added when
    // QueueScreen.jsx's edit modal gained the ability to add dates to an
    // EXISTING item): the new documents join joinGroupId when the
    // caller already has a group to add to (the item being edited
    // already has a groupId). When it doesn't yet (an ungrouped
    // single-date item is having dates added to it for the first time),
    // the caller instead passes joinItemId — a fresh groupId is
    // generated and that existing item is folded into it too, in the
    // same request, so it isn't left orphaned outside its own new group.
    // joinGroupId isn't verified to belong to this shop beyond the
    // ObjectId cast: every read/write elsewhere in this file already
    // scopes by { shopDomain, groupId } together (PATCH's applyToGroup,
    // DELETE's ?group=true, the calendar/detail-page group lookups), so
    // a bogus/foreign id here can create documents that don't match any
    // real group for this shop, never cross-shop data exposure.
    if (Array.isArray(scheduledAt)) {
      if (scheduledAt.length === 0) {
        return res.status(400).json({ error: 'scheduledAt array must not be empty' });
      }

      const { joinGroupId, joinItemId } = req.body;
      let groupId;
      if (joinGroupId) {
        try {
          groupId = new mongoose.Types.ObjectId(joinGroupId);
        } catch {
          return res.status(400).json({ error: 'invalid joinGroupId' });
        }
      } else {
        groupId = new mongoose.Types.ObjectId();
      }

      const store = await Store.findOne({ shopDomain: shop }).select('timezone').lean();
      const tz = resolveTz(store?.timezone);

      const converted = [];
      for (const raw of scheduledAt) {
        const utc = await resolveScheduledAt(shop, raw, tz);
        if (!utc) {
          return res.status(400).json({
            error: `scheduledAt entry "${raw}" must be a "YYYY-MM-DDTHH:mm" local date-time`,
          });
        }
        converted.push(utc);
      }

      const docs = converted.map((scheduledAtUtc) => ({ ...baseFields, scheduledAt: scheduledAtUtc, groupId }));
      const items = await FestivalQueue.insertMany(docs);

      if (joinItemId) {
        await FestivalQueue.updateOne(
          { _id: joinItemId, shopDomain: shop, groupId: null },
          { $set: { groupId } }
        );
      }

      return res.json({ success: true, groupId, items });
    }

    const scheduledAtUtc = await resolveScheduledAt(shop, scheduledAt);
    if (!scheduledAtUtc) {
      return res.status(400).json({
        error: 'scheduledAt must be a "YYYY-MM-DDTHH:mm" local date-time',
      });
    }
    const fields = { ...baseFields, scheduledAt: scheduledAtUtc };

    // Idempotent per (festival, date): a repeat Approve/Add-to-Queue for
    // the same shop+festival+date (e.g. re-clicking, or Add-to-Queue
    // after an earlier Approve) updates the existing draft/approved item
    // for THAT date instead of creating a second one. A festival that's
    // already 'sent' or 'cancelled' doesn't match here, so it can be
    // queued fresh — same rule the Suggestions sidebar uses to decide
    // what's re-suggestible.
    //
    // FIX (was matched on shopDomain+festival+status alone, with no date
    // in the match): that let a second date for the same festival find
    // and silently overwrite the first date's document via $set — five
    // Approve submissions for five dates collapsed into one document
    // holding only the last date, discarding the other four with no
    // error (see audits/multi-date-festival-audit.txt section 1).
    // scheduledAt is now part of the match, so two different dates for
    // the same festival can never collide into one document; only a
    // genuine resubmission of the SAME date is idempotent.
    let item = null;
    if (festival) {
      item = await FestivalQueue.findOneAndUpdate(
        { shopDomain: shop, festival, scheduledAt: scheduledAtUtc, status: { $in: ['draft', 'approved'] } },
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

    // Per-item delivery summary for the calendar chips — ONE aggregation
    // across every item's ScheduledJob rows, not a query per item (the
    // calendar must not make N+1 requests).
    const ids = items.map((i) => i._id);
    const stats = ids.length
      ? await ScheduledJob.aggregate([
          { $match: { shopDomain: shop, festivalQueueId: { $in: ids } } },
          {
            $group: {
              _id: '$festivalQueueId',
              total: { $sum: 1 },
              delivered: { $sum: { $cond: [{ $eq: ['$outcome', 'delivered'] }, 1, 0] } },
              failed: { $sum: { $cond: [{ $eq: ['$outcome', 'failed'] }, 1, 0] } },
            },
          },
        ])
      : [];

    const statsMap = {};
    stats.forEach((s) => { statsMap[s._id.toString()] = s; });

    const enriched = items.map((i) => {
      const s = statsMap[i._id.toString()];
      return {
        ...i,
        summary: s
          ? { total: s.total, delivered: s.delivered, failed: s.failed }
          : { total: 0, delivered: 0, failed: 0 },
      };
    });

    return res.json({ items: enriched });
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
// The subset of FESTIVAL_PATCH_FIELDS that a bulk ("all remaining dates")
// edit is allowed to propagate to sibling documents — deliberately
// excludes scheduledAt and status: each date in a group keeps its own
// schedule and its own send state, only the shared notification content
// (what the customer sees) is meant to apply across the group.
const FESTIVAL_BULK_FIELDS = [
  'title', 'body', 'mobileImageUrl', 'desktopImageUrl',
  'targetType', 'productId', 'productHandle', 'productTitle',
];
router.patch('/:shopDomain/festival/:id', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const FestivalQueue = require('../models/FestivalQueue');

    // Diagnostic — added after a 400 here went completely silent (no
    // console.error, since it was an explicit `return res.status(400)`,
    // not a thrown error) and looked from the server logs like the
    // handler hung. Cheap enough to leave in permanently.
    if (req.body.scheduledAt !== undefined) {
      const store = await Store.findOne({ shopDomain: shop }).select('timezone').lean();
      console.log(
        `[queue] festival PATCH ${req.params.id} — received scheduledAt: ${JSON.stringify(req.body.scheduledAt)}, ` +
        `resolved store timezone: ${resolveTz(store?.timezone)}`
      );
    }

    const updates = {};
    for (const key of FESTIVAL_PATCH_FIELDS) {
      if (req.body[key] === undefined) continue;
      if (key === 'scheduledAt') {
        const scheduledAtUtc = await resolveScheduledAt(shop, req.body[key]);
        if (!scheduledAtUtc) {
          return res.status(400).json({
            error: 'scheduledAt must be a "YYYY-MM-DDTHH:mm" local date-time',
          });
        }
        updates.scheduledAt = scheduledAtUtc;
      } else {
        updates[key] = req.body[key];
      }
    }

    const item = await FestivalQueue.findOneAndUpdate(
      { _id: req.params.id, shopDomain: shop },
      { $set: updates },
      { new: true }
    );

    if (!item) {
      return res.json({ success: true, item: null });
    }

    // Bulk propagation to the rest of the group — opt-in via
    // applyToGroup, default false so a plain PATCH keeps today's
    // this-date-only behaviour exactly. Only the content-field subset
    // propagates (never scheduledAt/status), and only to sibling
    // documents still 'draft' or 'approved' — a document that already
    // sent is historical fact and is never rewritten after the fact.
    let groupItems = null;
    if (req.body.applyToGroup && item.groupId) {
      const bulkUpdates = {};
      for (const key of FESTIVAL_BULK_FIELDS) {
        if (updates[key] !== undefined) bulkUpdates[key] = updates[key];
      }
      if (Object.keys(bulkUpdates).length) {
        await FestivalQueue.updateMany(
          { groupId: item.groupId, _id: { $ne: item._id }, status: { $in: ['draft', 'approved'] } },
          { $set: bulkUpdates }
        );
      }
      groupItems = await FestivalQueue.find({ groupId: item.groupId }).sort({ scheduledAt: 1 }).lean();
    }

    return res.json({ success: true, item, ...(groupItems ? { groupItems } : {}) });
  } catch (err) {
    console.error('[queue] festival PATCH error:', err.message);
    return res.status(500).json({ error: 'Failed to update' });
  }
});

// DELETE /api/queue/:shopDomain/festival/:id
// ?group=true deletes every OTHER document in the target's group that is
// still 'draft' or 'approved' (same guard as bulk edit — a 'sent'
// document is never deleted this way), in addition to the target itself.
// Without ?group=true (or when the target has no groupId), behaviour is
// unchanged: exactly the one document is deleted.
router.delete('/:shopDomain/festival/:id', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const FestivalQueue = require('../models/FestivalQueue');

    if (req.query.group === 'true') {
      const target = await FestivalQueue.findOne({ _id: req.params.id, shopDomain: shop }).select('groupId');
      if (target && target.groupId) {
        const result = await FestivalQueue.deleteMany({
          shopDomain: shop,
          groupId: target.groupId,
          status: { $in: ['draft', 'approved'] },
        });
        return res.json({ success: true, deletedCount: result.deletedCount });
      }
    }

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

// GET /api/queue/:shopDomain/festival/:id/summary
// Aggregate counts for the festival detail page's summary cards and the
// calendar chip's muted line — an aggregation, not a full fetch.
router.get('/:shopDomain/festival/:id/summary', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const festivalQueueId = new mongoose.Types.ObjectId(req.params.id);

    const rows = await ScheduledJob.aggregate([
      { $match: { shopDomain: shop, festivalQueueId } },
      {
        $group: {
          _id: '$channel',
          total: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$outcome', 'delivered'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$outcome', 'failed'] }, 1, 0] } },
        },
      },
    ]);

    const summary = { total: 0, delivered: 0, failed: 0, byChannel: {} };
    rows.forEach((r) => {
      summary.total += r.total;
      summary.delivered += r.delivered;
      summary.failed += r.failed;
      summary.byChannel[r._id || 'push'] = { total: r.total, delivered: r.delivered, failed: r.failed };
    });

    return res.json({ summary });
  } catch (err) {
    console.error('[queue] festival summary error:', err.message);
    return res.status(500).json({ error: 'Failed to load summary' });
  }
});

// GET /api/queue/:shopDomain/festival/:id/recipients
// Paginated per-recipient rows for one festival send (ScheduledJob rows
// written by services/sendLogService.js). Never returns a full FCM
// token — only its last 8 characters. ?outcome=delivered|failed filters;
// ?page= paginates.
router.get('/:shopDomain/festival/:id/recipients', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const page = parseInt(req.query.page || '0', 10);
    const limit = 20;

    const query = { shopDomain: shop, festivalQueueId: req.params.id };
    if (req.query.outcome === 'delivered' || req.query.outcome === 'failed') {
      query.outcome = req.query.outcome;
    }

    const [jobs, total] = await Promise.all([
      ScheduledJob.find(query)
        .sort({ sentAt: -1 })
        .skip(page * limit)
        .limit(limit)
        .lean(),
      ScheduledJob.countDocuments(query),
    ]);

    // Resolve email + profileId via customerId first, cartToken as a
    // fallback — festival rows never carry profileId directly (see
    // services/sendLogService.js, which only knows what
    // CustomerPushSubscription had on file at send time).
    const customerIds = [...new Set(jobs.map((j) => j.customerId).filter(Boolean))];
    const cartTokens = [...new Set(jobs.map((j) => j.cartToken).filter(Boolean))];
    const profileOr = [];
    if (customerIds.length) profileOr.push({ 'identifiers.customerId': { $in: customerIds } });
    if (cartTokens.length) profileOr.push({ 'identifiers.cartTokens': { $in: cartTokens } });

    const profiles = profileOr.length
      ? await Profile.find({ shopDomain: shop, $or: profileOr })
          .select('identifiers.customerId identifiers.cartTokens identifiers.emails channels.email.address')
          .lean()
      : [];

    const byCustomerId = {};
    const byCartToken = {};
    profiles.forEach((p) => {
      const email = p.channels?.email?.address || p.identifiers?.emails?.[0] || null;
      if (p.identifiers?.customerId) byCustomerId[p.identifiers.customerId] = { profileId: p._id, email };
      (p.identifiers?.cartTokens || []).forEach((ct) => { byCartToken[ct] = { profileId: p._id, email }; });
    });

    const rows = jobs.map((j) => {
      const match = (j.customerId && byCustomerId[j.customerId])
        || (j.cartToken && byCartToken[j.cartToken])
        || null;
      return {
        _id: j._id,
        channel: j.channel,
        outcome: j.outcome,
        sentAt: j.sentAt,
        customerId: j.customerId || null,
        cartToken: j.cartToken || null,
        subscriptionTokenMasked: j.subscriptionToken ? j.subscriptionToken.slice(-8) : null,
        email: match?.email || null,
        profileId: match?.profileId || null,
      };
    });

    return res.json({ rows, total, page, limit });
  } catch (err) {
    console.error('[queue] festival recipients error:', err.message);
    return res.status(500).json({ error: 'Failed to load recipients' });
  }
});

// GET /api/queue/:shopDomain/customer/:profileId/notifications
// Every ScheduledJob for one customer — brain/automation sends AND
// festival/manual broadcasts — newest first. Powers CustomerDetail.jsx's
// "Notifications sent" section. Matches by profileId (brain jobs) OR by
// the profile's own customerId/cartTokens (festival/manual jobs never
// carry profileId — see services/sendLogService.js).
router.get('/:shopDomain/customer/:profileId/notifications', requireAuth,
  requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const profile = await Profile.findOne({ _id: req.params.profileId, shopDomain: shop })
      .select('identifiers.customerId identifiers.cartTokens')
      .lean();

    if (!profile) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const or = [{ profileId: profile._id }];
    if (profile.identifiers?.customerId) or.push({ customerId: profile.identifiers.customerId });
    if (profile.identifiers?.cartTokens?.length) {
      or.push({ cartToken: { $in: profile.identifiers.cartTokens } });
    }

    const jobs = await ScheduledJob.find({ shopDomain: shop, $or: or })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('signalType channel status outcome sentAt runAt payload festivalQueueId')
      .lean();

    const notifications = jobs.map((j) => ({
      _id: j._id,
      signalType: j.signalType,
      channel: j.channel,
      status: j.status,
      outcome: j.outcome,
      title: j.payload?.title || null,
      sentAt: j.sentAt || null,
      runAt: j.runAt,
      isFestival: !!j.festivalQueueId,
    }));

    return res.json({ notifications });
  } catch (err) {
    console.error('[queue] customer notifications error:', err.message);
    return res.status(500).json({ error: 'Failed to load notifications' });
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
