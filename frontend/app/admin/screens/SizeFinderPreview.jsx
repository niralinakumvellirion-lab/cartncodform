'use client';

import { useEffect, useState } from 'react';
import { apiSend } from '../../../lib/api';

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** Size advisor words the store can change — same defaults and limits as backend utils/sizeFinder.js. */
export const ADVISOR_TEXT_DEFAULTS = {
  womenLabel: 'Woman',
  menLabel: 'Man',
  advisorTitle: 'Find my size',
  step1Title: 'Choose your avatar base',
  step1Text: 'Pick the one closest to you.',
  step2Title: 'Enter your height and weight',
  step2Text: 'Used only to work out your size.',
  step3Title: 'Choose your build',
  step3Text: 'Pick the one that looks most like you.',
  creatingTitle: 'Creating your avatar',
  resultTitle: 'Recommended size',
  addToBagText: 'Add to cart',
  privacyText: 'Your data stays private and secure',
};
export const ADVISOR_TEXT_MAX = {
  womenLabel: 24, menLabel: 24, advisorTitle: 30, step1Title: 50, step1Text: 90,
  step2Title: 50, step2Text: 90, step3Title: 50, step3Text: 90, creatingTitle: 40,
  resultTitle: 40, addToBagText: 40, privacyText: 80,
};
export const ADVISOR_OPTION_DEFAULTS = { liveEstimate: true, rememberSize: true, addToBag: true, sizeChart: true };
/** Text with an empty value falling back to the default; {size} filled in. */
export function advisorText(texts, key, size) {
  const v = texts && typeof texts[key] === 'string' && texts[key].trim() ? texts[key].trim() : ADVISOR_TEXT_DEFAULTS[key];
  return size == null ? v : v.replace(/\{size\}/g, size);
}
// Same builds as ccf-size.js; "average" is shown as Balanced.
export const BUILDS = [
  ['slim', 'Slim', 'Lean, narrow frame', 0.86],
  ['athletic', 'Athletic', 'Broad chest, fit waist', 1.02],
  ['average', 'Balanced', 'Average proportions', 1],
  ['broad', 'Broad', 'Wider, fuller frame', 1.18],
];

export function heightLabel(cm, unit) {
  if (unit !== 'ft') return `${Math.round(cm)} cm`;
  const totalIn = Math.round(cm / CM_PER_IN);
  return `${Math.floor(totalIn / 12)}′ ${totalIn % 12}″`;
}
export function weightLabel(kg, unit) {
  return unit === 'lb' ? `${Math.round(kg / KG_PER_LB)} lb` : `${Math.round(kg)} kg`;
}
/** Corner radius of the product-page button: 24 or more = fully round. Same rule as ccf-size.js. */
export function ctaRadius(v) {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || !Number.isFinite(n) || n >= 24) return '999px';
  return `${Math.max(0, Math.round(n))}px`;
}
/** Mannequin scale from height/weight and build — same rule as ccf-size.js figureSvg. */
export function figureScale(heightCm, weightKg, build = 'average') {
  const bmi = weightKg / ((heightCm / 100) ** 2);
  const b = BUILDS.find((x) => x[0] === build);
  return {
    x: Math.max(0.8, Math.min(1.4, (bmi / 22) * (b ? b[3] : 1))),
    y: Math.max(0.88, Math.min(1.08, heightCm / 172)),
  };
}
/** The recommended size with its neighbours and their notes (same as the storefront result). */
export function sizeRows(chartSizes, rec) {
  const at = chartSizes.indexOf(String(rec));
  if (at === -1) return [{ size: String(rec), note: 'Recommended', rec: true }];
  return chartSizes.slice(Math.max(0, at - 1), at + 2).map((s) => {
    const i = chartSizes.indexOf(s);
    return { size: s, note: i === at ? 'Recommended' : i < at ? 'Fits close' : 'Roomy fit', rec: i === at };
  });
}

const I = (props) => (
  <svg width={props.s || 14} height={props.s || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.w || 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{props.children}</svg>
);
const TYPE_ICON = {
  baby: <><path d="M9 3h6l1 3 4 2-2 4-2-1v9H8v-9l-2 1-2-4 4-2z" /><path d="M10 6c.6.7 1.2 1 2 1s1.4-.3 2-1" /></>,
  shoes: <><path d="M3 16.5V8.5c0-.8.7-1.5 1.5-1.5H7l2 3.5c.9 1.6 2.6 2.5 4.4 2.5H15l4 1.2c1.2.4 2 1.4 2 2.6v.7H3z" /><path d="M3 19h18" /></>,
  rings: <><circle cx="12" cy="14.5" r="6" /><path d="M9.5 8.8 8 5.5h8l-1.5 3.3" /><path d="M10 5.5 12 3l2 2.5" /></>,
  bangles: <><ellipse cx="12" cy="12" rx="8.5" ry="4.5" /><ellipse cx="12" cy="12" rx="5.5" ry="2.6" /></>,
};
const SAMPLE_PRODUCT = { baby: 'Cotton Baby Romper', shoes: 'Canvas Sneakers', rings: 'Solitaire Silver Ring', bangles: 'Glass Bangle Set' };
const HANGER = <><path d="M12 6a2 2 0 1 1 2 2c-1 .4-2 1-2 2.2V11" /><path d="M12 11 3.5 17a1.5 1.5 0 0 0 .9 2.7h15.2a1.5 1.5 0 0 0 .9-2.7L12 11z" /></>;
const CHECK = <path d="M5 12l5 5L20 7" />;

// The sample product ("Cotton Kurta") worn on the result avatar — same kurta shape as ccf-size.js, with a
// sample block-print fabric (on the store the fabric is the product's own photo).
const KURTA = {
  body: 'M25 27.5Q32 32.5 39 27.5L46.5 29.5Q50.6 31 51.7 39L52.9 62L48.3 62.6L46.3 47L45.4 74L47.3 100L49.2 121Q32 123.2 14.8 121L16.7 100L18.6 74L17.7 47L15.7 62.6L11.1 62L12.3 39Q13.4 31 17.5 29.5Z',
  detail: 'M25 27.5Q32 32.5 39 27.5M32 30.6V42M48.3 62.6L52.9 62M15.7 62.6L11.1 62M15.2 117.8Q32 120 48.8 117.8M47.4 104.5L48.5 121M16.6 104.5L15.5 121M26 76L24 118M38 76L40 118',
};
function Garment({ id }) {
  return (
    <>
      <defs>
        <pattern id={`${id}f`} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="#D9C9AE" />
          <circle cx="2.5" cy="2.5" r=".9" fill="#B6563F" fillOpacity=".55" />
          <circle cx="0" cy="0" r=".5" fill="#2F5D62" fillOpacity=".45" /><circle cx="5" cy="5" r=".5" fill="#2F5D62" fillOpacity=".45" />
        </pattern>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".26" /><stop offset=".22" stopColor="#fff" stopOpacity=".08" />
          <stop offset=".5" stopColor="#000" stopOpacity="0" /><stop offset=".78" stopColor="#000" stopOpacity=".06" />
          <stop offset="1" stopColor="#000" stopOpacity=".28" />
        </linearGradient>
      </defs>
      <g className="sfp-garment" data-kind="kurta">
        <path d={KURTA.body} fill={`url(#${id}f)`} />
        <path d={KURTA.body} fill={`url(#${id}s)`} />
        <path d={KURTA.body} fill="none" stroke="#000" strokeOpacity=".28" strokeWidth=".45" strokeLinejoin="round" />
        <path d={KURTA.detail} fill="none" stroke="#000" strokeOpacity=".2" strokeWidth=".5" strokeLinecap="round" />
      </g>
    </>
  );
}

// Sample bangle set on a wrist in the bangles preview (on the store the bangles are the product photo).
function SampleBangles() {
  const band = (cy, top) => (top
    ? `M46 ${cy}A34 8.5 0 0 1 114 ${cy}L114 ${cy + 3.2}A34 8.5 0 0 0 46 ${cy + 3.2}Z`
    : `M46 ${cy}A34 8.5 0 0 0 114 ${cy}L114 ${cy + 3.2}A34 8.5 0 0 1 46 ${cy + 3.2}Z`);
  const rows = [114, 121, 128, 135];
  const colors = ['#C2185B', '#D4AF6A', '#C2185B', '#D4AF6A'];
  return (
    <svg className="sfp-bangle" data-kind="set" viewBox="0 0 160 190" aria-hidden="true">
      <defs>
        <linearGradient id="sfpbsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".6" /><stop offset=".4" stopColor="#fff" stopOpacity=".08" /><stop offset="1" stopColor="#000" stopOpacity=".3" /></linearGradient>
        <linearGradient id="sfpbskin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E3CBB2" /><stop offset=".45" stopColor="#F4E6D7" /><stop offset="1" stopColor="#DCC1A6" /></linearGradient>
      </defs>
      {rows.map((y, i) => <path key={`b${y}`} d={band(y, true)} fill={colors[i]} fillOpacity=".7" />)}
      <path d="M60 190V112C60 104 58 98 56 92L50 58C48 46 50 36 54 28L57 14C58 9 63 7 66 10L68 22L70 8C71 3 77 3 78 8L79 22L81 6C82 1 88 1 89 6L90 22L92 9C93 4 99 5 99 10L98 30C104 34 108 40 107 48L104 90C102 98 100 104 100 112V190Z" fill="url(#sfpbskin)" stroke="#C9AE93" />
      <path d="M57 64C66 58 72 58 78 63M66 40H74M77 38H86M88 40H96M60 100C72 103 88 103 100 100" fill="none" stroke="#C9AE93" strokeWidth=".9" strokeLinecap="round" />
      {rows.map((y, i) => (
        <g key={`f${y}`}>
          <path d={band(y, false)} fill={colors[i]} /><path d={band(y, false)} fill="url(#sfpbsh)" />
          <path d={band(y, false)} fill="none" stroke="#000" strokeOpacity=".3" strokeWidth=".7" />
        </g>
      ))}
    </svg>
  );
}

// Sample solitaire on a finger in the rings preview (on the store the metal and stone are the product photo).
function SampleRing() {
  const front = 'M49 96A31 9 0 0 0 111 96L105 96A25 6.4 0 0 1 55 96Z';
  const back = 'M49 96A31 9 0 0 1 111 96L105 96A25 6.4 0 0 0 55 96Z';
  return (
    <svg className="sfp-ring" data-kind="solitaire" viewBox="0 0 160 170" aria-hidden="true">
      <defs>
        <linearGradient id="sfpringm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B8892E" /><stop offset=".3" stopColor="#F6DC8E" /><stop offset=".5" stopColor="#D4AF6A" /><stop offset=".75" stopColor="#F2D27A" /><stop offset="1" stopColor="#A87A22" />
        </linearGradient>
        <radialGradient id="sfpringg" cx=".38" cy=".32" r=".7"><stop offset="0" stopColor="#fff" /><stop offset=".4" stopColor="#DDEBFA" /><stop offset="1" stopColor="#9DB8D6" /></radialGradient>
        <linearGradient id="sfpringskin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E3CBB2" /><stop offset=".45" stopColor="#F4E6D7" /><stop offset="1" stopColor="#DCC1A6" /></linearGradient>
      </defs>
      <path d={back} fill="url(#sfpringm)" /><path d={back} fill="#000" fillOpacity=".25" />
      <path d="M58 170V34C58 18 68 8 80 8S102 18 102 34V170Z" fill="url(#sfpringskin)" stroke="#C9AE93" />
      <path d="M69 30C69 20 74 15 80 15S91 20 91 30V40C91 44 87 46 80 46S69 44 69 40Z" fill="#F7EDE3" stroke="#D9C2AA" strokeWidth=".9" />
      <path d="M70 64C76 67 84 67 90 64M72 70C77 72 83 72 88 70" fill="none" stroke="#C9AE93" strokeWidth=".9" strokeLinecap="round" />
      <path d={front} fill="url(#sfpringm)" stroke="#000" strokeOpacity=".3" strokeWidth=".8" />
      <path d="M73 100L76 90M87 100L84 90" stroke="#8C7A5B" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="80" cy="92" r="8.5" fill="url(#sfpringg)" stroke="#000" strokeOpacity=".3" strokeWidth=".8" />
      <path d="M77 87l1.2 2.4 2.4 1.2-2.4 1.2-1.2 2.4-1.2-2.4-2.4-1.2 2.4-1.2z" fill="#fff" />
    </svg>
  );
}

// Sample sneaker in the shoes preview (on the store the upper is the product's own photo) — same shape as ccf-size.js.
function SampleShoe() {
  const upper = 'M30 92C28 72 33 56 50 49L70 45C79 35 92 31 104 34L113 40C127 52 150 60 176 66C194 70 205 79 205 90L205 92Z';
  return (
    <svg className="sfp-shoe" data-kind="sneaker" viewBox="0 0 230 124" aria-hidden="true">
      <defs>
        <pattern id="sfpshoef" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#3E6E8E" /><path d="M0 3H6M3 0V6" stroke="#fff" strokeOpacity=".08" strokeWidth="1" />
        </pattern>
        <linearGradient id="sfpshoes" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".26" />
        </linearGradient>
        <radialGradient id="sfpshoeg" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#000" stopOpacity=".22" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="117" cy="110" rx="96" ry="7" fill="url(#sfpshoeg)" />
      <path d="M24 91H207C212 91 213 97 211 101C209 105 204 107 198 107H34C28 107 23 103 23 98C23 94 22 91 24 91Z" fill="#F6F5F2" stroke="#000" strokeOpacity=".22" strokeWidth=".8" />
      <path d={upper} fill="url(#sfpshoef)" /><path d={upper} fill="url(#sfpshoes)" />
      <path d={upper} fill="none" stroke="#000" strokeOpacity=".3" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M50 49C59 56 73 58 87 52M108 41L114 50M117 45L122 55M126 50L131 59M135 54L139 63M144 58L147 66M168 67C185 71 197 79 203 89M33 72C33 61 37 54 44 50M62 80C96 86 140 86 182 78M30 97H205" fill="none" stroke="#000" strokeOpacity=".24" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function Mannequin({ heightCm, weightKg, build = 'average', h = 120, dressed = false }) {
  const s = figureScale(heightCm, weightKg, build);
  return (
    <svg width={Math.round(h * 0.42)} height={h} viewBox="0 0 64 160" aria-hidden="true"
      style={{ transform: `scale(${s.x.toFixed(3)},${s.y.toFixed(3)})`, transformOrigin: '50% 100%' }}>
      <defs>
        <linearGradient id={`sfpg${h}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B8B8B6" /><stop offset=".5" stopColor="#D9D9D7" /><stop offset="1" stopColor="#A8A8A6" />
        </linearGradient>
      </defs>
      <g fill={`url(#sfpg${h})`}>
        <ellipse cx="32" cy="13" rx="9" ry="10.5" />
        <path d="M28 23h8v5h-8z" />
        <path d="M18 30c4-3 9-3.5 14-3.5s10 .5 14 3.5c3 2 4 5 4.5 9l2.5 34c.2 3-1.5 5-3.5 5s-3.3-1.6-3.6-4L46 46l-1 30c0 6 .5 10 .5 14l-2 63c-.1 3-2 4.5-4.3 4.5s-4-1.6-4-4.4L33.5 94h-3L29 153c0 2.8-1.8 4.4-4 4.4s-4.2-1.5-4.3-4.5l-2-63c0-4 .5-8 .5-14l-1-30-2.4 28c-.3 2.4-1.6 4-3.6 4s-3.7-2-3.5-5l2.5-34c.5-4 1.5-7 4.5-9z" />
      </g>
      {dressed && <Garment id={`sfpw${h}`} />}
    </svg>
  );
}

/**
 * Live preview of the storefront "Find my size" — DISPLAY ONLY, the same design as ccf-size.js:
 * 1) the button shoppers see on the product page and 2) the "Try it on me"-style sheet with its screens
 * (avatar base, height & weight, build, creating, result). Re-draws from the unsaved settings: words,
 * button style/colour/corners, unit, options and the size chart for the Women/Men tab open in the editor.
 * The result uses a sample shopper and the backend maths (POST /api/size-finder/:shop/preview).
 */
export const SAMPLE_SHOPPER = {
  women: { heightCm: 162, weightKg: 60 },
  men: { heightCm: 175, weightKg: 72 },
};
export const VIEWS = [[1, 'Base'], [2, 'Height & weight'], [3, 'Build'], [4, 'Creating'], [5, 'Result']];
export const MEASURE_VIEWS = [[1, 'Measure'], [2, 'Result']];
const CLOTHING_CAPTION = '3 quick questions · takes 20 seconds';
/** Value with its unit, without trailing .0 ("25.4 cm", "52 mm"). */
export function measureLabel(v, unit) {
  const n = Math.round(Number(v) * 10) / 10;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${unit}`;
}

/** The little drawing on the measure screen — same drawings as ccf-size.js. */
export function MeasureArt({ type, h = 78 }) {
  const a = 'var(--sfp-accent)';
  return (
    <svg width={Math.round(h * 160 / 90)} height={h} viewBox="0 0 160 90" aria-hidden="true">
      {type === 'shoes' && (
        <>
          <rect x="8" y="64" width="144" height="16" rx="4" fill="#F3F4F6" stroke="#D1D5DB" />
          {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${16 + i * 10} 64v${i % 2 ? 4 : 7}`} stroke="#9CA3AF" />)}
          <path d="M22 40c0-10 9-17 24-17h52c14 0 26 5 30 13 3 7-2 14-12 15l-18 2H44c-14 0-22-5-22-13z" fill="#EADFD3" stroke="#C8B6A3" />
          {[[128, 30, 5], [136, 36, 3.6], [139, 42, 3.2], [139, 48, 2.8], [135, 53, 2.5]].map(([cx, cy, rr]) => <circle key={cx + cy} cx={cx} cy={cy} r={rr} fill="#EADFD3" stroke="#C8B6A3" />)}
          <path d="M22 58h122" stroke={a} strokeWidth="2" /><path d="M22 54v8M144 54v8" stroke={a} strokeWidth="2" />
        </>
      )}
      {type === 'rings' && (
        <>
          <rect x="62" y="4" width="34" height="86" rx="17" fill="#F1E4D6" stroke="#D9C2AA" />
          <path d="M70 18c3 2 15 2 18 0" stroke="#D9C2AA" fill="none" />
          <ellipse cx="79" cy="58" rx="20" ry="6" fill="none" stroke="#D4A24C" strokeWidth="4" />
          <ellipse cx="79" cy="36" rx="20" ry="5.5" fill="none" stroke={a} strokeWidth="2" strokeDasharray="4 3" />
          <path d="M99 36h48" stroke={a} strokeWidth="2" strokeDasharray="4 3" />
          {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${107 + i * 9} 40v6`} stroke="#9CA3AF" />)}
        </>
      )}
      {type === 'baby' && (
        <>
          <rect x="8" y="70" width="144" height="12" rx="4" fill="#F3F4F6" stroke="#D1D5DB" />
          {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${16 + i * 10} 70v${i % 2 ? 3 : 6}`} stroke="#9CA3AF" />)}
          <circle cx="34" cy="42" r="11" fill="#F1E4D6" stroke="#D9C2AA" />
          <path d="M45 34h52c8 0 14 4 18 8l14 2c5 1 5 9 0 10l-14 2c-4 4-10 8-18 8H45c-6 0-9-5-9-15s3-15 9-15z" fill="#DCEBFB" stroke="#A9C7EA" />
          <path d="M24 62h110" stroke={a} strokeWidth="2" /><path d="M24 58v8M134 58v8" stroke={a} strokeWidth="2" />
        </>
      )}
      {type === 'bangles' && (
        <>
          <path d="M52 86V50c0-8 2-14 6-18l4-18c1-5 8-5 9 0l1 12 2-16c1-5 8-5 9 0l1 16 2-14c1-5 8-5 9 0l1 16 2-10c1-5 8-4 8 1l-2 26c0 8-2 14-6 18v23z" fill="#F1E4D6" stroke="#D9C2AA" strokeLinejoin="round" />
          <path d="M44 48h72" stroke={a} strokeWidth="2" /><path d="M44 44v8M116 44v8" stroke={a} strokeWidth="2" />
          <ellipse cx="80" cy="80" rx="30" ry="7" fill="none" stroke="#D4A24C" strokeWidth="4" />
        </>
      )}
    </svg>
  );
}

export default function SizeFinderPreview({ shop, settings, gender: editorGender, view: viewProp, onViewChange, show = 'both', onShowBoth, highlight = null, storeType = 'clothing', measure: measureProp = null, measureChart = [], baby = null, babyChart = [] }) {
  // Baby & kids clothes use the same 2-screen layout as shoes / rings / bangles, with two sliders (or age).
  const measure = measureProp || (baby ? { ...baby, value: 'Length', unit: 'cm', start: baby.length.start, min: baby.length.min, max: baby.length.max } : null);
  const isMeasure = !!measure;
  const accent = HEX_RE.test(settings.accentColor || '') ? settings.accentColor : '#111827';
  const genders = ['women', 'men'].filter((g) => (settings.charts[g] || []).length > 0);
  const gender = genders.includes(editorGender) ? editorGender : (genders[0] || 'women');
  const [device, setDevice] = useState('desktop');
  const [ownView, setOwnView] = useState(5);
  const rawView = viewProp || ownView;
  const view = isMeasure ? Math.min(Math.max(rawView, 1), 2) : rawView;
  const setView = onViewChange || setOwnView;
  const t = (k, size) => advisorText(settings.texts, k, size);
  // ' is-hl' on the part of the preview that the field being edited changes.
  const hl = (...keys) => (highlight && keys.includes(highlight.key) ? ' is-hl' : '');
  const opt = { ...ADVISOR_OPTION_DEFAULTS, ...(settings.options || {}) };
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const chart = baby ? babyChart : isMeasure ? measureChart : (settings.charts[gender] || []);
  const chartKey = JSON.stringify(chart);
  const sample = SAMPLE_SHOPPER[gender];
  const hUnit = settings.unit === 'in' ? 'ft' : 'cm';
  const wUnit = settings.unit === 'in' ? 'lb' : 'kg';

  // Re-work the sample shopper's size whenever the chart (or Women/Men) changes.
  useEffect(() => {
    if (!chart.length) {
      setResult(null);
      setError('');
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const d = await apiSend(`/api/size-finder/${shop}/preview`, 'POST', isMeasure
          ? (baby
            ? { storeType: 'baby', chart, answers: { mode: 'measure', lengthCm: baby.length.start, weightKg: baby.weight.start } }
            : { storeType, chart, value: measure.start })
          : { chart, answers: { gender, heightCm: sample.heightCm, weightKg: sample.weightKg, shape: 'average', fit: 'regular' } });
        if (!cancelled) { setResult(d); setError(''); }
      } catch (e) {
        if (!cancelled) { setResult(null); setError(e.message || 'Could not work out a size'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, gender, chartKey, storeType]);

  const chartSizes = chart.map((r) => String(r.size));
  const heightPct = ((sample.heightCm - 140) / (210 - 140)) * 100;
  const weightPct = ((sample.weightKg - 40) / (140 - 40)) * 100;
  const style = settings.buttonStyle || 'outline';
  const label = (g) => (g === 'men' ? t('menLabel') : t('womenLabel'));

  const hasChart = isMeasure ? chart.length > 0 : genders.length > 0;
  const caption = isMeasure && (!settings.cardText || settings.cardText === CLOTHING_CAPTION) ? measure.caption : (settings.cardText || CLOTHING_CAPTION);
  const card = !hasChart ? (
    <p className="sfp-warn">{isMeasure ? 'The size chart is empty' : 'Both size charts are empty'}, so shoppers won&apos;t see the button.</p>
  ) : (
    <div className={`sfp-page${hl('productTag')}`}>
      <p className="sfp-pagelabel">Size</p>
      <div className="sfp-pills" aria-hidden="true">{(isMeasure ? chart.slice(0, 4).map((r) => String(r.size)) : ['S', 'M', 'L']).map((s, i) => <span key={s} className={i === 1 ? 'on' : ''}>{s}</span>)}</div>
      <span
        className={`sfp-trigger is-${style}${hl('buttonText', 'accentColor', 'buttonStyle', 'buttonRadius')}`}
        style={{ borderRadius: ctaRadius(settings.buttonRadius) }}
      >
        <I s={18}>{TYPE_ICON[storeType] || HANGER}</I>{settings.buttonText || 'Find my ideal size'}
      </span>
      <p className={`sfp-caption${hl('cardText')}`}>{caption}</p>
      <span className="sfp-addcart">Add to cart</span>
    </div>
  );

  const stepper = (n) => (
    <div className="sfp-stepper" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className="sfp-stepwrap">
          <span className={`sfp-dot${i < n ? ' is-done' : i === n ? ' is-on' : ''}`}>{i < n ? <I s={10} w={2.6}>{CHECK}</I> : i}</span>
          {i < 4 && <span className={`sfp-line${i < n ? ' is-done' : ''}`} />}
        </span>
      ))}
    </div>
  );
  const privacy = (
    <p className={`sfp-privacy${hl('privacyText')}`}>
      <I s={11} w={2}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></I>{t('privacyText')}
    </p>
  );
  const rows = result ? sizeRows(chartSizes, result.size) : [];

  const sheet = isMeasure ? (chart.length > 0 && (
    <div className="sfp-sheet">
      <div className="sfp-grab" />
      <div className="sfp-head">
        <span className="sfp-hicon" />
        <span className={`sfp-htitle${hl('advisorTitle')}`}>{t('advisorTitle')}</span>
        <span className="sfp-hicon">×</span>
      </div>
      <div className="sfp-body">
        {view === 1 && (
          <>
            <div className="sfp-stepper is-two" aria-hidden="true">
              <span className="sfp-stepwrap"><span className="sfp-dot is-on">1</span><span className="sfp-line" /></span>
              <span className="sfp-stepwrap"><span className="sfp-dot">2</span></span>
            </div>
            <p className="sfp-title">{measure.title}</p>
            <p className="sfp-lede">{measure.text}</p>
            <div className="sfp-art"><MeasureArt type={storeType} h={70} /></div>
            {measure.alt && (
              <div className="sfp-modes"><span className="on">Measure yourself</span><span>{measure.alt.label}</span></div>
            )}
            {baby && <div className="sfp-modes"><span className="on">Length &amp; weight</span><span>Age only</span></div>}
            {baby ? [['length', 'cm'], ['weight', 'kg']].map(([k, unit]) => {
              const f = baby[k];
              const pct = ((f.start - f.min) / (f.max - f.min)) * 100;
              return (
                <div key={k} className="sfp-field">
                  <div className="sfp-frow"><span className="sfp-flabel">{f.label}</span><span className="sfp-fval">{measureLabel(f.start, unit)}</span></div>
                  <div className="sfp-track"><span style={{ width: `${pct}%` }} /><b style={{ left: `${pct}%` }} /></div>
                </div>
              );
            }) : (
            <div className="sfp-field">
              <div className="sfp-frow">
                <span className="sfp-flabel">{measure.value}</span>
                <span className="sfp-fval">{measureLabel(measure.start, measure.unit)}</span>
              </div>
              <div className="sfp-track"><span style={{ width: `${((measure.start - measure.min) / (measure.max - measure.min)) * 100}%` }} /><b style={{ left: `${((measure.start - measure.min) / (measure.max - measure.min)) * 100}%` }} /></div>
              <div className="sfp-minmax"><span>{measureLabel(measure.min, measure.unit)}</span><span>{measureLabel(measure.max, measure.unit)}</span></div>
            </div>
            )}
            {baby && (
              <div className="sfp-fitcards">
                <span className="on"><b>Fits now</b><small>The size for today</small></span>
                <span><b>Room to grow</b><small>One size up</small></span>
              </div>
            )}
            {opt.liveEstimate && (
              <div className={`sfp-live${hl('liveEstimate')}`}><span>Likely size <b>{result ? result.size : '—'}</b></span></div>
            )}
            <div className="sfp-howto">
              <b>How to measure</b>
              <ol>{measure.howTo.map((h) => <li key={h}>{h}</li>)}</ol>
            </div>
            {opt.rememberSize && (
              <div className={`sfp-check${hl('rememberSize')}`}>
                <span><b>Remember my size</b><small>We save only the size, never your measurement.</small></span>
                <i className="sfp-box" aria-hidden="true" />
              </div>
            )}
          </>
        )}
        {view === 2 && (
          <>
            <p className="sfp-change">‹ Measure again</p>
            {error && <p className="sfp-err" role="alert">{error}</p>}
            {!error && !result && <p className="sfp-muted sfp-loading">{loading ? 'Working out the size…' : 'Add sizes to the chart to see a result.'}</p>}
            {!error && result && (
              <>
                <div className="sfp-result">
                  <div className={`sfp-pvis${storeType === 'shoes' ? ' is-shoe' : storeType === 'rings' ? ' is-ring' : storeType === 'bangles' ? ' is-bangle' : ''}`}>
                    {storeType === 'bangles' ? (
                      <>
                        <span className="sfp-wearing"><i />Wearing {result.size}</span>
                        <SampleBangles />
                        {(() => {
                          const row = chart.find((c) => String(c.size) === String(result.size));
                          if (!row) return null;
                          const v = Math.round((row.value - measure.start) * 10) / 10;
                          const zone = v < 0 ? 'tight' : v <= 2.5 ? 'right' : 'roomy';
                          const pos = Math.max(4, Math.min(96, ((v + 2) / 8) * 100));
                          const text = v < 0 ? `${Math.abs(v)} mm smaller than your hand — hard to slip on`
                            : v <= 2.5 ? `${v === 0 ? 'Exact fit' : `${v} mm room`} — slides on, sits well` : `${v} mm extra — loose on the wrist`;
                          return (
                            <div className={`sfp-toe is-${zone}`}>
                              <div className="sfp-toebar"><span className="is-tight" /><span className="is-right" /><span className="is-roomy" /><i style={{ left: `${pos}%` }} /></div>
                              <p>{text}</p>
                            </div>
                          );
                        })()}
                      </>
                    ) : storeType === 'rings' ? (
                      <>
                        <span className="sfp-wearing"><i />Wearing {result.size}</span>
                        <SampleRing />
                        {(() => {
                          const row = chart.find((c) => String(c.size) === String(result.size));
                          if (!row) return null;
                          const v = Math.round((row.value - measure.start) * 10) / 10;
                          const zone = v < 0 ? 'tight' : v <= 1.5 ? 'right' : 'roomy';
                          const pos = Math.max(4, Math.min(96, ((v + 1.5) / 4.5) * 100));
                          const text = v < 0 ? `${Math.abs(v)} mm smaller than your finger — tight`
                            : v === 0 ? 'Exact fit — comfortable' : v <= 1.5 ? `${v} mm room — comfortable` : `${v} mm extra — may slip`;
                          return (
                            <div className={`sfp-toe is-${zone}`}>
                              <div className="sfp-toebar"><span className="is-tight" /><span className="is-right" /><span className="is-roomy" /><i style={{ left: `${pos}%` }} /></div>
                              <p>{text}</p>
                            </div>
                          );
                        })()}
                      </>
                    ) : storeType === 'shoes' ? (
                      <>
                        <span className="sfp-wearing"><i />Wearing {result.size}</span>
                        <SampleShoe />
                        {(() => {
                          const row = chart.find((c) => String(c.size) === String(result.size));
                          if (!row) return null;
                          const v = Math.round((row.value - measure.start) * 10) / 10;
                          const zone = v < 0 ? 'tight' : v <= 1 ? 'right' : 'roomy';
                          const pos = Math.max(4, Math.min(96, ((v + 1) / 3) * 100));
                          return (
                            <div className={`sfp-toe is-${zone}`}>
                              <div className="sfp-toebar"><span className="is-tight" /><span className="is-right" /><span className="is-roomy" /><i style={{ left: `${pos}%` }} /></div>
                              <p>{v < 0 ? `${Math.abs(v)} cm shorter than your foot — tight` : `${v} cm toe room — ${zone === 'right' ? 'just right' : 'roomy'}`}</p>
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                    <span className="sfp-pimg"><I s={30} w={1.4}>{TYPE_ICON[storeType]}</I></span>
                    )}
                    <span className="sfp-me">{baby ? `${measureLabel(baby.length.start, 'cm')} · ${measureLabel(baby.weight.start, 'kg')}` : `${measure.value.split(' ')[0]} ${measureLabel(measure.start, measure.unit)}`}</span>
                  </div>
                  <div>
                    <div className="sfp-prod"><span className="sfp-thumb" /><span><b>{SAMPLE_PRODUCT[storeType]}</b><small>₹1,499</small></span></div>
                    <div className="sfp-hero">
                      <p className={`sfp-rtitle${hl('resultTitle')}`}>{t('resultTitle')}</p>
                      <div className="sfp-big"><b>{result.size}</b><span className="sfp-pill">✓ Best match</span></div>
                      <p className="sfp-fit">{(() => {
                        const st = result.reasons && result.reasons[0] && result.reasons[0].status;
                        return baby ? (baby.fit[st] || baby.fit.right) : measure.fit[st === 'roomy' ? 'roomy' : 'right'];
                      })()}</p>
                    </div>
                    <p className="sfp-other">Compare sizes</p>
                    <div className={`sfp-sizes${hl('chart')}`}>
                      {rows.map((r) => (
                        <div key={r.size} className={`sfp-size${r.rec ? ' is-rec' : ''}`}>
                          <b aria-label={r.rec ? 'Recommended size' : undefined}>{r.size}</b><small>{r.rec ? 'Recommended' : r.note === 'Fits close' ? 'Snugger' : 'Looser'}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {result.outOfRange && <p className="sfp-note is-warn">{result.size} is the largest size in the chart — it may feel tight.</p>}
                <div className="sfp-links">{opt.sizeChart && <span className={hl('sizeChart').trim()}>View size chart</span>}<span>Edit measurement</span></div>
                <p className="sfp-fine">A guide based on your measurement and this product’s size chart.</p>
              </>
            )}
          </>
        )}
      </div>
      <div className="sfp-foot">
        {view === 1 && <span className="sfp-main">Find my size</span>}
        {view === 2 && result && (opt.addToBag
          ? <><span className={`sfp-main${hl('addToBag', 'addToBagText')}`}>{t('addToBagText', result.size)}</span><span className="sfp-ghost">Just select size {result.size}</span></>
          : <span className={`sfp-main${hl('addToBag')}`}>Select size {result.size}</span>)}
        {view === 1 && privacy}
      </div>
    </div>
  )) : genders.length > 0 && (
    <div className="sfp-sheet">
      <div className="sfp-grab" />
      <div className="sfp-head">
        <span className="sfp-hicon">{(view === 2 || view === 3) && <I s={14} w={2}><path d="M15 6l-6 6 6 6" /></I>}</span>
        <span className={`sfp-htitle${hl('advisorTitle')}`}>{t('advisorTitle')}</span>
        <span className="sfp-hicon">×</span>
      </div>
      <div className="sfp-body">
        {view === 1 && (
          <>
            {stepper(1)}
            <p className={`sfp-title${hl('step1Title')}`}>{t('step1Title')}</p>
            <p className={`sfp-lede${hl('step1Text')}`}>{t('step1Text')}</p>
            <div className="sfp-figure"><Mannequin heightCm={170} weightKg={64} h={110} /></div>
            <div className="sfp-rows">
              {['men', 'women'].filter((g) => genders.includes(g)).map((g) => (
                <div key={g} className={`sfp-row${g === gender ? ' is-on' : ''}${hl(g === 'men' ? 'menLabel' : 'womenLabel', 'chart')}`}>
                  <span className="sfp-ricon"><I s={13}>{g === 'men' ? <><circle cx="10" cy="14" r="5" /><path d="M14 10l6-6M15 4h5v5" /></> : <><circle cx="12" cy="9" r="5" /><path d="M12 14v7M9 18h6" /></>}</I></span>
                  <span className="sfp-rlabel">{label(g)}</span>
                  <span className="sfp-rchev">›</span>
                </div>
              ))}
            </div>
          </>
        )}

        {view === 2 && (
          <>
            {stepper(2)}
            <p className={`sfp-title${hl('step2Title')}`}>{t('step2Title')}</p>
            <p className={`sfp-lede${hl('step2Text')}`}>{t('step2Text')}</p>
            <div className="sfp-figure is-small"><Mannequin heightCm={sample.heightCm} weightKg={sample.weightKg} h={70} /></div>
            {[['Height', heightLabel(sample.heightCm, hUnit), heightPct, hUnit === 'ft' ? ['4′ 7″', '6′ 11″'] : ['140 cm', '210 cm'], [['cm', 'cm'], ['ft', 'ft']], hUnit],
              ['Weight', weightLabel(sample.weightKg, wUnit), weightPct, wUnit === 'lb' ? ['88 lb', '309 lb'] : ['40 kg', '140 kg'], [['kg', 'kg'], ['lb', 'lb']], wUnit]].map(([name, val, pct, mm, units, cur]) => (
              <div key={name} className="sfp-field">
                <div className="sfp-frow">
                  <span className="sfp-flabel">{name}<span className={`sfp-units${hl('unit')}`}>{units.map(([u, l]) => <span key={u} className={u === cur ? 'on' : ''}>{l}</span>)}</span></span>
                  <span className="sfp-fval">{val}</span>
                </div>
                <div className="sfp-track"><span style={{ width: `${pct}%` }} /><b style={{ left: `${pct}%` }} /></div>
                <div className="sfp-minmax"><span>{mm[0]}</span><span>{mm[1]}</span></div>
              </div>
            ))}
            {opt.liveEstimate && (
              <div className={`sfp-live${hl('liveEstimate')}`}><span>Likely size <b>{result ? result.size : '—'}</b></span></div>
            )}
          </>
        )}

        {view === 3 && (
          <>
            {stepper(3)}
            <p className={`sfp-title${hl('step3Title')}`}>{t('step3Title')}</p>
            <p className={`sfp-lede${hl('step3Text')}`}>{t('step3Text')}</p>
            <div className="sfp-builds">
              {BUILDS.map(([v, l, hint, sx]) => (
                <div key={v} className={`sfp-build${v === 'average' ? ' on' : ''}`}>
                  <span className="sfp-bfig"><Mannequin heightCm={170} weightKg={22 * 2.89 * sx} h={34} /></span>
                  <span className="sfp-bcopy"><b>{l}</b><small>{hint}</small></span>
                  {v === 'average' && <span className="sfp-bcheck"><I s={9} w={2.6}>{CHECK}</I></span>}
                </div>
              ))}
            </div>
            {opt.rememberSize && (
              <div className={`sfp-check${hl('rememberSize')}`}>
                <span><b>Remember my size</b><small>We save only the size, never your height or weight.</small></span>
                <i className="sfp-box" aria-hidden="true" />
              </div>
            )}
          </>
        )}

        {view === 4 && (
          <div className="sfp-creating">
            <div className="sfp-shirt"><I s={22} w={1.6}><path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z" /></I></div>
            <p className={`sfp-title${hl('creatingTitle')}`}>{t('creatingTitle')}</p>
            <div className="sfp-stage2"><span className="sfp-pedestal" /><Mannequin heightCm={sample.heightCm} weightKg={sample.weightKg} h={140} /></div>
            <div className="sfp-bar"><span /></div>
            <p className="sfp-status">Generating…</p>
          </div>
        )}

        {view === 5 && (
          <>
            <p className="sfp-change">‹ Change my avatar</p>
            {error && <p className="sfp-err" role="alert">{error}</p>}
            {!error && !result && <p className="sfp-muted sfp-loading">{loading ? 'Working out the size…' : 'Add sizes to this chart to see a result.'}</p>}
            {!error && result && (
              <>
                <div className="sfp-result">
                  <div className="sfp-avatar"><span className="sfp-floor" /><Mannequin heightCm={sample.heightCm} weightKg={sample.weightKg} h={150} dressed /><span className="sfp-wearing"><i />Wearing {result.size}</span><span className="sfp-me">{heightLabel(sample.heightCm, 'cm')} · {weightLabel(sample.weightKg, 'kg')}</span></div>
                  <div>
                    <div className="sfp-prod"><span className="sfp-thumb" /><span><b>Cotton Kurta</b><small>₹1,299</small></span></div>
                    <div className="sfp-hero">
                      <p className={`sfp-rtitle${hl('resultTitle')}`}>{t('resultTitle')}</p>
                      <div className="sfp-big"><b>{result.size}</b><span className="sfp-pill">✓ Best match</span></div>
                    </div>
                    <p className="sfp-other">Compare sizes</p>
                    <div className={`sfp-sizes${hl('chart')}`}>
                      {rows.map((r) => (
                        <div key={r.size} className={`sfp-size${r.rec ? ' is-rec' : ''}`}>
                          <b aria-label={r.rec ? 'Recommended size' : undefined}>{r.size}</b><small>{r.note}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {result.outOfRange && <p className="sfp-note is-warn">{result.size} is the largest size in the chart — it may feel tight.</p>}
                <div className="sfp-links">{opt.sizeChart && <span className={hl('sizeChart').trim()}>View size chart</span>}<span>Edit details</span></div>
                <p className="sfp-fine">A guide based on your details and this product’s size chart.</p>
              </>
            )}
          </>
        )}
      </div>
      <div className="sfp-foot">
        {(view === 2 || view === 3) && <span className="sfp-main">Continue</span>}
        {view === 5 && result && (opt.addToBag
          ? <><span className={`sfp-main${hl('addToBag', 'addToBagText')}`}>{t('addToBagText', result.size)}</span><span className="sfp-ghost">Just select size {result.size}</span></>
          : <span className={`sfp-main${hl('addToBag')}`}>Select size {result.size}</span>)}
        {view <= 3 && privacy}
      </div>
    </div>
  );

  return (
    <section className="sfp" style={{ '--sfp-accent': accent, '--sfp-tint': `${accent}14` }} aria-label="Live preview">
      <style>{CSS}</style>
      <div className="sfp-top">
        <div>
          <p className="sfp-label">Live preview</p>
          <p className="sfp-muted">
            {highlight && highlight.label ? <span className="sfp-editing" data-testid="preview-editing"><i aria-hidden="true" />Editing: {highlight.label}</span> : null}
            {highlight && highlight.label ? ' · ' : null}
            {show === 'card' ? 'Showing the button you are editing' : show === 'advisor' ? 'Showing the size preview you are editing' : 'View only · updates as you edit, before you save'}
            {show !== 'both' && onShowBoth && (
              <> · <button type="button" className="sfp-both" onClick={onShowBoth}>Show both</button></>
            )}
          </p>
        </div>
        <div className="sfp-dev" role="group" aria-label="Preview size">
          {[['desktop', 'Desktop'], ['mobile', 'Mobile']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={device === v} onClick={() => setDevice(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className={`sfp-stage${device === 'mobile' ? ' is-mobile' : ''}`}>
        {show !== 'advisor' && (
        <div className="sfp-block">
          <p className="sfp-blocktitle"><span>1</span>Button on the product page</p>
          {/* Display only: inert = no clicks, no keyboard focus inside the previews. */}
          <div className="sfp-cardbox sfp-static" data-testid="preview-card" {...{ inert: '' }}>{card}</div>
        </div>
        )}

        {show !== 'card' && (
        <div className="sfp-block">
          <div className="sfp-blockhead">
            <p className="sfp-blocktitle"><span>2</span>Size preview</p>
            <div className="sfp-views" role="group" aria-label="Preview screen">
              {(isMeasure ? MEASURE_VIEWS : VIEWS).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="sfp-frame sfp-static" data-testid="preview-frame" {...{ inert: '' }}>
            {sheet || <p className="sfp-warn">Add a size chart to see the size preview.</p>}
          </div>
        </div>
        )}
      </div>
      <p className="sfp-sample">
        {isMeasure
          ? (baby
            ? <>Sample baby: {measureLabel(baby.length.start, 'cm')} long, {measureLabel(baby.weight.start, 'kg')}.</>
            : <>Sample shopper: {measure.value.toLowerCase()} {measureLabel(measure.start, measure.unit)}.</>)
          : <>Sample shopper: {gender === 'men' ? 'Men' : 'Women'}, {heightLabel(sample.heightCm, hUnit)}, {weightLabel(sample.weightKg, wUnit)}, balanced build.</>}
      </p>
    </section>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap');
.sfp{font-family:Inter,-apple-system,BlinkMacSystemFont,'San Francisco','Segoe UI',Roboto,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;background:#fff;border-radius:12px;padding:16px;color:#111;box-shadow:0 1px 0 0 rgba(26,26,26,.07),inset 0 -1px 0 0 rgba(0,0,0,.08),inset 1px 0 0 0 rgba(0,0,0,.04),inset -1px 0 0 0 rgba(0,0,0,.04)}
.sfp *{box-sizing:border-box}
.sfp p{margin:0}
.sfp button{font-family:inherit}
.sfp-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.sfp-label{font-weight:650;font-size:14px;line-height:20px;color:#303030}
.sfp-muted{font-size:13px;line-height:20px;color:#616161;font-weight:450}
.sfp-dev,.sfp-views{display:inline-flex;background:#F1F1F1;border-radius:8px;padding:3px;flex-shrink:0}
.sfp-views{flex-wrap:wrap}
.sfp-dev button,.sfp-views button{border:0;background:transparent;border-radius:6px;height:26px;padding:0 10px;font-size:12px;font-weight:550;color:#616161;cursor:pointer}
.sfp-dev button[aria-pressed="true"],.sfp-views button[aria-pressed="true"]{background:#fff;color:#303030;box-shadow:0 1px 0 rgba(26,26,26,.07),0 0 0 1px #E3E3E3}
.sfp-both{background:none;border:0;padding:0;font-size:12px;font-weight:600;color:#303030;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.sfp-sample{font-size:12px;color:#616161;margin:10px 2px 0;font-weight:450}
.sfp-stage{display:flex;flex-direction:column;gap:14px}
.sfp-block{background:#F7F7F7;border-radius:10px;padding:14px}
.sfp-blockhead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px}
.sfp-blocktitle{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650;color:#303030;margin:0 0 10px}
.sfp-blockhead .sfp-blocktitle{margin:0}
.sfp-blocktitle span{display:none}
.sfp-cardbox{background:#fff;border-radius:10px;padding:14px;max-width:440px;margin:0 auto}
.sfp-frame{max-width:380px;margin:0 auto;border-radius:20px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.14);border:1px solid #E7E7E5;background:#fff}
.sfp-stage.is-mobile .sfp-cardbox{max-width:340px}
.sfp-stage.is-mobile .sfp-frame{max-width:330px;border-radius:20px 20px 0 0}
.sfp-stage.is-mobile .sfp-grab{display:block;width:34px;height:4px;border-radius:4px;background:#D1D5DB;margin:7px auto 0}
.sfp-static{pointer-events:none;user-select:none}
.sfp .is-hl{outline:1px dashed #A5B4FC;outline-offset:2px;border-radius:6px;animation:sfp-hl 1.2s ease-in-out infinite}
@keyframes sfp-hl{0%,100%{outline-color:#4F46E5}50%{outline-color:#C7D2FE}}
@media (prefers-reduced-motion:reduce){.sfp .is-hl{animation:none}}
.sfp-editing{display:inline-flex;align-items:center;gap:5px;color:#4338CA;font-weight:600}
.sfp-editing i{width:7px;height:7px;border-radius:50%;background:#4F46E5;box-shadow:0 0 0 3px rgba(79,70,229,.2)}
.sfp-warn{font-size:12px;color:#B45309;background:#FFFBEB;border-radius:8px;padding:8px 10px}

/* product page */
.sfp-page{display:flex;flex-direction:column;gap:8px}
.sfp-pagelabel{font-size:12px;color:#4B5563}
.sfp-pills{display:flex;gap:6px}
.sfp-pills span{min-width:40px;text-align:center;padding:7px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px}
.sfp-pills span.on{border-color:#111;box-shadow:inset 0 0 0 1px #111}
.sfp-trigger{display:flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:10px 14px;border:1.5px solid var(--sfp-accent);background:#fff;color:var(--sfp-accent);font-size:13.5px;font-weight:600}
.sfp-trigger.is-filled{background:var(--sfp-accent);color:#fff}
.sfp-trigger.is-soft{background:var(--sfp-tint);border-color:transparent}
.sfp-caption{font-size:11.5px;color:#6B7280;text-align:center;margin:-2px 0 0 !important}
.sfp-addcart{display:block;text-align:center;padding:10px;border-radius:6px;background:#111;color:#fff;font-size:13px;font-weight:600;opacity:.85}

/* sheet */
.sfp-sheet{display:flex;flex-direction:column;background:#fff;font-size:12.5px}
.sfp-grab{display:none}
.sfp-head{display:grid;grid-template-columns:26px 1fr 26px;align-items:center;padding:11px 12px 4px}
.sfp-hicon{display:flex;align-items:center;justify-content:center;font-size:17px;line-height:1;color:#111}
.sfp-htitle{text-align:center;font-size:12.5px;font-weight:600}
.sfp-body{padding:2px 18px 6px}
.sfp-stepper{display:flex;justify-content:center;margin:2px 0 10px}
.sfp-stepwrap{display:inline-flex;align-items:center}
.sfp-dot{width:20px;height:20px;border-radius:50%;border:1.5px solid #D1D5DB;color:#9CA3AF;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;background:#fff}
.sfp-dot.is-on,.sfp-dot.is-done{border-color:#111;background:#111;color:#fff}
.sfp-line{width:26px;height:1.5px;background:#E5E7EB}
.sfp-line.is-done{background:#111}
.sfp-title{text-align:center;font-size:16px;font-weight:650;letter-spacing:-.01em;line-height:1.25}
.sfp-lede{text-align:center;font-size:11.5px;color:#6B7280;margin:3px 0 0 !important}
.sfp-figure{display:flex;justify-content:center;align-items:flex-end;margin:10px auto 6px}
.sfp-figure.is-small{margin:6px auto 2px}
.sfp-rows{border-top:1px solid #F0F0F0;margin-top:6px}
.sfp-row{display:flex;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid #F0F0F0;font-size:13px;font-weight:500}
.sfp-row.is-on{font-weight:650}
.sfp-ricon{width:28px;height:28px;border-radius:50%;background:#F3F4F6;display:flex;align-items:center;justify-content:center}
.sfp-rlabel{flex:1}
.sfp-rchev{color:#9CA3AF;font-size:16px}
.sfp-field{margin:10px 0 4px}
.sfp-frow{display:flex;justify-content:space-between;align-items:center}
.sfp-flabel{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}
.sfp-units{display:inline-flex;gap:1px}
.sfp-units span{padding:1px 5px;border-radius:5px;font-size:10px;color:#9CA3AF}
.sfp-units span.on{background:#F3F4F6;color:#111;font-weight:600}
.sfp-fval{font-size:12.5px;font-weight:650;padding:3px 8px;border:1px solid #E5E7EB;border-radius:7px;min-width:62px;text-align:center}
.sfp-track{position:relative;height:3px;border-radius:3px;background:#E5E7EB;margin:12px 0 6px}
.sfp-track > span{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:#111}
.sfp-track > b{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#111;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.sfp-minmax{display:flex;justify-content:space-between;font-size:9.5px;color:#9CA3AF}
.sfp-live{display:flex;justify-content:center;margin:8px 0 2px}
.sfp-live span{font-size:11px;color:#374151;background:#F3F4F6;border-radius:999px;padding:4px 10px}
.sfp-live b{font-size:12px;color:#111}
.sfp-builds{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}
.sfp-build{position:relative;display:flex;align-items:center;gap:7px;padding:9px;border:1.5px solid #E5E7EB;border-radius:11px}
.sfp-build.on{border-color:#111;box-shadow:0 0 0 1px #111}
.sfp-bfig{width:18px;display:flex;justify-content:center}
.sfp-bcopy{display:flex;flex-direction:column;min-width:0}
.sfp-bcopy b{font-size:12px}
.sfp-bcopy small{font-size:9.5px;color:#6B7280;line-height:1.25}
.sfp-bcheck{position:absolute;top:6px;right:6px;width:15px;height:15px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center}
.sfp-check{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#F9FAFB;border-radius:10px;padding:8px 10px;margin-top:10px}
.sfp-check b{display:block;font-size:11.5px}
.sfp-check small{font-size:9.5px;color:#6B7280}
.sfp-box{width:14px;height:14px;border:1.5px solid #9CA3AF;border-radius:4px;flex-shrink:0}
.sfp-creating{text-align:center;padding:6px 0 4px}
.sfp-shirt{display:flex;justify-content:center;margin-bottom:4px}
.sfp-stage2{position:relative;display:flex;justify-content:center;align-items:flex-end;height:150px;margin:8px 0 4px}
.sfp-stage2 svg{position:relative;z-index:1}
.sfp-pedestal{position:absolute;bottom:-4px;left:50%;width:130px;height:24px;margin-left:-65px;border-radius:50%;border:1.5px solid #D1D5DB;background:radial-gradient(ellipse at center,#F3F4F6 0,#fff 70%)}
.sfp-bar{height:3px;border-radius:3px;background:#E5E7EB;overflow:hidden;margin:12px 0 6px}
.sfp-bar span{display:block;height:100%;width:60%;background:#111}
.sfp-status{font-size:11px;color:#6B7280}
.sfp-change{font-size:11.5px;font-weight:600;margin:2px 0 6px !important}
.sfp-result{display:grid;grid-template-columns:40% 1fr;gap:10px}
.sfp-avatar{position:relative;border-radius:14px;background:radial-gradient(120% 70% at 50% 18%,#FFFFFF 0,#F4F3F0 55%,#E9E7E2 100%);display:flex;align-items:flex-end;justify-content:center;min-height:180px;padding:8px 0 20px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)}
.sfp-floor{position:absolute;left:50%;bottom:15px;width:62%;height:10px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.16) 0,rgba(0,0,0,0) 70%)}
.sfp-wearing{position:absolute;top:7px;left:7px;display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;background:rgba(17,17,17,.86);color:#fff;font-size:8.5px;font-weight:650}
.sfp-wearing i{width:5px;height:5px;border-radius:50%;background:#4ADE80}
.sfp-avatar svg{filter:drop-shadow(0 4px 8px rgba(0,0,0,.08))}
.sfp-me{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(0,0,0,.08);font-size:9px;font-weight:600;color:#374151;white-space:nowrap}
.sfp-prod{display:flex;gap:7px;align-items:center;padding-bottom:8px;border-bottom:1px solid #F0F0F0}
.sfp-thumb{width:32px;height:32px;border-radius:7px;background:linear-gradient(135deg,#E9E4DA,#D8D0C2);flex-shrink:0}
.sfp-prod b{display:block;font-size:11.5px}
.sfp-prod small{font-size:10.5px;color:#6B7280}
.sfp-hero{margin-top:8px;padding:8px 10px;border-radius:11px;background:#FAFAF9;border:1px solid #EFEEEC}
.sfp-rtitle{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6B7280;margin:0 !important}
.sfp-big{display:flex;align-items:center;gap:7px;margin-top:2px}
.sfp-big b{font-size:24px;line-height:1.1;font-weight:750}
.sfp-pill{padding:2px 6px;border-radius:999px;font-size:9px;font-weight:650;background:#DCFCE7;color:#166534}
.sfp-other{font-size:9.5px;font-weight:600;color:#6B7280;margin:8px 0 4px !important}
.sfp-sizes{display:flex;gap:4px}
.sfp-size{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 2px;border:1.5px solid #E5E7EB;border-radius:9px}
.sfp-size b{font-size:12px}
.sfp-size small{font-size:8.5px;color:#6B7280;white-space:nowrap}
.sfp-size.is-rec{border-color:#111;background:#111;color:#fff}
.sfp-size.is-rec small{color:rgba(255,255,255,.8);font-weight:650}
.sfp-note{font-size:10.5px;color:#374151;margin:8px 0 0 !important;padding:7px 9px;border-radius:9px;background:#F3F4F6}
.sfp-note.is-warn{background:#FFFBEB;color:#78350F}
.sfp-links{display:flex;justify-content:center;gap:6px;margin:10px 0 2px}
.sfp-links span{font-size:10px;font-weight:600;padding:4px 9px;border:1px solid #E5E7EB;border-radius:999px}
.sfp-fine{text-align:center;font-size:9px;color:#9CA3AF;margin:6px 0 0 !important}
.sfp-stepper.is-two{max-width:120px;margin-left:auto;margin-right:auto}
.sfp-art{display:flex;justify-content:center;margin:6px 0 8px;padding:8px;border-radius:12px;background:linear-gradient(180deg,#FAFAF9,#F3F2EF)}
.sfp-modes{display:flex;background:#F1F1F1;border-radius:9px;padding:3px;margin:0 0 8px}
.sfp-modes span{flex:1;text-align:center;font-size:10px;font-weight:600;color:#6B7280;padding:5px 4px;border-radius:7px}
.sfp-modes span.on{background:#fff;color:#111;box-shadow:0 1px 2px rgba(0,0,0,.1)}
.sfp-fitcards{display:flex;gap:6px;margin:8px 0 0}
.sfp-fitcards span{flex:1;display:flex;flex-direction:column;gap:1px;padding:7px 8px;border:1.5px solid #E5E7EB;border-radius:9px;background:#fff}
.sfp-fitcards span.on{border-color:var(--sfp-accent);box-shadow:0 0 0 1px var(--sfp-accent)}
.sfp-fitcards b{font-size:10.5px}
.sfp-fitcards small{font-size:9px;color:#6B7280}
.sfp-howto{margin-top:8px;padding:8px 10px;border-radius:10px;background:#F7F7F5;font-size:10px;color:#374151}
.sfp-howto b{font-size:10.5px}
.sfp-howto ol{margin:4px 0 0;padding-left:15px;display:flex;flex-direction:column;gap:2px;line-height:1.35}
.sfp-pvis{position:relative;border-radius:14px;background:radial-gradient(120% 70% at 50% 18%,#FFFFFF 0,#F4F3F0 55%,#E9E7E2 100%);min-height:170px;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)}
.sfp-pvis.is-shoe{flex-direction:column;gap:6px;padding:28px 8px 30px}
.sfp-pvis.is-bangle{flex-direction:column;gap:6px;padding:26px 8px 30px}
.sfp-bangle{width:100%;max-width:100px;height:auto;filter:drop-shadow(0 3px 6px rgba(0,0,0,.08))}
.sfp-pvis.is-ring{flex-direction:column;gap:6px;padding:26px 8px 30px}
.sfp-ring{width:100%;max-width:110px;height:auto;filter:drop-shadow(0 3px 6px rgba(0,0,0,.08))}
.sfp-shoe{width:100%;max-width:170px;height:auto;filter:drop-shadow(0 3px 6px rgba(0,0,0,.08))}
.sfp-toe{width:100%;max-width:150px}
.sfp-toebar{position:relative;display:flex;gap:2px;height:4px}
.sfp-toebar span{flex:1;border-radius:3px;opacity:.35}
.sfp-toebar .is-tight{background:#F87171}.sfp-toebar .is-right{background:#22C55E}.sfp-toebar .is-roomy{background:#F59E0B}
.sfp-toe.is-tight .is-tight,.sfp-toe.is-right .is-right,.sfp-toe.is-roomy .is-roomy{opacity:1}
.sfp-toebar i{position:absolute;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#fff;border:2px solid #111}
.sfp-toe p{margin:5px 0 0 !important;text-align:center;font-size:8.5px;font-weight:600;color:#374151}
.sfp-pimg{width:76px;height:76px;border-radius:18px;background:linear-gradient(135deg,#E9E4DA,#D8D0C2);display:flex;align-items:center;justify-content:center;color:#6B5B45}
.sfp-fit{font-size:9.5px;color:#4B5563;margin:2px 0 0 !important}
.sfp-loading{padding:18px 0;text-align:center}
.sfp-err{font-size:12px;color:#B42318;font-weight:500;background:#FEF2F2;border-radius:6px;padding:8px 10px;text-align:left}
.sfp-foot{padding:8px 18px 12px}
.sfp-main{display:flex;align-items:center;justify-content:center;border-radius:11px;padding:11px 8px;font-size:12.5px;font-weight:650;background:#111;color:#fff}
.sfp-ghost{display:block;text-align:center;margin-top:7px;font-size:11px;font-weight:600;text-decoration:underline;text-underline-offset:3px;color:#374151}
.sfp-privacy{display:flex;align-items:center;justify-content:center;gap:5px;font-size:9.5px;color:#9CA3AF;margin:8px 0 0 !important}
`;
