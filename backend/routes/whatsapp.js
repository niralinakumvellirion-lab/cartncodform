const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const AttributedEvent = require('../models/AttributedEvent');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { toWaDigits } = require('../utils/phone');

function waMessage(firstName, storeDomain, ctaUrl) {
  const name = (storeDomain || '').split('.')[0];
  return (
    `Hi ${firstName}! You left something in your cart at ${name}.\n\n` +
    `Complete your order here: ${ctaUrl}\n\n` +
    `Reply STOP to opt out.`
  );
}

/**
 * POST /api/whatsapp/:shopDomain/send
 * Body: { profileId }
 * Creates a ScheduledJob (channel='whatsapp', status='sent') and returns
 * { url, jobId } where url is a wa.me click-to-chat link with attribution.
 */
router.post('/:shopDomain/send', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { profileId } = req.body;

    if (!profileId || !mongoose.Types.ObjectId.isValid(profileId)) {
      return res.status(400).json({ error: 'Invalid profileId' });
    }

    const profile = await Profile.findOne({ _id: profileId, shopDomain: shop });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const wa = profile.channels && profile.channels.whatsapp;
    if (!wa || !wa.phone || !wa.consentedAt) {
      return res.status(400).json({ error: 'Profile has no WhatsApp consent' });
    }
    if (wa.optedOutAt) {
      return res.status(400).json({ error: 'Customer opted out of WhatsApp messages' });
    }

    const digits = toWaDigits(wa.phone);
    if (!digits) {
      return res.status(400).json({ error: 'Invalid phone number on profile' });
    }

    // Create directly as 'sent' — never pending, so the poller never picks it up.
    const job = await ScheduledJob.create({
      shopDomain: shop,
      profileId: profile._id,
      channel: 'whatsapp',
      status: 'sent',
      sentAt: new Date(),
      runAt: new Date(),
      stepIndex: 0,
      ruleId: null,
    });

    const storeLink =
      `https://${shop}` +
      `?ccf_src=whatsapp&ccf_job=${job._id.toString()}`;

    const emailAddr =
      (profile.channels && profile.channels.email && profile.channels.email.address) ||
      (profile.identifiers && profile.identifiers.emails && profile.identifiers.emails[0]);
    const firstName = emailAddr
      ? (() => {
          const local = emailAddr.split('@')[0].split(/[._+]/)[0];
          return local.charAt(0).toUpperCase() + local.slice(1);
        })()
      : 'there';

    const message = waMessage(firstName, shop, storeLink);
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

    return res.status(200).json({ url, jobId: job._id });
  } catch (err) {
    console.error('[whatsapp] POST /send error:', err.message);
    return res.status(500).json({ error: 'Failed to create WhatsApp message' });
  }
});

/**
 * GET /api/whatsapp/:shopDomain/stats?from=&to=
 * -> { pending, sent, clicked, carted, purchased }
 * pending = opted-in profiles with no whatsapp job ever.
 * sent/clicked/carted/purchased use existing attribution data.
 */
router.get('/:shopDomain/stats', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const from = new Date(req.query.from || Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(req.query.to || Date.now());

    // Opted-in profiles (consented, not opted out).
    const optedIn = await Profile.find({
      shopDomain: shop,
      'channels.whatsapp.consentedAt': { $exists: true, $ne: null },
      'channels.whatsapp.optedOutAt': null,
    }).select('_id').lean();
    const optedInIds = optedIn.map((p) => p._id);

    // Jobs sent in range.
    const sentJobs = await ScheduledJob.find({
      shopDomain: shop,
      channel: 'whatsapp',
      status: 'sent',
      sentAt: { $gte: from, $lte: to },
    }).select('_id profileId').lean();
    const sentJobIds = sentJobs.map((j) => j._id);

    // Profiles that have ANY whatsapp job (not just in range — pending means never contacted).
    const contactedProfileIds = optedInIds.length
      ? await ScheduledJob.distinct('profileId', {
          shopDomain: shop,
          channel: 'whatsapp',
          profileId: { $in: optedInIds },
        })
      : [];

    const pending = optedInIds.length - contactedProfileIds.length;

    // Attribution events for the in-range whatsapp jobs.
    const events = sentJobIds.length
      ? await AttributedEvent.find({
          shopDomain: shop,
          jobId: { $in: sentJobIds },
        })
          .select('eventType jobId')
          .lean()
      : [];

    // Count distinct jobs that triggered each event type.
    const clicked = new Set(
      events.filter((e) => e.eventType === 'revisit').map((e) => String(e.jobId))
    ).size;
    const carted = new Set(
      events.filter((e) => e.eventType === 'add_to_cart').map((e) => String(e.jobId))
    ).size;
    const purchased = new Set(
      events.filter((e) => e.eventType === 'purchase').map((e) => String(e.jobId))
    ).size;

    return res.json({
      pending: Math.max(0, pending),
      sent: sentJobs.length,
      clicked,
      carted,
      purchased,
    });
  } catch (err) {
    console.error('[whatsapp] GET /stats error:', err.message);
    return res.status(500).json({ error: 'Failed to load WhatsApp stats' });
  }
});

/**
 * POST /api/whatsapp/:shopDomain/opt-out
 * Body: { profileId }
 * Sets channels.whatsapp.optedOutAt on the profile.
 */
router.post('/:shopDomain/opt-out', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { profileId } = req.body;

    if (!profileId || !mongoose.Types.ObjectId.isValid(profileId)) {
      return res.status(400).json({ error: 'Invalid profileId' });
    }

    const profile = await Profile.findOne({ _id: profileId, shopDomain: shop });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (!profile.channels || !profile.channels.whatsapp || !profile.channels.whatsapp.phone) {
      return res.status(400).json({ error: 'Profile has no WhatsApp number' });
    }

    await Profile.updateOne(
      { _id: profile._id },
      { $set: { 'channels.whatsapp.optedOutAt': new Date() } }
    );

    return res.json({ updated: true });
  } catch (err) {
    console.error('[whatsapp] POST /opt-out error:', err.message);
    return res.status(500).json({ error: 'Failed to record opt-out' });
  }
});

/**
 * GET /api/whatsapp/:shopDomain/profile/:profileId
 * Returns the WhatsApp channel data and WhatsApp message history for a profile.
 */
router.get('/:shopDomain/profile/:profileId', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { profileId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(profileId)) {
      return res.status(400).json({ error: 'Invalid profileId' });
    }

    const profile = await Profile.findOne({ _id: profileId, shopDomain: shop })
      .select('channels.whatsapp messages')
      .lean();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const whatsapp = (profile.channels && profile.channels.whatsapp) || null;
    const waMessages = (profile.messages || []).filter((m) => m.channel === 'whatsapp');

    return res.json({ whatsapp, messages: waMessages });
  } catch (err) {
    console.error('[whatsapp] GET /profile/:profileId error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch WhatsApp profile data' });
  }
});

module.exports = router;
