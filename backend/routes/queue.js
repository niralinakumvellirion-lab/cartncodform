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

module.exports = router;
