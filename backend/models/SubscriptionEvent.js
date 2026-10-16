const mongoose = require('mongoose');

const subscriptionEventSchema = new mongoose.Schema(
  {
    shopDomain:     { type: String, required: true },
    eventType:      { type: String, enum: ['activated', 'ended', 'uninstalled', 'baseline'], required: true },
    fromPlan:       { type: String, enum: ['free', 'pro'] },
    toPlan:         { type: String, enum: ['free', 'pro'] },
    shopifyStatus:  { type: String },
    source:         { type: String, enum: ['webhook', 'billing_callback', 'oauth_sync', 'baseline'] },
    isTest:         { type: Boolean, default: false },
    priceUsd:       { type: Number },
    currency:       { type: String, default: 'USD' },
    trialDays:      { type: Number },
    trialEndsAt:    { type: Date },
    approxSince:    { type: Date },
    occurredAt:     { type: Date, default: Date.now },
  },
  { timestamps: true }
);

subscriptionEventSchema.index({ shopDomain: 1, occurredAt: -1 });
subscriptionEventSchema.index({ eventType: 1, occurredAt: -1 });

module.exports = mongoose.model('SubscriptionEvent', subscriptionEventSchema);
