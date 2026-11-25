'use strict';

/**
 * "Find my size" — pure helpers (no DB, no I/O).
 *
 * Charts hold BODY measurements in cm per size (chest, waist) plus the garment length.
 * The shopper gives height, weight, body shape and preferred fit; we estimate chest and waist,
 * add ease for the fit, and pick the smallest size that covers both.
 * Estimates are a rough guide, which the storefront says plainly.
 */

const GENDERS = ['women', 'men'];
const SHAPES = { slim: -3, average: 0, broad: 3 };
const FITS = { snug: -2, regular: 0, relaxed: 4 };

// Indian starter charts (body measurements, cm). Merchants edit them in the admin.
const DEFAULT_CHARTS = Object.freeze({
  women: [
    { size: 'XS', chest: 81, waist: 66, length: 104 },
    { size: 'S', chest: 86, waist: 71, length: 105 },
    { size: 'M', chest: 91, waist: 76, length: 106 },
    { size: 'L', chest: 97, waist: 81, length: 107 },
    { size: 'XL', chest: 102, waist: 86, length: 108 },
    { size: 'XXL', chest: 107, waist: 91, length: 109 },
  ],
  men: [
    { size: 'S', chest: 92, waist: 78, length: 72 },
    { size: 'M', chest: 97, waist: 83, length: 73 },
    { size: 'L', chest: 102, waist: 88, length: 74 },
    { size: 'XL', chest: 107, waist: 94, length: 76 },
    { size: 'XXL', chest: 112, waist: 100, length: 77 },
  ],
});

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function validationError(message, field) {
  const e = new Error(message);
  e.isValidation = true;
  e.field = field;
  return e;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : NaN;
}

/**
 * One chart: 1–12 rows of { size, chest, waist, length } in cm.
 * Sizes unique (1–10 chars), chest and waist 40–200, length 0 (unknown) or 20–200,
 * chest strictly ascending so "smallest size that fits" is well defined. [] = chart off.
 */
function sanitizeChart(raw, gender) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw validationError(`${gender} chart must be a list`, `charts.${gender}`);
  if (raw.length > 12) throw validationError(`${gender} chart can have at most 12 sizes`, `charts.${gender}`);
  const out = [];
  const seen = new Set();
  raw.forEach((r, i) => {
    const size = String((r && r.size) || '').trim().slice(0, 10);
    const chest = num(r && r.chest);
    const waist = num(r && r.waist);
    const length = r && (r.length === '' || r.length == null) ? 0 : num(r.length);
    const where = `charts.${gender}[${i}]`;
    if (!size) throw validationError(`Row ${i + 1}: size name is required`, where);
    if (seen.has(size.toLowerCase())) throw validationError(`Row ${i + 1}: size ${size} is listed twice`, where);
    seen.add(size.toLowerCase());
    if (!(chest >= 40 && chest <= 200)) throw validationError(`Row ${i + 1}: chest must be 40–200 cm`, where);
    if (!(waist >= 40 && waist <= 200)) throw validationError(`Row ${i + 1}: waist must be 40–200 cm`, where);
    if (!(length === 0 || (length >= 20 && length <= 200))) throw validationError(`Row ${i + 1}: length must be 20–200 cm`, where);
    if (i > 0 && chest <= out[i - 1].chest) throw validationError(`Row ${i + 1}: chest must be bigger than the size above`, where);
    out.push({ size, chest, waist, length });
  });
  return out;
}

/** Full settings from the admin. Throws validation errors (→ 400). */
function sanitizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tag = String(r.productTag || '').trim().slice(0, 60);
  const out = {
    enabled: r.enabled === true,
    productTag: tag,
    buttonText: String(r.buttonText || '').trim().slice(0, 40) || 'Find my size',
    accentColor: COLOR_RE.test(String(r.accentColor || '')) ? String(r.accentColor) : '#111827',
    unit: r.unit === 'in' ? 'in' : 'cm',
    charts: {
      women: sanitizeChart(r.charts && r.charts.women, 'women'),
      men: sanitizeChart(r.charts && r.charts.men, 'men'),
    },
  };
  if (!out.charts.women.length && !out.charts.men.length) {
    throw validationError('Add at least one size chart (Women or Men)', 'charts');
  }
  return out;
}

/** Settings as stored, with defaults for a shop that never saved. */
function withDefaults(doc) {
  const d = doc || {};
  const charts = d.charts || {};
  return {
    enabled: d.enabled === true,
    productTag: String(d.productTag || ''),
    buttonText: String(d.buttonText || 'Find my size'),
    accentColor: COLOR_RE.test(String(d.accentColor || '')) ? d.accentColor : '#111827',
    unit: d.unit === 'in' ? 'in' : 'cm',
    charts: {
      women: Array.isArray(charts.women) ? charts.women.map(cleanRow) : DEFAULT_CHARTS.women.map(cleanRow),
      men: Array.isArray(charts.men) ? charts.men.map(cleanRow) : DEFAULT_CHARTS.men.map(cleanRow),
    },
  };
}

function cleanRow(r) {
  return { size: String(r.size), chest: Number(r.chest), waist: Number(r.waist), length: Number(r.length) || 0 };
}

/** What the storefront may see (no internal ids). */
function publicSettings(doc) {
  const s = withDefaults(doc);
  return {
    enabled: s.enabled,
    productTag: s.productTag,
    buttonText: s.buttonText,
    accentColor: s.accentColor,
    unit: s.unit,
    genders: GENDERS.filter((g) => s.charts[g].length > 0),
    charts: s.charts,
  };
}

/**
 * Shopper answers → validated input, or null when anything is out of range.
 * Height 120–220 cm, weight 30–200 kg.
 */
function sanitizeAnswers(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const gender = GENDERS.includes(r.gender) ? r.gender : null;
  const heightCm = num(r.heightCm);
  const weightKg = num(r.weightKg);
  const shape = Object.prototype.hasOwnProperty.call(SHAPES, r.shape) ? r.shape : 'average';
  const fit = Object.prototype.hasOwnProperty.call(FITS, r.fit) ? r.fit : 'regular';
  if (!gender || !(heightCm >= 120 && heightCm <= 220) || !(weightKg >= 30 && weightKg <= 200)) return null;
  return { gender, heightCm, weightKg, shape, fit };
}

/**
 * Rough body estimate from height + weight (cm, kg). Linear fits for adult Indian sizing,
 * shifted by body shape. Good enough to point at a size, not a tailor's measurement.
 */
function estimateBody({ gender, heightCm, weightKg, shape }) {
  const s = SHAPES[shape] || 0;
  if (gender === 'men') {
    return {
      chest: 0.6 * weightKg + 0.25 * heightCm + 10 + s,
      waist: 0.7 * weightKg + 0.15 * heightCm + 6 + s,
    };
  }
  return {
    chest: 0.65 * weightKg + 0.2 * heightCm + 18 + s,
    waist: 0.6 * weightKg + 0.15 * heightCm + 14 + s,
  };
}

function areaStatus(diff) {
  if (diff < -2) return 'snug';
  if (diff > 6) return 'roomy';
  return 'right';
}

/**
 * Smallest size whose chest AND waist cover the body + fit ease. If none does, the largest
 * size with tooBig=true (the storefront says it may be tight).
 * Reasons: chest/waist status ('right' | 'snug' | 'roomy') and the garment length when known.
 */
function recommendSize(chart, body, fit) {
  if (!Array.isArray(chart) || chart.length === 0) return null;
  const ease = FITS[fit] || 0;
  const needChest = body.chest + ease;
  const needWaist = body.waist + ease;
  let pick = chart.find((r) => r.chest >= needChest && r.waist >= needWaist);
  const outOfRange = !pick;
  if (!pick) pick = chart[chart.length - 1];
  const reasons = [
    { area: 'chest', status: areaStatus(pick.chest - needChest) },
    { area: 'waist', status: areaStatus(pick.waist - needWaist) },
  ];
  if (pick.length > 0) reasons.push({ area: 'length', status: 'info', value: pick.length });
  return { size: pick.size, outOfRange, reasons };
}

module.exports = {
  GENDERS, SHAPES, FITS, DEFAULT_CHARTS,
  sanitizeChart, sanitizeSettings, withDefaults, publicSettings,
  sanitizeAnswers, estimateBody, recommendSize,
};
