'use strict';

/**
 * Product reviews - storefront side, served through the App Proxy:
 *   GET  /apps/cartncodform/reviews?productId=..&page=..   approved reviews + summary + form rules
 *   POST /apps/cartncodform/reviews                        submit a review
 *   POST /apps/cartncodform/reviews/photo                  upload one photo, returns its URL
 *   POST /apps/cartncodform/reviews/:id/helpful            "helpful" vote
 * The App Proxy signature is hard-enforced. `shop` and `logged_in_customer_id` come from the
 * signed query, never from the body.
 */

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const ReviewVote = require('../models/ReviewVote');
const ReviewSettings = require('../models/ReviewSettings');
const PurchaseRecord = require('../models/PurchaseRecord');
const { verifyProxySignature } = require('../utils/shopify');
const { uploadImage } = require('../utils/cloudinary');
const { toPublicSettings } = require('../utils/reviewSettings');
const {
  PRODUCT_ID_RE,
  hashEmail,
  validateSubmission,
  checkPhotoDataUrl,
  ownPhotoUrls,
  summarizeRatings,
} = require('../utils/reviewsCore');

const router = express.Router();

// --- tiny in-memory rate limiter (per process; enough to stop casual spam) -------------
function makeLimiter(windowMs, max) {
  const hits = new Map();
  const allow = function allow(key) {
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [k, list] of hits) if (!list.length || now - list[list.length - 1] > windowMs) hits.delete(k);
    }
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) { hits.set(key, list); return false; }
    list.push(now);
    hits.set(key, list);
    return true;
  };
  allow.reset = () => hits.clear();
  return allow;
}
const submitLimiter = makeLimiter(10 * 60 * 1000, 5);
const photoLimiter = makeLimiter(10 * 60 * 1000, 20);
const voteLimiter = makeLimiter(60 * 1000, 30);

function guard(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (!verifyProxySignature(req.query)) {
    console.warn('[reviews-proxy] invalid or missing App Proxy signature - rejecting');
    return res.status(403).json({ ok: false, error: 'Invalid signature' });
  }
  const shop = String(req.query.shop || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return res.status(400).json({ ok: false, error: 'Bad shop' });
  }
  req.shop = shop;
  req.loggedInCustomerId = /^\d{1,20}$/.test(String(req.query.logged_in_customer_id || ''))
    ? String(req.query.logged_in_customer_id)
    : null;
  return next();
}

async function loadSettings(shop) {
  const doc = await ReviewSettings.findOne({ shopDomain: shop }).lean();
  return toPublicSettings(doc);
}

async function hasBought(shop, productId, customerId, emailHash) {
  const or = [];
  if (customerId) or.push({ customerId });
  if (emailHash) or.push({ emailHash });
  if (!or.length) return false;
  return !!(await PurchaseRecord.exists({ shopDomain: shop, productIds: productId, $or: or }));
}

async function alreadyReviewed(shop, productId, customerId, emailHash) {
  const or = [];
  if (customerId) or.push({ customerId });
  if (emailHash) or.push({ emailHash });
  if (!or.length) return false;
  return !!(await Review.exists({ shopDomain: shop, productId, $or: or }));
}

function publicReview(r, settings) {
  return {
    id: String(r._id),
    name: r.authorName,
    rating: settings.starRating ? r.rating : null,
    title: r.title,
    body: r.body,
    verified: !!(settings.verifiedBadge && r.verified),
    photos: (r.photos || []).map((p) => p.url),
    helpful: settings.helpfulVotes ? r.helpfulCount : null,
    createdAt: r.createdAt,
  };
}

function formRules(settings, loggedIn) {
  return {
    whoCanReview: settings.whoCanReview,
    loggedIn,
    needsEmail: !loggedIn && settings.whoCanReview !== 'logged_in',
    emailRequired: !loggedIn && settings.whoCanReview === 'verified',
    starRating: settings.starRating,
    starRequired: settings.starRating && settings.starRequired,
    photos: settings.photos.enabled
      ? { maxPhotos: settings.photos.maxPhotos, maxFileSizeMb: settings.photos.maxFileSizeMb, allowedTypes: settings.photos.allowedTypes }
      : null,
    helpfulVotes: settings.helpfulVotes,
    requireApproval: settings.requireApproval,
  };
}

// ---------------------------------------------------------------------------------------
router.get('/', guard, async (req, res) => {
  try {
    const productId = String(req.query.productId || '');
    if (!PRODUCT_ID_RE.test(productId)) return res.status(400).json({ ok: false, error: 'Missing product' });
    const settings = await loadSettings(req.shop);
    const page = Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
    const where = { shopDomain: req.shop, productId, status: 'approved' };

    const [rows, total, ratingRows] = await Promise.all([
      Review.find(where).sort({ createdAt: -1 }).skip((page - 1) * settings.reviewsPerPage).limit(settings.reviewsPerPage).lean(),
      Review.countDocuments(where),
      settings.starRating
        ? Review.aggregate([{ $match: { ...where, rating: { $ne: null } } }, { $group: { _id: '$rating', n: { $sum: 1 } } }])
        : Promise.resolve([]),
    ]);

    // Can this visitor write one? Only answerable for logged-in customers; guests are checked on submit.
    let canReview = true;
    let reason = null;
    if (settings.whoCanReview === 'logged_in' && !req.loggedInCustomerId) {
      canReview = false; reason = 'LOGIN_REQUIRED';
    } else if (req.loggedInCustomerId) {
      if (await alreadyReviewed(req.shop, productId, req.loggedInCustomerId, null)) {
        canReview = false; reason = 'ALREADY_REVIEWED';
      } else if (settings.whoCanReview === 'verified' && !(await hasBought(req.shop, productId, req.loggedInCustomerId, null))) {
        canReview = false; reason = 'NOT_VERIFIED_BUYER';
      }
    }

    return res.json({
      ok: true,
      summary: { count: total, ...summarizeRatings(ratingRows) },
      reviews: rows.map((r) => publicReview(r, settings)),
      page,
      pages: Math.max(1, Math.ceil(total / settings.reviewsPerPage)),
      form: { ...formRules(settings, !!req.loggedInCustomerId), canReview, reason },
    });
  } catch (err) {
    console.error('[reviews-proxy] GET error:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not load reviews' });
  }
});

// ---------------------------------------------------------------------------------------
router.post('/', guard, async (req, res) => {
  try {
    if (!submitLimiter(`${req.shop}|${req.ip}`)) return res.status(429).json({ ok: false, error: 'TOO_MANY', message: 'Too many reviews from this device. Please try later.' });

    const settings = await loadSettings(req.shop);
    const body = req.body || {};
    const photoUrls = ownPhotoUrls(body.photos, process.env.CLOUDINARY_CLOUD_NAME);

    let clean;
    try {
      clean = validateSubmission(settings, body, photoUrls);
    } catch (err) {
      if (err.isValidation) return res.status(400).json({ ok: false, error: err.code, field: err.field, message: err.message });
      throw err;
    }

    const customerId = req.loggedInCustomerId;
    const emailHash = hashEmail(clean.email);

    if (settings.whoCanReview === 'logged_in' && !customerId) {
      return res.status(401).json({ ok: false, error: 'LOGIN_REQUIRED', message: 'Please log in to write a review.' });
    }
    if (settings.whoCanReview === 'verified' && !customerId && !emailHash) {
      return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED', field: 'email', message: 'Enter the email you used to order.' });
    }

    const verified = await hasBought(req.shop, clean.productId, customerId, emailHash);
    if (settings.whoCanReview === 'verified' && !verified) {
      return res.status(403).json({ ok: false, error: 'NOT_VERIFIED_BUYER', message: 'Only customers who bought this product can review it.' });
    }
    if (await alreadyReviewed(req.shop, clean.productId, customerId, emailHash)) {
      return res.status(409).json({ ok: false, error: 'ALREADY_REVIEWED', message: 'You have already reviewed this product.' });
    }

    const status = settings.requireApproval ? 'pending' : 'approved';
    await Review.create({
      shopDomain: req.shop,
      productId: clean.productId,
      productHandle: clean.productHandle,
      rating: clean.rating,
      title: clean.title,
      body: clean.body,
      authorName: clean.name,
      customerId,
      emailHash,
      verified,
      status,
      photos: photoUrls.map((url) => ({ url })),
    });
    return res.json({ ok: true, status });
  } catch (err) {
    console.error('[reviews-proxy] POST error:', err.message);
    return res.status(500).json({ ok: false, error: 'FAILED', message: 'Could not save your review. Please try again.' });
  }
});

// ---------------------------------------------------------------------------------------
router.post('/photo', guard, async (req, res) => {
  try {
    if (!photoLimiter(`${req.shop}|${req.ip}`)) return res.status(429).json({ ok: false, error: 'TOO_MANY', message: 'Too many uploads. Please try later.' });
    const settings = await loadSettings(req.shop);
    try {
      checkPhotoDataUrl(settings, req.body && req.body.dataUrl);
    } catch (err) {
      if (err.isValidation) return res.status(400).json({ ok: false, error: err.code, message: err.message });
      throw err;
    }
    const uploaded = await uploadImage(req.body.dataUrl);
    if (!uploaded) return res.status(502).json({ ok: false, error: 'UPLOAD_FAILED', message: 'Could not upload the photo. Please try again.' });
    return res.json({ ok: true, url: uploaded.url });
  } catch (err) {
    console.error('[reviews-proxy] photo error:', err.message);
    return res.status(500).json({ ok: false, error: 'FAILED', message: 'Could not upload the photo.' });
  }
});

// ---------------------------------------------------------------------------------------
router.post('/:id/helpful', guard, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ ok: false, error: 'Bad review' });
    if (!voteLimiter(`${req.shop}|${req.ip}`)) return res.status(429).json({ ok: false, error: 'TOO_MANY' });

    const settings = await loadSettings(req.shop);
    if (!settings.helpfulVotes) return res.status(403).json({ ok: false, error: 'VOTES_OFF' });

    const review = await Review.findOne({ _id: req.params.id, shopDomain: req.shop, status: 'approved' }).select('_id helpfulCount').lean();
    if (!review) return res.status(404).json({ ok: false, error: 'Not found' });

    const visitor = String((req.body && req.body.visitorId) || '').slice(0, 64);
    const who = req.loggedInCustomerId ? `c:${req.loggedInCustomerId}` : `v:${visitor || req.ip}`;
    const voterKey = crypto.createHash('sha256').update(`${req.shop}|${who}`).digest('hex');

    try {
      await ReviewVote.create({ shopDomain: req.shop, reviewId: review._id, voterKey, customerId: req.loggedInCustomerId });
    } catch (err) {
      if (err && err.code === 11000) return res.json({ ok: true, already: true, helpful: review.helpfulCount });
      throw err;
    }
    const updated = await Review.findOneAndUpdate({ _id: review._id }, { $inc: { helpfulCount: 1 } }, { new: true }).select('helpfulCount').lean();
    return res.json({ ok: true, already: false, helpful: updated ? updated.helpfulCount : review.helpfulCount + 1 });
  } catch (err) {
    console.error('[reviews-proxy] helpful error:', err.message);
    return res.status(500).json({ ok: false, error: 'FAILED' });
  }
});

// Tests clear the counters between cases.
router.resetLimiters = () => [submitLimiter, photoLimiter, voteLimiter].forEach((l) => l.reset());

module.exports = router;
