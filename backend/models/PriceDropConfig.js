const mongoose = require('mongoose');

// "Price drop" settings — one per shop. Words/colours of the storefront "Notify me if the price drops"
// button + panel and the message texts. Defaults + caps live in utils/priceDrop.js.
const PriceDropConfigSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, unique: true },
  enabled: { type: Boolean, default: false },
  channels: {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    // WhatsApp: the shopper leaves a number; the seller sends the alert by hand (wa.me link).
    whatsapp: { type: Boolean, default: false },
  },
  // Only alert when the price falls at least this much below the price at sign-up.
  minDropPercent: { type: Number, default: 5 },
  // Chance ring: WhatsApp adds this %, email the rest (shown when both are on).
  whatsappPercent: { type: Number, default: 80 },
  accentColor: { type: String, default: '#111827' },
  buttonRadius: { type: Number, default: 8 },
  texts: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastCheckedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PriceDropConfig', PriceDropConfigSchema);
