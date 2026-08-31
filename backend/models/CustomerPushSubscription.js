const mongoose = require('mongoose');

const CustomerPushSubscriptionSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true },
  token: { type: String, required: true, unique: true },
  page: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('CustomerPushSubscription', CustomerPushSubscriptionSchema);
