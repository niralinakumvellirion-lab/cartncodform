const mongoose = require('mongoose');

// "Back in stock" settings — one per shop. Words/colours of the storefront "Notify me" box and the
// message texts. Defaults + caps live in utils/restock.js.
const RestockConfigSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, unique: true },
  enabled: { type: Boolean, default: false },
  channels: {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    // WhatsApp: the shopper leaves a number; the seller sends the alert by hand (wa.me link).
    whatsapp: { type: Boolean, default: false },
  },
  // Email alerts wait this long after the restock (WhatsApp + push go first).
  emailDelayMinutes: { type: Number, default: 60 },
  accentColor: { type: String, default: '#111827' },
  buttonRadius: { type: Number, default: 8 },
  texts: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Poller bookkeeping: last stock check for this shop.
  lastCheckedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('RestockConfig', RestockConfigSchema);
