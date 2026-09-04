const mongoose = require('mongoose');

const stepSchema = new mongoose.Schema({
  delayMinutes: { type: Number, required: true },
  channel: { type: String, enum: ['push'], default: 'push' },
  title: { type: String, required: true },
  body: { type: String, required: true },
  imageSource: {
    type: String,
    enum: ['product', 'none'],
    default: 'product'
  },
}, { _id: false });

const automationRuleSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, index: true },
  name: { type: String, required: true },
  trigger: {
    type: String,
    required: true,
    enum: ['browse_abandon', 'cart_abandon', 'checkout_abandon', 'back_in_interest'],
  },
  conditions: { type: mongoose.Schema.Types.Mixed, default: {} },
  steps: { type: [stepSchema], default: [] },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AutomationRule', automationRuleSchema);
