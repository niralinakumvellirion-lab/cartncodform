const mongoose = require('mongoose');

/**
 * Per-shop product review settings (one document per shop). Created the first time the
 * merchant saves the Reviews screen; a shop with no document uses the defaults in
 * utils/reviewSettings.js.
 */
const reviewSettingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, trim: true },

  // Who may leave a review: only customers who bought the product, logged-in customers, or anyone.
  whoCanReview: { type: String, enum: ['verified', 'logged_in', 'anyone'], default: 'verified' },
  verifiedBadge: { type: Boolean, default: true },
  starRating: { type: Boolean, default: true },
  starRequired: { type: Boolean, default: true },
  reviewsPerPage: { type: Number, default: 10, min: 1, max: 50 },

  photos: {
    enabled: { type: Boolean, default: true },
    maxPhotos: { type: Number, default: 3, min: 1, max: 10 },
    maxFileSizeMb: { type: Number, default: 5, min: 1, max: 10 },
    allowedTypes: { type: [{ type: String, enum: ['jpeg', 'png', 'gif', 'webp'] }], default: ['jpeg', 'png', 'webp'] },
  },

  helpfulVotes: { type: Boolean, default: true },

  // true: new reviews wait in "Pending" until the merchant approves them.
  requireApproval: { type: Boolean, default: true },

  updatedAt: { type: Date, default: Date.now },
});

reviewSettingsSchema.index({ shopDomain: 1 }, { unique: true });

module.exports = mongoose.model('ReviewSettings', reviewSettingsSchema);
