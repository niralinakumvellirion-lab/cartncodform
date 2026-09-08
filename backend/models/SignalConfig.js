const mongoose = require('mongoose');

/**
 * Per-shop, per-signal-type configuration for the Brain (Phase C).
 * Replaces AutomationRule. A missing row means the defaults below:
 * enabled = true, no channel override, one step.
 */
const signalConfigSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true },
  signalType: {
    type: String,
    required: true,
    enum: [
      'cart_abandon', 'checkout_abandon', 'browse_abandon',
      'high_intent', 'price_hesitation', 'price_drop', 'back_in_stock',
      'post_purchase_d3', 'lapsing', 'winback', 'email_capture', 'cod_to_prepaid',
    ],
  },
  enabled: { type: Boolean, default: true },
  channelOverride: { type: String, enum: ['push', 'email', null], default: null },
  maxSteps: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now },
});

signalConfigSchema.index({ shopDomain: 1, signalType: 1 }, { unique: true });

module.exports = mongoose.model('SignalConfig', signalConfigSchema);
