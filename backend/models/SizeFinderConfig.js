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

// Shoes / rings / bangles: one value per size (foot length cm · ring circumference mm · bangle width mm).
const measureRowSchema = new mongoose.Schema({
  size:  { type: String, required: true },
  value: { type: Number, required: true },
}, { _id: false });

const sizeFinderConfigSchema = new mongoose.Schema({
  shopDomain:  { type: String, required: true, lowercase: true, trim: true },
  // clothing | shoes | rings | bangles | none. Missing on settings saved before store types = clothing.
  storeType:   { type: String, enum: ['', 'clothing', 'baby', 'shoes', 'rings', 'bangles', 'none'] },
  enabled:     { type: Boolean, default: false },
  productTag:  { type: String, default: '' },          // '' = every product with a Size option
  buttonText:  { type: String, default: 'Find my size' },
  cardTitle:   { type: String, default: 'Not sure about your size?' },
  cardText:    { type: String, default: '3 quick questions · takes 20 seconds' },
  buttonStyle: { type: String, default: 'filled', enum: ['filled', 'outline', 'soft'] },
  buttonRadius: { type: Number, default: 24 },             // px, 0–24; 24 = fully round
  texts:       { type: mongoose.Schema.Types.Mixed, default: undefined }, // size advisor words (see ADVISOR_TEXTS)
  options:     { type: mongoose.Schema.Types.Mixed, default: undefined }, // size advisor on/off parts (see ADVISOR_OPTIONS)
  accentColor: { type: String, default: '#111827' },
  unit:        { type: String, default: 'cm', enum: ['cm', 'in'] },
  charts: {
    women: { type: [rowSchema], default: undefined },
    men:   { type: [rowSchema], default: undefined },
  },
  // Baby & kids clothes: each size covers up to this length (cm), weight (kg) and age (months).
  babyChart: {
    type: [new mongoose.Schema({
      size:      { type: String, required: true },
      maxLength: { type: Number, required: true },
      maxWeight: { type: Number, required: true },
      maxAge:    { type: Number, required: true },
    }, { _id: false })],
    default: undefined,
  },
  measureCharts: {
    shoes:   { type: [measureRowSchema], default: undefined },
    rings:   { type: [measureRowSchema], default: undefined },
    bangles: { type: [measureRowSchema], default: undefined },
  },
  updatedAt:   { type: Date, default: Date.now },
});

sizeFinderConfigSchema.index({ shopDomain: 1 }, { unique: true });

module.exports = mongoose.model('SizeFinderConfig', sizeFinderConfigSchema);
