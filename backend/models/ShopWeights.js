const mongoose = require('mongoose');

/**
 * Phase H — per-shop learned weights that the Brain multiplies into its
 * expected-value ranking. Recomputed once per day by weightsService.computeWeights
 * from the last 90 days of ScheduledJob outcomes. One doc per shop.
 *
 * Every `rate` defaults to 1.0 (neutral) — with < the minimum sample size the
 * shop's real rate is not used, so a shop with no click/convert history ranks
 * exactly as it did before Phase H.
 */
const shopWeightsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true },

  // Per signal type: (clicks + conversions) / sends
  signalRates: {
    type: Map,
    of: new mongoose.Schema(
      {
        sends: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        rate: { type: Number, default: 1.0 },
      },
      { _id: false }
    ),
    default: {},
  },

  // Per channel: (clicks + conversions) / sends
  channelRates: {
    push: {
      sends: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      rate: { type: Number, default: 1.0 },
    },
    email: {
      sends: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      rate: { type: Number, default: 1.0 },
    },
  },

  // Per hour of day (0-23, UTC): conversions / sends
  hourRates: {
    type: Map,
    of: new mongoose.Schema(
      {
        sends: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        rate: { type: Number, default: 1.0 },
      },
      { _id: false }
    ),
    default: {},
  },

  lastComputedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
});

// { shopDomain: 1 } unique — already enforced by `unique: true` above.

module.exports = mongoose.model('ShopWeights', shopWeightsSchema);
