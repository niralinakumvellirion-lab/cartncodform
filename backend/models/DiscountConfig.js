const mongoose = require('mongoose');

/**
 * Per-shop discount configuration (discount-feature).
 *
 * A row is created/updated the first time a merchant saves the Discounts
 * screen. Each of the four "action" sub-docs controls the automatic Shopify
 * discount code generated when a storefront visitor completes that action in
 * the push prompt:
 *   pushDiscount  — visitor allows browser push notifications
 *   emailDiscount — visitor leaves an email address
 *   phoneDiscount — visitor leaves a phone number
 *   bothDiscount  — visitor leaves BOTH email and phone (a "VIP" reward)
 *
 * All sub-docs default to enabled:false so nothing is generated until the
 * merchant explicitly turns an action on.
 */
const discountConfigSchema = new mongoose.Schema({
  shopDomain: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },

  // Per-action discount percentages / limits.
  pushDiscount: {
    enabled: { type: Boolean, default: false },
    percentage: { type: Number, default: 10, min: 0, max: 100 },
    maxUses: { type: Number, default: 100 },
    expiryDays: { type: Number, default: 7 },
    prefix: { type: String, default: 'PUSH' },
  },
  emailDiscount: {
    enabled: { type: Boolean, default: false },
    percentage: { type: Number, default: 15, min: 0, max: 100 },
    maxUses: { type: Number, default: 100 },
    expiryDays: { type: Number, default: 7 },
    prefix: { type: String, default: 'EMAIL' },
  },
  phoneDiscount: {
    enabled: { type: Boolean, default: false },
    percentage: { type: Number, default: 15, min: 0, max: 100 },
    maxUses: { type: Number, default: 100 },
    expiryDays: { type: Number, default: 7 },
    prefix: { type: String, default: 'PHONE' },
  },
  bothDiscount: {
    enabled: { type: Boolean, default: false },
    percentage: { type: Number, default: 20, min: 0, max: 100 },
    maxUses: { type: Number, default: 100 },
    expiryDays: { type: Number, default: 7 },
    prefix: { type: String, default: 'VIP' },
  },

  // Popup text customization — shown above the email/phone fields.
  offerHeadline: {
    type: String,
    default: 'Get a discount on your first order!',
  },

  updatedAt: { type: Date, default: Date.now },
});

discountConfigSchema.index({ shopDomain: 1 }, { unique: true });

module.exports = mongoose.model('DiscountConfig', discountConfigSchema);
