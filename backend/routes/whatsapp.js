const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const AttributedEvent = require('../models/AttributedEvent');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { toWaDigits, normalizePhone } = require('../utils/phone');

// Timezone → ISO 3166-1 alpha-2 country code for phone normalisation.
// Defaults to 'IN' for anything not listed.
const TZ_COUNTRY = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE', 'Asia/Singapore': 'SG',
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD',
  'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP',
  'America/New_York': 'US', 'America/Chicago': 'US',
  'America/Los_Angeles': 'US', 'America/Toronto': 'CA',
  'Europe/London': 'GB', 'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE', 'Australia/Sydney': 'AU',
};

function countryFromStore(store) {
  return TZ_COUNTRY[(store && store.timezone) || ''] || 'IN';
}

// --- Message templates -------------------------------------------------------

function waFollowupMessage(firstName, storeDomain, ctaUrl) {
  const name = (storeDomain || '').split('.')[0];
  return (
    `Hi ${firstName}! You left something in your cart at ${name}.\n\n` +
    `Complete your order here: ${ctaUrl}\n\n` +
    `Reply STOP to opt out.`
  );
}

function waOrderMessage(firstName, storeDomain, ctaUrl) {
  const name = (storeDomain || '').split('.')[0];
  return (
    `Hi ${firstName}! This is ${name}.\n\n` +
    `We wanted to reach out about your order. Find details here: ${ctaUrl}\n\n` +
    `Reply STOP to opt out.`
  );
}

// --- Phone resolution --------------------------------------------------------

/**
 * Resolve the best E.164 phone for a profile, following the lookup order:
 *   1. channels.whatsapp.phone (already E.164)
 *   2. identifiers.phones[]
 *   3. CodOrder rows linked to this profile (by email or phone)
 *   4. AbandonedCustomer rows linked to this profile (by email or phone)
 * Returns the first phone that normalizePhone() accepts, or null.
 */
async function resolveOrderPhone(profile, shopDomain, defaultCountry) {
  // 1. channels.whatsapp.phone
  const waPhone = profile.channels && profile.channels.whatsapp && profile.channels.whatsapp.phone;
  if (waPhone) {
    const n = normalizePhone(waPhone, defaultCountry);
    if (n) return n;
  }

  // 2. identifiers.phones[]
  const idPhones = (profile.identifiers && profile.identifiers.phones) || [];
  for (const p of idPhones) {
    const n = normalizePhone(p, defaultCountry);
    if (n) return n;
  }

  // 3. CodOrder rows linked by email or phone
  const emails = (profile.identifiers && profile.identifiers.emails) || [];
  const allPhones = idPhones;
  if (emails.length || allPhones.length) {
    const CodOrder = require('../models/CodOrder');
    const codOr = [];
    if (emails.length) codOr.push({ email: { $in: emails } });
    if (allPhones.length) codOr.push({ phone: { $in: allPhones } });
    const codOrders = await CodOrder.find({ shopDomain, $or: codOr }).select('phone').lean();
    for (const co of codOrders) {
      const n = normalizePhone(co.phone, defaultCountry);
      if (n) return n;
    }
  }

  // 4. AbandonedCustomer rows linked by email or phone
  if (emails.length || allPhones.length) {
    const AbandonedCustomer = require('../models/AbandonedCustomer');
    const acOr = [];
    if (emails.length) acOr.push({ email: { $in: emails } });
    if (allPhones.length) acOr.push({ phone: { $in: allPhones } });
    const abandons = await AbandonedCustomer.find({ shopDomain, $or: acOr })
      .select('phone').lean();
    for (const ac of abandons) {
      if (ac.phone) {
        const n = normalizePhone(ac.phone, defaultCountry);
        if (n) return n;
      }
    }
  }

  return null;
}

function resolveFirstName(profile) {
  const emailAddr =
    (profile.channels && profile.channels.email && profile.channels.email.address) ||
    (profile.identifiers && profile.identifiers.emails && profile.identifiers.emails[0]);
  if (!emailAddr) return 'there';
  const local = emailAddr.split('@')[0].split(/[._+]/)[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// --- Routes ------------------------------------------------------------------

/**
 * POST /api/whatsapp/:shopDomain/send
 * Body: { profileId, purpose?: 'followup' | 'order' }
 * purpose defaults to 'followup'.
 * followup: requires channels.whatsapp.consentedAt + not opted out.
 * order: any normalizable phone; refuses if opted out.
 * Returns { url, jobId, purpose }.
 */
router.post('/:shopDomain/send', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { profileId } = req.body;
    const purpose = req.body.purpose === 'order' ? 'order' : 'followup';

    if (!profileId || !mongoose.Types.ObjectId.isValid(profileId)) {
      return res.status(400).json({ error: 'Invalid profileId' });
    }

    const profile = await Profile.findOne({ _id: profileId, shopDomain: shop });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const wa = profile.channels && profile.channels.whatsapp;
    const optedOut = wa && wa.optedOutAt;

    if (purpose === 'followup') {
      if (!wa || !wa.phone || !wa.consentedAt) {
        return res.status(400).json({ error: 'Profile has no WhatsApp consent' });
      }
      if (optedOut) {
        return res.status(400).json({ error: 'Customer opted out of WhatsApp messages' });
      }
    }

    if (purpose === 'order') {
      if (optedOut) {
        return res.status(400).json({ error: 'Customer opted out of WhatsApp messages' });
      }
    }

    const defaultCountry = countryFromStore(req.store);
    let phone;

    if (purpose === 'followup') {
      phone = normalizePhone(wa.phone, defaultCountry);
      if (!phone) {
        return res.status(400).json({ error: 'Invalid phone number on profile' });
      }
    } else {
      phone = await resolveOrderPhone(profile, shop, defaultCountry);
      if (!phone) {
        return res.status(400).json({ error: 'Phone number needs a country code' });
      }
    }

    const digits = toWaDigits(phone);
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
      purpose,
    });

    const storeLink =
      `https://${shop}?ccf_src=whatsapp&ccf_job=${job._id.toString()}`;

    const firstName = resolveFirstName(profile);
    const message = purpose === 'order'
      ? waOrderMessage(firstName, shop, storeLink)
      : waFollowupMessage(firstName, shop, storeLink);
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

    return res.status(200).json({ url, jobId: job._id, purpose });
  } catch (err) {
    console.error('[whatsapp] POST /send error:', err.message);
    return res.status(500).json({ error: 'Failed to create WhatsApp message' });
  }
});

/**
 * GET /api/whatsapp/:shopDomain/stats?from=&to=
 * -> { pending, sent, sentFollowup, sentOrder, clicked, carted, purchased, canMessageCount }
 * pending = opted-in (consented) profiles with no whatsapp job ever.
 * sent = sentFollowup + sentOrder.
 * canMessageCount = profiles with any normalizable phone (informational).
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
    }).select('_id profileId purpose').lean();
    const sentJobIds = sentJobs.map((j) => j._id);

    // purpose breakdown — missing purpose defaults to 'followup'.
    const sentFollowup = sentJobs.filter((j) => !j.purpose || j.purpose === 'followup').length;
    const sentOrder = sentJobs.filter((j) => j.purpose === 'order').length;

    // Profiles that have ANY whatsapp job (not just in range — pending means never contacted).
    const contactedProfileIds = optedInIds.length
      ? await ScheduledJob.distinct('profileId', {
          shopDomain: shop,
          channel: 'whatsapp',
          profileId: { $in: optedInIds },
        })
      : [];

    const pending = optedInIds.length - contactedProfileIds.length;

    // Profiles with any phone (approx canMessage count — does not verify normalisability).
    const canMessageCount = await Profile.countDocuments({
      shopDomain: shop,
      $or: [
        { 'channels.whatsapp.phone': { $ne: null } },
        { 'identifiers.phones.0': { $exists: true } },
      ],
    });

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
      sentFollowup,
      sentOrder,
      clicked,
      carted,
      purchased,
      canMessageCount,
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
 * Returns:
 *   { whatsapp, messages, canFollowup, canOrder, orderReason }
 * canFollowup: true when consented and not opted out.
 * canOrder: true when a normalizable phone exists and not opted out.
 * orderReason: null | 'opted_out' | 'no_phone' | 'invalid_phone'
 * Each message includes its purpose field.
 */
router.get('/:shopDomain/profile/:profileId', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { profileId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(profileId)) {
      return res.status(400).json({ error: 'Invalid profileId' });
    }

    const profile = await Profile.findOne({ _id: profileId, shopDomain: shop })
      .select('channels identifiers messages')
      .lean();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const wa = (profile.channels && profile.channels.whatsapp) || null;
    const waMessages = (profile.messages || []).filter((m) => m.channel === 'whatsapp');

    // canFollowup / canOrder
    const optedOut = !!(wa && wa.optedOutAt);
    const canFollowup = !!(wa && wa.consentedAt && !optedOut);

    let canOrder = false;
    let orderReason = null;

    if (optedOut) {
      orderReason = 'opted_out';
    } else {
      const defaultCountry = countryFromStore(req.store);
      const phone = await resolveOrderPhone(profile, shop, defaultCountry);
      if (!phone) {
        const hasAnyPhone =
          (wa && wa.phone) ||
          (profile.identifiers && profile.identifiers.phones && profile.identifiers.phones.length > 0);
        orderReason = hasAnyPhone ? 'invalid_phone' : 'no_phone';
      } else {
        canOrder = true;
      }
    }

    return res.json({ whatsapp: wa, messages: waMessages, canFollowup, canOrder, orderReason });
  } catch (err) {
    console.error('[whatsapp] GET /profile/:profileId error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch WhatsApp profile data' });
  }
});

module.exports = router;
