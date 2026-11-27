const mongoose = require('mongoose');

// One shopper waiting for a lower price on one variant, on one channel.
const PriceDropRequestSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, index: true },
  productId: { type: String, required: true },
  variantId: { type: String, required: true },
  productTitle: { type: String, default: '' },
  variantTitle: { type: String, default: '' },
  productHandle: { type: String, default: '' },
  imageUrl: { type: String, default: '' },

  channel: { type: String, enum: ['push', 'email', 'whatsapp'], required: true },
  pushToken: { type: String, default: null },
  email: { type: String, default: null, lowercase: true, trim: true },
  phone: { type: String, default: null }, // E.164
  customerId: { type: String, default: null },
  sessionId: { type: String, default: null },
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', default: null },

  // Price when the shopper asked (set by the first server-side check, not trusted from the browser),
  // and the lower price that triggered the alert. Shop currency, e.g. 1499.00.
  basePrice: { type: Number, default: null },
  dropPrice: { type: Number, default: null },
  currencyCode: { type: String, default: null },

  status: {
    type: String,
    // ready = price dropped, WhatsApp shopper waiting for the seller to send it by hand
    enum: ['waiting', 'ready', 'sending', 'sent', 'failed', 'expired'],
    default: 'waiting',
    index: true,
  },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledJob', default: null },
  error: { type: String, default: null },
  claimedAt: { type: Date, default: null },
  readyAt: { type: Date, default: null },
  sellerNotifiedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  sentAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});

PriceDropRequestSchema.index({ shopDomain: 1, status: 1, variantId: 1, createdAt: 1 });
PriceDropRequestSchema.index(
  { shopDomain: 1, variantId: 1, channel: 1, pushToken: 1, email: 1, phone: 1 },
  { unique: true, partialFilterExpression: { status: 'waiting' }, name: 'pricedrop_waiting_unique' }
);
PriceDropRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('PriceDropRequest', PriceDropRequestSchema);
