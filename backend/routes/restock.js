'use strict';

/**
 * "Back in stock" — admin.
 *   GET /api/restock/:shopDomain/config     settings with defaults
 *   PUT /api/restock/:shopDomain/config     save settings ({ settings })
 *   GET /api/restock/:shopDomain/overview   waiting list per product/size + last-30-days results
 * All: requireAuth + requireStoreOwner, scoped by the verified shopDomain. No shopper emails are returned.
 */

const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const RestockConfig = require('../models/RestockConfig');
const RestockRequest = require('../models/RestockRequest');
const ScheduledJob = require('../models/ScheduledJob');
const AttributedEvent = require('../models/AttributedEvent');
const { sanitizeSettings, withDefaults } = require('../utils/restock');

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
      { $match: { shopDomain: shop, status: 'waiting' } },
      {
        $group: {
          _id: '$variantId',
          productTitle: { $last: '$productTitle' },
          variantTitle: { $last: '$variantTitle' },
          imageUrl: { $last: '$imageUrl' },
          count: { $sum: 1 },
          push: { $sum: { $cond: [{ $eq: ['$channel', 'push'] }, 1, 0] } },
          email: { $sum: { $cond: [{ $eq: ['$channel', 'email'] }, 1, 0] } },
          since: { $min: '$createdAt' },
        },
      },
      { $sort: { count: -1, since: 1 } },
      { $limit: 50 },
    ]);
    const waitingTotal = await RestockRequest.countDocuments({ shopDomain: shop, status: 'waiting' });

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
      waiting: waiting.map((w) => ({
        variantId: w._id,
        productTitle: w.productTitle,
        variantTitle: w.variantTitle && w.variantTitle !== 'Default Title' ? w.variantTitle : '',
        imageUrl: w.imageUrl || '',
        count: w.count,
        push: w.push,
        email: w.email,
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

module.exports = router;
