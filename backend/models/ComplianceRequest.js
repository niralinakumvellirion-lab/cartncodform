const mongoose = require('mongoose');

const { Schema } = mongoose;

const complianceRequestSchema = new Schema(
  {
    shopDomain: { type: String, required: true, trim: true, lowercase: true, index: true },
    topic: {
      type: String,
      required: true,
      enum: ['customers/data_request', 'customers/redact', 'shop/redact'],
    },
    status: {
      type: String,
      default: 'received',
      enum: ['received', 'processing', 'completed', 'failed', 'dead'],
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    completedAt: { type: Date },
    // Stores customer identifiers needed by the background job.
    // Wiped to null after the job completes (privacy by design).
    identifiers: { type: Schema.Types.Mixed },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

// Auto-delete completed/dead rows after 90 days (audit trail belt-and-suspenders;
// identifiers are already wiped on both transitions).
complianceRequestSchema.index({ completedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('ComplianceRequest', complianceRequestSchema);
