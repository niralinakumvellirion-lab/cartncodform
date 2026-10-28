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
      enum: ['received', 'processing', 'completed', 'failed'],
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

module.exports = mongoose.model('ComplianceRequest', complianceRequestSchema);
