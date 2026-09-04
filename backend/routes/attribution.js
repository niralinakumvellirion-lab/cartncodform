const express = require('express');
const router = express.Router();
const PushClick = require('../models/PushClick');
const ScheduledJob = require('../models/ScheduledJob');

/**
 * POST /api/attribution/click
 * Body: { shopDomain, jobId, cartToken, customerId, subscriptionToken }
 * Called by the storefront when a page loads with a ?ccf_job param
 * (i.e. the visitor clicked through from a CartnCodForm push).
 */
router.post('/click', async (req, res) => {
  try {
    const { shopDomain, jobId, cartToken, customerId, subscriptionToken } = req.body;

    if (!shopDomain || !jobId) {
      return res.status(400).json({ error: 'shopDomain and jobId are required' });
    }

    const shop = String(shopDomain).trim().toLowerCase();

    // Validate the job exists and belongs to this shop. A bad/foreign
    // jobId is rejected so bogus PushClick rows can't be planted.
    let job;
    try {
      job = await ScheduledJob.findOne({ _id: jobId, shopDomain: shop });
    } catch (castErr) {
      return res.status(400).json({ error: 'Invalid jobId' });
    }
    if (!job) {
      return res.status(404).json({ error: 'Job not found for this shop' });
    }

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

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[attribution] POST /click error:', err.message);
    return res.status(500).json({ error: 'Failed to record click' });
  }
});

module.exports = router;
