'use strict';

/**
 * Push Users endpoints — per-user views of push send history and revisit data.
 * Mounted at /api/dashboard/:shopDomain/channels/push by server.js.
 *
 * All routes:
 *   - requireAuth + requireStoreOwner (same as dashboard.js)
 *   - date range: ?from / ?to (same as drawer — defaults 7 days)
 *   - page/limit with max 50
 *   - aggregation cap 500 rows; joins in application code via batched $in
 *   - NEVER exposes raw FCM tokens
 *
 * userKey format: "p_<profileId>" or "a_<subscriptionDocId>"
 * name: derived from email (first dot/+/_-separated segment, title-cased) or "Anonymous visitor"
 * email: masked as j***@gmail.com (first char + *** + @domain)
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const ScheduledJob = require('../models/ScheduledJob');
const FestivalQueue = require('../models/FestivalQueue');
const AttributedEvent = require('../models/AttributedEvent');
const Profile = require('../models/Profile');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');

const SIGNAL_LABELS = {
  cart_abandon: 'Cart reminder',
  browse_abandon: 'Browse reminder',
  checkout_abandon: 'Checkout reminder',
  high_intent: 'High intent',
  price_hesitation: 'Price hesitation',
  post_purchase_d3: 'Post-purchase',
  lapsing: 'Going quiet',
  email_capture: 'Email capture',
  cod_to_prepaid: 'Prepaid upgrade',
  winback: 'Win back',
  welcome: 'Welcome',
  festival: 'Campaign',
  manual: 'Manual send',
  followup: 'Follow-up',
  order: 'Order message',
};
function typeLabel(t) {
  return SIGNAL_LABELS[t] || (t ? t.replace(/_/g, ' ') : 'Other');
}

function parseDateRange(req) {
  const from = new Date(req.query.from || Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to   = new Date(req.query.to   || Date.now());
  return {
    from: isNaN(from.getTime()) ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : from,
    to:   isNaN(to.getTime())   ? new Date()                                       : to,
  };
}

function parsePageLimit(req) {
  let page  = parseInt(req.query.page,  10); if (!isFinite(page)  || page  < 0) page  = 0;
  let limit = parseInt(req.query.limit, 10); if (!isFinite(limit) || limit < 1) limit = 20;
  if (limit > 50) limit = 50;
  return { page, limit };
}

// mask j***@gmail.com
function maskEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const at = email.indexOf('@');
  if (at < 1) return null;
  return email.slice(0, 1) + '***' + email.slice(at);
}

// derive display name from email (first segment before . _ + @)
function nameFromEmail(email) {
  if (!email) return null;
  const local = email.split('@')[0];
  return local.split(/[._+]/)[0].replace(/\b\w/g, (c) => c.toUpperCase()) || null;
}

// CSV injection guard: prefix cells starting with = + - @ with an apostrophe
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function csvRow(cells) {
  return cells.map((c) => {
    const s = csvCell(c);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(',');
}

// Parse userKey — returns { kind: 'profile'|'anon', id: string } or null on invalid
function parseUserKey(userKey) {
  if (!userKey || typeof userKey !== 'string') return null;
  if (userKey.startsWith('p_')) return { kind: 'profile', id: userKey.slice(2) };
  if (userKey.startsWith('a_')) return { kind: 'anon',    id: userKey.slice(2) };
  return null;
}

const UNTRACKED_SIGNAL_TYPES = new Set(['festival', 'manual']);

/**
 * Resolve ScheduledJob aggregation rows to user records.
 * groups: array from ScheduledJob.aggregate grouped by { profileId, token }
 * Returns array of user objects with userKey, sentCount, lastSentAt, jobIds, festivalQueueIds, trackedJobCount.
 */
async function resolveUserGroups(shop, groups) {
  // Split into profile-keyed and token-keyed groups
  const profileGroups = {};    // profileId (string) → merged group
  const tokenGroups   = {};    // token (string) → group

  for (const g of groups) {
    const pid = g._id.profileId ? String(g._id.profileId) : null;
    const tok = g._id.token || null;
    if (pid) {
      if (!profileGroups[pid]) {
        profileGroups[pid] = { pid, sentCount: 0, lastSentAt: null, jobIds: [], festivalQueueIds: [], trackedJobCount: 0 };
      }
      const pg = profileGroups[pid];
      pg.sentCount += g.sentCount;
      if (!pg.lastSentAt || g.lastSentAt > pg.lastSentAt) pg.lastSentAt = g.lastSentAt;
      pg.jobIds.push(...g.jobIds);
      pg.festivalQueueIds.push(...(g.festivalQueueIds || []));
      pg.trackedJobCount += g.trackedJobCount || 0;
    } else if (tok) {
      tokenGroups[tok] = { tok, sentCount: g.sentCount, lastSentAt: g.lastSentAt, jobIds: g.jobIds, festivalQueueIds: g.festivalQueueIds || [], trackedJobCount: g.trackedJobCount || 0 };
    }
  }

  // Resolve token-keyed groups to profiles via Profile.identifiers.pushTokens (batched $in)
  const unresolvedTokens = Object.keys(tokenGroups);
  if (unresolvedTokens.length) {
    const profiles = await Profile.find(
      { shopDomain: shop, 'identifiers.pushTokens': { $in: unresolvedTokens } },
      '_id identifiers.pushTokens'
    ).lean();
    for (const p of profiles) {
      const pid = String(p._id);
      for (const tok of (p.identifiers?.pushTokens || [])) {
        if (tokenGroups[tok]) {
          const tg = tokenGroups[tok];
          if (!profileGroups[pid]) {
            profileGroups[pid] = { pid, sentCount: 0, lastSentAt: null, jobIds: [], festivalQueueIds: [], trackedJobCount: 0 };
          }
          const pg = profileGroups[pid];
          pg.sentCount += tg.sentCount;
          if (!pg.lastSentAt || tg.lastSentAt > pg.lastSentAt) pg.lastSentAt = tg.lastSentAt;
          pg.jobIds.push(...tg.jobIds);
          pg.festivalQueueIds.push(...tg.festivalQueueIds);
          pg.trackedJobCount += tg.trackedJobCount;
          delete tokenGroups[tok];
        }
      }
    }
  }

  // Remaining token groups with no profile → look up CustomerPushSubscription for anon id
  const stillUnresolved = Object.values(tokenGroups);
  const anonMap = {};  // token → subscriptionDocId
  if (stillUnresolved.length) {
    const subs = await CustomerPushSubscription.find(
      { shopDomain: shop, token: { $in: stillUnresolved.map((g) => g.tok) } },
      '_id token deviceType'
    ).lean();
    for (const s of subs) {
      anonMap[s.token] = { id: String(s._id), deviceType: s.deviceType || 'unknown' };
    }
  }

  // Build final user list
  const users = [];

  // Profile-based users
  const profileIds = Object.keys(profileGroups);
  const profileDocs = profileIds.length
    ? await Profile.find(
        { _id: { $in: profileIds } },
        'channels.email.address identifiers.emails'
      ).lean()
    : [];
  const profileDocMap = {};
  for (const p of profileDocs) profileDocMap[String(p._id)] = p;

  for (const [pid, pg] of Object.entries(profileGroups)) {
    const pDoc = profileDocMap[pid];
    const email = pDoc?.channels?.email?.address || pDoc?.identifiers?.emails?.[0] || null;
    users.push({
      userKey: 'p_' + pid,
      name: nameFromEmail(email) || 'Anonymous visitor',
      email: maskEmail(email),
      deviceType: null,
      sentCount: pg.sentCount,
      lastSentAt: pg.lastSentAt,
      jobIds: pg.jobIds,
      festivalQueueIds: pg.festivalQueueIds.filter(Boolean),
      trackedJobCount: pg.trackedJobCount,
    });
  }

  // Anonymous users
  for (const tg of Object.values(tokenGroups)) {
    const anonInfo = anonMap[tg.tok];
    if (!anonInfo) continue; // token fully pruned from DB — skip
    users.push({
      userKey: 'a_' + anonInfo.id,
      name: 'Anonymous visitor',
      email: null,
      deviceType: anonInfo.deviceType,
      sentCount: tg.sentCount,
      lastSentAt: tg.lastSentAt,
      jobIds: tg.jobIds,
      festivalQueueIds: tg.festivalQueueIds.filter(Boolean),
      trackedJobCount: tg.trackedJobCount,
    });
  }

  return users;
}

/**
 * Determine revisited status for a list of user records.
 * Returns same users with revisited added.
 */
async function addRevisitedStatus(shop, users) {
  if (!users.length) return users;

  // Collect all jobIds and festivalQueueIds
  const allJobIds = [];
  const allFqIds  = [];
  for (const u of users) {
    allJobIds.push(...u.jobIds);
    allFqIds.push(...u.festivalQueueIds);
  }

  // Build set of FestivalQueue ids that have tracking enabled
  const trackedFqIds = new Set();
  if (allFqIds.length) {
    const fqDocs = await FestivalQueue.find(
      { _id: { $in: allFqIds }, tracked: true },
      '_id'
    ).lean();
    for (const fq of fqDocs) trackedFqIds.add(String(fq._id));
  }

  // Find clicked outcomes from ScheduledJob
  const clickedJobIds = new Set();
  if (allJobIds.length) {
    const clicked = await ScheduledJob.find(
      { _id: { $in: allJobIds }, outcome: { $in: ['clicked', 'converted'] } },
      '_id'
    ).lean();
    for (const j of clicked) clickedJobIds.add(String(j._id));
  }

  // Also check AttributedEvent for revisit events (some jobs may have outcome not yet updated)
  const revisitedJobIds = new Set();
  const revisitedFqIds  = new Set();
  if (allJobIds.length || allFqIds.length) {
    const attrQuery = { shopDomain: shop, eventType: 'revisit' };
    if (allJobIds.length && allFqIds.length) {
      attrQuery.$or = [
        { jobId: { $in: allJobIds } },
        { festivalQueueId: { $in: allFqIds } },
      ];
    } else if (allJobIds.length) {
      attrQuery.jobId = { $in: allJobIds };
    } else {
      attrQuery.festivalQueueId = { $in: allFqIds };
    }
    const attrRows = await AttributedEvent.find(attrQuery, 'jobId festivalQueueId').lean();
    for (const a of attrRows) {
      if (a.jobId) revisitedJobIds.add(String(a.jobId));
      if (a.festivalQueueId) revisitedFqIds.add(String(a.festivalQueueId));
    }
  }

  return users.map((u) => {
    // clicked?
    const hasClick = u.jobIds.some((jid) => clickedJobIds.has(String(jid)));
    const hasRevisitJob = u.jobIds.some((jid) => revisitedJobIds.has(String(jid)));
    const hasRevisitFq  = u.festivalQueueIds.some((fqid) => revisitedFqIds.has(String(fqid)));

    if (hasClick || hasRevisitJob || hasRevisitFq) {
      return { ...u, revisited: true };
    }

    // Is this user "tracked" — do they have at least one tracked job?
    // Brain/automation jobs (signalType not festival/manual): always tracked.
    // Festival/manual: tracked only if FestivalQueue.tracked=true.
    // trackedJobCount was computed in the aggregation (jobs with non-untracked signal).
    // But also: if any festivalQueueId is in trackedFqIds → tracked.
    const hasFestivalTracked = u.festivalQueueIds.some((fqid) => trackedFqIds.has(String(fqid)));
    const isTracked = (u.trackedJobCount > 0) || hasFestivalTracked;

    return { ...u, revisited: isTracked ? false : 'not_tracked' };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /users — list of push users for the shop in the date range
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { from, to } = parseDateRange(req);
    const { page, limit } = parsePageLimit(req);

    const typeFilter = typeof req.query.type  === 'string' && req.query.type.trim()   ? req.query.type.trim()   : null;
    const originFilter = typeof req.query.origin === 'string' && req.query.origin.trim() ? req.query.origin.trim() : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const includeVia = req.query.includeVia === '1';

    const match = {
      shopDomain: shop,
      channel: 'push',
      status: 'sent',
      sentAt: { $gte: from, $lte: to },
    };
    if (typeFilter)   match.signalType = typeFilter;
    if (originFilter) match.origin = originFilter;

    // Group by (profileId, subscriptionToken). trackedJobCount counts rows
    // whose signalType is NOT a broadcast type (always had ccf_job in URL).
    const groups = await ScheduledJob.aggregate([
      { $match: match },
      {
        $group: {
          _id: { profileId: '$profileId', token: '$subscriptionToken' },
          sentCount:       { $sum: 1 },
          lastSentAt:      { $max: '$sentAt' },
          jobIds:          { $push: '$_id' },
          festivalQueueIds: { $addToSet: '$festivalQueueId' },
          trackedJobCount: {
            $sum: {
              $cond: [{ $not: [{ $in: ['$signalType', ['festival', 'manual']] }] }, 1, 0],
            },
          },
        },
      },
      { $sort: { lastSentAt: -1 } },
      { $limit: 500 },
    ]);

    let users = await resolveUserGroups(shop, groups);
    users = await addRevisitedStatus(shop, users);

    // q filter: match against name (lower) and first char of email (lower)
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      users = users.filter((u) => re.test(u.name) || (u.email && re.test(u.email)));
    }

    // Sort by lastSentAt desc (already sorted from agg, but q filter may reorder)
    users.sort((a, b) => (b.lastSentAt || 0) - (a.lastSentAt || 0));

    const total = users.length;
    const slice = users.slice(page * limit, (page + 1) * limit);

    // When includeVia=1, batch-fetch cameBackVia for the page slice
    let viaMap = {};  // userKey -> [{type, label, count}]
    if (includeVia && slice.length > 0) {
      const allJobIds = [];
      for (const u of slice) allJobIds.push(...u.jobIds);

      if (allJobIds.length) {
        const attrRows = await AttributedEvent.find(
          { shopDomain: shop, eventType: 'revisit', jobId: { $in: allJobIds } },
          'jobId'
        ).lean();

        const jobToUserKey = {};
        for (const u of slice) {
          for (const jid of u.jobIds) jobToUserKey[String(jid)] = u.userKey;
        }

        const jobSignalRows = await ScheduledJob.find(
          { _id: { $in: allJobIds } },
          '_id signalType'
        ).lean();
        const jobSignalMap = {};
        for (const j of jobSignalRows) jobSignalMap[String(j._id)] = j.signalType || 'other';

        const tally = {};  // userKey -> { signalType -> count }
        for (const a of attrRows) {
          const jid = String(a.jobId);
          const uk = jobToUserKey[jid];
          if (!uk) continue;
          const st = jobSignalMap[jid] || 'other';
          if (!tally[uk]) tally[uk] = {};
          tally[uk][st] = (tally[uk][st] || 0) + 1;
        }

        for (const [uk, typeCounts] of Object.entries(tally)) {
          viaMap[uk] = Object.entries(typeCounts)
            .map(([type, count]) => ({ type, label: typeLabel(type), count }))
            .sort((a, b) => b.count - a.count);
        }
      }
    }

    return res.json({
      total,
      users: slice.map((u) => {
        const base = {
          userKey:    u.userKey,
          name:       u.name,
          email:      u.email,
          deviceType: u.deviceType,
          lastSentAt: u.lastSentAt,
          sentCount:  u.sentCount,
          revisited:  u.revisited,
        };
        if (includeVia) base.cameBackVia = viaMap[u.userKey] || [];
        return base;
      }),
    });
  } catch (err) {
    console.error('[push-users] GET /users error:', err.message);
    return res.status(500).json({ error: 'Failed to load push users' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /users/:userKey/count — per-user sent count by type
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:userKey/count', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { userKey } = req.params;
    const { from, to } = parseDateRange(req);

    const parsed = parseUserKey(userKey);
    if (!parsed) return res.status(400).json({ error: 'Invalid userKey format' });

    let jobMatch;
    if (parsed.kind === 'profile') {
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(parsed.id)) {
        return res.status(400).json({ error: 'Invalid userKey id' });
      }
      jobMatch = { shopDomain: shop, channel: 'push', status: 'sent', sentAt: { $gte: from, $lte: to }, profileId: new mongoose.Types.ObjectId(parsed.id) };
    } else {
      // anon: look up by subscriptionDocId → get token → query by token
      const sub = await CustomerPushSubscription.findOne(
        { _id: parsed.id, shopDomain: shop },
        'token'
      ).lean();
      if (!sub) return res.status(404).json({ error: 'User not found' });
      jobMatch = { shopDomain: shop, channel: 'push', status: 'sent', sentAt: { $gte: from, $lte: to }, subscriptionToken: sub.token };
    }

    const agg = await ScheduledJob.aggregate([
      { $match: jobMatch },
      { $group: { _id: '$signalType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const total = agg.reduce((s, r) => s + r.count, 0);
    const byType = agg.map((r) => ({ type: r._id || 'other', label: typeLabel(r._id), count: r.count }));

    return res.json({ total, byType });
  } catch (err) {
    console.error('[push-users] GET /users/:userKey/count error:', err.message);
    return res.status(500).json({ error: 'Failed to load user count' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /users/:userKey/revisit — per-user revisit detail per notification
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:userKey/revisit', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { userKey } = req.params;
    const { from, to } = parseDateRange(req);
    const { page, limit } = parsePageLimit(req);

    const parsed = parseUserKey(userKey);
    if (!parsed) return res.status(400).json({ error: 'Invalid userKey format' });

    let jobQuery;
    if (parsed.kind === 'profile') {
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(parsed.id)) {
        return res.status(400).json({ error: 'Invalid userKey id' });
      }
      // Verify this profile belongs to this shop
      const profileExists = await Profile.findOne({ _id: parsed.id, shopDomain: shop }, '_id').lean();
      if (!profileExists) return res.status(404).json({ error: 'User not found' });
      jobQuery = { shopDomain: shop, channel: 'push', status: 'sent', sentAt: { $gte: from, $lte: to }, profileId: new mongoose.Types.ObjectId(parsed.id) };
    } else {
      const sub = await CustomerPushSubscription.findOne({ _id: parsed.id, shopDomain: shop }, 'token').lean();
      if (!sub) return res.status(404).json({ error: 'User not found' });
      jobQuery = { shopDomain: shop, channel: 'push', status: 'sent', sentAt: { $gte: from, $lte: to }, subscriptionToken: sub.token };
    }

    const jobs = await ScheduledJob.find(jobQuery)
      .sort({ sentAt: -1 })
      .select('_id signalType sentAt payload outcome clickedAt festivalQueueId')
      .lean();

    const total = jobs.length;
    const slicedJobs = jobs.slice(page * limit, (page + 1) * limit);

    // Determine which FestivalQueue ids are tracked
    const fqIds = [...new Set(slicedJobs.map((j) => j.festivalQueueId).filter(Boolean).map(String))];
    const trackedFqIds = new Set();
    if (fqIds.length) {
      const fqDocs = await FestivalQueue.find({ _id: { $in: fqIds }, tracked: true }, '_id').lean();
      for (const fq of fqDocs) trackedFqIds.add(String(fq._id));
    }

    // Batch-load AttributedEvents for these jobs
    const jobIds = slicedJobs.map((j) => j._id);
    const slicedFqIds = slicedJobs.map((j) => j.festivalQueueId).filter(Boolean);
    const attrQuery = { shopDomain: shop };
    if (jobIds.length && slicedFqIds.length) {
      attrQuery.$or = [{ jobId: { $in: jobIds } }, { festivalQueueId: { $in: slicedFqIds } }];
    } else if (jobIds.length) {
      attrQuery.jobId = { $in: jobIds };
    } else if (slicedFqIds.length) {
      attrQuery.festivalQueueId = { $in: slicedFqIds };
    }

    const attrEvents = jobIds.length || slicedFqIds.length
      ? await AttributedEvent.find(attrQuery).select('jobId festivalQueueId eventType ts').lean()
      : [];

    // Group attributed events by jobId or festivalQueueId
    const attrByJob = {};
    const attrByFq  = {};
    for (const a of attrEvents) {
      if (a.jobId) {
        const k = String(a.jobId);
        if (!attrByJob[k]) attrByJob[k] = [];
        attrByJob[k].push(a);
      }
      if (a.festivalQueueId) {
        const k = String(a.festivalQueueId);
        if (!attrByFq[k]) attrByFq[k] = [];
        attrByFq[k].push(a);
      }
    }

    const notifications = slicedJobs.map((j) => {
      const jidStr = String(j._id);
      const fqIdStr = j.festivalQueueId ? String(j.festivalQueueId) : null;
      const events = [
        ...(attrByJob[jidStr] || []),
        ...(fqIdStr ? (attrByFq[fqIdStr] || []) : []),
      ];

      // Determine tracked status
      let isTracked;
      if (UNTRACKED_SIGNAL_TYPES.has(j.signalType)) {
        isTracked = fqIdStr ? trackedFqIds.has(fqIdStr) : false;
      } else {
        isTracked = true;
      }

      const visits   = events.filter((e) => e.eventType === 'revisit').length;
      const revisitTs = events.filter((e) => e.eventType === 'revisit').map((e) => e.ts);
      const lastVisitAt = revisitTs.length ? new Date(Math.max(...revisitTs.map((t) => +t))) : null;

      let status;
      if (!isTracked) {
        status = 'not_tracked';
      } else if (j.outcome === 'clicked' || j.outcome === 'converted' || visits > 0) {
        status = 'revisited';
      } else {
        status = 'no_revisit';
      }

      return {
        jobId:       jidStr,
        type:        j.signalType || 'other',
        label:       typeLabel(j.signalType),
        title:       j.payload?.title || null,
        sentAt:      j.sentAt,
        status,
        visits,
        lastVisitAt,
        funnel: {
          addedToCart: events.filter((e) => e.eventType === 'add_to_cart').length,
          checkout:    events.filter((e) => e.eventType === 'checkout_start').length,
          purchased:   events.filter((e) => e.eventType === 'purchase').length,
        },
      };
    });

    // Summary stats
    const revisitedAfter = notifications.filter((n) => n.status === 'revisited').length;
    const byTypeSent = {};
    for (const j of jobs) {
      const t = j.signalType || 'other';
      byTypeSent[t] = (byTypeSent[t] || 0) + 1;
    }
    const byType = Object.entries(byTypeSent).map(([type, count]) => ({
      type, label: typeLabel(type), count,
    })).sort((a, b) => b.count - a.count);

    return res.json({
      summary: { sent: total, revisitedAfter, byType },
      notifications,
      page,
      limit,
    });
  } catch (err) {
    console.error('[push-users] GET /users/:userKey/revisit error:', err.message);
    return res.status(500).json({ error: 'Failed to load revisit data' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /revisited — all users who revisited after a push
// ─────────────────────────────────────────────────────────────────────────────
router.get('/revisited', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { from, to } = parseDateRange(req);
    const { page, limit } = parsePageLimit(req);

    const typeFilter = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    // Find all 'revisit' AttributedEvents in range, with jobId or festivalQueueId
    const attrMatch = {
      shopDomain: shop,
      eventType: 'revisit',
      ts: { $gte: from, $lte: to },
    };

    const attrEvents = await AttributedEvent.find(attrMatch)
      .select('jobId festivalQueueId profileId sessionId ts')
      .sort({ ts: -1 })
      .limit(500)
      .lean();

    if (!attrEvents.length) {
      return res.json({ total: 0, users: [] });
    }

    // Collect jobIds and festivalQueueIds to find originating ScheduledJob rows
    const jobIds = [...new Set(attrEvents.map((a) => a.jobId).filter(Boolean).map(String))];
    const fqIds  = [...new Set(attrEvents.map((a) => a.festivalQueueId).filter(Boolean).map(String))];

    // Load ScheduledJob rows for jobId-based events
    const jobRows = jobIds.length
      ? await ScheduledJob.find(
          { _id: { $in: jobIds }, shopDomain: shop, channel: 'push' },
          '_id profileId subscriptionToken signalType'
        ).lean()
      : [];

    const jobMap = {};
    for (const j of jobRows) jobMap[String(j._id)] = j;

    // For fqId-based events, find associated ScheduledJob rows (one per token per broadcast)
    const fqJobRows = fqIds.length
      ? await ScheduledJob.find(
          { festivalQueueId: { $in: fqIds }, shopDomain: shop, channel: 'push', status: 'sent' },
          '_id profileId subscriptionToken festivalQueueId signalType'
        ).lean()
      : [];

    // Apply type filter across job rows
    const allJobRowsForFilter = [...jobRows, ...fqJobRows];
    const allowedJobIds = typeFilter
      ? new Set(allJobRowsForFilter.filter((j) => j.signalType === typeFilter).map((j) => String(j._id)))
      : null;

    // Build user-level revisit map
    const userVisits = {};  // userKey → { profileId|anonId, revisits, jobs, latestTs }

    for (const attr of attrEvents) {
      // Resolve jobRow
      let jobRow = null;
      if (attr.jobId) {
        jobRow = jobMap[String(attr.jobId)];
        if (!jobRow) continue;
        if (allowedJobIds && !allowedJobIds.has(String(jobRow._id))) continue;
      } else if (attr.festivalQueueId) {
        // Match a fqJobRow for this event. Use profileId from the attr event if present.
        // Otherwise find any fqJobRow for this festivalQueueId.
        if (attr.profileId) {
          jobRow = fqJobRows.find(
            (j) => String(j.festivalQueueId) === String(attr.festivalQueueId) &&
                   j.profileId && String(j.profileId) === String(attr.profileId)
          ) || fqJobRows.find((j) => String(j.festivalQueueId) === String(attr.festivalQueueId));
        } else {
          jobRow = fqJobRows.find((j) => String(j.festivalQueueId) === String(attr.festivalQueueId));
        }
        if (!jobRow) continue;
        if (allowedJobIds && !allowedJobIds.has(String(jobRow._id))) continue;
      } else {
        continue;
      }

      // Determine userKey
      let userKey;
      const pid = jobRow.profileId ? String(jobRow.profileId) : null;
      if (pid) {
        userKey = 'p_' + pid;
      } else {
        // Will resolve anon userKey after collecting all
        userKey = '__tok__' + (jobRow.subscriptionToken || 'unknown');
      }

      if (!userVisits[userKey]) {
        userVisits[userKey] = { userKey, pid, tok: jobRow.subscriptionToken || null, revisits: 0, latestTs: null, jobIds: new Set(), signalTypeCounts: {} };
      }
      const uv = userVisits[userKey];
      uv.revisits++;
      if (!uv.latestTs || attr.ts > uv.latestTs) uv.latestTs = attr.ts;
      uv.jobIds.add(String(jobRow._id));
      const st = jobRow.signalType || 'other';
      uv.signalTypeCounts[st] = (uv.signalTypeCounts[st] || 0) + 1;
    }

    // Resolve __tok__ keys to 'a_<subscriptionDocId>'
    const tokKeys = Object.keys(userVisits).filter((k) => k.startsWith('__tok__'));
    if (tokKeys.length) {
      const tokens = tokKeys.map((k) => userVisits[k].tok).filter(Boolean);
      const subs = tokens.length
        ? await CustomerPushSubscription.find(
            { shopDomain: shop, token: { $in: tokens } }, '_id token deviceType'
          ).lean()
        : [];
      const subMap = {};
      for (const s of subs) subMap[s.token] = s;
      for (const k of tokKeys) {
        const uv = userVisits[k];
        const sub = subMap[uv.tok];
        const newKey = sub ? 'a_' + String(sub._id) : null;
        if (newKey) {
          if (userVisits[newKey]) {
            // merge
            userVisits[newKey].revisits += uv.revisits;
            if (uv.latestTs > userVisits[newKey].latestTs) userVisits[newKey].latestTs = uv.latestTs;
          } else {
            userVisits[newKey] = { ...uv, userKey: newKey, deviceType: sub.deviceType };
          }
        }
        delete userVisits[k];
      }
    }

    // Load profile display info
    const profileIds = [...new Set(Object.values(userVisits).map((u) => u.pid).filter(Boolean))];
    const profileDocMap = {};
    if (profileIds.length) {
      const pDocs = await Profile.find(
        { _id: { $in: profileIds } }, 'channels.email.address identifiers.emails'
      ).lean();
      for (const p of pDocs) profileDocMap[String(p._id)] = p;
    }

    let users = Object.values(userVisits).map((uv) => {
      const pDoc = uv.pid ? profileDocMap[uv.pid] : null;
      const email = pDoc?.channels?.email?.address || pDoc?.identifiers?.emails?.[0] || null;
      const cameBackVia = Object.entries(uv.signalTypeCounts)
        .map(([type, count]) => ({ type, label: typeLabel(type), count, lastVisitAt: uv.latestTs }))
        .sort((a, b) => b.count - a.count);
      return {
        userKey: uv.userKey,
        name:    nameFromEmail(email) || 'Anonymous visitor',
        email:   maskEmail(email),
        deviceType: uv.deviceType || null,
        revisits: uv.revisits,
        lastVisitAt: uv.latestTs,
        cameBackVia,
      };
    });

    // q filter
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      users = users.filter((u) => re.test(u.name) || (u.email && re.test(u.email)));
    }

    users.sort((a, b) => (b.lastVisitAt || 0) - (a.lastVisitAt || 0));

    const total = users.length;
    return res.json({
      total,
      users: users.slice(page * limit, (page + 1) * limit),
    });
  } catch (err) {
    console.error('[push-users] GET /revisited error:', err.message);
    return res.status(500).json({ error: 'Failed to load revisited users' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /users.csv — CSV export of push users (max 5000 rows)
// Authenticated same as all other dashboard routes (requireAuth + requireStoreOwner).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users.csv', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { from, to } = parseDateRange(req);

    const typeFilter = typeof req.query.type  === 'string' && req.query.type.trim()   ? req.query.type.trim()   : null;
    const originFilter = typeof req.query.origin === 'string' && req.query.origin.trim() ? req.query.origin.trim() : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const match = {
      shopDomain: shop,
      channel: 'push',
      status: 'sent',
      sentAt: { $gte: from, $lte: to },
    };
    if (typeFilter)   match.signalType = typeFilter;
    if (originFilter) match.origin = originFilter;

    const CSV_AGG_LIMIT = 5000;
    const groups = await ScheduledJob.aggregate([
      { $match: match },
      {
        $group: {
          _id: { profileId: '$profileId', token: '$subscriptionToken' },
          sentCount:       { $sum: 1 },
          lastSentAt:      { $max: '$sentAt' },
          jobIds:          { $push: '$_id' },
          festivalQueueIds: { $addToSet: '$festivalQueueId' },
          trackedJobCount: {
            $sum: {
              $cond: [{ $not: [{ $in: ['$signalType', ['festival', 'manual']] }] }, 1, 0],
            },
          },
        },
      },
      { $sort: { lastSentAt: -1 } },
      { $limit: CSV_AGG_LIMIT },
    ]);

    let users = await resolveUserGroups(shop, groups);
    users = await addRevisitedStatus(shop, users);

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      users = users.filter((u) => re.test(u.name) || (u.email && re.test(u.email)));
    }

    users.sort((a, b) => (b.lastSentAt || 0) - (a.lastSentAt || 0));

    const rows = [
      csvRow(['name', 'email', 'sent_count', 'last_sent', 'revisited', 'came_back_via']),
    ];
    for (const u of users) {
      rows.push(csvRow([
        u.name,
        u.email || '',
        u.sentCount,
        u.lastSentAt ? new Date(u.lastSentAt).toISOString() : '',
        u.revisited === true ? 'yes' : u.revisited === false ? 'no' : 'not_tracked',
        '',
      ]));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="push-users.csv"');
    return res.send(rows.join('\r\n'));
  } catch (err) {
    console.error('[push-users] GET /users.csv error:', err.message);
    return res.status(500).json({ error: 'Failed to export CSV' });
  }
});

module.exports = router;
