const mongoose = require('mongoose');

const automationConfigSchema = new mongoose.Schema({
  shopDomain: {
    type: String, required: true, unique: true, lowercase: true
  },
  // Master on/off switch
  enabled: { type: Boolean, default: true },

  // Brain run time (nightly automation)
  brainRunHour: { type: Number, default: 2 },   // 0-23, IST
  brainRunMinute: { type: Number, default: 0 },  // 0-59

  // Signal delays (how long after event before sending)
  // in minutes
  cartAbandonDelay: { type: Number, default: 60 },
  checkoutAbandonDelay: { type: Number, default: 60 },
  browseAbandonDelay: { type: Number, default: 30 },
  lapsingDelay: { type: Number, default: 0 },    // 0 = send at brain run time
  winbackDelay: { type: Number, default: 0 },
  pageVisitDelay: { type: Number, default: 60 }, // minutes

  // Which signals are enabled
  enabledSignals: {
    cart_abandon: { type: Boolean, default: true },
    checkout_abandon: { type: Boolean, default: true },
    browse_abandon: { type: Boolean, default: true },
    high_intent: { type: Boolean, default: true },
    price_hesitation: { type: Boolean, default: true },
    lapsing: { type: Boolean, default: true },
    winback: { type: Boolean, default: true },
    email_capture: { type: Boolean, default: true },
    post_purchase_d3: { type: Boolean, default: true },
    price_drop: { type: Boolean, default: true },
    back_in_stock: { type: Boolean, default: true },
    cod_to_prepaid: { type: Boolean, default: true },
    page_visit: { type: Boolean, default: true },
  },

  // Real-time triggers (send immediately when signal fires)
  realtimeTriggers: {
    cart_abandon: { type: Boolean, default: false },
    checkout_abandon: { type: Boolean, default: false },
    page_visit: { type: Boolean, default: false },
  },

}, { timestamps: true });

module.exports = mongoose.model('AutomationConfig',
  automationConfigSchema);
