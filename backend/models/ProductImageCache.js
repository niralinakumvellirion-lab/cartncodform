const mongoose = require('mongoose');

const productImageCacheSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true },
  productId: { type: String, required: true },
  imageUrl: { type: String },
  cachedAt: { type: Date, default: Date.now },
});

// Compound unique index — one cache entry per shop+product.
productImageCacheSchema.index({ shopDomain: 1, productId: 1 }, { unique: true });

// Auto-expire cache entries after 24 hours.
productImageCacheSchema.index({ cachedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('ProductImageCache', productImageCacheSchema);
