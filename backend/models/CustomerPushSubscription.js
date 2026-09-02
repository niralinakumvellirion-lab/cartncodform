const mongoose = require('mongoose');

const CustomerPushSubscriptionSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true },
  token: { type: String, required: true, unique: true },
  page: { type: String },
  deviceType: { type: String, enum: ['mobile', 'desktop', 'unknown'], default: 'unknown' },
  cartToken: { type: String, trim: true, index: true },
  createdAt: { type: Date, default: Date.now },
  // Last storefront activity recorded for this subscriber (POST /api/push/cart-activity).
  lastEvent: { type: String },
  lastActivityUrl: { type: String },
  lastActivityAt: { type: Date },
});

module.exports = mongoose.model('CustomerPushSubscription', CustomerPushSubscriptionSchema);
