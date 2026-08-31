const mongoose = require('mongoose');

const PushSubscriptionSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true },
  token: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
