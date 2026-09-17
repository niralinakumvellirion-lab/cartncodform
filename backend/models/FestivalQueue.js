const mongoose = require('mongoose');

const festivalQueueSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  scheduledAt: { type: Date, required: true },
  festival: { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'approved', 'sent', 'cancelled'],
    default: 'draft'
  },
  sentAt: { type: Date },
  recipientCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('FestivalQueue', festivalQueueSchema);
