'use strict';

/**
 * "Back in stock" sender — run from the 30 s poller (server.js runPollerTick).
 *
 * Per shop with waiting requests, at most every CHECK_EVERY_MS:
 *   1. skip when the feature is off, the store is suspended / uninstalled, automation or the
 *      back_in_stock signal is switched off, or it is quiet hours (checked again later);
 *   2. ask Shopify which waited-for variants can be bought again (ProductVariant.availableForSale —
 *      needs only read_products);
 *   3. send to the oldest waiting shoppers of those variants, at most WAVE per check (so a small
 *      restock doesn't alert everyone at once), stopping at the plan's monthly message limit.
 * Each send is logged as a ScheduledJob (signalType back_in_stock) so it shows in the dashboards,
 * counts toward the plan and carries click attribution (ccf_src / ccf_job).
 * Message words resolve here, at send time. Emails and tokens are never logged.
 */

const RestockConfig = require('../models/RestockConfig');
const RestockRequest = require('../models/RestockRequest');
const ScheduledJob = require('../models/ScheduledJob');
const Store = require('../models/Store');
const Profile = require('../models/Profile');
const AutomationConfig = require('../models/AutomationConfig');
const PurchaseRecord = require('../models/PurchaseRecord');
const { withDefaults, buildMessage, sizeLabel } = require('../utils/restock');

const CHECK_EVERY_MS = 5 * 60 * 1000;
const WAVE = 25;
const STUCK_MS = 15 * 60 * 1000;
const MAX_VARIANTS = 250;

function defaultDeps() {
  return {
    graphQL: (...a) => require('../utils/shopifyGraphQL').shopifyGraphQL(...a),
    sendPush: (...a) => require('../utils/pushNotification').sendPushToTokens(...a),
    sendEmail: (...a) => require('../utils/email').sendMarketingEmail(...a),
    isAtLimit: (...a) => require('../utils/planUsage').isAtLimit(...a),
    isQuietNow: (...a) => require('../utils/timezone').isQuietNow(...a),
    hasActivePlan: (...a) => require('../utils/planAccess').hasActivePlan(...a),
    hashEmail: (...a) => require('../utils/reviewsCore').hashEmail(...a),
  };
}

const AVAILABILITY_QUERY = `query RestockAvailability($ids: [ID!]!) {
  nodes(ids: $ids) { ... on ProductVariant { id availableForSale } }
}`;

/** Which of these numeric variant ids can be bought now. */
async function availableVariants(shop, accessToken, variantIds, deps) {
  const out = new Set();
  for (let i = 0; i < variantIds.length; i += 100) {
    const ids = variantIds.slice(i, i + 100).map((v) => `gid://shopify/ProductVariant/${v}`);
    const data = await deps.graphQL(shop, accessToken, AVAILABILITY_QUERY, { ids });
    for (const n of (data && data.nodes) || []) {
      if (n && n.availableForSale === true && typeof n.id === 'string') out.add(n.id.split('/').pop());
    }
  }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function emailHtml(msg, request, accent) {
  const img = request.imageUrl
    ? `<p style="margin:0 0 16px"><img src="${escapeHtml(request.imageUrl)}" alt="" width="120" style="border-radius:10px;display:block"></p>`
    : '';
  return `${img}<p style="margin:0 0 20px">${escapeHtml(msg.body)}</p>`
    + `<p style="margin:0"><a href="${escapeHtml(msg.url)}" style="display:inline-block;background:${escapeHtml(accent)};color:#fff;`
    + 'text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Shop now</a></p>';
}

async function alreadyBought(request, deps) {
  const or = [];
  if (request.customerId) or.push({ customerId: request.customerId });
  const hash = request.email ? deps.hashEmail(request.email) : null;
  if (hash) or.push({ emailHash: hash });
  if (!or.length) return false;
  const hit = await PurchaseRecord.exists({
    shopDomain: request.shopDomain,
    productIds: request.productId,
    createdAt: { $gte: request.createdAt },
    $or: or,
  });
  return !!hit;
}

/** Send one claimed request. Returns 'sent' | 'failed' | 'skipped'. */
async function sendOne(request, settings, deps, now) {
  const finish = (status, error) => RestockRequest.updateOne(
    { _id: request._id },
    { $set: { status, error: error || null, sentAt: status === 'sent' ? now : null, claimedAt: null } }
  );

  if (await alreadyBought(request, deps)) {
    await finish('expired', 'already_bought');
    return 'skipped';
  }
  if (request.channel === 'email' && request.profileId) {
    const prof = await Profile.findById(request.profileId).select('suppressed').lean();
    if (prof && prof.suppressed) {
      await finish('failed', 'unsubscribed');
      return 'skipped';
    }
  }

  const job = await ScheduledJob.create({
    shopDomain: request.shopDomain,
    profileId: request.profileId || null,
    signalType: 'back_in_stock',
    reason: `Asked to hear when ${sizeLabel(request.variantTitle)} is back`,
    channel: request.channel,
    status: 'pending',
    runAt: now,
    origin: 'automated',
    customerId: request.customerId || undefined,
    sessionId: request.sessionId || undefined,
    productHandle: request.productHandle || null,
  });
  const msg = buildMessage(settings, request, request.shopDomain, String(job._id));

  let ok = false;
  let error = null;
  try {
    if (request.channel === 'push') {
      const r = await deps.sendPush(request.shopDomain, [request.pushToken], {
        title: msg.title, body: msg.body, url: msg.url, imageUrl: request.imageUrl || null,
      });
      ok = !!(r && r.success && r.sent > 0);
      if (!ok) error = (r && (r.errorCode || r.error)) || 'not_delivered';
    } else {
      const r = await deps.sendEmail(
        request.email, msg.subject, emailHtml(msg, request, settings.accentColor),
        request.shopDomain, request.profileId || null
      );
      ok = !!(r && r.success);
      if (!ok) error = (r && r.skipped) ? 'email_not_configured' : 'email_failed';
    }
  } catch (err) {
    error = String(err.message || 'send_error').slice(0, 120);
  }

  const payload = request.channel === 'push'
    ? { title: msg.title, body: msg.body, url: msg.url, imageUrl: request.imageUrl || null }
    : { subject: msg.subject, body: msg.body, url: msg.url };
  await ScheduledJob.updateOne(
    { _id: job._id },
    { $set: ok ? { status: 'sent', sentAt: now, payload } : { status: 'failed', error, payload } }
  );
  await RestockRequest.updateOne(
    { _id: request._id },
    { $set: { status: ok ? 'sent' : 'failed', error: ok ? null : error, sentAt: ok ? now : null, jobId: job._id, claimedAt: null } }
  );
  if (ok && request.profileId) {
    await Profile.updateOne({ _id: request.profileId }, {
      $push: {
        messages: {
          $each: [{ channel: request.channel, type: 'back_in_stock', sentAt: now, outcome: 'sent', jobId: job._id }],
          $slice: -20,
        },
      },
    }).catch(() => {});
  }
  return ok ? 'sent' : 'failed';
}

/** One shop: returns a small summary (for logs/tests). */
async function processShop(shop, deps, now) {
  const summary = { shop, checked: 0, available: 0, sent: 0, failed: 0, skipped: 0, reason: null };

  const cfgDoc = await RestockConfig.findOne({ shopDomain: shop }).lean();
  if (!cfgDoc || !cfgDoc.enabled) { summary.reason = 'off'; return summary; }

  // Claim this shop's check slot so overlapping ticks / instances don't double-check.
  const claimed = await RestockConfig.findOneAndUpdate(
    {
      shopDomain: shop,
      $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lte: new Date(now.getTime() - CHECK_EVERY_MS) } }],
    },
    { $set: { lastCheckedAt: now } },
    { new: true }
  ).lean();
  if (!claimed) { summary.reason = 'not_due'; return summary; }
  const settings = withDefaults(claimed);

  const store = await Store.findOne({ shopDomain: shop })
    .select('shopDomain accessToken timezone quietHours suspended plan planTier isInternal subscriptionStatus').lean();
  if (!store || store.suspended || !deps.hasActivePlan(store) || !store.accessToken) {
    summary.reason = 'store_inactive';
    return summary;
  }
  const auto = await AutomationConfig.findOne({ shopDomain: shop }).select('enabled enabledSignals').lean();
  if (auto && (auto.enabled === false || (auto.enabledSignals && auto.enabledSignals.back_in_stock === false))) {
    summary.reason = 'automation_off';
    return summary;
  }
  if (deps.isQuietNow(store, now)) { summary.reason = 'quiet_hours'; return summary; }

  const variantIds = (await RestockRequest.distinct('variantId', { shopDomain: shop, status: 'waiting' }))
    .slice(0, MAX_VARIANTS);
  summary.checked = variantIds.length;
  if (!variantIds.length) return summary;

  let available;
  try {
    available = await availableVariants(shop, store.accessToken, variantIds, deps);
  } catch (err) {
    console.error('[restock] stock check failed for', shop, '-', err.message);
    summary.reason = 'stock_check_failed';
    return summary;
  }
  summary.available = available.size;
  if (!available.size) return summary;

  const due = await RestockRequest.find({ shopDomain: shop, status: 'waiting', variantId: { $in: [...available] } })
    .sort({ createdAt: 1 })
    .limit(WAVE)
    .lean();

  for (const r of due) {
    if (await deps.isAtLimit(store, 'messages')) { summary.reason = 'plan_limit'; break; }
    const mine = await RestockRequest.findOneAndUpdate(
      { _id: r._id, status: 'waiting' },
      { $set: { status: 'sending', claimedAt: now } },
      { new: true }
    ).lean();
    if (!mine) continue;
    const result = await sendOne(mine, settings, deps, now);
    summary[result] += 1;
  }
  if (summary.sent || summary.failed) {
    console.log(`[restock] ${shop}: ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped`);
  }
  return summary;
}

async function processRestock(options = {}) {
  const deps = { ...defaultDeps(), ...(options.deps || {}) };
  const now = options.now || new Date();

  await RestockRequest.updateMany(
    { status: 'waiting', expiresAt: { $lte: now } },
    { $set: { status: 'expired', error: 'timed_out' } }
  );
  // A sender that crashed mid-send leaves 'sending' rows: put them back in the queue.
  await RestockRequest.updateMany(
    { status: 'sending', claimedAt: { $lte: new Date(now.getTime() - STUCK_MS) } },
    { $set: { status: 'waiting', claimedAt: null } }
  );

  const shops = await RestockRequest.distinct('shopDomain', { status: 'waiting' });
  const results = [];
  for (const shop of shops) {
    try {
      results.push(await processShop(shop, deps, now));
    } catch (err) {
      console.error('[restock] shop error', shop, '-', err.message);
    }
  }
  return results;
}

module.exports = { processRestock, processShop, availableVariants, CHECK_EVERY_MS, WAVE };
