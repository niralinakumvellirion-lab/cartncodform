const mongoose = require('mongoose');

/**
 * One-time discount code made when a COD-form visitor chose "Pay online". Marked used by orders/create;
 * deleted from Shopify by the poller when it expires unused.
 */
const prepaidCodeSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, trim: true },
  code: { type: String, required: true },
  discountId: { type: String, required: true },
  amount: { type: Number, required: true },
  productId: { type: String },
  variantId: { type: String, default: null },
  quantity: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  // Filled from orders/create when the code is used.
  usedAt: { type: Date, default: null },
  orderId: { type: String, default: null },
  orderTotal: { type: Number, default: null },
  // false = the customer used the code but still paid Cash on Delivery at Shopify checkout.
  paidOnline: { type: Boolean, default: null },
  // Set when the unused, expired code was removed from Shopify.
  deletedAt: { type: Date, default: null },
});

prepaidCodeSchema.index({ shopDomain: 1, code: 1 }, { unique: true });
prepaidCodeSchema.index({ shopDomain: 1, createdAt: -1 });
prepaidCodeSchema.index({ usedAt: 1, deletedAt: 1, expiresAt: 1 });

module.exports = mongoose.model('PrepaidCode', prepaidCodeSchema);
