const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * A deterministic fact about a Profile, computed by
 * backend/services/signalEngine.js on ingest and nightly.
 *
 * One active row per (shopDomain, profileId, type) — recompute upserts it.
 * Rows self-expire via the TTL index on `expiresAt`.
 */
const signalSchema = new Schema({
  shopDomain: { type: String, required: true, lowercase: true, trim: true },
  profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
  type: {
    type: String,
    required: true,
    enum: [
      'cart_abandon', 'checkout_abandon', 'browse_abandon',
      'high_intent', 'price_hesitation', 'price_drop', 'back_in_stock',
      'post_purchase_d3', 'lapsing', 'winback',
      'email_capture', 'cod_to_prepaid',
    ],
  },
  strength: { type: Number, min: 0, max: 1, required: true },
  productId: { type: String, default: null },
  evidence: [{ type: String }], // human-readable reasons, max 5
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// One active signal per type per profile — upsert on this key.
signalSchema.index({ shopDomain: 1, profileId: 1, type: 1 }, { unique: true });

// Mongo auto-deletes a signal the moment it passes expiresAt.
signalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Brain: strongest signals per shop per type.
signalSchema.index({ shopDomain: 1, type: 1, strength: -1 });

module.exports = mongoose.model('Signal', signalSchema);
