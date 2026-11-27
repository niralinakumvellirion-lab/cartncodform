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
// Body build → shift of the estimated chest / waist in cm. "average" is shown as "Balanced".
const SHAPES = { slim: -3, athletic: 0, average: 0, broad: 3 };
const SHAPE_SHIFT = {
  slim: { chest: -3, waist: -3 },
  athletic: { chest: 1, waist: -2 }, // broader chest, narrower waist
  average: { chest: 0, waist: 0 },
  broad: { chest: 3, waist: 3 },
};
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

/**
 * Kinds of store. clothing = height/weight/build → body chart. shoes / rings / bangles = one measurement
 * → a one-column chart (smallest size whose value covers it). none = sizes not needed (feature off).
 */
const STORE_TYPES = ['clothing', 'baby', 'shoes', 'rings', 'bangles', 'none'];

/**
 * Baby & kids clothes: sized by the baby's length (head to heel) and weight, or by age alone.
 * Chart rows: { size, maxLength cm, maxWeight kg, maxAge months } — each size covers up to those values.
 * "Room to grow" = one size up. The words and ranges below go to the storefront and admin preview.
 */
const BABY = Object.freeze({
  title: 'Tell us about your baby',
  text: 'Length and weight give the best fit. No measurements handy? Use their age.',
  howTo: [
    'Lay your baby on their back on a flat bed or mat.',
    'Gently straighten their legs and measure from the top of the head to the heel.',
    'Use a recent weight from a check-up or a home scale.',
  ],
  caption: 'Baby’s size in 20 seconds',
  length: { label: 'Length (head to heel)', min: 40, max: 120, step: 0.5, start: 68 },
  weight: { label: 'Weight', min: 1.5, max: 30, step: 0.1, start: 8 },
  age: { label: 'Age', min: 0, max: 72, step: 1, start: 6 },
  fit: {
    right: 'Fits now — within this size for length and weight',
    grow: 'Room to grow — one size up, so it lasts a few more months',
    age: 'Based on age — add length and weight for a closer fit',
  },
});
const DEFAULT_BABY_CHART = Object.freeze([
  ['Newborn', 56, 4.5, 1], ['0-3 M', 62, 6, 3], ['3-6 M', 68, 8, 6], ['6-9 M', 74, 9.5, 9], ['9-12 M', 80, 10.5, 12],
  ['12-18 M', 86, 12, 18], ['18-24 M', 92, 13.5, 24], ['2-3 Y', 98, 15.5, 36], ['3-4 Y', 104, 17.5, 48],
].map(([size, maxLength, maxWeight, maxAge]) => ({ size, maxLength, maxWeight, maxAge })));
/**
 * One-measurement kinds. value = what the chart column holds; min/max = allowed range (chart and shopper);
 * tolerance = up to this much bigger than the shopper still counts as "just right".
 * alt = a second way to measure (a ring / bangle that already fits) — same unit.
 */
const MEASURE_TYPES = Object.freeze({
  shoes: {
    value: 'Foot length', unit: 'cm', min: 18, max: 33, step: 0.1, start: 25, tolerance: 0.6,
    title: 'Measure your foot',
    text: 'Stand on a sheet of paper and measure from your heel to your longest toe.',
    howTo: ['Put a sheet of paper on the floor against a wall.', 'Stand on it with your heel touching the wall.', 'Mark your longest toe and measure from the wall to the mark.'],
    caption: 'Measure your foot · takes 30 seconds',
    fit: { right: 'True to size, with a little toe room', roomy: 'A little extra room — wear thicker socks' },
  },
  rings: {
    value: 'Finger size (around)', unit: 'mm', min: 40, max: 76, step: 0.5, start: 52, tolerance: 1.5,
    title: 'Measure your finger',
    text: 'Wrap a thread around the finger you will wear the ring on, then measure the thread.',
    howTo: ['Wrap a thread or paper strip around the base of your finger.', 'Mark where the ends meet — snug, but it should slide over the knuckle.', 'Lay it flat and measure the length in mm.'],
    alt: { label: 'A ring that fits', value: 'Inside width of the ring', min: 12.7, max: 24.2, step: 0.1, start: 16.5, toValue: 'circle' },
    caption: 'Measure your finger · takes 30 seconds',
    fit: { right: 'A comfortable, snug fit', roomy: 'Slightly loose — easy over the knuckle' },
  },
  bangles: {
    value: 'Hand width', unit: 'mm', min: 48, max: 80, step: 0.5, start: 60, tolerance: 2.5,
    title: 'Measure your hand',
    text: 'Bring your thumb and little finger together, then measure across the widest part of your hand.',
    howTo: ['Bring your thumb and little finger together, as if putting on a bangle.', 'Measure across the widest part of your hand, at the knuckles.', 'Use that width in mm.'],
    alt: { label: 'A bangle that fits', value: 'Inside width of the bangle', min: 48, max: 80, step: 0.5, start: 60 },
    caption: 'Measure your hand · takes 30 seconds',
    fit: { right: 'Slides on easily and sits well', roomy: 'A little loose on the wrist' },
  },
});

/** Starter charts (Indian sizes). Shoes: foot length cm (UK/India). Rings: inside circumference mm. Bangles: inside width mm. */
const DEFAULT_MEASURE_CHARTS = Object.freeze({
  shoes: [
    ['3', 22.0], ['4', 22.9], ['5', 23.7], ['6', 24.6], ['7', 25.4], ['8', 26.2], ['9', 27.1], ['10', 27.9], ['11', 28.8], ['12', 29.6],
  ].map(([size, value]) => ({ size, value })),
  rings: Array.from({ length: 19 }, (_, i) => ({ size: String(i + 6), value: 46 + i })),
  bangles: [
    ['2.2', 54], ['2.4', 57.2], ['2.6', 60.3], ['2.8', 63.5], ['2.10', 66.7], ['2.12', 69.9],
  ].map(([size, value]) => ({ size, value })),
});

/**
 * What the admin search matches. words = what sellers type; the first word list entry is shown as an example.
 * Jewellery words point at both rings and bangles; necklaces / earrings / watches have no size → none.
 */
const STORE_TYPE_CATALOG = Object.freeze([
  {
    id: 'clothing', name: 'Clothing', blurb: 'Height, weight and build → S, M, L, XL',
    words: ['clothing', 'clothes', 'apparel', 'fashion', 'garments', 'kurta', 'kurti', 'saree', 'sari', 'lehenga', 'salwar suit', 'ethnic wear',
      'western wear', 't-shirt', 'tshirt', 'shirt', 'top', 'dress', 'jeans', 'trousers', 'pants', 'shorts', 'hoodie', 'sweatshirt', 'jacket',
      'blazer', 'sweater', 'co-ord set', 'nightwear', 'loungewear', 'activewear', 'gym wear', 'sportswear', 'menswear', 'womenswear',
      'uniform', 'sherwani', 'dupatta', 'blouse', 'skirt', 'jumpsuit'],
  },
  {
    id: 'baby', name: 'Baby & kids clothes', blurb: 'Length, weight or age → Newborn, 0-3 M … 3-4 Y',
    words: ['baby clothes', 'baby', 'babies', 'baby wear', 'babywear', 'newborn', 'infant', 'toddler', 'kids wear', 'kidswear',
      'kids clothes', 'onesie', 'romper', 'bodysuit', 'jhabla', 'jabla', 'sleepsuit', 'baby frock', 'baby dress', 'baby set',
      'nappy', 'baby nightwear', 'baby kurta', 'baby girl', 'baby boy', 'children', 'kids'],
  },
  {
    id: 'shoes', name: 'Shoes & footwear', blurb: 'Foot length → UK / India shoe size',
    words: ['shoes', 'shoe', 'footwear', 'sneakers', 'sandals', 'slippers', 'chappal', 'heels', 'boots', 'loafers', 'flip flops', 'juttis',
      'jutti', 'mojari', 'kolhapuri', 'sports shoes', 'running shoes', 'formal shoes', 'flats', 'wedges', 'crocs', 'kids shoes'],
  },
  {
    id: 'rings', name: 'Rings', blurb: 'Finger size → Indian ring size',
    words: ['rings', 'ring', 'jewellery', 'jewelry', 'engagement ring', 'wedding ring', 'couple rings', 'band', 'silver ring', 'gold ring',
      'diamond ring', 'toe ring', 'fine jewellery', 'artificial jewellery'],
  },
  {
    id: 'bangles', name: 'Bangles & bracelets', blurb: 'Hand width → bangle size (2.4, 2.6…)',
    words: ['bangles', 'bangle', 'bracelet', 'bracelets', 'kada', 'kangan', 'chudi', 'churi', 'cuff', 'jewellery', 'jewelry', 'glass bangles',
      'gold bangles', 'silver kada'],
  },
  {
    id: 'none', name: 'Sizes not needed', blurb: 'Electronics, beauty, home and other products without sizes',
    words: ['electronics', 'mobile', 'phone', 'mobile accessories', 'charger', 'cables', 'earphones', 'headphones', 'speakers', 'laptop',
      'gadgets', 'smartwatch', 'watches', 'appliances', 'home decor', 'furniture', 'kitchen', 'home', 'beauty', 'cosmetics', 'makeup',
      'skincare', 'haircare', 'perfume', 'fragrance', 'food', 'grocery', 'snacks', 'tea', 'coffee', 'books', 'stationery', 'toys', 'pet',
      'plants', 'health', 'supplements', 'ayurveda', 'bags', 'handbags', 'wallets', 'sunglasses', 'candles', 'gifts', 'art', 'handicrafts',
      'necklace', 'earrings', 'pendant', 'chain', 'anklet', 'mangalsutra', 'nose pin', 'hair accessories', 'phone covers'],
  },
]);

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

/**
 * One measure chart: 1–30 rows of { size, value } in the type's unit, sizes unique (1–10 chars),
 * value inside the type's range and strictly ascending. [] = empty.
 */
function sanitizeMeasureChart(raw, type) {
  const m = MEASURE_TYPES[type];
  const field = `measureCharts.${type}`;
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw validationError('The size chart must be a list', field);
  if (raw.length > 30) throw validationError('The size chart can have at most 30 sizes', field);
  const out = [];
  const seen = new Set();
  raw.forEach((r, i) => {
    const size = String((r && r.size) || '').trim().slice(0, 10);
    const value = num(r && r.value);
    const where = `${field}[${i}]`;
    if (!size) throw validationError(`Row ${i + 1}: size name is required`, where);
    if (seen.has(size.toLowerCase())) throw validationError(`Row ${i + 1}: size ${size} is listed twice`, where);
    seen.add(size.toLowerCase());
    if (!(value >= m.min && value <= m.max)) throw validationError(`Row ${i + 1}: ${m.value.toLowerCase()} must be ${m.min}–${m.max} ${m.unit}`, where);
    if (i > 0 && value <= out[i - 1].value) throw validationError(`Row ${i + 1}: must be bigger than the size above`, where);
    out.push({ size, value });
  });
  return out;
}

function cleanMeasureRow(r) {
  return { size: String(r.size), value: Number(r.value) };
}
function measureChartsWithDefaults(stored) {
  const src = stored || {};
  const out = {};
  Object.keys(MEASURE_TYPES).forEach((t) => {
    out[t] = Array.isArray(src[t]) ? src[t].map(cleanMeasureRow) : DEFAULT_MEASURE_CHARTS[t].map(cleanMeasureRow);
  });
  return out;
}
/** Saved settings without a type were set up before store types existed → clothing. Never saved → ''. */
function storeTypeOf(doc) {
  if (!doc) return '';
  return STORE_TYPES.includes(doc.storeType) ? doc.storeType : (doc.storeType === '' ? '' : 'clothing');
}

/**
 * Baby chart: 1–20 rows of { size, maxLength 40–120 cm, maxWeight 1.5–30 kg, maxAge 1–72 months },
 * sizes unique, each value bigger than the size above.
 */
function sanitizeBabyChart(raw) {
  const field = 'babyChart';
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw validationError('The size chart must be a list', field);
  if (raw.length > 20) throw validationError('The size chart can have at most 20 sizes', field);
  const out = [];
  const seen = new Set();
  raw.forEach((r, i) => {
    const size = String((r && r.size) || '').trim().slice(0, 10);
    const maxLength = num(r && r.maxLength);
    const maxWeight = num(r && r.maxWeight);
    const maxAge = Math.round(Number(r && r.maxAge));
    const where = `${field}[${i}]`;
    if (!size) throw validationError(`Row ${i + 1}: size name is required`, where);
    if (seen.has(size.toLowerCase())) throw validationError(`Row ${i + 1}: size ${size} is listed twice`, where);
    seen.add(size.toLowerCase());
    if (!(maxLength >= 40 && maxLength <= 120)) throw validationError(`Row ${i + 1}: length must be 40–120 cm`, where);
    if (!(maxWeight >= 1.5 && maxWeight <= 30)) throw validationError(`Row ${i + 1}: weight must be 1.5–30 kg`, where);
    if (!(maxAge >= 1 && maxAge <= 72)) throw validationError(`Row ${i + 1}: age must be 1–72 months`, where);
    const prev = out[i - 1];
    if (prev && (maxLength <= prev.maxLength || maxWeight <= prev.maxWeight || maxAge <= prev.maxAge)) {
      throw validationError(`Row ${i + 1}: length, weight and age must all be bigger than the size above`, where);
    }
    out.push({ size, maxLength, maxWeight, maxAge });
  });
  return out;
}
function cleanBabyRow(r) {
  return { size: String(r.size), maxLength: Number(r.maxLength), maxWeight: Number(r.maxWeight), maxAge: Number(r.maxAge) };
}

/**
 * Shopper answers for a baby: { mode: 'measure', lengthCm, weightKg } or { mode: 'age', ageMonths },
 * plus grow (room to grow). Null when out of range.
 */
function sanitizeBabyAnswers(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const grow = r.grow === true;
  if (r.mode === 'age') {
    const ageMonths = Math.round(Number(r.ageMonths));
    if (!(ageMonths >= BABY.age.min && ageMonths <= BABY.age.max) || r.ageMonths === '' || r.ageMonths == null) return null;
    return { mode: 'age', ageMonths, grow };
  }
  const lengthCm = num(r.lengthCm);
  const weightKg = num(r.weightKg);
  if (!(lengthCm >= BABY.length.min && lengthCm <= BABY.length.max)) return null;
  if (!(weightKg >= BABY.weight.min && weightKg <= BABY.weight.max)) return null;
  return { mode: 'measure', lengthCm, weightKg, grow };
}

/**
 * Length + weight → the smallest size that covers both. Age → the size whose age range holds it
 * (a size covers up to, not including, its maxAge). Grow → one size up when there is one.
 * Bigger than the chart → the largest size, flagged.
 */
function recommendBaby(chart, answers) {
  if (!Array.isArray(chart) || !chart.length || !answers) return null;
  let at = answers.mode === 'age'
    ? chart.findIndex((r) => answers.ageMonths < r.maxAge)
    : chart.findIndex((r) => r.maxLength >= answers.lengthCm && r.maxWeight >= answers.weightKg);
  const outOfRange = at === -1;
  if (outOfRange) at = chart.length - 1;
  const grew = answers.grow && !outOfRange && at < chart.length - 1;
  if (grew) at += 1;
  const status = grew ? 'grow' : answers.mode === 'age' ? 'age' : 'right';
  return { size: chart[at].size, outOfRange, reasons: [{ area: 'fit', status, basis: answers.mode }] };
}

/** Text on the product-page card, when the store has not changed it. */
const CARD_DEFAULTS = { cardTitle: 'Not sure about your size?', cardText: '3 quick questions · takes 20 seconds' };
const BUTTON_STYLES = ['filled', 'outline', 'soft'];

/** Words in the size advisor the store can change: [default, max length]. {size} = the recommended size. */
const ADVISOR_TEXTS = {
  womenLabel: ['Woman', 24],
  menLabel: ['Man', 24],
  advisorTitle: ['Find my size', 30],
  step1Title: ['Choose your avatar base', 50],
  step1Text: ['Pick the one closest to you.', 90],
  step2Title: ['Enter your height and weight', 50],
  step2Text: ['Used only to work out your size.', 90],
  step3Title: ['Choose your build', 50],
  step3Text: ['Pick the one that looks most like you.', 90],
  creatingTitle: ['Creating your avatar', 40],
  resultTitle: ['Recommended size', 40],
  addToBagText: ['Add to cart', 40],
  privacyText: ['Your data stays private and secure', 80],
};
// Defaults of the earlier design: a store that never changed them gets the new words.
const LEGACY_TEXTS = {
  womenLabel: 'Womenswear',
  menLabel: 'Menswear',
  advisorTitle: 'Size advisor',
  step1Title: 'Let’s find your fit',
  step1Text: 'Two measurements, about ten seconds.',
  step2Title: 'How do you like it to fit?',
  step2Text: 'Two quick choices make the size more accurate.',
  resultTitle: 'Your size',
  addToBagText: 'Add size {size} to bag',
};
const BUTTON_DEFAULT = 'Find my ideal size';
const LEGACY_BUTTON = 'Find my size';
/** Parts of the size advisor the store can turn off. */
const ADVISOR_OPTIONS = { liveEstimate: true, rememberSize: true, addToBag: true, sizeChart: true };

function cleanTexts(t) {
  const src = t && typeof t === 'object' ? t : {};
  const out = {};
  Object.keys(ADVISOR_TEXTS).forEach((k) => {
    const [def, max] = ADVISOR_TEXTS[k];
    const v = String(src[k] == null ? '' : src[k]).replace(/\s+/g, ' ').trim().slice(0, max);
    out[k] = v && v !== LEGACY_TEXTS[k] ? v : def;
  });
  return out;
}
function cleanOptions(o) {
  const src = o && typeof o === 'object' ? o : {};
  const out = {};
  Object.keys(ADVISOR_OPTIONS).forEach((k) => { out[k] = typeof src[k] === 'boolean' ? src[k] : ADVISOR_OPTIONS[k]; });
  return out;
}
function cleanButton(v) {
  const t = String(v || '').trim().slice(0, 40);
  return t && t !== LEGACY_BUTTON ? t : BUTTON_DEFAULT;
}
const MAX_RADIUS = 24; // 24 = fully round (pill)
function cleanRadius(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== '' && v !== null && v !== undefined ? Math.min(MAX_RADIUS, Math.max(0, n)) : MAX_RADIUS;
}

/** Full settings from the admin. Throws validation errors (→ 400). */
function sanitizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tag = String(r.productTag || '').trim().slice(0, 60);
  const storeType = r.storeType === undefined ? 'clothing' : r.storeType;
  if (!STORE_TYPES.includes(storeType)) throw validationError('Choose what your store sells', 'storeType');
  const measureCharts = {};
  Object.keys(MEASURE_TYPES).forEach((t) => {
    measureCharts[t] = r.measureCharts && r.measureCharts[t] !== undefined
      ? sanitizeMeasureChart(r.measureCharts[t], t)
      : DEFAULT_MEASURE_CHARTS[t].map(cleanMeasureRow);
  });
  const babyChart = r.babyChart !== undefined ? sanitizeBabyChart(r.babyChart) : DEFAULT_BABY_CHART.map(cleanBabyRow);
  const out = {
    storeType,
    enabled: r.enabled === true && storeType !== 'none',
    productTag: tag,
    buttonText: cleanButton(r.buttonText),
    cardTitle: String(r.cardTitle || '').trim().slice(0, 60) || CARD_DEFAULTS.cardTitle,
    cardText: String(r.cardText || '').trim().slice(0, 80) || CARD_DEFAULTS.cardText,
    buttonStyle: BUTTON_STYLES.includes(r.buttonStyle) ? r.buttonStyle : 'outline',
    buttonRadius: cleanRadius(r.buttonRadius),
    texts: cleanTexts(r.texts),
    options: cleanOptions(r.options),
    accentColor: COLOR_RE.test(String(r.accentColor || '')) ? String(r.accentColor) : '#111827',
    unit: r.unit === 'in' ? 'in' : 'cm',
    charts: {
      women: sanitizeChart(r.charts && r.charts.women, 'women'),
      men: sanitizeChart(r.charts && r.charts.men, 'men'),
    },
    measureCharts,
    babyChart,
  };
  if (storeType === 'baby' && !babyChart.length) {
    throw validationError('Add at least one size to the size chart', 'babyChart');
  }
  if (storeType === 'clothing' && !out.charts.women.length && !out.charts.men.length) {
    throw validationError('Add at least one size chart (Women or Men)', 'charts');
  }
  if (MEASURE_TYPES[storeType] && !measureCharts[storeType].length) {
    throw validationError('Add at least one size to the size chart', `measureCharts.${storeType}`);
  }
  return out;
}

/** Settings as stored, with defaults for a shop that never saved. */
function withDefaults(doc) {
  const d = doc || {};
  const charts = d.charts || {};
  const storeType = storeTypeOf(doc);
  return {
    storeType,
    enabled: d.enabled === true && storeType !== 'none' && storeType !== '',
    productTag: String(d.productTag || ''),
    buttonText: cleanButton(d.buttonText),
    cardTitle: String(d.cardTitle || CARD_DEFAULTS.cardTitle),
    cardText: String(d.cardText || CARD_DEFAULTS.cardText),
    buttonStyle: BUTTON_STYLES.includes(d.buttonStyle) ? d.buttonStyle : 'outline',
    buttonRadius: cleanRadius(d.buttonRadius),
    texts: cleanTexts(d.texts),
    options: cleanOptions(d.options),
    accentColor: COLOR_RE.test(String(d.accentColor || '')) ? d.accentColor : '#111827',
    unit: d.unit === 'in' ? 'in' : 'cm',
    charts: {
      women: Array.isArray(charts.women) ? charts.women.map(cleanRow) : DEFAULT_CHARTS.women.map(cleanRow),
      men: Array.isArray(charts.men) ? charts.men.map(cleanRow) : DEFAULT_CHARTS.men.map(cleanRow),
    },
    measureCharts: measureChartsWithDefaults(d.measureCharts),
    babyChart: Array.isArray(d.babyChart) ? d.babyChart.map(cleanBabyRow) : DEFAULT_BABY_CHART.map(cleanBabyRow),
  };
}

function cleanRow(r) {
  return { size: String(r.size), chest: Number(r.chest), waist: Number(r.waist), length: Number(r.length) || 0 };
}

/** What the storefront may see (no internal ids). */
function publicSettings(doc) {
  const s = withDefaults(doc);
  const m = MEASURE_TYPES[s.storeType] || (s.storeType === 'baby' ? BABY : null);
  return {
    storeType: s.storeType,
    enabled: s.enabled,
    productTag: s.productTag,
    buttonText: s.buttonText,
    cardTitle: s.cardTitle,
    // The clothing caption ("3 quick questions") doesn't fit a measure store: use that type's own.
    cardText: m && s.cardText === CARD_DEFAULTS.cardText ? m.caption : s.cardText,
    buttonStyle: s.buttonStyle,
    buttonRadius: s.buttonRadius,
    texts: s.texts,
    options: s.options,
    accentColor: s.accentColor,
    unit: s.unit,
    genders: s.storeType === 'clothing' ? GENDERS.filter((g) => s.charts[g].length > 0) : [],
    charts: s.charts,
    measure: MEASURE_TYPES[s.storeType] ? { type: s.storeType, ...publicMeasure(s.storeType), chart: s.measureCharts[s.storeType] } : null,
    baby: s.storeType === 'baby' ? { ...BABY, chart: s.babyChart } : null,
  };
}

/** A measure type's words and ranges for the storefront / admin preview (no tolerance maths needed there). */
function publicMeasure(type) {
  const { tolerance, ...rest } = MEASURE_TYPES[type];
  return rest;
}

/** One measurement from the shopper, in the type's unit (the storefront converts ring width etc.). */
function sanitizeMeasure(raw, type) {
  const m = MEASURE_TYPES[type];
  if (!m) return null;
  const value = num(raw && typeof raw === 'object' ? raw.value : raw);
  return value >= m.min && value <= m.max ? value : null;
}

/**
 * Smallest size whose value covers the measurement. None → the largest, outOfRange.
 * Reasons: one 'fit' entry — 'right' within the type's tolerance, else 'roomy' — with the size's value.
 */
function recommendByMeasure(chart, value, type) {
  const m = MEASURE_TYPES[type];
  if (!m || !Array.isArray(chart) || !chart.length) return null;
  let pick = chart.find((r) => r.value >= value);
  const outOfRange = !pick;
  if (!pick) pick = chart[chart.length - 1];
  const diff = pick.value - value;
  return {
    size: pick.size,
    outOfRange,
    reasons: [{ area: 'fit', status: outOfRange ? 'snug' : diff <= m.tolerance ? 'right' : 'roomy', value: pick.value }],
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
  const s = SHAPE_SHIFT[shape] || SHAPE_SHIFT.average;
  if (gender === 'men') {
    return {
      chest: 0.6 * weightKg + 0.25 * heightCm + 10 + s.chest,
      waist: 0.7 * weightKg + 0.15 * heightCm + 6 + s.waist,
    };
  }
  return {
    chest: 0.65 * weightKg + 0.2 * heightCm + 18 + s.chest,
    waist: 0.6 * weightKg + 0.15 * heightCm + 14 + s.waist,
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
  GENDERS, SHAPES, FITS, DEFAULT_CHARTS, CARD_DEFAULTS, BUTTON_STYLES, MAX_RADIUS, ADVISOR_TEXTS, ADVISOR_OPTIONS,
  STORE_TYPES, MEASURE_TYPES, DEFAULT_MEASURE_CHARTS, STORE_TYPE_CATALOG, BABY, DEFAULT_BABY_CHART,
  sanitizeBabyChart, sanitizeBabyAnswers, recommendBaby,
  sanitizeChart, sanitizeMeasureChart, sanitizeSettings, withDefaults, publicSettings, publicMeasure,
  sanitizeAnswers, estimateBody, recommendSize, sanitizeMeasure, recommendByMeasure,
};
