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

  channel: { type: String, enum: ['push', 'email', 'whatsapp'], required: true },
  pushToken: { type: String, default: null }, // FCM token (push only)
  email: { type: String, default: null, lowercase: true, trim: true }, // email only
  phone: { type: String, default: null }, // WhatsApp only, E.164
  customerId: { type: String, default: null },
  sessionId: { type: String, default: null },
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', default: null },

  status: {
    type: String,
    // ready = back in stock, WhatsApp shopper waiting for the seller to send it by hand
    enum: ['waiting', 'ready', 'sending', 'sent', 'failed', 'expired'],
    default: 'waiting',
    index: true,
  },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledJob', default: null },
  error: { type: String, default: null },
  claimedAt: { type: Date, default: null }, // set while the sender works on it
  readyAt: { type: Date, default: null }, // when the variant was seen back in stock (email delay counts from here)
  sellerNotifiedAt: { type: Date, default: null }, // seller reminded to send the WhatsApp
  createdAt: { type: Date, default: Date.now },
  sentAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});

RestockRequestSchema.index({ shopDomain: 1, status: 1, variantId: 1, createdAt: 1 });
// One waiting request per shopper + variant + channel. (v2 adds phone; the v1 index without it is
// dropped by services/restock.js dropOldIndex() so two WhatsApp shoppers can wait for one size.)
RestockRequestSchema.index(
  { shopDomain: 1, variantId: 1, channel: 1, pushToken: 1, email: 1, phone: 1 },
  { unique: true, partialFilterExpression: { status: 'waiting' }, name: 'restock_waiting_unique_v2' }
);
// Finished requests are kept 180 days for the results numbers, then removed.
RestockRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('RestockRequest', RestockRequestSchema);
