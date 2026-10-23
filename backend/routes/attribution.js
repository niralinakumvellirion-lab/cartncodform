const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const PushClick = require('../models/PushClick');
const ScheduledJob = require('../models/ScheduledJob');
const FestivalQueue = require('../models/FestivalQueue');
const Profile = require('../models/Profile');

/**
 * POST /api/attribution/click
 * Body: { shopDomain, jobId, cartToken, customerId, subscriptionToken }
 * Called by the storefront when a page loads with a ?ccf_job param
 * (i.e. the visitor clicked through from a CartnCodForm push).
 *
 * jobId may be either a ScheduledJob _id (brain/automation/legacy) or a
 * FestivalQueue _id (festival/manual broadcast tracking, Phase 2).
 * Both are ObjectId strings; we try ScheduledJob first, then FestivalQueue.
 */
router.post('/click', async (req, res) => {
  try {
    const { shopDomain, jobId, cartToken, customerId, subscriptionToken } = req.body;

    if (!shopDomain || !jobId) {
      return res.status(400).json({ error: 'shopDomain and jobId are required' });
    }

    const shop = String(shopDomain).trim().toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ error: 'Invalid jobId' });
    }

    // ── Try ScheduledJob (brain / automation / legacy) ────────────────────
    let job;
    try {
      job = await ScheduledJob.findOne({ _id: jobId, shopDomain: shop });
    } catch (castErr) {
      return res.status(400).json({ error: 'Invalid jobId' });
    }

    if (job) {
      // Dedupe: one click per (jobId, cartToken). A page reload with
      // ?ccf_job still in the URL hits the partial-unique index -> 11000,
      // which we swallow instead of erroring.
      try {
        await PushClick.create({
          shopDomain: shop,
          jobId,
          subscriptionToken: subscriptionToken || null,
          cartToken: cartToken || null,
          customerId: customerId || null,
        });
        console.log(`[attribution] Click recorded for job ${jobId} (shop: ${shop})`);
      } catch (err) {
        if (err.code === 11000) {
          console.log(`[attribution] Duplicate click ignored for job ${jobId}`);
        } else {
          throw err;
        }
      }

      // Phase C2 — mark the job + the profile's message-log entry as 'clicked'.
      await ScheduledJob.findByIdAndUpdate(job._id, {
        outcome: 'clicked',
        clickedAt: new Date(),
      });
      if (job.profileId) {
        await Profile.updateOne(
          { _id: job.profileId, 'messages.jobId': job._id },
          { $set: { 'messages.$.outcome': 'clicked' } }
        );
      }

      return res.status(200).json({ success: true });
    }

    // ── Try FestivalQueue (festival / manual broadcast) ───────────────────
    let festivalDoc;
    try {
      festivalDoc = await FestivalQueue.findOne({ _id: jobId, shopDomain: shop });
    } catch (castErr) {
      return res.status(400).json({ error: 'Invalid jobId' });
    }

    if (!festivalDoc) {
      // Neither ScheduledJob nor FestivalQueue found for this shop.
      return res.status(404).json({ error: 'Job not found for this shop' });
    }

    // Record PushClick idempotently — unique per (festivalQueueId, subscriptionToken).
    try {
      await PushClick.create({
        shopDomain: shop,
        festivalQueueId: festivalDoc._id,
        subscriptionToken: subscriptionToken || null,
        cartToken: cartToken || null,
        customerId: customerId || null,
      });
      console.log(`[attribution] Festival click recorded for ${festivalDoc._id} (shop: ${shop})`);
    } catch (err) {
      if (err.code === 11000) {
        console.log(`[attribution] Duplicate festival click ignored for ${festivalDoc._id}`);
      } else {
        throw err;
      }
    }

    // Update the subscriber's own per-token ScheduledJob send-log row.
    if (subscriptionToken) {
      await ScheduledJob.findOneAndUpdate(
        {
          shopDomain: shop,
          festivalQueueId: festivalDoc._id,
          subscriptionToken,
        },
        { outcome: 'clicked', clickedAt: new Date() }
      );
    }

    // Update Profile.messages if the profile is known via subscriptionToken.
    if (subscriptionToken) {
      const profile = await Profile.findOne({
        shopDomain: shop,
        'identifiers.pushTokens': subscriptionToken,
      }).select('_id');
      if (profile) {
        // Find the matching message entry and mark it clicked.
        // Use a separate query: the jobId stored in messages is the
        // ScheduledJob _id, which we need to look up first.
        const jobRow = await ScheduledJob.findOne(
          { shopDomain: shop, festivalQueueId: festivalDoc._id, subscriptionToken },
          '_id'
        ).lean();
        if (jobRow) {
          await Profile.updateOne(
            { _id: profile._id, 'messages.jobId': jobRow._id },
            { $set: { 'messages.$.outcome': 'clicked' } }
          );
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[attribution] POST /click error:', err.message);
    return res.status(500).json({ error: 'Failed to record click' });
  }
});

module.exports = router;
