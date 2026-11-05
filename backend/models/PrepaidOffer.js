const mongoose = require('mongoose');

/**
 * "Pay online and save" offer on the COD form. One per shop. Validation lives in
 * utils/prepaidOffer.sanitizeSettings; the schema only keeps the shape.
 */
const prepaidOfferSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, lowercase: true, trim: true },
  enabled: { type: Boolean, default: false },
  discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  // percent: 1-50; fixed: rupees off the order.
  value: { type: Number, default: 5 },
  // percent only: the most a customer can save (0 = no cap).
  maxDiscount: { type: Number, default: 100 },
  // Offer shown only when the order is at least this much (0 = always).
  minOrder: { type: Number, default: 0 },
  heading: { type: String, default: 'Pay online and save' },
  buttonText: { type: String, default: 'Pay online' },
  accentColor: { type: String, default: '#4F46E5' },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PrepaidOffer', prepaidOfferSchema);
