const mongoose = require('mongoose');

const festivalQueueSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  mobileImageUrl: { type: String, default: '' },
  desktopImageUrl: { type: String, default: '' },
  scheduledAt: { type: Date, required: true },
  // Links documents created together as one multi-date campaign (one
  // document per date — audits/multi-date-festival-audit.txt design (a)).
  // null for every ungrouped/single-date item, including every document
  // that existed before this field was added — no migration needed.
  groupId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  festival: { type: String, default: '' },
  targetType: { type: String, enum: ['home', 'product'], default: 'home' },
  productId: { type: String, default: '' },
  productHandle: { type: String, default: '' },
  productTitle: { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'approved', 'sent', 'cancelled'],
    default: 'draft'
  },
  sentAt: { type: Date },
  recipientCount: { type: Number, default: 0 },
  // Consecutive failed send attempts by processFestivalQueue() in
  // server.js — reset is not needed since a successful send moves the
  // item to status 'sent' (this field just stops mattering at that
  // point); capped at FESTIVAL_MAX_FAILED_ATTEMPTS there, past which the
  // item is marked 'cancelled' instead of retrying forever.
  failedAttempts: { type: Number, default: 0 },
  channel: { type: String, enum: ['push', 'email', 'whatsapp'], default: 'push' },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate', default: null },
  subject: { type: String, default: '' },
  segment: {
    type: String,
    enum: ['everyone', 'email_captured', 'has_cart', 'bought_once', 'going_quiet'],
    default: 'everyone',
  },
  // Claimed by a poller tick before sending; cleared on retry so the next tick
  // can pick it up. Null means unclaimed. A claim older than 15 min is stale
  // (the poller likely crashed) and may be reclaimed by the next tick.
  sendClaimedAt: { type: Date, default: null },
  // True when this doc was created by the reschedule-copy endpoint (a merchant
  // chose to resend a previously-sent notification on a new date). The original
  // sent doc is never modified; this is a fresh draft copy of its content.
  isResend: { type: Boolean, default: false },
  // True when this broadcast was sent with a ?ccf_job tracking URL so that
  // click / revisit attribution is available. False/absent for rows created
  // before this feature was deployed — those are reported as "not_tracked".
  tracked: { type: Boolean, default: false },
  // True for docs created by routes/push.js send-store (manual "Send Now"
  // broadcasts). These are attribution-only records — they must never appear
  // in the Queue / Campaign screens or be picked up by the festival poller.
  // Poller safety is guaranteed by status='sent'; this flag is the display
  // guard for calendar + duplicate-check queries that have no status filter.
  isManualSend: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('FestivalQueue', festivalQueueSchema);
