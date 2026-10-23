const mongoose = require('mongoose');

const attributedEventSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledJob' },
  // Set when the attributing ccf_job resolved to a FestivalQueue _id (festival /
  // manual broadcast). Mutually exclusive with jobId for a given row.
  festivalQueueId: { type: mongoose.Schema.Types.ObjectId, ref: 'FestivalQueue' },
  sessionId: { type: String },
  email: { type: String },
  eventType: {
    type: String,
    enum: ['revisit', 'add_to_cart', 'checkout_start', 'purchase'],
    required: true
  },
  meta: { type: Object, default: {} },
  ts: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

// TTL: auto-delete after 90 days
attributedEventSchema.index({ ts: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
attributedEventSchema.index({ shopDomain: 1, ts: -1 });
attributedEventSchema.index({ shopDomain: 1, eventType: 1, ts: -1 });
// Per-job and per-festival-queue lookup indexes (previously missing).
attributedEventSchema.index({ shopDomain: 1, jobId: 1 });
attributedEventSchema.index({ shopDomain: 1, festivalQueueId: 1 });

module.exports = mongoose.model('AttributedEvent', attributedEventSchema);
