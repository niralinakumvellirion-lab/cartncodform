const ScheduledJob = require('../models/ScheduledJob');

/**
 * Per-recipient send log for broadcast-shaped pushes (festival queue +
 * manual "Send Now" — audits/queue-notification-detail-audit.txt finding
 * #2). Reuses ScheduledJob rather than a new collection: it already has
 * exactly this per-recipient shape, and the admin already has query/list
 * plumbing for it (routes/queue.js).
 *
 * Write shape differs from brain/automation jobs on purpose: those are
 * created 'pending' and claimed/updated in place by the poller. A
 * festival/manual push is a synchronous broadcast — by the time this
 * runs, the FCM call has already happened — so every row here is
 * inserted already-'sent', with `outcome` set straight from that token's
 * own FCM response ('delivered' or 'failed') instead of being left null
 * for a later click/convert update.
 *
 * One row per TOKEN, not merged per customer, even though mobile and
 * desktop are sent as two separate passes today (server.js
 * processFestivalQueue, routes/push.js POST /send-store): each pass
 * carries its own device-specific image, so a customer subscribed on
 * both devices genuinely receives two different notification payloads
 * with independent success/failure outcomes. Merging them into one row
 * would lose that (which image, which outcome) with no non-arbitrary way
 * to pick a winner when one leg succeeds and the other fails.
 */

const LOG_BATCH_SIZE = 500;

/**
 * @param {object} opts
 * @param {string} opts.shopDomain
 * @param {string|null} [opts.festivalQueueId] - null for manual send-store sends
 * @param {string} opts.signalType - 'festival' | 'manual'
 * @param {string} [opts.channel] - defaults to 'push'
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.imageUrl]
 * @param {Array<{token:string, customerId:?string, cartToken:?string, sessionId:?string, success:boolean, errorCode:?string}>} opts.recipients
 */
async function logBroadcastSend({
  shopDomain,
  festivalQueueId = null,
  signalType,
  channel = 'push',
  title,
  body,
  imageUrl = '',
  recipients,
}) {
  if (!recipients || !recipients.length) return;

  const now = new Date();
  const rows = recipients.map((r) => ({
    shopDomain,
    festivalQueueId,
    signalType,
    channel,
    status: 'sent',
    subscriptionToken: r.token,
    customerId: r.customerId || null,
    cartToken: r.cartToken || null,
    sessionId: r.sessionId || null,
    payload: { title, body, imageUrl: imageUrl || '' },
    outcome: r.success ? 'delivered' : 'failed',
    runAt: now,
    sentAt: now,
  }));

  try {
    for (let i = 0; i < rows.length; i += LOG_BATCH_SIZE) {
      await ScheduledJob.insertMany(rows.slice(i, i + LOG_BATCH_SIZE), { ordered: false });
    }
  } catch (err) {
    // The push itself already happened — a logging failure must never
    // surface as a send failure to the caller.
    console.error('[send-log] insertMany error:', err.message);
  }
}

module.exports = { logBroadcastSend };
