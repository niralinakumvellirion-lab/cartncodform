const mongoose = require('mongoose');
const { Schema } = mongoose;

const emailTemplateSchema = new Schema(
  {
    shopDomain: { type: String, required: true, index: true, lowercase: true, trim: true },
    type: { type: String, enum: ['special_offer', 'festival', 'normal'], required: true },
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    offerText: { type: String, default: null },
    imageUrl: { type: String, default: null },
    ctaLabel: { type: String, default: null },
    ctaUrl: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
