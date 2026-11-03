const mongoose = require('mongoose');

/**
 * Which products a customer bought, kept only to decide "verified buyer" for reviews.
 * Written from the orders/create webhook. No name, address or raw email.
 */
const purchaseRecordSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, trim: true },
  orderId: { type: String, required: true },
  customerId: { type: String, default: null },
  emailHash: { type: String, default: null },
  productIds: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

purchaseRecordSchema.index({ shopDomain: 1, orderId: 1 }, { unique: true });
purchaseRecordSchema.index({ shopDomain: 1, customerId: 1, productIds: 1 }, { sparse: true });
purchaseRecordSchema.index({ shopDomain: 1, emailHash: 1, productIds: 1 }, { sparse: true });

module.exports = mongoose.model('PurchaseRecord', purchaseRecordSchema);
