// Extracted broadcast logic shared by /:id/broadcast route and
// processFestivalQueue (server.js). Both paths need to send the same
// HTML to every non-suppressed subscriber without duplicating the loop.
//
// sendEmailBroadcast({ shopDomain, templateId, subject, logOrigin })
//   shopDomain  — the shop to send for
//   templateId  — EmailTemplate._id (ObjectId or string)
//   subject     — override subject (falls back to template.subject if omitted)
//   logOrigin   — 'scheduled' | 'manual' (passed to logBroadcastSend)
//   festivalQueueId — ObjectId, written to ScheduledJob rows (optional)
//
// Returns { sent, failed, total, error? }
// Never throws — catches internally and returns { sent:0, failed:0, error }.

const mongoose = require('mongoose');
const { Resend } = require('resend');
const EmailTemplate = require('../models/EmailTemplate');
const Profile = require('../models/Profile');
const Store = require('../models/Store');
const { FROM } = require('./email');
const { buildUnsubscribeHeaders, buildUnsubscribeUrl } = require('./unsubscribeToken');
const { logBroadcastSend } = require('../services/sendLogService');
const { renderEmailDocument } = require('./emailEngine');
const { designFromTemplate } = require('./emailDesign');

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_no_key');

const VALID_SEGMENTS = ['everyone', 'email_captured', 'has_cart', 'bought_once', 'going_quiet'];
const BROADCAST_CAP = 90;

function tagEmailCtaUrl(url, jobId) {
  if (!url || !/^https:\/\//i.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}ccf_src=email&ccf_job=${jobId}`;
}

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

async function sendEmailBroadcast({
  shopDomain,
  templateId,
  subject: subjectOverride,
  segment = 'everyone',
  logOrigin = 'scheduled',
  festivalQueueId = null,
}) {
  try {
    if (!VALID_SEGMENTS.includes(segment)) segment = 'everyone';

    const template = await EmailTemplate.findOne({ _id: templateId, shopDomain });
    if (!template) return { sent: 0, failed: 0, total: 0, error: 'Template not found' };

    const query = buildEmailSegmentQuery(shopDomain, segment);
    const total = await Profile.countDocuments(query);
    if (total === 0) return { sent: 0, failed: 0, total: 0, error: 'No recipients in segment' };
    if (total > BROADCAST_CAP) {
      return { sent: 0, failed: 0, total, error: `Segment too large (${total} > ${BROADCAST_CAP})` };
    }

    const profiles = await Profile.find(query).select('identifiers channels').lean();

    const store = await Store.findOne({ shopDomain }).select('shopName logoUrl primaryColor').lean();
    const storeCtx = {
      shopName: store?.shopName || shopDomain,
      logoUrl: store?.logoUrl || null,
      primaryColor: store?.primaryColor || null,
      shopDomain,
    };

    const broadcastJobId = new mongoose.Types.ObjectId();
    const baseDesign = designFromTemplate(template, storeCtx, { placeholder: false });
    baseDesign.ctaUrl = tagEmailCtaUrl(baseDesign.ctaUrl, broadcastJobId);
    if (subjectOverride) baseDesign.subject = subjectOverride;
    const finalSubject = subjectOverride || template.subject;

    let sent = 0;
    let failed = 0;
    const logRecipients = [];

    for (const profile of profiles) {
      const email = profile.channels?.email?.address || profile.identifiers?.emails?.[0];
      if (!email) { failed++; continue; }
      const profileId = String(profile._id);
      const perDesign = Object.assign({}, baseDesign, {
        unsubscribeUrl: buildUnsubscribeUrl(shopDomain, profileId),
      });
      const html = renderEmailDocument(perDesign);
      const headers = buildUnsubscribeHeaders(shopDomain, profileId);
      try {
        const { error } = await resend.emails.send({
          from: FROM,
          to: email,
          subject: finalSubject,
          html,
          headers,
        });
        const success = !error;
        if (!success) console.error('[emailBroadcast] Resend error:', error.message);
        logRecipients.push({
          token: email,
          customerId: profile.identifiers?.customerId || null,
          success,
          errorCode: success ? null : error.message,
        });
        if (success) sent++; else failed++;
      } catch (err) {
        console.error('[emailBroadcast] send throw:', err.message);
        logRecipients.push({ token: email, customerId: profile.identifiers?.customerId || null, success: false, errorCode: err.message });
        failed++;
      }
    }

    await logBroadcastSend({
      shopDomain,
      festivalQueueId,
      signalType: 'email_broadcast',
      channel: 'email',
      title: finalSubject,
      body: template.body || '',
      imageUrl: template.imageUrl || '',
      recipients: logRecipients,
      origin: logOrigin,
    });

    return { sent, failed, total: profiles.length };
  } catch (err) {
    console.error('[emailBroadcast] error:', err.message);
    return { sent: 0, failed: 0, total: 0, error: err.message };
  }
}

module.exports = { sendEmailBroadcast };
