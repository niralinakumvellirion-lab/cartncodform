const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  shopDomain: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  accessToken: {
    type: String,
    required: true,
  },
  ownerEmail: {
    type: String,
    lowercase: true,
    trim: true,
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata',
  },
  plan: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free',
  },
  subscriptionId: { type: String },
  subscriptionStatus: { type: String },
  planUpdatedAt: { type: Date },

  // --- Phase C: brain configuration ---
  voice: {
    tone: { type: String, default: 'friendly' },
    emoji: { type: Boolean, default: true },
    lang: { type: String, default: 'en' },
    signOff: { type: String, default: '' },
  },
  caps: {
    perDay: { type: Number, default: 2 },
    perWeek: { type: Number, default: 5 },
  },
  quietHours: {
    start: { type: Number, default: 22 }, // hour 0-23
    end: { type: Number, default: 8 },
  },
  onboarding: {
    steps: [{ id: String, done: Boolean, doneAt: Date }],
  },
  // NOTE: `timezone` already exists above (default 'Asia/Kolkata') — not re-added.

  installedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Store', storeSchema);
