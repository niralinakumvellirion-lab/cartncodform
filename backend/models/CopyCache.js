const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Phase E — resolved message copy, cached per
 * (shopDomain, signalType, productId, channel, voiceHash) for 24h.
 * One LLM call per product per signal per channel per voice, not per customer.
 */
const copyCacheSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true },
  cacheKey: { type: String, required: true }, // sha256 of the inputs
  signalType: { type: String, required: true },
  channel: { type: String, required: true },
  title: { type: String, default: '' },
  body: { type: String, required: true },
  subject: { type: String, default: '' }, // email subject
  promptTokens: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }, // 24h TTL
});

copyCacheSchema.index({ cacheKey: 1 }, { unique: true });
copyCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
copyCacheSchema.index({ shopDomain: 1, signalType: 1, channel: 1 });

/**
 * Deterministic cache key. voiceHash is md5(JSON.stringify(store.voice)) so a
 * voice change invalidates the whole shop's copy cache.
 */
function buildCacheKey(shopDomain, signalType, productId, channel, voiceHash) {
  return crypto
    .createHash('sha256')
    .update(`${shopDomain}|${signalType}|${productId || ''}|${channel}|${voiceHash}`)
    .digest('hex');
}

module.exports = mongoose.model('CopyCache', copyCacheSchema);
module.exports.buildCacheKey = buildCacheKey;
