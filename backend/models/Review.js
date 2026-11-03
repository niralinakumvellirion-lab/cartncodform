const mongoose = require('mongoose');

/**
 * One customer review of one product. Raw email is never stored: emailHash (sha256 of the
 * lower-cased address) is only used to match purchases and to stop duplicate reviews.
 */
const reviewSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, trim: true },
  productId: { type: String, required: true },
  productHandle: { type: String, default: '' },

  rating: { type: Number, min: 1, max: 5, default: null }, // null when star rating is off
  title: { type: String, default: '', maxlength: 120 },
  body: { type: String, required: true, maxlength: 2000 },
  authorName: { type: String, required: true, maxlength: 60 },

  customerId: { type: String, default: null },
  emailHash: { type: String, default: null },
  verified: { type: Boolean, default: false }, // the author bought this product

  status: { type: String, enum: ['pending', 'approved', 'hidden'], default: 'pending' },
  photos: [{ _id: false, url: String, width: Number, height: Number }],
  helpfulCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  moderatedAt: { type: Date, default: null },
});

reviewSchema.index({ shopDomain: 1, productId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ shopDomain: 1, status: 1, createdAt: -1 });
reviewSchema.index({ shopDomain: 1, customerId: 1 }, { sparse: true });
reviewSchema.index({ shopDomain: 1, emailHash: 1 }, { sparse: true });

module.exports = mongoose.model('Review', reviewSchema);
