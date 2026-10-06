const express = require('express');
const router = express.Router();
const { Resend } = require('resend');

const EmailTemplate = require('../models/EmailTemplate');
const Profile = require('../models/Profile');
const Store = require('../models/Store');
const { requireAuth } = require('../middleware/requireOwner');
const { FROM, UNSUBSCRIBE_HEADERS, buildEmailHtml } = require('../utils/email');
const { normalizeImageUrl } = require('../utils/productImage');
const { generateTemplateCopy } = require('../services/aiService');
const { logBroadcastSend } = require('../services/sendLogService');

// Same safe-fallback pattern as email.js: avoid crashing on load when key absent.
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_no_key');

const VALID_TYPES = ['special_offer', 'festival', 'normal'];
const EDITABLE_FIELDS = ['name', 'type', 'subject', 'body', 'imageUrl', 'ctaLabel', 'ctaUrl'];

const VALID_SEGMENTS = ['everyone', 'email_captured', 'has_cart', 'bought_once', 'going_quiet'];
const BROADCAST_CAP = 90;

// Translate a segment key into a MongoDB query (mirrors profiles.js filter logic).
// Always includes shopDomain, suppressed guard, and email-presence guard.
function buildEmailSegmentQuery(shopDomain, segment) {
  const query = {
    shopDomain,
    suppressed: { $ne: true },
    $or: [
      { 'channels.email.address': { $exists: true, $ne: null } },
      { 'identifiers.emails.0': { $exists: true } },
    ],
  };
  if (segment === 'email_captured') {
    query['channels.email.capturedAt'] = { $exists: true };
  } else if (segment === 'has_cart') {
    query['identifiers.cartTokens.0'] = { $exists: true };
    query['orders.count'] = 0;
  } else if (segment === 'bought_once') {
    query['orders.count'] = 1;
  } else if (segment === 'going_quiet') {
    query['lastSeenAt'] = { $lt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000) };
  }
  return query;
}

// Load store brand data; never block a send on a miss.
// voice is included so the generate route can pass it to generateTemplateCopy.
async function loadBrandData(shopDomain) {
  try {
    const store = await Store.findOne({ shopDomain }).select('shopName logoUrl primaryColor voice');
    if (!store) return { storeName: shopDomain, logoUrl: null, primaryColor: null, voice: {} };
    return {
      storeName: store.shopName || shopDomain,
      logoUrl: store.logoUrl || null,
      primaryColor: store.primaryColor || null,
      voice: store.voice || {},
    };
  } catch {
    return { storeName: shopDomain, logoUrl: null, primaryColor: null, voice: {} };
  }
}

// GET /api/email-templates
router.get('/', requireAuth, async (req, res) => {
  try {
    const templates = await EmailTemplate.find({ shopDomain: req.shopDomain })
      .sort({ createdAt: -1 });
    return res.json({ templates });
  } catch (err) {
    console.error('[email-templates] list error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/email-templates/generate — must be before /:id routes so Express
// does not interpret the literal string "generate" as an :id param.
const GENERATE_FALLBACKS = {
  special_offer: {
    subject: 'Special offer just for you',
    body: 'We have something special waiting for you.\n\nCheck out our latest deals before they expire.\n\nWe look forward to seeing you soon!',
  },
  festival: {
    subject: 'Celebrate with us!',
    body: "It's a festive time and we want to celebrate with you.\n\nExplore our special collection and find something you'll love.\n\nWarm wishes from our team.",
  },
  normal: {
    subject: 'A message from us',
    body: "We wanted to reach out and share something with you.\n\nTake a look at what's new in our store.\n\nThank you for being a valued customer.",
  },
};

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { type, productTitle } = req.body;
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'type must be one of special_offer, festival, normal' });
    }
    const { storeName, voice } = await loadBrandData(req.shopDomain);
    const result = await generateTemplateCopy(
      req.shopDomain, storeName, type, productTitle || null, voice
    );
    return res.json(result);
  } catch (err) {
    console.warn('[email-templates] generate error:', err.message);
    const fb = GENERATE_FALLBACKS[(req.body && req.body.type)] || GENERATE_FALLBACKS.normal;
    return res.json({ ...fb, fallback: true });
  }
});

// GET /api/email-templates/count?segment=... — must be before /:id routes
router.get('/count', requireAuth, async (req, res) => {
  try {
    const segment = req.query.segment || 'everyone';
    if (!VALID_SEGMENTS.includes(segment)) {
      return res.status(400).json({ error: `segment must be one of ${VALID_SEGMENTS.join(', ')}` });
    }
    const query = buildEmailSegmentQuery(req.shopDomain, segment);
    const count = await Profile.countDocuments(query);
    return res.json({ count });
  } catch (err) {
    console.error('[email-templates] count error:', err.message);
    return res.status(500).json({ error: 'Failed to count recipients' });
  }
});

// GET /api/email-templates/:id/preview — must be before /:id
router.get('/:id/preview', requireAuth, async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template || template.shopDomain !== req.shopDomain) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const { storeName, logoUrl, primaryColor } = await loadBrandData(req.shopDomain);
    const html = buildEmailHtml({
      subject: template.subject,
      bodyHtml: template.body.replace(/\n/g, '<br>'),
      imageUrl: normalizeImageUrl(template.imageUrl),
      ctaLabel: template.ctaLabel,
      ctaUrl: template.ctaUrl,
      storeName,
      logoUrl,
      primaryColor,
    });

    return res.json({ html });
  } catch (err) {
    console.error('[email-templates] preview error:', err.message);
    return res.status(500).json({ error: 'Failed to render preview' });
  }
});

// GET /api/email-templates/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template || template.shopDomain !== req.shopDomain) {
      return res.status(404).json({ error: 'Template not found' });
    }
    return res.json({ template });
  } catch (err) {
    console.error('[email-templates] get error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// POST /api/email-templates
router.post('/', requireAuth, async (req, res) => {
  try {
    const { type, name, subject, body, imageUrl, ctaLabel, ctaUrl } = req.body;

    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'type must be one of special_offer, festival, normal' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'subject is required' });
    }
    if (!body) {
      return res.status(400).json({ error: 'body is required' });
    }

    const template = await EmailTemplate.create({
      shopDomain: req.shopDomain,
      type,
      name: name.trim(),
      subject: subject.trim(),
      body,
      imageUrl: imageUrl || null,
      ctaLabel: ctaLabel || null,
      ctaUrl: ctaUrl || null,
    });

    return res.status(201).json({ template });
  } catch (err) {
    console.error('[email-templates] create error:', err.message);
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

// PATCH /api/email-templates/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template || template.shopDomain !== req.shopDomain) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const update = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in req.body) {
        if (field === 'type' && !VALID_TYPES.includes(req.body[field])) {
          return res.status(400).json({ error: 'type must be one of special_offer, festival, normal' });
        }
        update[field] = req.body[field];
      }
    }

    // Verify required fields are not being cleared.
    const name = update.name !== undefined ? update.name : template.name;
    const subject = update.subject !== undefined ? update.subject : template.subject;
    const body = update.body !== undefined ? update.body : template.body;
    if (!name || !subject || !body) {
      return res.status(400).json({ error: 'name, subject, and body cannot be empty' });
    }

    Object.assign(template, update);
    await template.save();

    return res.json({ template });
  } catch (err) {
    console.error('[email-templates] update error:', err.message);
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/email-templates/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template || template.shopDomain !== req.shopDomain) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await template.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[email-templates] delete error:', err.message);
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

// POST /api/email-templates/:id/send
// Body: { email } — looks up the profile by email address (preferred)
//       { profileId } — looks up by MongoDB _id (backward-compat)
router.post('/:id/send', requireAuth, async (req, res) => {
  try {
    const { profileId, email: rawEmail } = req.body;
    if (!profileId && !rawEmail) {
      return res.status(400).json({ error: 'email or profileId is required' });
    }

    const template = await EmailTemplate.findById(req.params.id);
    if (!template || template.shopDomain !== req.shopDomain) {
      return res.status(404).json({ error: 'Template not found' });
    }

    let profile;
    if (rawEmail) {
      const emailLower = String(rawEmail).trim().toLowerCase();
      // Escape special regex chars so a literal email address is matched exactly.
      const safe = emailLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      profile = await Profile.findOne({
        shopDomain: req.shopDomain,
        $or: [
          { 'channels.email.address': { $regex: `^${safe}$`, $options: 'i' } },
          { 'identifiers.emails': emailLower },
        ],
      }).select('identifiers channels');
      if (!profile) {
        return res.status(404).json({ error: 'No customer found with that email' });
      }
    } else {
      profile = await Profile.findOne({ _id: profileId, shopDomain: req.shopDomain })
        .select('identifiers channels');
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }
    }

    const email =
      profile.channels?.email?.address || profile.identifiers?.emails?.[0];
    if (!email) {
      return res.status(400).json({ error: 'No email address for this profile' });
    }

    const { storeName, logoUrl, primaryColor } = await loadBrandData(req.shopDomain);
    const html = buildEmailHtml({
      subject: template.subject,
      bodyHtml: template.body.replace(/\n/g, '<br>'),
      imageUrl: normalizeImageUrl(template.imageUrl),
      ctaLabel: template.ctaLabel,
      ctaUrl: template.ctaUrl,
      storeName,
      logoUrl,
      primaryColor,
    });

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: template.subject,
      html,
      headers: UNSUBSCRIBE_HEADERS,
    });

    if (error) {
      console.error('[email-templates] Resend error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log('[email-templates] sent template', String(template._id), 'for shop', req.shopDomain);
    return res.json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('[email-templates] send error:', err.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

// POST /api/email-templates/:id/broadcast { segment }
router.post('/:id/broadcast', requireAuth, async (req, res) => {
  try {
    const { segment = 'everyone' } = req.body;
    if (!VALID_SEGMENTS.includes(segment)) {
      return res.status(400).json({ error: `segment must be one of ${VALID_SEGMENTS.join(', ')}` });
    }

    const template = await EmailTemplate.findById(req.params.id);
    if (!template || template.shopDomain !== req.shopDomain) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const query = buildEmailSegmentQuery(req.shopDomain, segment);
    const total = await Profile.countDocuments(query);

    if (total === 0) {
      return res.status(400).json({ error: 'No customers match this segment' });
    }
    if (total > BROADCAST_CAP) {
      return res.status(400).json({
        error: `Segment has ${total} recipients; Resend free tier allows ~${BROADCAST_CAP}/day. Narrow your segment or upgrade Resend.`,
        recipientCount: total,
      });
    }

    const profiles = await Profile.find(query).select('identifiers channels').lean();
    const { storeName, logoUrl, primaryColor } = await loadBrandData(req.shopDomain);

    const html = buildEmailHtml({
      subject: template.subject,
      bodyHtml: template.body.replace(/\n/g, '<br>'),
      imageUrl: normalizeImageUrl(template.imageUrl),
      ctaLabel: template.ctaLabel,
      ctaUrl: template.ctaUrl,
      storeName,
      logoUrl,
      primaryColor,
    });

    let sent = 0;
    let failed = 0;
    const logRecipients = [];

    for (const profile of profiles) {
      const email = profile.channels?.email?.address || profile.identifiers?.emails?.[0];
      if (!email) {
        failed++;
        continue;
      }
      try {
        const { data, error } = await resend.emails.send({
          from: FROM,
          to: email,
          subject: template.subject,
          html,
          headers: UNSUBSCRIBE_HEADERS,
        });
        const success = !error;
        if (!success) console.error('[email-templates] broadcast send error:', error.message);
        logRecipients.push({
          token: email,
          customerId: profile.identifiers?.customerId || null,
          success,
          errorCode: success ? null : error.message,
        });
        if (success) sent++; else failed++;
      } catch (err) {
        console.error('[email-templates] broadcast send throw:', err.message);
        logRecipients.push({ token: email, customerId: profile.identifiers?.customerId || null, success: false, errorCode: err.message });
        failed++;
      }
    }

    await logBroadcastSend({
      shopDomain: req.shopDomain,
      festivalQueueId: null,
      signalType: 'email_broadcast',
      channel: 'email',
      title: template.subject,
      body: template.body,
      imageUrl: template.imageUrl || '',
      recipients: logRecipients,
    });

    console.log(`[email-templates] broadcast ${String(template._id)}: sent=${sent} failed=${failed}`);
    return res.json({ sent, failed, total: profiles.length });
  } catch (err) {
    console.error('[email-templates] broadcast error:', err.message);
    return res.status(500).json({ error: 'Broadcast failed' });
  }
});

module.exports = router;
