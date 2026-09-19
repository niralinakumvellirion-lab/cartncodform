const mongoose = require('mongoose');

const festivalQueueSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  mobileImageUrl: { type: String, default: '' },
  desktopImageUrl: { type: String, default: '' },
  scheduledAt: { type: Date, required: true },
  festival: { type: String, default: '' },
  targetType: { type: String, enum: ['home', 'product'], default: 'home' },
  productId: { type: String, default: '' },
  productHandle: { type: String, default: '' },
  productTitle: { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'approved', 'sent', 'cancelled'],
    default: 'draft'
  },
  sentAt: { type: Date },
  recipientCount: { type: Number, default: 0 },
  // Consecutive failed send attempts by processFestivalQueue() in
  // server.js — reset is not needed since a successful send moves the
  // item to status 'sent' (this field just stops mattering at that
  // point); capped at FESTIVAL_MAX_FAILED_ATTEMPTS there, past which the
  // item is marked 'cancelled' instead of retrying forever.
  failedAttempts: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('FestivalQueue', festivalQueueSchema);
