const mongoose = require('mongoose');

const storefrontEventSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, index: true },
  sessionId:  { type: String, index: true },   // Shopify cart token
  customerId: { type: String, index: true },   // Shopify customer id (logged-in only)
  token:      { type: String },                // FCM push token (subscribed only)
  type:       { type: String, required: true }, // event type
  path:       { type: String },
  pageType:   { type: String },
  meta:       { type: mongoose.Schema.Types.Mixed }, // event-specific data
  ts:         { type: Date, default: Date.now, index: true },
});

// Auto-delete events older than 90 days.
storefrontEventSchema.index({ ts: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('StorefrontEvent', storefrontEventSchema);
