'use strict';

/**
 * Email Users endpoints — per-user views of email send history and revisit data.
 * Mounted at /api/dashboard/:shopDomain/channels/email by server.js. Same shape as
 * routes/pushUsers.js so the dashboard drawer can show the same details for email.
 *
 * All routes: requireAuth + requireStoreOwner (scoped by shopDomain), date range
 * ?from/?to (default 7 days), page/limit max 50, aggregation cap 500 rows.
 * Emails are always masked (j***@gmail.com); full addresses are never returned.
 *
 * userKey is always "p_<profileId>" (email has no anonymous visitors).
 *
 * Where the rows come from (ScheduledJob, channel 'email', status 'sent'):
 *   - automated / manual single sends: one row per email with profileId; the email
 *     link carries ccf_job=<row _id>.
 *   - broadcasts: one row per recipient (subscriptionToken = the email address, no
 *     profileId) sharing a broadcastId (or festivalQueueId for queue emails); the link
 *     carries ccf_job=<broadcastId or festivalQueueId>.
 * A revisit on a shared id only counts for the person it was recorded for.
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const ScheduledJob = require('../models/ScheduledJob');
const FestivalQueue = require('../models/FestivalQueue');
const AttributedEvent = require('../models/AttributedEvent');
const Profile = require('../models/Profile');
const { helpers } = require('./pushUsers');

const { typeLabel, parseDateRange, parsePageLimit, maskEmail, nameFromEmail, csvRow } = helpers;

const PROFILE_EMAIL_FIELDS = 'channels.email.address identifiers.emails';

function lower(s) { return String(s || '').toLowerCase(); }

function emailsOfProfile(p) {
  const out = new Set();
  const addr = p && p.channels && p.channels.email && p.channels.email.address;
  if (addr) out.add(addr);
  for (const e of (p && p.identifiers && p.identifiers.emails) || []) if (e) out.add(e);
  return [...out];
}

function parseEmailUserKey(userKey) {
  if (!userKey || typeof userKey !== 'string' || !userKey.startsWith('p_')) return null;
  const id = userKey.slice(2);
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

// A send is "tracked" when its email link carries a ccf_job we can resolve:
// everything except old broadcast rows that were logged without a link id.
const TRACKED_ROW_EXPR = {
  $cond: [
    {
      $or: [
        { $ne: ['$signalType', 'email_broadcast'] },
        { $ne: [{ $ifNull: ['$festivalQueueId', null] }, null] },
        { $ne: [{ $ifNull: ['$broadcastId', null] }, null] },
      ],
    },
    1,
    0,
  ],
};

function userGroupStage() {
  return {
    $group: {
      _id: { profileId: '$profileId', token: '$subscriptionToken' },
      sentCount: { $sum: 1 },
      lastSentAt: { $max: '$sentAt' },
      jobIds: { $push: '$_id' },
      broadcastIds: { $addToSet: '$broadcastId' },
      festivalQueueIds: { $addToSet: '$festivalQueueId' },
      trackedJobCount: { $sum: TRACKED_ROW_EXPR },
    },
  };
}

function emptyGroup(pid) {
  return { pid, sentCount: 0, lastSentAt: null, jobIds: [], broadcastIds: [], festivalQueueIds: [], trackedJobCount: 0 };
}

function mergeGroup(dst, g) {
  dst.sentCount += g.sentCount;
  if (!dst.lastSentAt || g.lastSentAt > dst.lastSentAt) dst.lastSentAt = g.lastSentAt;
  dst.jobIds.push(...(g.jobIds || []));
  dst.broadcastIds.push(...(g.broadcastIds || []).filter(Boolean));
  dst.festivalQueueIds.push(...(g.festivalQueueIds || []).filter(Boolean));
  dst.trackedJobCount += g.trackedJobCount || 0;
  return dst;
}

/**
 * Turn ScheduledJob aggregation groups into user records. Rows with a profileId group
 * by profile; broadcast rows (email address only) are matched to a profile by address.
 */
async function resolveUsers(shop, groups) {
  const byPid = {};
  const byToken = {};

  for (const g of groups) {
    const pid = g._id.profileId ? String(g._id.profileId) : null;
    const tok = g._id.token || null;
    if (pid) {
      mergeGroup(byPid[pid] || (byPid[pid] = emptyGroup(pid)), g);
    } else if (tok) {
      byToken[tok] = mergeGroup(emptyGroup(null), g);
    }
  }

  const tokens = Object.keys(byToken);
  if (tokens.length) {
    const profiles = await Profile.find(
      {
        shopDomain: shop,
        $or: [{ 'identifiers.emails': { $in: tokens } }, { 'channels.email.address': { $in: tokens } }],
      },
      '_id ' + PROFILE_EMAIL_FIELDS
    ).lean();
    for (const p of profiles) {
      const pid = String(p._id);
      for (const e of emailsOfProfile(p)) {
        if (byToken[e]) {
          mergeGroup(byPid[pid] || (byPid[pid] = emptyGroup(pid)), byToken[e]);
          delete byToken[e];
        }
      }
    }
  }

  const pids = Object.keys(byPid);
  const docs = pids.length
    ? await Profile.find({ _id: { $in: pids }, shopDomain: shop }, PROFILE_EMAIL_FIELDS).lean()
    : [];
  const docMap = {};
  for (const d of docs) docMap[String(d._id)] = d;

  return pids.map((pid) => {
    const g = byPid[pid];
    const doc = docMap[pid];
    const emails = emailsOfProfile(doc);
    const first = (doc && doc.channels && doc.channels.email && doc.channels.email.address) || emails[0] || null;
    return {
      userKey: 'p_' + pid,
      pid,
      name: nameFromEmail(first) || 'Anonymous visitor',
      email: maskEmail(first),
      deviceType: null,
      sentCount: g.sentCount,
      lastSentAt: g.lastSentAt,
      jobIds: g.jobIds,
      broadcastIds: g.broadcastIds,
      festivalQueueIds: g.festivalQueueIds,
      trackedJobCount: g.trackedJobCount,
      emails: emails.map(lower),
    };
  });
}

function samePerson(ev, user) {
  if (ev.pid && ev.pid === user.pid) return true;
  return !!(ev.email && user.emails.includes(lower(ev.email)));
}

/**
 * Load revisit-type AttributedEvents that could belong to any of these users, keyed by the
 * id they were recorded against: own (a send row _id), shared (broadcastId), fq (FestivalQueue _id).
 */
async function loadRevisitEvents(shop, users, eventTypes = ['revisit']) {
  const own = [];
  const shared = [];
  const fq = [];
  for (const u of users) {
    own.push(...u.jobIds);
    shared.push(...u.broadcastIds);
    fq.push(...u.festivalQueueIds);
  }
  const maps = { own: new Map(), shared: new Map(), fq: new Map(), ownSet: new Set(own.map(String)), sharedSet: new Set(shared.map(String)) };
  const or = [];
  if (own.length || shared.length) or.push({ jobId: { $in: [...own, ...shared] } });
  if (fq.length) or.push({ festivalQueueId: { $in: fq } });
  if (!or.length) return maps;

  const rows = await AttributedEvent.find(
    { shopDomain: shop, eventType: { $in: eventTypes }, $or: or },
    'jobId festivalQueueId profileId email eventType ts'
  ).lean();

  for (const a of rows) {
    const ev = { pid: a.profileId ? String(a.profileId) : null, email: a.email || null, type: a.eventType, ts: a.ts };
    if (a.jobId) {
      const k = String(a.jobId);
      const target = maps.ownSet.has(k) ? maps.own : maps.shared;
      (target.get(k) || target.set(k, []).get(k)).push(ev);
    }
    if (a.festivalQueueId) {
      const k = String(a.festivalQueueId);
      (maps.fq.get(k) || maps.fq.set(k, []).get(k)).push(ev);
    }
  }
  return maps;
}

/** All events recorded for one user, with the kind of send they came from. */
function eventsForUser(user, maps) {
  const out = [];
  for (const id of user.jobIds.map(String)) {
    for (const ev of maps.own.get(id) || []) out.push({ ...ev, kind: 'own', jobId: id });
  }
  for (const id of user.broadcastIds.map(String)) {
    for (const ev of maps.shared.get(id) || []) if (samePerson(ev, user)) out.push({ ...ev, kind: 'broadcast' });
  }
  for (const id of user.festivalQueueIds.map(String)) {
    for (const ev of maps.fq.get(id) || []) if (samePerson(ev, user)) out.push({ ...ev, kind: 'festival' });
  }
  return out;
}

async function addRevisitedStatus(shop, users) {
  if (!users.length) return users;
  const allJobIds = [];
  for (const u of users) allJobIds.push(...u.jobIds);

  const clicked = new Set();
  if (allJobIds.length) {
    const rows = await ScheduledJob.find({ _id: { $in: allJobIds }, outcome: { $in: ['clicked', 'converted'] } }, '_id').lean();
    for (const j of rows) clicked.add(String(j._id));
  }
  const maps = await loadRevisitEvents(shop, users);

  return users.map((u) => {
    const hasClick = u.jobIds.some((id) => clicked.has(String(id)));
    const hasRevisit = eventsForUser(u, maps).length > 0;
    if (hasClick || hasRevisit) return { ...u, revisited: true };
    return { ...u, revisited: u.trackedJobCount > 0 ? false : 'not_tracked' };
  });
}

function matchRegex(q) {
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function publicUser(u, extra) {
  return {
    userKey: u.userKey,
    name: u.name,
    email: u.email,
    deviceType: null,
    lastSentAt: u.lastSentAt,
    sentCount: u.sentCount,
    revisited: u.revisited,
    ...extra,
  };
}

function buildSentMatch(shop, from, to, req) {
  const typeFilter = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : null;
  const originFilter = typeof req.query.origin === 'string' && req.query.origin.trim() ? req.query.origin.trim() : null;
  const match = { shopDomain: shop, channel: 'email', status: 'sent', sentAt: { $gte: from, $lte: to } };
  if (typeFilter) match.signalType = typeFilter;
  if (originFilter) match.origin = originFilter;
  return match;
}

async function listUsers(shop, req, aggLimit) {
  const { from, to } = parseDateRange(req);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const groups = await ScheduledJob.aggregate([
    { $match: buildSentMatch(shop, from, to, req) },
    userGroupStage(),
    { $sort: { lastSentAt: -1 } },
    { $limit: aggLimit },
  ]);
  let users = await resolveUsers(shop, groups);
  users = await addRevisitedStatus(shop, users);
  if (q) {
    const re = matchRegex(q);
    users = users.filter((u) => re.test(u.name) || (u.email && re.test(u.email)));
  }
  users.sort((a, b) => (b.lastSentAt || 0) - (a.lastSentAt || 0));
  return users;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /users — people who were emailed in the date range
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { page, limit } = parsePageLimit(req);
    const includeVia = req.query.includeVia === '1';

    const users = await listUsers(shop, req, 500);
    const total = users.length;
    const slice = users.slice(page * limit, (page + 1) * limit);

    let viaMap = {};
    if (includeVia && slice.length) {
      const maps = await loadRevisitEvents(shop, slice);
      const ownIds = [];
      for (const u of slice) ownIds.push(...u.jobIds);
      const signalRows = ownIds.length
        ? await ScheduledJob.find({ _id: { $in: ownIds } }, '_id signalType').lean()
        : [];
      const signalOf = {};
      for (const j of signalRows) signalOf[String(j._id)] = j.signalType || 'other';

      for (const u of slice) {
        const tally = {};
        for (const ev of eventsForUser(u, maps)) {
          const st = ev.kind === 'own' ? (signalOf[ev.jobId] || 'other') : ev.kind === 'festival' ? 'festival' : 'email_broadcast';
          tally[st] = (tally[st] || 0) + 1;
        }
        viaMap[u.userKey] = Object.entries(tally)
          .map(([type, count]) => ({ type, label: typeLabel(type), count }))
          .sort((a, b) => b.count - a.count);
      }
    }

    return res.json({
      total,
      users: slice.map((u) => publicUser(u, includeVia ? { cameBackVia: viaMap[u.userKey] || [] } : {})),
    });
  } catch (err) {
    console.error('[email-users] GET /users error:', err.message);
    return res.status(500).json({ error: 'Failed to load email users' });
  }
});

/**
 * The jobs query for one profile: rows with its profileId, or sent to one of its addresses.
 * The profile record itself is optional (it can be gone after a merge or an erasure request).
 * Rows are always scoped by shopDomain, so another shop's id simply finds nothing.
 */
async function loadUserJobQuery(shop, pid, from, to) {
  const profile = await Profile.findOne({ _id: pid, shopDomain: shop }, '_id ' + PROFILE_EMAIL_FIELDS).lean();
  const emails = emailsOfProfile(profile);
  const oid = new mongoose.Types.ObjectId(pid);
  const or = [{ profileId: oid }];
  if (emails.length) or.push({ subscriptionToken: { $in: emails } });
  return {
    user: { pid: String(pid), emails: emails.map(lower) },
    query: { shopDomain: shop, channel: 'email', status: 'sent', sentAt: { $gte: from, $lte: to }, $or: or },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /users/:userKey/count — emails sent to one person, by type
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:userKey/count', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const pid = parseEmailUserKey(req.params.userKey);
    if (!pid) return res.status(400).json({ error: 'Invalid userKey format' });
    const { from, to } = parseDateRange(req);

    const ctx = await loadUserJobQuery(shop, pid, from, to);

    const agg = await ScheduledJob.aggregate([
      { $match: ctx.query },
      { $group: { _id: '$signalType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const total = agg.reduce((s, r) => s + r.count, 0);
    const byType = agg.map((r) => ({ type: r._id || 'other', label: typeLabel(r._id), count: r.count }));
    return res.json({ total, byType });
  } catch (err) {
    console.error('[email-users] GET /users/:userKey/count error:', err.message);
    return res.status(500).json({ error: 'Failed to load user count' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /users/:userKey/revisit — per-email revisit detail for one person
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:userKey/revisit', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const pid = parseEmailUserKey(req.params.userKey);
    if (!pid) return res.status(400).json({ error: 'Invalid userKey format' });
    const { from, to } = parseDateRange(req);
    const { page, limit } = parsePageLimit(req);

    const ctx = await loadUserJobQuery(shop, pid, from, to);

    const jobs = await ScheduledJob.find(ctx.query)
      .sort({ sentAt: -1 })
      .select('_id signalType sentAt payload outcome festivalQueueId broadcastId')
      .lean();

    const total = jobs.length;
    const sliced = jobs.slice(page * limit, (page + 1) * limit);

    const sliceUser = {
      ...ctx.user,
      jobIds: sliced.map((j) => j._id),
      broadcastIds: sliced.map((j) => j.broadcastId).filter(Boolean),
      festivalQueueIds: sliced.map((j) => j.festivalQueueId).filter(Boolean),
    };
    const maps = await loadRevisitEvents(shop, [sliceUser], ['revisit', 'add_to_cart', 'checkout_start', 'purchase']);

    const notifications = sliced.map((j) => {
      const events = [
        ...(maps.own.get(String(j._id)) || []),
        ...(j.broadcastId ? (maps.shared.get(String(j.broadcastId)) || []).filter((e) => samePerson(e, ctx.user)) : []),
        ...(j.festivalQueueId ? (maps.fq.get(String(j.festivalQueueId)) || []).filter((e) => samePerson(e, ctx.user)) : []),
      ];
      const isTracked = j.signalType !== 'email_broadcast' || !!j.festivalQueueId || !!j.broadcastId;
      const revisitEvents = events.filter((e) => e.type === 'revisit');
      const visits = revisitEvents.length;
      const lastVisitAt = visits ? new Date(Math.max(...revisitEvents.map((e) => +new Date(e.ts)))) : null;

      let status;
      if (!isTracked) status = 'not_tracked';
      else if (j.outcome === 'clicked' || j.outcome === 'converted' || visits > 0) status = 'revisited';
      else status = 'no_revisit';

      return {
        jobId: String(j._id),
        type: j.signalType || 'other',
        label: typeLabel(j.signalType),
        title: (j.payload && (j.payload.subject || j.payload.title)) || null,
        sentAt: j.sentAt,
        status,
        visits,
        lastVisitAt,
        funnel: {
          addedToCart: events.filter((e) => e.type === 'add_to_cart').length,
          checkout: events.filter((e) => e.type === 'checkout_start').length,
          purchased: events.filter((e) => e.type === 'purchase').length,
        },
      };
    });

    const revisitedAfter = notifications.filter((n) => n.status === 'revisited').length;
    const byTypeSent = {};
    for (const j of jobs) {
      const t = j.signalType || 'other';
      byTypeSent[t] = (byTypeSent[t] || 0) + 1;
    }
    const byType = Object.entries(byTypeSent)
      .map(([type, count]) => ({ type, label: typeLabel(type), count }))
      .sort((a, b) => b.count - a.count);

    return res.json({ summary: { sent: total, revisitedAfter, byType }, notifications, page, limit });
  } catch (err) {
    console.error('[email-users] GET /users/:userKey/revisit error:', err.message);
    return res.status(500).json({ error: 'Failed to load revisit data' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /revisited — everyone who came back to the store from an email
// ─────────────────────────────────────────────────────────────────────────────
router.get('/revisited', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { from, to } = parseDateRange(req);
    const { page, limit } = parsePageLimit(req);
    const typeFilter = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const events = await AttributedEvent.find({ shopDomain: shop, eventType: 'revisit', ts: { $gte: from, $lte: to } })
      .select('jobId festivalQueueId profileId email ts')
      .sort({ ts: -1 })
      .limit(500)
      .lean();
    if (!events.length) return res.json({ total: 0, users: [] });

    const jobIds = [...new Set(events.map((a) => a.jobId).filter(Boolean).map(String))];
    const fqIds = [...new Set(events.map((a) => a.festivalQueueId).filter(Boolean).map(String))];

    // Only events that belong to an EMAIL send count here (push shares AttributedEvent).
    const jobRows = jobIds.length
      ? await ScheduledJob.find(
          { shopDomain: shop, channel: 'email', $or: [{ _id: { $in: jobIds } }, { broadcastId: { $in: jobIds } }] },
          '_id broadcastId profileId subscriptionToken signalType'
        ).lean()
      : [];
    const rowByJobId = {};
    for (const r of jobRows) {
      rowByJobId[String(r._id)] = r;
      if (r.broadcastId && !rowByJobId[String(r.broadcastId)]) rowByJobId[String(r.broadcastId)] = r;
    }
    const emailFq = new Set();
    if (fqIds.length) {
      const fqDocs = await FestivalQueue.find({ _id: { $in: fqIds }, shopDomain: shop, channel: 'email' }, '_id').lean();
      for (const f of fqDocs) emailFq.add(String(f._id));
    }

    // Resolve each event to a person (profile id) and the type of send.
    const personEvents = [];   // { pid|null, email|null, type, ts }
    for (const a of events) {
      let type = null;
      let pid = a.profileId ? String(a.profileId) : null;
      const email = a.email || null;
      if (a.jobId) {
        const row = rowByJobId[String(a.jobId)];
        if (!row) continue;
        type = row.signalType || 'other';
        if (!pid && row.profileId) pid = String(row.profileId);
      } else if (a.festivalQueueId) {
        if (!emailFq.has(String(a.festivalQueueId))) continue;
        type = 'festival';
      } else {
        continue;
      }
      if (typeFilter && type !== typeFilter) continue;
      personEvents.push({ pid, email, type, ts: a.ts });
    }

    // Resolve email-only events to profiles.
    const needEmail = [...new Set(personEvents.filter((e) => !e.pid && e.email).map((e) => e.email))];
    const emailToPid = {};
    if (needEmail.length) {
      const profs = await Profile.find(
        { shopDomain: shop, $or: [{ 'identifiers.emails': { $in: needEmail } }, { 'channels.email.address': { $in: needEmail } }] },
        '_id ' + PROFILE_EMAIL_FIELDS
      ).lean();
      for (const p of profs) for (const e of emailsOfProfile(p)) emailToPid[lower(e)] = String(p._id);
    }

    const byPid = {};
    for (const e of personEvents) {
      const pid = e.pid || (e.email ? emailToPid[lower(e.email)] : null);
      if (!pid) continue;
      const u = byPid[pid] || (byPid[pid] = { pid, revisits: 0, latestTs: null, types: {} });
      u.revisits++;
      if (!u.latestTs || e.ts > u.latestTs) u.latestTs = e.ts;
      u.types[e.type] = (u.types[e.type] || 0) + 1;
    }

    const pids = Object.keys(byPid);
    const docs = pids.length ? await Profile.find({ _id: { $in: pids }, shopDomain: shop }, PROFILE_EMAIL_FIELDS).lean() : [];
    const docMap = {};
    for (const d of docs) docMap[String(d._id)] = d;

    let users = pids.map((pid) => {
      const u = byPid[pid];
      const first = emailsOfProfile(docMap[pid])[0] || null;
      return {
        userKey: 'p_' + pid,
        name: nameFromEmail(first) || 'Anonymous visitor',
        email: maskEmail(first),
        deviceType: null,
        revisits: u.revisits,
        lastVisitAt: u.latestTs,
        cameBackVia: Object.entries(u.types)
          .map(([type, count]) => ({ type, label: typeLabel(type), count, lastVisitAt: u.latestTs }))
          .sort((a, b) => b.count - a.count),
      };
    });

    if (q) {
      const re = matchRegex(q);
      users = users.filter((u) => re.test(u.name) || (u.email && re.test(u.email)));
    }
    users.sort((a, b) => (b.lastVisitAt || 0) - (a.lastVisitAt || 0));

    return res.json({ total: users.length, users: users.slice(page * limit, (page + 1) * limit) });
  } catch (err) {
    console.error('[email-users] GET /revisited error:', err.message);
    return res.status(500).json({ error: 'Failed to load revisited users' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /users.csv — CSV export (max 5000 rows, masked emails)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users.csv', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const users = await listUsers(shop, req, 5000);
    const rows = [csvRow(['name', 'email', 'sent_count', 'last_sent', 'revisited', 'came_back_via'])];
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
    res.setHeader('Content-Disposition', 'attachment; filename="email-users.csv"');
    return res.send(rows.join('\r\n'));
  } catch (err) {
    console.error('[email-users] GET /users.csv error:', err.message);
    return res.status(500).json({ error: 'Failed to export CSV' });
  }
});

module.exports = router;
