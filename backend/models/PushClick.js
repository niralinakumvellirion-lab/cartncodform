const mongoose = require('mongoose');

const pushClickSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledJob', index: true },
  subscriptionToken: { type: String },
  cartToken: { type: String, index: true },
  customerId: { type: String, index: true },
  clickedAt: { type: Date, default: Date.now },
});

// One click per (jobId, cartToken) — a storefront reload with ?ccf_job
// still in the URL would otherwise insert a duplicate. Partial so rows
// with no cartToken (guest / cart.js unavailable) don't collide on null.
pushClickSchema.index(
  { jobId: 1, cartToken: 1 },
  { unique: true, partialFilterExpression: { cartToken: { $type: 'string' } } }
);

module.exports = mongoose.model('PushClick', pushClickSchema);
