const express = require('express');
const router = express.Router();
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const ScheduledJob = require('../models/ScheduledJob');
const Profile = require('../models/Profile');
const AttributedEvent = require('../models/AttributedEvent');

// Furthest-event priority for WhatsApp outcome chips (higher index = better outcome).
const WA_EVENT_PRIORITY = ['revisit', 'add_to_cart', 'checkout_start', 'purchase'];
const WA_OUTCOME_CHIP = {
  revisit: 'Visited',
  checkout_start: 'Started checkout',
  add_to_cart: 'Added to cart',
  purchase: 'Bought',
};

// Human-readable labels for signalType / purpose values.
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
  const to = new Date(req.query.to || Date.now());
  return {
    from: Number.isNaN(from.getTime()) ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : from,
    to: Number.isNaN(to.getTime()) ? new Date() : to,
  };
}

// Build a masked display name from an email address (local-part only).
function nameFromEmail(email) {
  if (!email) return null;
  const local = email.split('@')[0];
  return local.split(/[._+]/)[0].replace(/\b\w/g, (c) => c.toUpperCase()) || null;
}

/**
 * GET /api/dashboard/:shopDomain/channels?from=&to=
 *
 * Returns channel-level sent/pending counts with per-type breakdown and
 * one representative preview per type (latest sent / next pending).
 *
 * -> {
 *   push:     { sent, pending, types: [{ type, label, sent, pending, preview }] },
 *   email:    { same shape },
 *   whatsapp: { sent, pending, sentFollowup, sentOrder },
 * }
 */
router.get('/:shopDomain/channels', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { from, to } = parseDateRange(req);

    const [
      pushSentAgg,
      pushPendingAgg,
      emailSentAgg,
      emailPendingAgg,
      emailSentFromMsgAgg,
      waJobsSent,
      waOptedIn,
    ] = await Promise.all([
      // Push sent by signalType — get sent count + latest payload as representative preview.
      ScheduledJob.aggregate([
        { $match: { shopDomain: shop, channel: 'push', status: 'sent', sentAt: { $gte: from, $lte: to } } },
        { $sort: { sentAt: -1 } },
        { $group: { _id: '$signalType', sent: { $sum: 1 }, rep: { $first: '$payload' } } },
      ]),
      // Push pending by signalType — get pending count + soonest payload.
      ScheduledJob.aggregate([
        { $match: { shopDomain: shop, channel: 'push', status: 'pending' } },
        { $sort: { runAt: 1 } },
        { $group: { _id: '$signalType', pending: { $sum: 1 }, rep: { $first: '$payload' } } },
      ]),
      // Email sent (rule-based jobs) by signalType.
      ScheduledJob.aggregate([
        { $match: { shopDomain: shop, channel: 'email', status: 'sent', sentAt: { $gte: from, $lte: to } } },
        { $sort: { sentAt: -1 } },
        { $group: { _id: '$signalType', sent: { $sum: 1 }, rep: { $first: '$payload' } } },
      ]),
      // Email pending by signalType.
      ScheduledJob.aggregate([
        { $match: { shopDomain: shop, channel: 'email', status: 'pending' } },
        { $sort: { runAt: 1 } },
        { $group: { _id: '$signalType', pending: { $sum: 1 }, rep: { $first: '$payload' } } },
      ]),
      // Email sent total from Profile.messages — captures both brain+rule paths.
      Profile.aggregate([
        { $match: { shopDomain: shop } },
        { $unwind: '$messages' },
        { $match: { 'messages.channel': 'email', 'messages.sentAt': { $gte: from, $lte: to } } },
        { $count: 'total' },
      ]),
      // WhatsApp jobs sent in range (purpose breakdown).
      ScheduledJob.find({
        shopDomain: shop,
        channel: 'whatsapp',
        status: 'sent',
        sentAt: { $gte: from, $lte: to },
      })
        .select('purpose')
        .lean(),
      // Opted-in profiles (for pending count).
      Profile.find({
        shopDomain: shop,
        'channels.whatsapp.consentedAt': { $exists: true, $ne: null },
        'channels.whatsapp.optedOutAt': null,
      })
        .select('_id')
        .lean(),
    ]);

    // ---- Push ----
    const pushSentTotal = pushSentAgg.reduce((s, t) => s + t.sent, 0);
    const pushPendingTotal = pushPendingAgg.reduce((s, t) => s + t.pending, 0);
    const pushTypeMap = {};
    for (const t of pushSentAgg) {
      const key = t._id || 'other';
      pushTypeMap[key] = { type: key, label: typeLabel(t._id), sent: t.sent, pending: 0, preview: t.rep || null };
    }
    for (const t of pushPendingAgg) {
      const key = t._id || 'other';
      if (!pushTypeMap[key]) pushTypeMap[key] = { type: key, label: typeLabel(t._id), sent: 0, pending: 0, preview: null };
      pushTypeMap[key].pending += t.pending;
      if (!pushTypeMap[key].preview) pushTypeMap[key].preview = t.rep || null;
    }
    const pushTypes = Object.values(pushTypeMap).sort((a, b) => (b.sent + b.pending) - (a.sent + a.pending));

    // ---- Email ----
    const emailSentTotal = emailSentFromMsgAgg[0]?.total || 0;
    const emailPendingTotal = emailPendingAgg.reduce((s, t) => s + t.pending, 0);
    const emailTypeMap = {};
    for (const t of emailSentAgg) {
      const key = t._id || 'other';
      emailTypeMap[key] = { type: key, label: typeLabel(t._id), sent: t.sent, pending: 0, preview: t.rep || null };
    }
    for (const t of emailPendingAgg) {
      const key = t._id || 'other';
      if (!emailTypeMap[key]) emailTypeMap[key] = { type: key, label: typeLabel(t._id), sent: 0, pending: 0, preview: null };
      emailTypeMap[key].pending += t.pending;
      if (!emailTypeMap[key].preview) emailTypeMap[key].preview = t.rep || null;
    }
    const emailTypes = Object.values(emailTypeMap).sort((a, b) => (b.sent + b.pending) - (a.sent + a.pending));

    // ---- WhatsApp ----
    const waSent = waJobsSent.length;
    const waSentFollowup = waJobsSent.filter((j) => !j.purpose || j.purpose === 'followup').length;
    const waSentOrder = waJobsSent.filter((j) => j.purpose === 'order').length;

    let waPending = 0;
    if (waOptedIn.length > 0) {
      const optedInIds = waOptedIn.map((p) => p._id);
      const contacted = await ScheduledJob.distinct('profileId', {
        shopDomain: shop,
        channel: 'whatsapp',
        profileId: { $in: optedInIds },
      });
      waPending = Math.max(0, optedInIds.length - contacted.length);
    }

    return res.json({
      push: { sent: pushSentTotal, pending: pushPendingTotal, types: pushTypes },
      email: { sent: emailSentTotal, pending: emailPendingTotal, types: emailTypes },
      whatsapp: { sent: waSent, pending: waPending, sentFollowup: waSentFollowup, sentOrder: waSentOrder },
    });
  } catch (err) {
    console.error('[dashboard] GET channels error:', err.message);
    return res.status(500).json({ error: 'Failed to load channel stats' });
  }
});

/**
 * GET /api/dashboard/:shopDomain/channels/:channel/items
 * ?status=sent|pending &type=<signalType> &page=0 &limit=20 &from= &to=
 *
 * -> { items: [...], total, page, limit }
 *
 * Per item:
 *   id, type, label, status, time (sentAt or runAt),
 *   customer: { profileId, name, email },
 *   preview: { push: title/body/imageUrl | email: subject/preheader/body | wa: message },
 *   outcome (sent items only),
 *   purpose + consentedAt (WhatsApp pending only)
 */
router.get('/:shopDomain/channels/:channel/items', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const channel = req.params.channel;
    if (!['push', 'email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel — must be push, email or whatsapp' });
    }

    const statusParam = req.query.status === 'pending' ? 'pending' : 'sent';
    const typeParam = typeof req.query.type === 'string' ? req.query.type.trim() : '';

    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 0) page = 0;
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    const { from, to } = parseDateRange(req);

    // WhatsApp pending — items come from Profile records, not ScheduledJob.
    if (channel === 'whatsapp' && statusParam === 'pending') {
      const optedIn = await Profile.find({
        shopDomain: shop,
        'channels.whatsapp.consentedAt': { $exists: true, $ne: null },
        'channels.whatsapp.optedOutAt': null,
      })
        .select('_id channels.whatsapp channels.email.address identifiers.emails identifiers.phones')
        .sort({ 'channels.whatsapp.consentedAt': -1 })
        .lean();

      if (!optedIn.length) return res.json({ items: [], total: 0, page, limit });

      const optedInIds = optedIn.map((p) => p._id);
      const contacted = await ScheduledJob.distinct('profileId', {
        shopDomain: shop,
        channel: 'whatsapp',
        profileId: { $in: optedInIds },
      });
      const contactedSet = new Set(contacted.map(String));
      const pending = optedIn.filter((p) => !contactedSet.has(String(p._id)));
      const total = pending.length;
      const pageItems = pending.slice(page * limit, (page + 1) * limit);

      const items = pageItems.map((p) => {
        const emailAddr = p.channels?.email?.address || p.identifiers?.emails?.[0] || null;
        return {
          id: String(p._id),
          type: 'followup',
          label: 'Follow-up',
          status: 'pending',
          time: p.channels.whatsapp.consentedAt,
          customer: { profileId: String(p._id), name: nameFromEmail(emailAddr), email: emailAddr },
          preview: { message: null },
          purpose: 'followup',
          consentedAt: p.channels.whatsapp.consentedAt,
        };
      });

      return res.json({ items, total, page, limit });
    }

    // Push, email (both statuses) and WhatsApp sent — query ScheduledJob.
    const jobQuery = { shopDomain: shop, channel, status: statusParam };
    if (statusParam === 'sent') jobQuery.sentAt = { $gte: from, $lte: to };
    if (typeParam) jobQuery.signalType = typeParam;

    const sortField = statusParam === 'sent' ? 'sentAt' : 'runAt';
    const sortOrder = statusParam === 'sent' ? -1 : 1;

    const [jobs, total] = await Promise.all([
      ScheduledJob.find(jobQuery)
        .sort({ [sortField]: sortOrder })
        .skip(page * limit)
        .limit(limit)
        .select('_id signalType purpose sentAt runAt profileId payload messageText outcome')
        .lean(),
      ScheduledJob.countDocuments(jobQuery),
    ]);

    // Enrich with profile display info (no raw tokens; email only).
    const profileIds = jobs.map((j) => j.profileId).filter(Boolean).map(String);
    const profileMap = {};
    if (profileIds.length) {
      const profiles = await Profile.find({ _id: { $in: profileIds } })
        .select('channels.email.address identifiers.emails')
        .lean();
      for (const p of profiles) {
        const email = p.channels?.email?.address || p.identifiers?.emails?.[0] || null;
        profileMap[String(p._id)] = { email, name: nameFromEmail(email) };
      }
    }

    // WhatsApp sent — derive outcome chip from AttributedEvent (one batch query, no N+1).
    const outcomeChipMap = {};
    if (channel === 'whatsapp' && statusParam === 'sent' && jobs.length) {
      const jobIds = jobs.map((j) => j._id);
      const attrEvents = await AttributedEvent.find({
        shopDomain: shop,
        jobId: { $in: jobIds },
      }).select('jobId eventType').lean();
      for (const ev of attrEvents) {
        const jid = String(ev.jobId);
        const cur = outcomeChipMap[jid];
        if (!cur || WA_EVENT_PRIORITY.indexOf(ev.eventType) > WA_EVENT_PRIORITY.indexOf(cur)) {
          outcomeChipMap[jid] = ev.eventType;
        }
      }
    }

    const items = jobs.map((j) => {
      const pInfo = profileMap[String(j.profileId)] || { email: null, name: null };
      let preview;
      if (channel === 'push') {
        preview = {
          title: j.payload?.title || null,
          body: j.payload?.body || null,
          imageUrl: j.payload?.imageUrl || null,
        };
      } else if (channel === 'email') {
        preview = {
          subject: j.payload?.subject || null,
          preheader: j.payload?.preheader || null,
          body: j.payload?.body || null,
        };
      } else {
        preview = { message: j.messageText || null };
      }
      const rawChip = outcomeChipMap[String(j._id)];
      return {
        id: String(j._id),
        type: j.signalType || j.purpose || null,
        label: typeLabel(j.signalType || j.purpose),
        status: j.status,
        time: j.sentAt || j.runAt,
        customer: {
          profileId: j.profileId ? String(j.profileId) : null,
          name: pInfo.name,
          email: pInfo.email,
        },
        preview,
        outcome: j.outcome || null,
        outcomeChip: rawChip ? (WA_OUTCOME_CHIP[rawChip] || null) : null,
      };
    });

    return res.json({ items, total, page, limit });
  } catch (err) {
    console.error('[dashboard] GET channel items error:', err.message);
    return res.status(500).json({ error: 'Failed to load channel items' });
  }
});

module.exports = router;
