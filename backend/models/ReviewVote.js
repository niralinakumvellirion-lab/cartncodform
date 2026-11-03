const mongoose = require('mongoose');

/** One "helpful" vote. voterKey is a hash, so a visitor can vote once per review without being identified. */
const reviewVoteSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, lowercase: true, trim: true },
  reviewId: { type: mongoose.Schema.Types.ObjectId, required: true },
  voterKey: { type: String, required: true },
  customerId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

reviewVoteSchema.index({ reviewId: 1, voterKey: 1 }, { unique: true });
reviewVoteSchema.index({ shopDomain: 1, customerId: 1 }, { sparse: true });

module.exports = mongoose.model('ReviewVote', reviewVoteSchema);
