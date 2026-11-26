'use strict';

/**
 * "Back in stock" — admin.
 *   GET /api/restock/:shopDomain/config     settings with defaults
 *   PUT /api/restock/:shopDomain/config     save settings ({ settings })
 *   GET /api/restock/:shopDomain/overview   waiting list per product/size + last-30-days results
 *   GET /api/restock/:shopDomain/waiting    who is waiting (?variantId= for one size)
 *   GET /api/restock/:shopDomain/whatsapp   back in stock: WhatsApp alerts for the seller to send (wa.me links)
 *   POST /api/restock/:shopDomain/whatsapp/:id/sent   seller sent it → mark sent + log the message
 * All: requireAuth + requireStoreOwner, scoped by the verified shopDomain. Only /waiting and /whatsapp
 * return shopper emails / phone numbers (the store's own customers, for the owner).
 */

const express = require('express');
const mongoose = require('mongoose');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const RestockConfig = require('../models/RestockConfig');
const RestockRequest = require('../models/RestockRequest');
const ScheduledJob = require('../models/ScheduledJob');
const AttributedEvent = require('../models/AttributedEvent');
const Profile = require('../models/Profile');
const { sanitizeSettings, withDefaults, buildMessage } = require('../utils/restock');

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;

router.get('/:shopDomain/config', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const doc = await RestockConfig.findOne({ shopDomain: req.store.shopDomain }).lean();
    return res.json({ settings: withDefaults(doc) });
  } catch (err) {
    console.error('[restock] GET config error:', err.message);
    return res.status(500).json({ error: 'Could not load the back in stock settings' });
  }
});

router.put('/:shopDomain/config', requireAuth, requireStoreOwner, async (req, res) => {
  let clean;
  try {
    clean = sanitizeSettings(req.body && req.body.settings);
  } catch (err) {
    if (err.isValidation) return res.status(400).json({ error: err.message, field: err.field });
    return res.status(500).json({ error: 'Could not save the back in stock settings' });
  }
  try {
    const doc = await RestockConfig.findOneAndUpdate(
      { shopDomain: req.store.shopDomain },
      { $set: { ...clean, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ settings: withDefaults(doc) });
  } catch (err) {
    console.error('[restock] PUT config error:', err.message);
    return res.status(500).json({ error: 'Could not save the back in stock settings' });
  }
});

router.get('/:shopDomain/overview', requireAuth, requireStoreOwner, async (req, res) => {
  const shop = req.store.shopDomain;
  const since = new Date(Date.now() - 30 * DAY);
  try {
    const waiting = await RestockRequest.aggregate([
      { $match: { shopDomain: shop, status: { $in: ['waiting', 'ready'] } } },
      {
        $group: {
          _id: '$variantId',
          productTitle: { $last: '$productTitle' },
          variantTitle: { $last: '$variantTitle' },
          imageUrl: { $last: '$imageUrl' },
          count: { $sum: 1 },
          push: { $sum: { $cond: [{ $eq: ['$channel', 'push'] }, 1, 0] } },
          email: { $sum: { $cond: [{ $eq: ['$channel', 'email'] }, 1, 0] } },
          whatsapp: { $sum: { $cond: [{ $eq: ['$channel', 'whatsapp'] }, 1, 0] } },
          since: { $min: '$createdAt' },
        },
      },
      { $sort: { count: -1, since: 1 } },
      { $limit: 50 },
    ]);
    const waitingTotal = await RestockRequest.countDocuments({ shopDomain: shop, status: { $in: ['waiting', 'ready'] } });
    const whatsappToSend = await RestockRequest.countDocuments({ shopDomain: shop, status: 'ready' });

    const jobs = await ScheduledJob.find(
      { shopDomain: shop, signalType: 'back_in_stock', status: 'sent', sentAt: { $gte: since } },
      '_id clickedAt outcome'
    ).lean();
    const jobIds = jobs.map((j) => j._id);
    const purchases = jobIds.length
      ? await AttributedEvent.find({ shopDomain: shop, eventType: 'purchase', jobId: { $in: jobIds } }, 'meta').lean()
      : [];
    const revenue = purchases.reduce((sum, p) => sum + (Number(p.meta && p.meta.orderTotal) || 0), 0);

    return res.json({
      waitingTotal,
      whatsappToSend,
      waiting: waiting.map((w) => ({
        variantId: w._id,
        productTitle: w.productTitle,
        variantTitle: w.variantTitle && w.variantTitle !== 'Default Title' ? w.variantTitle : '',
        imageUrl: w.imageUrl || '',
        count: w.count,
        push: w.push,
        email: w.email,
        whatsapp: w.whatsapp,
        since: w.since,
      })),
      last30: {
        sent: jobs.length,
        clicked: jobs.filter((j) => j.clickedAt || j.outcome === 'clicked' || j.outcome === 'converted').length,
        orders: purchases.length,
        revenue: Math.round(revenue * 100) / 100,
      },
    });
  } catch (err) {
    console.error('[restock] overview error:', err.message);
    return res.status(500).json({ error: 'Could not load the waiting list' });
  }
});

// Who is waiting (store owner only): email, or "push" with the profile's known email, customer id,
// profile link and date. Optional ?variantId= narrows it to one size. Newest first, max 200.
router.get('/:shopDomain/waiting', requireAuth, requireStoreOwner, async (req, res) => {
  const shop = req.store.shopDomain;
  const variantId = String(req.query.variantId || '');
  const filter = { shopDomain: shop, status: { $in: ['waiting', 'ready'] } };
  if (variantId) {
    if (!/^\d{1,20}$/.test(variantId)) return res.status(400).json({ error: 'Bad size id' });
    filter.variantId = variantId;
  }
  try {
    const rows = await RestockRequest.find(
      filter,
      'variantId productTitle variantTitle channel email phone status customerId profileId createdAt'
    ).sort({ createdAt: -1 }).limit(200).lean();
    const profileIds = rows.filter((r) => r.profileId && !r.email).map((r) => r.profileId);
    const profiles = profileIds.length
      ? await Profile.find({ _id: { $in: profileIds }, shopDomain: shop }, 'identifiers.emails channels.email.address').lean()
      : [];
    const emailOf = new Map(profiles.map((p) => [
      String(p._id),
      (p.channels && p.channels.email && p.channels.email.address) || (p.identifiers && p.identifiers.emails && p.identifiers.emails[0]) || null,
    ]));
    return res.json({
      people: rows.map((r) => ({
        id: String(r._id),
        variantId: r.variantId,
        productTitle: r.productTitle,
        variantTitle: r.variantTitle && r.variantTitle !== 'Default Title' ? r.variantTitle : '',
        channel: r.channel,
        email: r.email || (r.profileId ? emailOf.get(String(r.profileId)) || null : null),
        phone: r.phone || null,
        ready: r.status === 'ready',
        customerId: r.customerId || null,
        profileId: r.profileId ? String(r.profileId) : null,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error('[restock] waiting list error:', err.message);
    return res.status(500).json({ error: 'Could not load who is waiting' });
  }
});

// WhatsApp alerts ready to send (size is back): newest restock first, with the wa.me link and text.
router.get('/:shopDomain/whatsapp', requireAuth, requireStoreOwner, async (req, res) => {
  const shop = req.store.shopDomain;
  try {
    const settings = withDefaults(await RestockConfig.findOne({ shopDomain: shop }).lean());
    const rows = await RestockRequest.find({ shopDomain: shop, status: 'ready', channel: 'whatsapp' })
      .sort({ readyAt: 1, createdAt: 1 }).limit(200).lean();
    // Reserve the message id now so the link the seller sends already carries it (click tracking).
    for (const r of rows) {
      if (!r.jobId) {
        r.jobId = new mongoose.Types.ObjectId();
        await RestockRequest.updateOne({ _id: r._id, jobId: null }, { $set: { jobId: r.jobId } });
      }
    }
    return res.json({
      toSend: rows.map((r) => {
        const msg = buildMessage(settings, r, shop, String(r.jobId));
        return {
          id: String(r._id),
          productTitle: r.productTitle,
          variantTitle: r.variantTitle && r.variantTitle !== 'Default Title' ? r.variantTitle : '',
          imageUrl: r.imageUrl || '',
          phone: r.phone,
          profileId: r.profileId ? String(r.profileId) : null,
          readyAt: r.readyAt,
          text: msg.text,
          waLink: msg.waLink,
        };
      }),
    });
  } catch (err) {
    console.error('[restock] whatsapp list error:', err.message);
    return res.status(500).json({ error: 'Could not load the WhatsApp alerts' });
  }
});

// The seller opened WhatsApp and sent it: mark it sent and log the message (counts like other messages).
router.post('/:shopDomain/whatsapp/:id/sent', requireAuth, requireStoreOwner, async (req, res) => {
  const shop = req.store.shopDomain;
  if (!/^[a-f0-9]{24}$/.test(String(req.params.id || ''))) return res.status(400).json({ error: 'Bad id' });
  try {
    const now = new Date();
    const row = await RestockRequest.findOneAndUpdate(
      { _id: req.params.id, shopDomain: shop, status: 'ready', channel: 'whatsapp' },
      { $set: { status: 'sending', claimedAt: now } },
      { new: true }
    ).lean();
    if (!row) return res.status(404).json({ error: 'Already sent or no longer waiting' });
    const settings = withDefaults(await RestockConfig.findOne({ shopDomain: shop }).lean());
    const job = await ScheduledJob.create({
      _id: row.jobId || new mongoose.Types.ObjectId(),
      shopDomain: shop,
      profileId: row.profileId || null,
      signalType: 'back_in_stock',
      reason: 'Back in stock — sent by the seller on WhatsApp',
      channel: 'whatsapp',
      status: 'sent',
      sentAt: now,
      runAt: now,
      origin: 'manual',
      customerId: row.customerId || undefined,
      productHandle: row.productHandle || null,
    });
    const msg = buildMessage(settings, row, shop, String(job._id));
    await ScheduledJob.updateOne({ _id: job._id }, { $set: { messageText: msg.text.slice(0, 1000), payload: { body: msg.text, url: msg.url } } });
    await RestockRequest.updateOne(
      { _id: row._id },
      { $set: { status: 'sent', sentAt: now, jobId: job._id, claimedAt: null, error: null } }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[restock] whatsapp sent error:', err.message);
    return res.status(500).json({ error: 'Could not mark it as sent' });
  }
});

module.exports = router;
