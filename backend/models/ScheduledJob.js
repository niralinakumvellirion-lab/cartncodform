const mongoose = require('mongoose');

const scheduledJobSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, index: true },
  // Phase C: brain-scheduled jobs carry no ruleId — relaxed from `required`.
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationRule', default: null },
  stepIndex: { type: Number, required: true, default: 0 },

  // --- Phase C: brain targeting / explainability ---
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', default: null },
  signalType: { type: String, default: null },
  reason: { type: String, default: '' }, // human-readable why

  // Targeting — at least one of these should be present.
  subscriptionToken: { type: String },  // FCM token, if already resolved
  sessionId: { type: String, index: true },  // stable UUID (StorefrontEvent.sessionId)
  cartToken: { type: String, index: true },  // Shopify cart token, for cancellation matching
  customerId: { type: String, index: true },

  runAt: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'sent', 'cancelled', 'failed', 'skipped'],
    default: 'pending',
    index: true,
  },
  channel: { type: String, enum: ['push', 'email'], default: 'push' },
  payload: { type: mongoose.Schema.Types.Mixed },  // resolved title/body/imageUrl at send time

  // Phase C2: outcome of the send, updated by attribution (click) + order webhook (convert).
  outcome: {
    type: String,
    enum: ['delivered', 'clicked', 'converted', 'failed', 'skipped'],
    default: null,
  },
  clickedAt: { type: Date, default: null },

  // Phase G3: createdAt + updatedAt are managed by { timestamps: true } below.
  sentAt: { type: Date },
  error: { type: String },
}, { timestamps: true });

// Compound index for the sender's poll query.
scheduledJobSchema.index({ status: 1, runAt: 1 });

// Prevent duplicate first-step scheduling for the same rule+cart+step
// when carts/create and carts/update fire near-simultaneously.
// Phase C: scoped to rule-based jobs (ruleId is an ObjectId) so brain jobs,
// which have ruleId=null and share cartToken+stepIndex, are NOT deduped here.
scheduledJobSchema.index(
  { shopDomain: 1, ruleId: 1, cartToken: 1, stepIndex: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending', 'sent'] },
      ruleId: { $type: 'objectId' },
    },
  }
);

// Phase C: one pending brain job per (profile, signal) at a time.
scheduledJobSchema.index(
  { shopDomain: 1, profileId: 1, signalType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending',
      profileId: { $type: 'objectId' },
    },
  }
);

module.exports = mongoose.model('ScheduledJob', scheduledJobSchema);
