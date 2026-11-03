'use strict';

/**
 * WhatsApp Users endpoints — per-person views of WhatsApp send history and revisit data.
 * Mounted at /api/dashboard/:shopDomain/channels/whatsapp by server.js. Same shape as
 * routes/pushUsers.js and routes/emailUsers.js so the dashboard drawer shows the same details.
 *
 * WhatsApp here is manual click-to-chat: POST /api/whatsapp/:shop/send creates one ScheduledJob
 * row (channel 'whatsapp', status 'sent') per message the merchant opens, always with a profileId.
 * The message link carries ccf_job=<row _id>, so a revisit event is tied to that exact message.
 * "Type" = the message purpose: followup (default) or order.
 *
 * All routes: requireAuth + requireStoreOwner (scoped by shopDomain), date range ?from/?to
 * (default 7 days), page/limit max 50, aggregation cap 500 rows. Email and phone are always
 * masked (j***@x.com, ****3210); full values are never returned.
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const ScheduledJob = require('../models/ScheduledJob');
const AttributedEvent = require('../models/AttributedEvent');
const Profile = require('../models/Profile');
const { helpers } = require('./pushUsers');

const { typeLabel, parseDateRange, parsePageLimit, maskEmail, nameFromEmail, csvRow } = helpers;

const PROFILE_FIELDS = 'channels.email.address identifiers.emails channels.whatsapp.phone identifiers.phones';

function emailOf(p) {
  return (p && p.channels && p.channels.email && p.channels.email.address) ||
    (p && p.identifiers && p.identifiers.emails && p.identifiers.emails[0]) || null;
}

function phoneOf(p) {
  return (p && p.channels && p.channels.whatsapp && p.channels.whatsapp.phone) ||
    (p && p.identifiers && p.identifiers.phones && p.identifiers.phones[0]) || null;
}

// ****3210 — enough to tell customers apart, never the full number.
function maskPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 4 ? '****' + digits.slice(-4) : null;
}

function parseUserKey(userKey) {
  if (!userKey || typeof userKey !== 'string' || !userKey.startsWith('p_')) return null;
  const id = userKey.slice(2);
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

function purposeOf(job) {
  return job.purpose || 'followup';
}

function matchRegex(q) {
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

// Rows sent without a purpose count as followup (in MongoDB { purpose: null } also matches a missing field).
function purposeFilter(type) {
  if (type === 'followup') return { $or: [{ purpose: 'followup' }, { purpose: null }] };
  return { purpose: type };
}

function buildSentMatch(shop, from, to, req) {
  const type = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : null;
  const origin = typeof req.query.origin === 'string' && req.query.origin.trim() ? req.query.origin.trim() : null;
  const match = { shopDomain: shop, channel: 'whatsapp', status: 'sent', profileId: { $ne: null }, sentAt: { $gte: from, $lte: to } };
  if (type) Object.assign(match, purposeFilter(type));
  if (origin) match.origin = origin;
  return match;
}

async function listUsers(shop, req, aggLimit) {
  const { from, to } = parseDateRange(req);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const groups = await ScheduledJob.aggregate([
    { $match: buildSentMatch(shop, from, to, req) },
    {
      $group: {
        _id: '$profileId',
        sentCount: { $sum: 1 },
        lastSentAt: { $max: '$sentAt' },
        jobIds: { $push: '$_id' },
      },
    },
    { $sort: { lastSentAt: -1 } },
    { $limit: aggLimit },
  ]);

  const pids = groups.map((g) => String(g._id));
  const docs = pids.length ? await Profile.find({ _id: { $in: pids }, shopDomain: shop }, PROFILE_FIELDS).lean() : [];
  const docMap = {};
  for (const d of docs) docMap[String(d._id)] = d;

  const allJobIds = [];
  for (const g of groups) allJobIds.push(...g.jobIds);
  const clicked = new Set();
  const revisitedJobs = new Set();
  if (allJobIds.length) {
    const rows = await ScheduledJob.find({ _id: { $in: allJobIds }, outcome: { $in: ['clicked', 'converted'] } }, '_id').lean();
    for (const j of rows) clicked.add(String(j._id));
    const evs = await AttributedEvent.find({ shopDomain: shop, eventType: 'revisit', jobId: { $in: allJobIds } }, 'jobId').lean();
    for (const e of evs) revisitedJobs.add(String(e.jobId));
  }

  let users = groups.map((g) => {
    const pid = String(g._id);
    const doc = docMap[pid];
    const email = emailOf(doc);
    const revisited = g.jobIds.some((id) => clicked.has(String(id)) || revisitedJobs.has(String(id)));
    return {
      userKey: 'p_' + pid,
      pid,
      name: nameFromEmail(email) || (doc ? 'Customer' : 'Anonymous visitor'),
      email: maskEmail(email),
      phone: maskPhone(phoneOf(doc)),
      deviceType: null,
      lastSentAt: g.lastSentAt,
      sentCount: g.sentCount,
      revisited,
      jobIds: g.jobIds,
    };
  });

  if (q) {
    const re = matchRegex(q);
    users = users.filter((u) => re.test(u.name) || (u.email && re.test(u.email)) || (u.phone && re.test(u.phone)));
  }
  users.sort((a, b) => (b.lastSentAt || 0) - (a.lastSentAt || 0));
  return users;
}

function publicUser(u, extra) {
  const { jobIds, pid, ...rest } = u;
  return { ...rest, ...extra };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /users — people the merchant opened WhatsApp messages for, in the date range
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { page, limit } = parsePageLimit(req);
    const includeVia = req.query.includeVia === '1';

    const users = await listUsers(shop, req, 500);
    const slice = users.slice(page * limit, (page + 1) * limit);

    let viaMap = {};
    if (includeVia && slice.length) {
      const ids = [];
      const owner = {};
      for (const u of slice) for (const id of u.jobIds) { ids.push(id); owner[String(id)] = u.userKey; }
      const jobs = await ScheduledJob.find({ _id: { $in: ids } }, '_id purpose').lean();
      const purposeOf_ = {};
      for (const j of jobs) purposeOf_[String(j._id)] = purposeOf(j);
      const evs = await AttributedEvent.find({ shopDomain: shop, eventType: 'revisit', jobId: { $in: ids } }, 'jobId').lean();
      const tally = {};
      for (const e of evs) {
        const uk = owner[String(e.jobId)];
        if (!uk) continue;
        const p = purposeOf_[String(e.jobId)] || 'followup';
        (tally[uk] || (tally[uk] = {}))[p] = ((tally[uk] || {})[p] || 0) + 1;
      }
      for (const [uk, byType] of Object.entries(tally)) {
        viaMap[uk] = Object.entries(byType)
          .map(([type, count]) => ({ type, label: typeLabel(type), count }))
          .sort((a, b) => b.count - a.count);
      }
    }

    return res.json({
      total: users.length,
      users: slice.map((u) => publicUser(u, includeVia ? { cameBackVia: viaMap[u.userKey] || [] } : {})),
    });
  } catch (err) {
    console.error('[whatsapp-users] GET /users error:', err.message);
    return res.status(500).json({ error: 'Failed to load WhatsApp users' });
  }
});

function oneUserJobQuery(shop, pid, from, to) {
  return {
    shopDomain: shop,
    channel: 'whatsapp',
    status: 'sent',
    sentAt: { $gte: from, $lte: to },
    profileId: new mongoose.Types.ObjectId(pid),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /users/:userKey/count — messages for one person, by type
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:userKey/count', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const pid = parseUserKey(req.params.userKey);
    if (!pid) return res.status(400).json({ error: 'Invalid userKey format' });
    const { from, to } = parseDateRange(req);

    const agg = await ScheduledJob.aggregate([
      { $match: oneUserJobQuery(shop, pid, from, to) },
      { $group: { _id: { $ifNull: ['$purpose', 'followup'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const total = agg.reduce((s, r) => s + r.count, 0);
    return res.json({ total, byType: agg.map((r) => ({ type: r._id, label: typeLabel(r._id), count: r.count })) });
  } catch (err) {
    console.error('[whatsapp-users] GET /users/:userKey/count error:', err.message);
    return res.status(500).json({ error: 'Failed to load user count' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /users/:userKey/revisit — per-message revisit detail for one person
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:userKey/revisit', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const pid = parseUserKey(req.params.userKey);
    if (!pid) return res.status(400).json({ error: 'Invalid userKey format' });
    const { from, to } = parseDateRange(req);
    const { page, limit } = parsePageLimit(req);

    const jobs = await ScheduledJob.find(oneUserJobQuery(shop, pid, from, to))
      .sort({ sentAt: -1 })
      .select('_id purpose sentAt outcome productHandle')
      .lean();
    const total = jobs.length;
    const sliced = jobs.slice(page * limit, (page + 1) * limit);

    const events = sliced.length
      ? await AttributedEvent.find({ shopDomain: shop, jobId: { $in: sliced.map((j) => j._id) } })
          .select('jobId eventType ts')
          .lean()
      : [];
    const byJob = {};
    for (const e of events) (byJob[String(e.jobId)] || (byJob[String(e.jobId)] = [])).push(e);

    const notifications = sliced.map((j) => {
      const evs = byJob[String(j._id)] || [];
      const revisits = evs.filter((e) => e.eventType === 'revisit');
      const visits = revisits.length;
      const lastVisitAt = visits ? new Date(Math.max(...revisits.map((e) => +new Date(e.ts)))) : null;
      const status = j.outcome === 'clicked' || j.outcome === 'converted' || visits > 0 ? 'revisited' : 'no_revisit';
      return {
        jobId: String(j._id),
        type: purposeOf(j),
        label: typeLabel(purposeOf(j)),
        title: j.productHandle ? `Product page: ${j.productHandle}` : 'Store home page',
        sentAt: j.sentAt,
        status,
        visits,
        lastVisitAt,
        funnel: {
          addedToCart: evs.filter((e) => e.eventType === 'add_to_cart').length,
          checkout: evs.filter((e) => e.eventType === 'checkout_start').length,
          purchased: evs.filter((e) => e.eventType === 'purchase').length,
        },
      };
    });

    const revisitedAfter = notifications.filter((n) => n.status === 'revisited').length;
    const byTypeSent = {};
    for (const j of jobs) byTypeSent[purposeOf(j)] = (byTypeSent[purposeOf(j)] || 0) + 1;
    const byType = Object.entries(byTypeSent)
      .map(([type, count]) => ({ type, label: typeLabel(type), count }))
      .sort((a, b) => b.count - a.count);

    return res.json({ summary: { sent: total, revisitedAfter, byType }, notifications, page, limit });
  } catch (err) {
    console.error('[whatsapp-users] GET /users/:userKey/revisit error:', err.message);
    return res.status(500).json({ error: 'Failed to load revisit data' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /revisited — everyone who came back to the store from a WhatsApp message
// ─────────────────────────────────────────────────────────────────────────────
router.get('/revisited', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { from, to } = parseDateRange(req);
    const { page, limit } = parsePageLimit(req);
    const type = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const events = await AttributedEvent.find({ shopDomain: shop, eventType: 'revisit', jobId: { $ne: null }, ts: { $gte: from, $lte: to } })
      .select('jobId ts')
      .sort({ ts: -1 })
      .limit(500)
      .lean();
    if (!events.length) return res.json({ total: 0, users: [] });

    // Only events for WhatsApp messages count here (push and email share AttributedEvent).
    const jobRows = await ScheduledJob.find(
      { shopDomain: shop, channel: 'whatsapp', _id: { $in: [...new Set(events.map((e) => String(e.jobId)))] }, profileId: { $ne: null } },
      '_id profileId purpose'
    ).lean();
    const rowById = {};
    for (const r of jobRows) rowById[String(r._id)] = r;

    const byPid = {};
    for (const e of events) {
      const row = rowById[String(e.jobId)];
      if (!row) continue;
      const p = purposeOf(row);
      if (type && p !== type) continue;
      const pid = String(row.profileId);
      const u = byPid[pid] || (byPid[pid] = { revisits: 0, latestTs: null, types: {} });
      u.revisits++;
      if (!u.latestTs || e.ts > u.latestTs) u.latestTs = e.ts;
      u.types[p] = (u.types[p] || 0) + 1;
    }

    const pids = Object.keys(byPid);
    const docs = pids.length ? await Profile.find({ _id: { $in: pids }, shopDomain: shop }, PROFILE_FIELDS).lean() : [];
    const docMap = {};
    for (const d of docs) docMap[String(d._id)] = d;

    let users = pids.map((pid) => {
      const u = byPid[pid];
      const doc = docMap[pid];
      const email = emailOf(doc);
      return {
        userKey: 'p_' + pid,
        name: nameFromEmail(email) || (doc ? 'Customer' : 'Anonymous visitor'),
        email: maskEmail(email),
        phone: maskPhone(phoneOf(doc)),
        deviceType: null,
        revisits: u.revisits,
        lastVisitAt: u.latestTs,
        cameBackVia: Object.entries(u.types)
          .map(([t, count]) => ({ type: t, label: typeLabel(t), count, lastVisitAt: u.latestTs }))
          .sort((a, b) => b.count - a.count),
      };
    });

    if (q) {
      const re = matchRegex(q);
      users = users.filter((u) => re.test(u.name) || (u.email && re.test(u.email)) || (u.phone && re.test(u.phone)));
    }
    users.sort((a, b) => (b.lastVisitAt || 0) - (a.lastVisitAt || 0));

    return res.json({ total: users.length, users: users.slice(page * limit, (page + 1) * limit) });
  } catch (err) {
    console.error('[whatsapp-users] GET /revisited error:', err.message);
    return res.status(500).json({ error: 'Failed to load revisited users' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /users.csv — CSV export (max 5000 rows, masked email and phone)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users.csv', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const users = await listUsers(shop, req, 5000);
    const rows = [csvRow(['name', 'email', 'phone', 'sent_count', 'last_sent', 'revisited'])];
    for (const u of users) {
      rows.push(csvRow([
        u.name,
        u.email || '',
        u.phone || '',
        u.sentCount,
        u.lastSentAt ? new Date(u.lastSentAt).toISOString() : '',
        u.revisited ? 'yes' : 'no',
      ]));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="whatsapp-users.csv"');
    return res.send(rows.join('\r\n'));
  } catch (err) {
    console.error('[whatsapp-users] GET /users.csv error:', err.message);
    return res.status(500).json({ error: 'Failed to export CSV' });
  }
});

module.exports = router;
