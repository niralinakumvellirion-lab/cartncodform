const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const AttributedEvent = require('../models/AttributedEvent');
const StorefrontEvent = require('../models/StorefrontEvent');
const ProductImageCache = require('../models/ProductImageCache');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { toWaDigits, normalizePhone } = require('../utils/phone');
const { normalizeImageUrl } = require('../utils/productImage');

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

// Named templates (optional `template` field on POST /send).
// Each entry: { purpose, build(firstName, storeName, ctaUrl) -> string }
// purpose 'followup' requires consent; 'order' is non-promotional.
const WA_TEMPLATES = {
  cart_reminder: {
    purpose: 'followup',
    build: (firstName, storeName, ctaUrl) =>
      `Hi ${firstName}! 🛒 You left something in your cart at ${storeName}.\n\n` +
      `Complete your order before it sells out: ${ctaUrl}\n\n` +
      `Reply STOP to opt out.`,
  },
  welcome_offer: {
    purpose: 'followup',
    build: (firstName, storeName, ctaUrl) =>
      `Hi ${firstName}! Welcome to ${storeName}. 🎉\n\n` +
      `We're glad you're here. Explore our collection and find something you'll love: ${ctaUrl}\n\n` +
      `Reply STOP to opt out.`,
  },
  cod_confirmation: {
    purpose: 'order',
    build: (firstName, storeName, ctaUrl) =>
      `Hi ${firstName}! This is ${storeName}.\n\n` +
      `We're confirming your Cash on Delivery order. Please keep your phone handy for delivery. ` +
      `View order details: ${ctaUrl}\n\n` +
      `Reply STOP to opt out.`,
  },
  order_thank_you: {
    purpose: 'order',
    build: (firstName, storeName, ctaUrl) =>
      `Hi ${firstName}! Thank you for your order at ${storeName}. 🙏\n\n` +
      `We're getting it ready for you. Track your order here: ${ctaUrl}\n\n` +
      `Reply STOP to opt out.`,
  },
  win_back: {
    purpose: 'followup',
    build: (firstName, storeName, ctaUrl) =>
      `Hi ${firstName}! It's been a while — we miss you at ${storeName}. 💛\n\n` +
      `Come check out what's new: ${ctaUrl}\n\n` +
      `Reply STOP to opt out.`,
  },
  product_followup: {
    purpose: 'followup',
    build: (firstName, storeName, ctaUrl) =>
      `Hi ${firstName}! Still thinking about what you saw at ${storeName}?\n\n` +
      `We saved it for you. Take another look: ${ctaUrl}\n\n` +
      `Reply STOP to opt out.`,
  },
};

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

// --- Product helpers ---------------------------------------------------------

function extractHandle(path) {
  if (typeof path !== 'string') return null;
  const m = /\/products\/([^/?#]+)/.exec(path);
  return m ? m[1].toLowerCase() : null;
}

function isProxiedUrl(url) {
  return typeof url === 'string' && /^https?:\/\/[^/]+\.myshopify\.com\/cdn\//i.test(url);
}

/**
 * Returns up to 3 products (viewed or in cart) for this profile in the last
 * 30 days, most recent first. Requires no Admin API call — cache + event
 * imageUrl only, so it stays fast for the profile endpoint.
 */
async function resolveRecentProducts(shop, profile) {
  const sessionIds = (profile.identifiers && profile.identifiers.sessionIds) || [];
  const cartTokens = (profile.identifiers && profile.identifiers.cartTokens) || [];
  if (!sessionIds.length && !cartTokens.length) return [];

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await StorefrontEvent.find({
    shopDomain: shop,
    sessionId: { $in: [...sessionIds, ...cartTokens] },
    type: { $in: ['product_view', 'add_to_cart'] },
    ts: { $gte: since },
    'meta.productId': { $exists: true, $ne: null },
  })
    .sort({ ts: -1 })
    .limit(100)
    .select('type path meta ts')
    .lean();

  const byProduct = {};
  for (const e of events) {
    const pid = e.meta && e.meta.productId;
    if (!pid) continue;
    const key = String(pid);
    if (!byProduct[key]) {
      byProduct[key] = {
        productId: key,
        title: (e.meta && e.meta.productTitle) || null,
        handle: extractHandle(e.path),
        imageUrl: null,
        lastViewedAt: e.ts,
        source: e.type === 'product_view' ? 'viewed' : 'cart',
      };
    }
    if (e.ts > byProduct[key].lastViewedAt) byProduct[key].lastViewedAt = e.ts;
    if (e.type === 'product_view') byProduct[key].source = 'viewed';
    if (!byProduct[key].title && e.meta && e.meta.productTitle) {
      byProduct[key].title = e.meta.productTitle;
    }
    if (!byProduct[key].handle) byProduct[key].handle = extractHandle(e.path);
    if (e.type === 'product_view' && e.meta && e.meta.imageUrl && !byProduct[key].imageUrl) {
      const img = normalizeImageUrl(e.meta.imageUrl);
      if (img && !isProxiedUrl(img)) byProduct[key].imageUrl = img;
    }
  }

  const sorted = Object.values(byProduct)
    .filter((p) => p.handle)
    .sort((a, b) => new Date(b.lastViewedAt) - new Date(a.lastViewedAt))
    .slice(0, 3);

  if (!sorted.length) return [];

  const pids = sorted.map((p) => p.productId);
  const cached = await ProductImageCache.find({ shopDomain: shop, productId: { $in: pids } })
    .select('productId imageUrl')
    .lean();
  const imageMap = {};
  cached.forEach((c) => {
    const img = normalizeImageUrl(c.imageUrl);
    if (img && !isProxiedUrl(img)) imageMap[String(c.productId)] = img;
  });

  return sorted.map((p) => ({
    handle: p.handle,
    title: p.title,
    imageUrl: imageMap[p.productId] || p.imageUrl || null,
    url: `https://${shop}/products/${p.handle}`,
    lastViewedAt: p.lastViewedAt,
    source: p.source,
  }));
}

function applyProductPlaceholder(text, productTitle) {
  if (!productTitle) {
    return text.replace(/\s*\{product\}\s*/g, ' ').replace(/ {2,}/g, ' ').trim();
  }
  return text.replace(/\{product\}/g, productTitle);
}

// --- Routes ------------------------------------------------------------------

/**
 * POST /api/whatsapp/:shopDomain/send
 * Body: { profileId, purpose?: 'followup'|'order', template?: string, message?: string }
 * purpose defaults to 'followup'.
 * template (optional): one of the WA_TEMPLATES keys. Locks purpose to the template's own.
 *   Unknown key → 400. Eligibility re-checked server-side.
 * message (optional): custom text (1–1000 chars after trim, no bare control chars).
 *   Replaces the template body. The server always appends the store link on its own
 *   line regardless of what the client sent. If the text already contains the exact
 *   tracking link, it is not duplicated. Eligibility checks (consent/opt-out) are
 *   unchanged. The final sent text is saved as ScheduledJob.messageText.
 * followup: requires channels.whatsapp.consentedAt + not opted out.
 * order: any normalizable phone; refuses if opted out.
 * Returns { url, jobId, purpose }.
 */
router.post('/:shopDomain/send', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const { profileId } = req.body;

    // Validate custom message when provided.
    let customMessage = null;
    if (req.body.message !== undefined && req.body.message !== null) {
      const raw = String(req.body.message);
      // Strip bare control characters (keep \t \n \r).
      const cleaned = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
      const trimmed = cleaned.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Message is empty' });
      }
      if (trimmed.length > 1000) {
        return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
      }
      customMessage = trimmed;
    }

    // Resolve template first — it locks the purpose.
    const templateKey = req.body.template || null;
    if (templateKey !== null && !WA_TEMPLATES[templateKey]) {
      return res.status(400).json({ error: `Unknown template: ${templateKey}` });
    }
    const tpl = templateKey ? WA_TEMPLATES[templateKey] : null;

    // purpose: template overrides explicit body.purpose
    const purpose = tpl ? tpl.purpose : (req.body.purpose === 'order' ? 'order' : 'followup');

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

    // Resolve product handle: validate against recent events (server re-checks).
    const rawHandle = typeof req.body.productHandle === 'string' && req.body.productHandle.trim()
      ? req.body.productHandle.trim().toLowerCase()
      : null;

    const recentProducts = await resolveRecentProducts(shop, profile);

    let selectedHandle = null;
    if (rawHandle) {
      const found = recentProducts.find((p) => p.handle === rawHandle);
      if (!found) {
        return res.status(400).json({ error: 'Product not in recent views for this customer' });
      }
      selectedHandle = rawHandle;
    } else {
      // Auto-pick most recently viewed product; null → home URL (as before).
      selectedHandle = recentProducts.length > 0 ? recentProducts[0].handle : null;
    }

    const productTitle = selectedHandle
      ? (recentProducts.find((p) => p.handle === selectedHandle) || {}).title || null
      : null;

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
      productHandle: selectedHandle || null,
    });

    // ctaUrl: product page when a product is selected, store home otherwise.
    const ctaUrl = selectedHandle
      ? `https://${shop}/products/${selectedHandle}?ccf_src=whatsapp&ccf_job=${job._id.toString()}`
      : `https://${shop}?ccf_src=whatsapp&ccf_job=${job._id.toString()}`;

    const firstName = resolveFirstName(profile);
    const storeName = shop.split('.')[0];

    let message;
    if (customMessage) {
      // Custom text: server appends ctaUrl on its own line unless already present.
      const body = customMessage.includes(ctaUrl)
        ? customMessage
        : `${customMessage}\n\n${ctaUrl}`;
      message = applyProductPlaceholder(body, productTitle);
    } else {
      // Default template path.
      const raw = tpl
        ? tpl.build(firstName, storeName, ctaUrl)
        : (purpose === 'order'
            ? waOrderMessage(firstName, shop, ctaUrl)
            : waFollowupMessage(firstName, shop, ctaUrl));
      message = applyProductPlaceholder(raw, productTitle);
    }

    // Store final sent text (never log message bodies to console).
    await ScheduledJob.updateOne({ _id: job._id }, { $set: { messageText: message.slice(0, 1000) } });

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
 * GET /api/whatsapp/:shopDomain/pending?limit=
 * Opted-in profiles (consentedAt set, optedOutAt null) that have never
 * received a whatsapp job. Default limit=8, max=50. Newest consent first.
 * -> { total, items: [{ profileId, name, email, phone, consentedAt }] }
 */
router.get('/:shopDomain/pending', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 8;

    const optedIn = await Profile.find({
      shopDomain: shop,
      'channels.whatsapp.consentedAt': { $exists: true, $ne: null },
      'channels.whatsapp.optedOutAt': null,
    })
      .select('_id channels.whatsapp.consentedAt channels.whatsapp.phone channels.email.address identifiers.emails identifiers.phones')
      .sort({ 'channels.whatsapp.consentedAt': -1 })
      .lean();

    if (!optedIn.length) {
      return res.json({ total: 0, items: [] });
    }

    const optedInIds = optedIn.map((p) => p._id);
    const contactedIds = await ScheduledJob.distinct('profileId', {
      shopDomain: shop,
      channel: 'whatsapp',
      profileId: { $in: optedInIds },
    });
    const contactedSet = new Set(contactedIds.map(String));

    const pending = optedIn.filter((p) => !contactedSet.has(String(p._id)));
    const total = pending.length;

    const items = pending.slice(0, limit).map((p) => {
      const email =
        (p.channels && p.channels.email && p.channels.email.address) ||
        (p.identifiers && p.identifiers.emails && p.identifiers.emails[0]) ||
        null;
      const phone =
        (p.channels && p.channels.whatsapp && p.channels.whatsapp.phone) ||
        (p.identifiers && p.identifiers.phones && p.identifiers.phones[0]) ||
        null;
      const local = email ? email.split('@')[0] : null;
      const name = local
        ? local.split(/[._+]/)[0].replace(/\b\w/g, (c) => c.toUpperCase())
        : null;
      return {
        profileId: String(p._id),
        name,
        email,
        phone,
        consentedAt: p.channels.whatsapp.consentedAt,
      };
    });

    return res.json({ total, items });
  } catch (err) {
    console.error('[whatsapp] GET /pending error:', err.message);
    return res.status(500).json({ error: 'Failed to load pending profiles' });
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
 *   { whatsapp, messages, canFollowup, canOrder, orderReason, recentProducts }
 * canFollowup: true when consented and not opted out.
 * canOrder: true when a normalizable phone exists and not opted out.
 * orderReason: null | 'opted_out' | 'no_phone' | 'invalid_phone'
 * recentProducts: up to 3 [{handle, title, imageUrl, url, lastViewedAt, source}]
 *   from product_view / add_to_cart events in the last 30 days, most recent first.
 *   Home/collection-only visitors return [].
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

    const recentProducts = await resolveRecentProducts(shop, profile);

    return res.json({ whatsapp: wa, messages: waMessages, canFollowup, canOrder, orderReason, recentProducts });
  } catch (err) {
    console.error('[whatsapp] GET /profile/:profileId error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch WhatsApp profile data' });
  }
});

module.exports = router;
