const mongoose = require('mongoose');

const pushClickSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledJob', index: true },
  // Set for festival/manual broadcast clicks (FestivalQueue _id).
  festivalQueueId: { type: mongoose.Schema.Types.ObjectId, ref: 'FestivalQueue', index: true },
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

// One click per (festivalQueueId, subscriptionToken) — same dedup logic for
// festival/manual broadcast clicks. subscriptionToken is unique per device so
// page reloads with ?ccf_job still in the URL don't insert a duplicate.
pushClickSchema.index(
  { festivalQueueId: 1, subscriptionToken: 1 },
  {
    unique: true,
    partialFilterExpression: {
      festivalQueueId: { $type: 'objectId' },
      subscriptionToken: { $type: 'string' },
    },
  }
);

module.exports = mongoose.model('PushClick', pushClickSchema);
