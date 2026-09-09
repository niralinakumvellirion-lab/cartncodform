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
    maxUnopenedPush: { type: Number, default: 5 }, // Phase F: suppress push after N unopened
  },
  quietHours: {
    start: { type: Number, default: 22 }, // hour 0-23
    end: { type: Number, default: 8 },
  },
  onboarding: {
    steps: [{ id: String, done: Boolean, doneAt: Date }],
  },
  // NOTE: `timezone` already exists above (default 'Asia/Kolkata') — not re-added.

  // --- Phase F: rolling 7-day push delivery health ---
  pushStats: {
    deliveredLast7d: { type: Number, default: 0 },
    attemptedLast7d: { type: Number, default: 0 },
    rateLast7d: { type: Number, default: 0 },
    lastComputedAt: { type: Date, default: null },
  },

  // --- Phase C2: last time the nightly signals+brain gate ran for this shop ---
  lastSignalRunAt: { type: Date, default: null },

  // --- popup-customizer: storefront soft push prompt appearance ---
  popup: {
    position: {
      type: String,
      enum: ['bottom-right', 'bottom-left', 'center', 'top-right', 'top-left'],
      default: 'bottom-right',
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'custom'],
      default: 'light',
    },
    accentColor: { type: String, default: '#4f46e5' },
    bgColor: { type: String, default: '#ffffff' },
    textColor: { type: String, default: '#111827' },
    fontFamily: { type: String, default: 'inherit' },
    borderRadius: { type: Number, default: 12 },
    imageUrl: { type: String, default: '' },
    allowText: { type: String, default: 'Allow' },
    denyText: { type: String, default: 'No thanks' },
    customTitle: { type: String, default: '' },
    showBranding: { type: Boolean, default: true },
  },

  installedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Store', storeSchema);
