'use client';

import { useEffect, useState } from 'react';
import { apiSend } from '../../../lib/api';

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const REASON_TEXT = { right: 'Right for your fit', snug: 'A little snug', roomy: 'A little roomy' };
const STEP_NAMES = { 1: 'Measurements', 2: 'Your fit', 3: 'Your size' };

/** Size advisor words the store can change — same defaults and limits as backend utils/sizeFinder.js. */
export const ADVISOR_TEXT_DEFAULTS = {
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
export const ADVISOR_TEXT_MAX = {
  womenLabel: 24, menLabel: 24, advisorTitle: 30, step1Title: 50, step1Text: 90,
  step2Title: 50, step2Text: 90, resultTitle: 40, addToBagText: 40,
};
export const ADVISOR_OPTION_DEFAULTS = { liveEstimate: true, rememberSize: true, addToBag: true, sizeChart: true };
/** Text with an empty value falling back to the default; {size} filled in. */
export function advisorText(texts, key, size) {
  const v = texts && typeof texts[key] === 'string' && texts[key].trim() ? texts[key].trim() : ADVISOR_TEXT_DEFAULTS[key];
  return size == null ? v : v.replace(/\{size\}/g, size);
}
const SHAPES = [['slim', 'Slim', 'Narrow frame'], ['average', 'Average', 'Medium frame'], ['broad', 'Broad', 'Wider frame']];
const FITS = [['snug', 'Snug', 'Close to body'], ['regular', 'Regular', 'Classic fit'], ['relaxed', 'Relaxed', 'Loose and easy']];

export function heightLabel(cm, unit) {
  if (unit !== 'ft') return `${Math.round(cm)} cm`;
  const totalIn = Math.round(cm / CM_PER_IN);
  return `${Math.floor(totalIn / 12)}′ ${totalIn % 12}″`;
}
export function weightLabel(kg, unit) {
  return unit === 'lb' ? `${Math.round(kg / KG_PER_LB)} lb` : `${Math.round(kg)} kg`;
}
/** Corner radius of the card button: 24 or more = fully round. Same rule as ccf-size.js. */
export function ctaRadius(v) {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || !Number.isFinite(n) || n >= 24) return '999px';
  return `${Math.max(0, Math.round(n))}px`;
}
// Fit-meter position (0–100) from the chest result — same as ccf-size.js.
export function meterPosition(reasons) {
  const chest = (reasons || []).find((x) => x.area === 'chest');
  if (!chest) return 50;
  return chest.status === 'snug' ? 18 : chest.status === 'roomy' ? 82 : 50;
}
/** Figure scale from height/weight — same rule as ccf-size.js figureSvg. */
export function figureScale(heightCm, weightKg) {
  const bmi = weightKg / ((heightCm / 100) ** 2);
  return {
    x: Math.max(0.82, Math.min(1.35, bmi / 22)),
    y: Math.max(0.88, Math.min(1.08, heightCm / 172)),
  };
}

function Ruler() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 15.5 15.5 3 21 8.5 8.5 21z" /><path d="m7 12 2 2M10 9l2 2M13 6l2 2" />
    </svg>
  );
}
function Figure({ heightCm, weightKg }) {
  const s = figureScale(heightCm, weightKg);
  return (
    <svg width="44" height="118" viewBox="0 0 56 150" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: `scale(${s.x.toFixed(3)},${s.y.toFixed(3)})`, transformOrigin: '50% 100%' }}>
      <circle cx="28" cy="13" r="9" />
      <path d="M28 22v4M17 30c3-3 7-4 11-4s8 1 11 4l4 34M17 30l-4 34M19 32v40l-2 74M37 32v40l2 74M28 74v72M19 72h18" />
    </svg>
  );
}

/**
 * Live preview of the storefront "Find my size" — DISPLAY ONLY, the same design as ccf-size.js:
 * 1) the card shoppers see on the product page and 2) the "Size advisor" (drawer / phone bottom sheet).
 * Re-draws from the unsaved settings on the page: card words, button style/colour/corners, unit, and the
 * size chart for the Women/Men tab open in the chart editor. The result uses a sample shopper and the
 * backend's maths (POST /api/size-finder/:shop/preview), fetched again ~0.4s after the chart changes.
 */
export const SAMPLE_SHOPPER = {
  women: { heightCm: 162, weightKg: 60 },
  men: { heightCm: 175, weightKg: 72 },
};
const VIEWS = [[1, 'Step 1'], [2, 'Step 2'], [3, 'Result']];

export default function SizeFinderPreview({ shop, settings, gender: editorGender, view: viewProp, onViewChange, show = 'both', onShowBoth, highlight = null }) {
  const accent = HEX_RE.test(settings.accentColor || '') ? settings.accentColor : '#111827';
  const genders = ['women', 'men'].filter((g) => (settings.charts[g] || []).length > 0);
  const gender = genders.includes(editorGender) ? editorGender : (genders[0] || 'women');
  const [device, setDevice] = useState('desktop');
  const [ownView, setOwnView] = useState(3);
  const view = viewProp || ownView;
  const setView = onViewChange || setOwnView;
  const t = (k, size) => advisorText(settings.texts, k, size);
  // ' is-hl' on the part of the preview that the field being edited changes.
  const hl = (...keys) => (highlight && keys.includes(highlight.key) ? ' is-hl' : '');
  const opt = { ...ADVISOR_OPTION_DEFAULTS, ...(settings.options || {}) };
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const chart = settings.charts[gender] || [];
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
        const d = await apiSend(`/api/size-finder/${shop}/preview`, 'POST', {
          chart,
          answers: { gender, heightCm: sample.heightCm, weightKg: sample.weightKg, shape: 'average', fit: 'regular' },
        });
        if (!cancelled) { setResult(d); setError(''); }
      } catch (e) {
        if (!cancelled) { setResult(null); setError(e.message || 'Could not work out a size'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, gender, chartKey]);

  const sizes = chart.length ? chart.map((r) => String(r.size)) : ['S', 'M', 'L'];
  const lengthText = (v) => (hUnit === 'ft' ? `${Math.round((v / CM_PER_IN) * 10) / 10} in` : `${v} cm`);
  const heightPct = ((sample.heightCm - 140) / (200 - 140)) * 100;
  const weightPct = ((sample.weightKg - 40) / (130 - 40)) * 100;
  const hParts = hUnit === 'cm' ? [String(sample.heightCm), 'cm'] : [heightLabel(sample.heightCm, 'ft'), ''];
  const wParts = wUnit === 'kg' ? [String(sample.weightKg), 'kg'] : [String(Math.round(sample.weightKg / KG_PER_LB)), 'lb'];
  const ctaClass = `sfp-cta${settings.buttonStyle === 'outline' ? ' is-outline' : settings.buttonStyle === 'soft' ? ' is-soft' : ''}`;
  const good = result && !result.outOfRange;
  const C = 2 * Math.PI * 60;

  const card = !genders.length ? (
    <p className="sfp-warn">Both size charts are empty, so shoppers won&apos;t see the card.</p>
  ) : (
    <div className={`sfp-card${hl('productTag')}`}>
      <span className="sfp-icon"><Ruler /></span>
      <span className="sfp-copy">
        <span className={`sfp-card-title${hl('cardTitle')}`}>{settings.cardTitle || 'Not sure about your size?'}</span>
        <span className={`sfp-card-sub${hl('cardText')}`}>{settings.cardText || '3 quick questions · takes 20 seconds'}</span>
      </span>
      <span className={ctaClass + hl('buttonText', 'accentColor', 'buttonStyle', 'buttonRadius')} style={{ borderRadius: ctaRadius(settings.buttonRadius) }}>
        {settings.buttonText || 'Find my size'} →
      </span>
    </div>
  );

  const drawer = genders.length > 0 && (
    <div className="sfp-drawer">
      <div className="sfp-grab" />
      <div className="sfp-dtop"><span className={`sfp-brand${hl('advisorTitle')}`}>{t('advisorTitle')}</span><span className="sfp-x" aria-hidden="true">×</span></div>
      <div className="sfp-scroll">
        <div className="sfp-product"><span className="sfp-thumb" /><span><b>Cotton Kurta</b><small>₹1,299</small></span></div>
        <div className="sfp-progress" aria-hidden="true">{[1, 2, 3].map((i) => <span key={i} className={i <= view ? 'on' : ''} />)}</div>
        <p className="sfp-stepline"><span className="sfp-step">Step {view} of 3</span> · {STEP_NAMES[view]}</p>

        {view === 1 && (
          <>
            <p className={`sfp-title${hl('step1Title')}`}>{t('step1Title')}</p>
            <p className={`sfp-lede${hl('step1Text')}`}>{t('step1Text')}</p>
            {genders.length > 1 && (
              <div className="sfp-seg">
                {genders.map((g) => <span key={g} className={(gender === g ? 'on' : '') + hl(g === 'men' ? 'menLabel' : 'womenLabel', 'chart')}>{g === 'men' ? t('menLabel') : t('womenLabel')}</span>)}
              </div>
            )}
            <div className="sfp-measure">
              <div className="sfp-figure"><Figure heightCm={sample.heightCm} weightKg={sample.weightKg} /></div>
              <div className="sfp-fields">
                <div className="sfp-field">
                  <div className="sfp-flabel"><span>Height</span><span className={`sfp-unit${hl('unit')}`}><span className={hUnit === 'cm' ? 'on' : ''}>cm</span><span className={hUnit === 'ft' ? 'on' : ''}>ft/in</span></span></div>
                  <div className="sfp-value">{hParts[0]}{hParts[1] && <small>{hParts[1]}</small>}</div>
                  <div className="sfp-ctrl"><i>−</i><div className="sfp-track"><span style={{ width: `${heightPct}%` }} /><b style={{ left: `${heightPct}%` }} /></div><i>+</i></div>
                </div>
                <div className="sfp-field">
                  <div className="sfp-flabel"><span>Weight</span><span className={`sfp-unit${hl('unit')}`}><span className={wUnit === 'kg' ? 'on' : ''}>kg</span><span className={wUnit === 'lb' ? 'on' : ''}>lb</span></span></div>
                  <div className="sfp-value">{wParts[0]}<small>{wParts[1]}</small></div>
                  <div className="sfp-ctrl"><i>−</i><div className="sfp-track"><span style={{ width: `${weightPct}%` }} /><b style={{ left: `${weightPct}%` }} /></div><i>+</i></div>
                </div>
              </div>
            </div>
            {opt.liveEstimate && (
              <div className={`sfp-live${hl('liveEstimate')}`}>
                <span><b>Live estimate</b><small>Refines in the next steps</small></span>
                <span className="sfp-live-size">{result ? result.size : '—'}</span>
              </div>
            )}
          </>
        )}

        {view === 2 && (
          <>
            <p className={`sfp-title${hl('step2Title')}`}>{t('step2Title')}</p>
            <p className={`sfp-lede${hl('step2Text')}`}>{t('step2Text')}</p>
            <p className="sfp-q">Body shape</p>
            <div className="sfp-cards">
              {SHAPES.map(([v, l, h]) => <span key={v} className={v === 'average' ? 'on' : ''}><b>{l}</b><small>{h}</small></span>)}
            </div>
            <p className="sfp-q">Preferred fit</p>
            <div className="sfp-cards">
              {FITS.map(([v, l, h]) => <span key={v} className={v === 'regular' ? 'on' : ''}><b>{l}</b><small>{h}</small></span>)}
            </div>
            {opt.rememberSize && (
              <div className={`sfp-check${hl('rememberSize')}`}>
                <span><b>Remember my size</b><small>We save only the size, never your height or weight.</small></span>
                <i className="sfp-switch" aria-hidden="true" />
              </div>
            )}
          </>
        )}

        {view === 3 && (
          <div className="sfp-result">
            <p className={`sfp-title${hl('resultTitle')}`}>{t('resultTitle')}</p>
            {error && <p className="sfp-err" role="alert">{error}</p>}
            {!error && !result && <p className="sfp-muted sfp-loading">{loading ? 'Working out the size…' : 'Add sizes to this chart to see a result.'}</p>}
            {!error && result && (
              <>
                <div className={`sfp-ring${hl('chart')}`}>
                  <svg width="112" height="112" viewBox="0 0 132 132" aria-hidden="true">
                    <circle cx="66" cy="66" r="60" fill="none" stroke="#EEECE8" strokeWidth="6" />
                    <circle cx="66" cy="66" r="60" fill="none" stroke={good ? '#2F6B4F' : '#B7791F'} strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={C.toFixed(1)} strokeDashoffset={(good ? 0 : C * 0.3).toFixed(1)} transform="rotate(-90 66 66)" />
                  </svg>
                  <div className="sfp-size" aria-label="Recommended size">{result.size}</div>
                  <span className="sfp-ring-label">{good ? 'Best fit' : 'Closest fit'}</span>
                </div>
                <p className="sfp-verdict">
                  {result.outOfRange
                    ? `${result.size} is our largest size — it may feel tight. Check the size chart below.`
                    : `${result.size} lines up best with your measurements and the fit you chose.`}
                </p>
                {(result.reasons || []).map((x) => (
                  <div key={x.area} className={`sfp-reason${x.status === 'info' ? ' is-info' : x.status === 'right' ? '' : ' is-warn'}`}>
                    <span>{x.area.charAt(0).toUpperCase() + x.area.slice(1)}</span>
                    {x.status === 'info'
                      ? <span className="sfp-muted">Garment length {lengthText(x.value)}</span>
                      : <span className={x.status === 'right' ? 'sfp-ok' : 'sfp-bad'}>{REASON_TEXT[x.status]}</span>}
                  </div>
                ))}
                <div className={`sfp-strip${hl('chart')}`} aria-hidden="true">
                  {sizes.map((s) => <span key={s} className={s === String(result.size) ? 'is-you' : ''}>{s}</span>)}
                </div>
                <div className="sfp-meter" aria-hidden="true">
                  <div className="sfp-meter-bar"><span style={{ left: `${meterPosition(result.reasons)}%` }} /></div>
                  <div className="sfp-meter-labels"><span>Snug</span><span>Just right</span><span>Roomy</span></div>
                </div>
                <div className="sfp-links">{opt.sizeChart && <span className={hl('sizeChart').trim()}>View size chart</span>}<span>Edit details</span></div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="sfp-foot">
        {view === 1 && <span className="sfp-main">Continue →</span>}
        {view === 2 && <div className="sfp-actions"><span className="sfp-ghost">Back</span><span className="sfp-main">See my size</span></div>}
        {view === 3 && (result
          ? (opt.addToBag
            ? <div className={`sfp-actions${hl('addToBag')}`}><span className="sfp-ghost">Select {result.size}</span><span className={`sfp-main${hl('addToBagText')}`}>{t('addToBagText', result.size)}</span></div>
            : <span className={`sfp-main${hl('addToBag')}`}>Select size {result.size}</span>)
          : <span className="sfp-main">Close</span>)}
        {view === 1 && <p className="sfp-privacy">Used only to work out your size — never saved by the store.</p>}
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
            {show === 'card' ? 'Showing the card you are editing' : show === 'advisor' ? 'Showing the size preview you are editing' : 'View only · updates as you edit, before you save'}
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
          <p className="sfp-blocktitle"><span>1</span>Card on the product page</p>
          {/* Display only: inert = no clicks, no keyboard focus inside the previews. */}
          <div className="sfp-cardbox sfp-static" data-testid="preview-card" {...{ inert: '' }}>{card}</div>
        </div>
        )}

        {show !== 'card' && (
        <div className="sfp-block">
          <div className="sfp-blockhead">
            <p className="sfp-blocktitle"><span>2</span>Size preview</p>
            <div className="sfp-views" role="group" aria-label="Preview screen">
              {VIEWS.map(([v, l]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="sfp-frame sfp-static" data-testid="preview-frame" {...{ inert: '' }}>
            {drawer || <p className="sfp-warn">Add a size chart to see the size preview.</p>}
          </div>
        </div>
        )}
      </div>
      <p className="sfp-sample">
        Sample shopper: {gender === 'men' ? 'Men' : 'Women'}, {heightLabel(sample.heightCm, hUnit)}, {weightLabel(sample.weightKg, wUnit)}, average shape, regular fit.
      </p>
    </section>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
.sfp{font-family:Inter,-apple-system,BlinkMacSystemFont,'San Francisco','Segoe UI',Roboto,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;background:#fff;border:1px solid #E3E3E3;border-radius:14px;padding:16px;color:#1A1A1A;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.sfp *{box-sizing:border-box}
.sfp p{margin:0}
.sfp button{font-family:inherit}
.sfp-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.sfp-label{font-weight:600;font-size:14px}
.sfp-muted{font-size:12px;color:#6B6B6B}
.sfp-dev,.sfp-views{display:inline-flex;background:#F1F1F1;border-radius:8px;padding:3px;flex-shrink:0}
.sfp-views{margin:0 0 12px;flex-wrap:wrap}
.sfp-dev button,.sfp-views button{border:0;background:transparent;border-radius:6px;padding:5px 11px;font-size:12px;font-weight:500;color:#616161;cursor:pointer}
.sfp-dev button[aria-pressed="true"],.sfp-views button[aria-pressed="true"]{background:#fff;color:#1A1A1A;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.sfp-both{background:none;border:0;padding:0;font-size:12px;font-weight:600;color:#303030;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.sfp-sample{font-size:12px;color:#8A8A8A;margin:10px 2px 0}

/* two previews */
.sfp-stage{display:flex;flex-direction:column;gap:14px}
.sfp-block{background:#F4F2EE;border-radius:12px;padding:14px}
.sfp-blockhead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px}
.sfp-blocktitle{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#303030;margin:0 0 10px}
.sfp-blockhead .sfp-blocktitle{margin:0}
.sfp-blocktitle span{width:20px;height:20px;border-radius:50%;background:#303030;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px}
.sfp-cardbox{background:#fff;border-radius:10px;padding:14px;max-width:440px;margin:0 auto}
.sfp-frame{max-width:400px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.10);border:1px solid #E7E5E0;background:#fff}
.sfp-stage.is-mobile .sfp-cardbox{max-width:340px}
.sfp-stage.is-mobile .sfp-frame{max-width:340px;border-radius:18px 18px 0 0}
.sfp-stage.is-mobile .sfp-grab{display:block;width:34px;height:4px;border-radius:4px;background:#D9D6D0;margin:7px auto 0}
.sfp-static{pointer-events:none;user-select:none}
.sfp .is-hl{outline:2px solid #4F46E5;outline-offset:3px;border-radius:6px;box-shadow:0 0 0 5px rgba(79,70,229,.14);animation:sfp-hl .7s ease-out 2;transition:outline-color .2s}
@keyframes sfp-hl{0%{box-shadow:0 0 0 0 rgba(79,70,229,.35)}100%{box-shadow:0 0 0 5px rgba(79,70,229,.14)}}
.sfp .sfp-seg span.is-hl{outline-offset:-4px;border-radius:2px;animation:none;box-shadow:inset 0 0 0 6px rgba(79,70,229,.18)}
.sfp .sfp-seg span.on.is-hl{outline-color:#A5B4FC}
@media (prefers-reduced-motion:reduce){.sfp .is-hl{animation:none}}
.sfp-editing{display:inline-flex;align-items:center;gap:5px;color:#4338CA;font-weight:600}
.sfp-editing i{width:7px;height:7px;border-radius:50%;background:#4F46E5;box-shadow:0 0 0 3px rgba(79,70,229,.2)}
.sfp-warn{font-size:12px;color:#B45309;background:#FFFBEB;border-radius:8px;padding:8px 10px}

/* size card on the page */
.sfp-card{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--sfp-accent) 25%,transparent);border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--sfp-accent) 6%,#fff),color-mix(in srgb,var(--sfp-accent) 2%,#fff))}
.sfp-icon{width:40px;height:40px;border-radius:50%;background:#fff;color:var(--sfp-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 1px color-mix(in srgb,var(--sfp-accent) 20%,transparent)}
.sfp-copy{flex:1;min-width:140px;display:flex;flex-direction:column;gap:1px}
.sfp-card-title{font-size:14px;font-weight:600;line-height:1.3}
.sfp-card-sub{font-size:12px;color:#6B6B6B}
.sfp-cta{flex-shrink:0;background:var(--sfp-accent);color:#fff;border:1px solid var(--sfp-accent);border-radius:999px;padding:8px 14px;font-size:12.5px;font-weight:600;white-space:nowrap}
.sfp-cta.is-outline{background:#fff;color:var(--sfp-accent)}
.sfp-cta.is-soft{background:color-mix(in srgb,var(--sfp-accent) 12%,#fff);border-color:transparent;color:var(--sfp-accent)}

/* drawer */
.sfp-drawer{display:flex;flex-direction:column;background:#fff;font-size:12.5px}
.sfp-grab{display:none}
.sfp-dtop{display:flex;align-items:center;justify-content:space-between;padding:11px 16px;border-bottom:1px solid #EEECE8}
.sfp-brand{font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.sfp-x{font-size:18px;line-height:1}
.sfp-scroll{flex:1;padding:0 16px 8px}
.sfp-product{display:flex;align-items:center;gap:10px;background:#F7F6F3;border-radius:6px;padding:8px;margin:12px 0 0}
.sfp-thumb{width:32px;height:32px;border-radius:4px;background:#E2DFD9;flex-shrink:0}
.sfp-product b{display:block;font-size:12px;font-weight:600}
.sfp-product small{font-size:11px;color:#6B6B6B}
.sfp-progress{display:flex;gap:4px;margin:12px 0 5px}
.sfp-progress span{flex:1;height:3px;border-radius:2px;background:#E7E5E0}
.sfp-progress span.on{background:#1A1A1A}
.sfp-stepline{font-size:10.5px;color:#6B6B6B}
.sfp-title{font-size:17px;font-weight:600;letter-spacing:-.01em;margin:12px 0 2px !important}
.sfp-lede{font-size:11.5px;color:#6B6B6B;margin:0 0 12px !important}
.sfp-seg{display:flex;border:1px solid #1A1A1A;border-radius:4px;overflow:hidden;margin:0 0 12px}
.sfp-seg span{flex:1;text-align:center;padding:7px 4px;font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
.sfp-seg span.on{background:#1A1A1A;color:#fff}
.sfp-measure{display:flex;gap:10px}
.sfp-figure{width:46px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#1A1A1A}
.sfp-fields{flex:1;min-width:0}
.sfp-field{margin:0 0 10px}
.sfp-flabel{display:flex;justify-content:space-between;align-items:center;margin:0 0 2px}
.sfp-flabel > span:first-child{font-size:9.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#6B6B6B}
.sfp-unit{display:inline-flex;gap:2px}
.sfp-unit > span{border:1px solid #E1DED8;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:600;text-transform:uppercase;color:#6B6B6B}
.sfp-unit > span.on{background:#1A1A1A;border-color:#1A1A1A;color:#fff}
.sfp-value{font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.15;margin:0 0 4px}
.sfp-value small{font-size:11px;font-weight:500;color:#6B6B6B;margin-left:2px}
.sfp-ctrl{display:flex;align-items:center;gap:6px}
.sfp-ctrl i{width:18px;height:18px;border:1px solid #E1DED8;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:11px;flex-shrink:0}
.sfp-track{position:relative;flex:1;height:3px;border-radius:3px;background:#E3E0DA}
.sfp-track > span{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:#1A1A1A}
.sfp-track > b{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#1A1A1A}
.sfp-live{display:flex;align-items:center;justify-content:space-between;border:1px solid #E7E5E0;border-radius:6px;padding:9px 11px;margin:2px 0 6px}
.sfp-live b{display:block;font-size:9.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.sfp-live small{font-size:10.5px;color:#6B6B6B}
.sfp-live-size{font-size:19px;font-weight:600}
.sfp-q{font-size:9.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#6B6B6B;margin:0 0 6px !important}
.sfp-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 12px}
.sfp-cards > span{border:1px solid #E1DED8;border-radius:6px;padding:8px 4px;text-align:center;display:flex;flex-direction:column;gap:1px}
.sfp-cards > span.on{border:1.5px solid #1A1A1A;background:#F7F6F3}
.sfp-cards b{font-size:12px;font-weight:600}
.sfp-cards small{font-size:9.5px;color:#6B6B6B}
.sfp-check{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#F7F6F3;border-radius:6px;padding:9px 11px}
.sfp-check b{display:block;font-size:11.5px;font-weight:600}
.sfp-check small{font-size:10px;color:#6B6B6B}
.sfp-switch{display:inline-block;width:32px;height:18px;border-radius:999px;background:#D1CEC7;position:relative;flex-shrink:0}
.sfp-switch::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff}
.sfp-result{text-align:center}
.sfp-ring{position:relative;width:112px;height:112px;margin:6px auto 10px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.sfp-ring svg{position:absolute;inset:0}
.sfp-size{font-size:34px;font-weight:600;line-height:1;letter-spacing:-.02em}
.sfp-ring-label{font-size:10.5px;color:#6B6B6B;margin-top:3px}
.sfp-verdict{font-size:11.5px;background:#F7F6F3;border-radius:6px;padding:9px 11px;margin:0 0 8px !important;text-align:left}
.sfp-reason{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11.5px;background:#F7F6F3;border-left:3px solid #2F6B4F;border-radius:0 6px 6px 0;padding:7px 10px;margin:0 0 5px;text-align:left}
.sfp-reason.is-warn{border-left-color:#B7791F}
.sfp-reason.is-info{border-left-color:#C9C5BD}
.sfp-reason > span:first-child{font-weight:600}
.sfp-ok,.sfp-bad{display:inline-flex;align-items:center;gap:6px}
.sfp-ok::before,.sfp-bad::before{content:"";width:6px;height:6px;border-radius:50%}
.sfp-ok::before{background:#2F6B4F}.sfp-bad::before{background:#B7791F}
.sfp-strip{display:flex;justify-content:center;gap:4px;margin:18px 0 2px;flex-wrap:wrap}
.sfp-strip span{position:relative;min-width:30px;padding:5px 4px;border:1px solid #E1DED8;border-radius:4px;font-size:10.5px;font-weight:600}
.sfp-strip span.is-you{background:#1A1A1A;border-color:#1A1A1A;color:#fff}
.sfp-strip span.is-you::before{content:"YOU";position:absolute;left:50%;top:-14px;transform:translateX(-50%);font-size:8px;letter-spacing:.14em;color:#1A1A1A}
.sfp-meter{margin:12px 0 2px;text-align:left}
.sfp-meter-bar{position:relative;height:3px;border-radius:3px;background:linear-gradient(90deg,#E8D9B5,#2F6B4F 50%,#E8D9B5)}
.sfp-meter-bar span{position:absolute;top:50%;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;background:#fff;border:2.5px solid #1A1A1A}
.sfp-meter-labels{display:flex;justify-content:space-between;font-size:9.5px;color:#6B6B6B;margin-top:4px}
.sfp-links{display:flex;justify-content:center;gap:16px;margin:10px 0 2px}
.sfp-links span{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;text-decoration:underline;text-underline-offset:3px}
.sfp-loading{padding:18px 0;text-align:center}
.sfp-err{font-size:12px;color:#B42318;font-weight:500;background:#FEF2F2;border-radius:6px;padding:8px 10px;text-align:left}
.sfp-foot{border-top:1px solid #EEECE8;padding:10px 16px 12px}
.sfp-actions{display:flex;gap:6px}
.sfp-main,.sfp-ghost{display:flex;align-items:center;justify-content:center;border-radius:4px;padding:10px 8px;font-size:12px;font-weight:600;white-space:nowrap}
.sfp-main{flex:2;background:var(--sfp-accent);color:#fff;border:1px solid var(--sfp-accent)}
.sfp-ghost{flex:1;border:1px solid #1A1A1A;background:#fff}
.sfp-privacy{font-size:9.5px;color:#8A867E;text-align:center;margin:6px 0 0 !important}

`;
