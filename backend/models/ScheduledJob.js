const mongoose = require('mongoose');

const scheduledJobSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, index: true },
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationRule', required: true },
  stepIndex: { type: Number, required: true, default: 0 },

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
  payload: { type: mongoose.Schema.Types.Mixed },  // resolved title/body/imageUrl at send time

  createdAt: { type: Date, default: Date.now },
  sentAt: { type: Date },
  error: { type: String },
});

// Compound index for the sender's poll query.
scheduledJobSchema.index({ status: 1, runAt: 1 });

module.exports = mongoose.model('ScheduledJob', scheduledJobSchema);
