const mongoose = require('mongoose');

/**
 * "Find my size" settings — one per shop. Charts hold body measurements in cm.
 * Validation lives in utils/sizeFinder.sanitizeSettings (the admin route), not here.
 */
const rowSchema = new mongoose.Schema({
  size:   { type: String, required: true },
  chest:  { type: Number, required: true },
  waist:  { type: Number, required: true },
  length: { type: Number, default: 0 },
}, { _id: false });

const sizeFinderConfigSchema = new mongoose.Schema({
  shopDomain:  { type: String, required: true, lowercase: true, trim: true },
  enabled:     { type: Boolean, default: false },
  productTag:  { type: String, default: '' },          // '' = every product with a Size option
  buttonText:  { type: String, default: 'Find my size' },
  cardTitle:   { type: String, default: 'Not sure about your size?' },
  cardText:    { type: String, default: '3 quick questions · takes 20 seconds' },
  accentColor: { type: String, default: '#111827' },
  unit:        { type: String, default: 'cm', enum: ['cm', 'in'] },
  charts: {
    women: { type: [rowSchema], default: undefined },
    men:   { type: [rowSchema], default: undefined },
  },
  updatedAt:   { type: Date, default: Date.now },
});

sizeFinderConfigSchema.index({ shopDomain: 1 }, { unique: true });

module.exports = mongoose.model('SizeFinderConfig', sizeFinderConfigSchema);
