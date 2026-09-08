const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One record per human, per shop. Every ingest path (storefront events, carts,
 * checkouts, orders, COD orders, push subscribe) resolves to a Profile via
 * backend/services/profileService.js -> upsertProfile().
 *
 * Merge priority (identity resolution):
 *   customerId -> email -> phone -> cartToken -> ccfSessionId -> pushToken
 */
const profileSchema = new Schema({
  shopDomain: { type: String, required: true, lowercase: true, trim: true },

  identifiers: {
    customerId: { type: String, default: null },
    emails: [{ type: String, lowercase: true, trim: true }],
    phones: [{ type: String }],
    sessionIds: [{ type: String }], // ccfSessionIds (stable UUIDs)
    cartTokens: [{ type: String }],
    pushTokens: [{ type: String }], // FCM tokens
  },

  channels: {
    push: { subscribed: Boolean, lastToken: String, subscribedAt: Date },
    email: {
      address: String,
      source: { type: String, enum: ['cod', 'form', 'checkout'] },
    },
  },

  stage: {
    type: String,
    enum: ['anonymous', 'identified', 'customer', 'lapsed'],
    default: 'anonymous',
  },

  interests: { type: Map, of: Number, default: {} }, // productId -> score 0-1

  activeHours: { type: [Number], default: [] }, // hours 0-23 when active

  orders: {
    count: { type: Number, default: 0 },
    ltv: { type: Number, default: 0 },
    lastOrderAt: { type: Date, default: null },
    codCount: { type: Number, default: 0 },
    prepaidCount: { type: Number, default: 0 },
  },

  messages: [
    {
      // last 20 only, capped in profileService
      channel: String,
      type: String,
      sentAt: Date,
      outcome: {
        type: String,
        enum: ['sent', 'clicked', 'converted', 'unsubscribed'],
        default: 'sent',
      },
      jobId: { type: Schema.Types.ObjectId, ref: 'ScheduledJob' },
    },
  ],

  suppressed: { type: Boolean, default: false },
  lastSeenAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Identity-resolution lookups — one per identifier field, all sparse.
profileSchema.index({ shopDomain: 1, 'identifiers.customerId': 1 }, { sparse: true });
profileSchema.index({ shopDomain: 1, 'identifiers.emails': 1 }, { sparse: true });
profileSchema.index({ shopDomain: 1, 'identifiers.phones': 1 }, { sparse: true });
profileSchema.index({ shopDomain: 1, 'identifiers.cartTokens': 1 }, { sparse: true });
profileSchema.index({ shopDomain: 1, 'identifiers.sessionIds': 1 }, { sparse: true });
profileSchema.index({ shopDomain: 1, 'identifiers.pushTokens': 1 }, { sparse: true });

// Dashboard "most recently active" listing.
profileSchema.index({ shopDomain: 1, updatedAt: -1 });

module.exports = mongoose.model('Profile', profileSchema);
