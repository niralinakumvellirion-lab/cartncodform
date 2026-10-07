const mongoose = require('mongoose');
const { Schema } = mongoose;
const { LAYOUT_INFO, FONT_ORDER } = require('../utils/emailEngine');

const LAYOUT_KEYS = LAYOUT_INFO.map((l) => l.k);

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
    // ── design fields (all optional; null = follow store/engine defaults) ───────
    layout:   { type: String, enum: [...LAYOUT_KEYS, null], default: null },
    color:    { type: String, default: null },
    hFont:    { type: String, enum: [...FONT_ORDER, null], default: null },
    bFont:    { type: String, enum: [...FONT_ORDER, null], default: null },
    radius:   { type: String, enum: ['round', 'sharp', null], default: null },
    pageBg:   { type: String, default: null },
    cardBg:   { type: String, default: null },
    eyebrow:  { type: String, default: '' },
    headline: { type: String, default: '' },
    note:     { type: String, default: '' },
    imgW:     { type: Number, default: null },
    imgH:     { type: Number, default: null },
    showLogo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
