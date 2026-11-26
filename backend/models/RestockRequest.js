const mongoose = require('mongoose');

// One shopper waiting for one sold-out variant on one channel ("Notify me" on the product page).
const RestockRequestSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, index: true },
  productId: { type: String, required: true },
  variantId: { type: String, required: true },
  productTitle: { type: String, default: '' },
  variantTitle: { type: String, default: '' },
  productHandle: { type: String, default: '' },
  imageUrl: { type: String, default: '' },

  channel: { type: String, enum: ['push', 'email'], required: true },
  pushToken: { type: String, default: null }, // FCM token (push only)
  email: { type: String, default: null, lowercase: true, trim: true }, // email only
  customerId: { type: String, default: null },
  sessionId: { type: String, default: null },
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', default: null },

  status: {
    type: String,
    enum: ['waiting', 'sending', 'sent', 'failed', 'expired'],
    default: 'waiting',
    index: true,
  },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledJob', default: null },
  error: { type: String, default: null },
  claimedAt: { type: Date, default: null }, // set while the sender works on it
  createdAt: { type: Date, default: Date.now },
  sentAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});

RestockRequestSchema.index({ shopDomain: 1, status: 1, variantId: 1, createdAt: 1 });
// One waiting request per shopper + variant + channel.
RestockRequestSchema.index(
  { shopDomain: 1, variantId: 1, channel: 1, pushToken: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: 'waiting' } }
);
// Finished requests are kept 180 days for the results numbers, then removed.
RestockRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('RestockRequest', RestockRequestSchema);
