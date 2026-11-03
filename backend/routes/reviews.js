'use strict';

/**
 * Product reviews — merchant settings.
 *   GET /api/reviews/:shopDomain/settings   current settings (defaults if never saved)
 *   PUT /api/reviews/:shopDomain/settings   validate and save the whole settings object
 *   GET /api/reviews/:shopDomain/items      reviews to moderate (?status=pending|approved|hidden&page=)
 *   PATCH  /api/reviews/:shopDomain/items/:id   { status } approve / hide / back to pending
 *   DELETE /api/reviews/:shopDomain/items/:id   remove a review
 * Both: requireAuth + requireStoreOwner, scoped by shopDomain from the verified token.
 */

const express = require('express');
const mongoose = require('mongoose');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const ReviewSettings = require('../models/ReviewSettings');
const Review = require('../models/Review');
const ReviewVote = require('../models/ReviewVote');
const { sanitizeReviewSettings, toPublicSettings } = require('../utils/reviewSettings');

const router = express.Router();

router.get('/:shopDomain/settings', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.store.shopDomain;
    const doc = await ReviewSettings.findOne({ shopDomain: shop }).lean();
    return res.json({ settings: toPublicSettings(doc) });
  } catch (err) {
    console.error('[reviews] GET settings error:', err.message);
    return res.status(500).json({ error: 'Failed to load review settings' });
  }
});

router.put('/:shopDomain/settings', requireAuth, requireStoreOwner, async (req, res) => {
  let clean;
  try {
    clean = sanitizeReviewSettings(req.body && req.body.settings);
  } catch (err) {
    if (err.isValidation) return res.status(400).json({ error: err.message, field: err.field });
    throw err;
  }

  try {
    const shop = req.store.shopDomain;
    const doc = await ReviewSettings.findOneAndUpdate(
      { shopDomain: shop },
      { $set: { ...clean, updatedAt: new Date() }, $setOnInsert: { shopDomain: shop } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ settings: toPublicSettings(doc) });
  } catch (err) {
    console.error('[reviews] PUT settings error:', err.message);
    return res.status(500).json({ error: 'Failed to save review settings' });
  }
});

// ---- Moderation -----------------------------------------------------------------------
const STATUSES = ['pending', 'approved', 'hidden'];
const PAGE_SIZE = 20;

function adminReview(r) {
  return {
    id: String(r._id),
    productId: r.productId,
    productHandle: r.productHandle || '',
    rating: r.rating,
    title: r.title,
    body: r.body,
    authorName: r.authorName,
    verified: !!r.verified,
    status: r.status,
    photos: (r.photos || []).map((p) => p.url),
    helpfulCount: r.helpfulCount || 0,
    createdAt: r.createdAt,
  };
}

router.get('/:shopDomain/items', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.store.shopDomain;
    const status = STATUSES.includes(req.query.status) ? req.query.status : null; // null = all
    const page = Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
    const where = { shopDomain: shop, ...(status ? { status } : {}) };

    const [rows, total, countRows] = await Promise.all([
      Review.find(where).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      Review.countDocuments(where),
      Review.aggregate([{ $match: { shopDomain: shop } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const counts = { pending: 0, approved: 0, hidden: 0 };
    for (const c of countRows) if (c._id in counts) counts[c._id] = c.n;

    return res.json({
      items: rows.map(adminReview),
      counts: { ...counts, all: counts.pending + counts.approved + counts.hidden },
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    console.error('[reviews] GET items error:', err.message);
    return res.status(500).json({ error: 'Failed to load reviews' });
  }
});

router.patch('/:shopDomain/items/:id', requireAuth, requireStoreOwner, async (req, res) => {
  const status = req.body && req.body.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status must be pending, approved or hidden', field: 'status' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Bad review id' });
  try {
    const doc = await Review.findOneAndUpdate(
      { _id: req.params.id, shopDomain: req.store.shopDomain },
      { $set: { status, moderatedAt: new Date() } },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Review not found' });
    return res.json({ item: adminReview(doc) });
  } catch (err) {
    console.error('[reviews] PATCH item error:', err.message);
    return res.status(500).json({ error: 'Failed to update review' });
  }
});

router.delete('/:shopDomain/items/:id', requireAuth, requireStoreOwner, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Bad review id' });
  try {
    const shop = req.store.shopDomain;
    const doc = await Review.findOneAndDelete({ _id: req.params.id, shopDomain: shop }).lean();
    if (!doc) return res.status(404).json({ error: 'Review not found' });
    await ReviewVote.deleteMany({ shopDomain: shop, reviewId: doc._id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[reviews] DELETE item error:', err.message);
    return res.status(500).json({ error: 'Failed to delete review' });
  }
});

module.exports = router;
