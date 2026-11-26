'use client';

import { useEffect, useState } from 'react';
import { apiSend } from '../../../lib/api';

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const REASON_TEXT = { right: 'Right for your fit', snug: 'A little snug', roomy: 'A little roomy' };
const STEP_NAMES = { 1: 'Measurements', 2: 'Your fit', 3: 'Your size' };
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
 * the product page with the size card, and the "Size advisor" drawer (desktop) or bottom sheet (phone).
 * Re-draws from the unsaved settings on the page: card words, button style/colour/corners, unit, and the
 * size chart for the Women/Men tab open in the chart editor. The result uses a sample shopper and the
 * backend's maths (POST /api/size-finder/:shop/preview), fetched again ~0.4s after the chart changes.
 */
export const SAMPLE_SHOPPER = {
  women: { heightCm: 162, weightKg: 60 },
  men: { heightCm: 175, weightKg: 72 },
};
const VIEWS = [[0, 'Product page'], [1, 'Step 1'], [2, 'Step 2'], [3, 'Result']];

export default function SizeFinderPreview({ shop, settings, gender: editorGender }) {
  const accent = HEX_RE.test(settings.accentColor || '') ? settings.accentColor : '#111827';
  const genders = ['women', 'men'].filter((g) => (settings.charts[g] || []).length > 0);
  const gender = genders.includes(editorGender) ? editorGender : (genders[0] || 'women');
  const [device, setDevice] = useState('desktop');
  const [view, setView] = useState(3);
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
  const picked = view === 3 && result ? String(result.size) : '';
  const lengthText = (v) => (hUnit === 'ft' ? `${Math.round((v / CM_PER_IN) * 10) / 10} in` : `${v} cm`);
  const heightPct = ((sample.heightCm - 140) / (200 - 140)) * 100;
  const weightPct = ((sample.weightKg - 40) / (130 - 40)) * 100;
  const hParts = hUnit === 'cm' ? [String(sample.heightCm), 'cm'] : [heightLabel(sample.heightCm, 'ft'), ''];
  const wParts = wUnit === 'kg' ? [String(sample.weightKg), 'kg'] : [String(Math.round(sample.weightKg / KG_PER_LB)), 'lb'];
  const ctaClass = `sfp-cta${settings.buttonStyle === 'outline' ? ' is-outline' : settings.buttonStyle === 'soft' ? ' is-soft' : ''}`;
  const good = result && !result.outOfRange;
  const C = 2 * Math.PI * 60;
  const drawerOpen = view > 0 && genders.length > 0;

  const page = (
    <div className={`sfp-page${drawerOpen ? ' is-dim' : ''}`}>
      <div className="sfp-photo" aria-hidden="true">
        <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#A8A39A" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6a2 2 0 1 1 2-2" /><path d="M12 6v1.5L3 14a1.5 1.5 0 0 0 .9 2.7h16.2A1.5 1.5 0 0 0 21 14l-9-6.5" /></svg>
      </div>
      <div className="sfp-info">
        <p className="sfp-name">Cotton Kurta</p>
        <p className="sfp-price">₹1,299</p>
        <p className="sfp-optlabel">Size</p>
        <div className="sfp-sizes" aria-label="Example sizes">
          {sizes.map((s) => <span key={s} className={picked === s ? 'on' : ''}>{s}</span>)}
        </div>
        {!genders.length ? (
          <p className="sfp-warn">Both size charts are empty, so shoppers won&apos;t see the card.</p>
        ) : (
          <div className="sfp-card">
            <span className="sfp-icon"><Ruler /></span>
            <span className="sfp-copy">
              <span className="sfp-card-title">{settings.cardTitle || 'Not sure about your size?'}</span>
              <span className="sfp-card-sub">{settings.cardText || '3 quick questions · takes 20 seconds'}</span>
            </span>
            <span className={ctaClass} style={{ borderRadius: ctaRadius(settings.buttonRadius) }}>
              {settings.buttonText || 'Find my size'} →
            </span>
          </div>
        )}
        <span className="sfp-add">Add to cart</span>
      </div>
    </div>
  );

  const drawer = drawerOpen && (
    <div className="sfp-drawer">
      <div className="sfp-grab" />
      <div className="sfp-dtop"><span className="sfp-brand">Size advisor</span><span className="sfp-x" aria-hidden="true">×</span></div>
      <div className="sfp-scroll">
        <div className="sfp-product"><span className="sfp-thumb" /><span><b>Cotton Kurta</b><small>₹1,299</small></span></div>
        <div className="sfp-progress" aria-hidden="true">{[1, 2, 3].map((i) => <span key={i} className={i <= view ? 'on' : ''} />)}</div>
        <p className="sfp-stepline"><span className="sfp-step">Step {view} of 3</span> · {STEP_NAMES[view]}</p>

        {view === 1 && (
          <>
            <p className="sfp-title">Let’s find your fit</p>
            <p className="sfp-lede">Two measurements, about ten seconds.</p>
            {genders.length > 1 && (
              <div className="sfp-seg">
                {genders.map((g) => <span key={g} className={gender === g ? 'on' : ''}>{g === 'men' ? 'Menswear' : 'Womenswear'}</span>)}
              </div>
            )}
            <div className="sfp-measure">
              <div className="sfp-figure"><Figure heightCm={sample.heightCm} weightKg={sample.weightKg} /></div>
              <div className="sfp-fields">
                <div className="sfp-field">
                  <div className="sfp-flabel"><span>Height</span><span className="sfp-unit"><span className={hUnit === 'cm' ? 'on' : ''}>cm</span><span className={hUnit === 'ft' ? 'on' : ''}>ft/in</span></span></div>
                  <div className="sfp-value">{hParts[0]}{hParts[1] && <small>{hParts[1]}</small>}</div>
                  <div className="sfp-ctrl"><i>−</i><div className="sfp-track"><span style={{ width: `${heightPct}%` }} /><b style={{ left: `${heightPct}%` }} /></div><i>+</i></div>
                </div>
                <div className="sfp-field">
                  <div className="sfp-flabel"><span>Weight</span><span className="sfp-unit"><span className={wUnit === 'kg' ? 'on' : ''}>kg</span><span className={wUnit === 'lb' ? 'on' : ''}>lb</span></span></div>
                  <div className="sfp-value">{wParts[0]}<small>{wParts[1]}</small></div>
                  <div className="sfp-ctrl"><i>−</i><div className="sfp-track"><span style={{ width: `${weightPct}%` }} /><b style={{ left: `${weightPct}%` }} /></div><i>+</i></div>
                </div>
              </div>
            </div>
            <div className="sfp-live">
              <span><b>Live estimate</b><small>Refines in the next steps</small></span>
              <span className="sfp-live-size">{result ? result.size : '—'}</span>
            </div>
          </>
        )}

        {view === 2 && (
          <>
            <p className="sfp-title">How do you like it to fit?</p>
            <p className="sfp-lede">Two quick choices make the size more accurate.</p>
            <p className="sfp-q">Body shape</p>
            <div className="sfp-cards">
              {SHAPES.map(([v, l, h]) => <span key={v} className={v === 'average' ? 'on' : ''}><b>{l}</b><small>{h}</small></span>)}
            </div>
            <p className="sfp-q">Preferred fit</p>
            <div className="sfp-cards">
              {FITS.map(([v, l, h]) => <span key={v} className={v === 'regular' ? 'on' : ''}><b>{l}</b><small>{h}</small></span>)}
            </div>
            <div className="sfp-check">
              <span><b>Remember my size</b><small>We save only the size, never your height or weight.</small></span>
              <i className="sfp-switch" aria-hidden="true" />
            </div>
          </>
        )}

        {view === 3 && (
          <div className="sfp-result">
            <p className="sfp-title">Your size</p>
            {error && <p className="sfp-err" role="alert">{error}</p>}
            {!error && !result && <p className="sfp-muted sfp-loading">{loading ? 'Working out the size…' : 'Add sizes to this chart to see a result.'}</p>}
            {!error && result && (
              <>
                <div className="sfp-ring">
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
                <div className="sfp-strip" aria-hidden="true">
                  {sizes.map((s) => <span key={s} className={s === String(result.size) ? 'is-you' : ''}>{s}</span>)}
                </div>
                <div className="sfp-meter" aria-hidden="true">
                  <div className="sfp-meter-bar"><span style={{ left: `${meterPosition(result.reasons)}%` }} /></div>
                  <div className="sfp-meter-labels"><span>Snug</span><span>Just right</span><span>Roomy</span></div>
                </div>
                <div className="sfp-links"><span>View size chart</span><span>Edit details</span></div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="sfp-foot">
        {view === 1 && <span className="sfp-main">Continue →</span>}
        {view === 2 && <div className="sfp-actions"><span className="sfp-ghost">Back</span><span className="sfp-main">See my size</span></div>}
        {view === 3 && (result
          ? <div className="sfp-actions"><span className="sfp-ghost">Select {result.size}</span><span className="sfp-main">Add size {result.size} to bag</span></div>
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
          <p className="sfp-muted">View only · updates as you edit, before you save</p>
        </div>
        <div className="sfp-dev" role="group" aria-label="Preview size">
          {[['desktop', 'Desktop'], ['mobile', 'Mobile']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={device === v} onClick={() => setDevice(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="sfp-views" role="group" aria-label="Preview screen">
        {VIEWS.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      <div className={`sfp-frame ${device === 'mobile' ? 'is-mobile' : ''}`} data-testid="preview-frame">
        {device === 'mobile'
          ? <div className="sfp-notch" aria-hidden="true"><span>9:41</span><i /></div>
          : <div className="sfp-bar" aria-hidden="true"><i /><i /><i /><span>yourstore.com/products/cotton-kurta</span></div>}
        {/* Display only: inert = no clicks, no keyboard focus inside the store frame. */}
        <div className={`sfp-screen sfp-static${drawerOpen ? ' has-drawer' : ''}`} {...{ inert: '' }}>
          {page}
          {drawer}
        </div>
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
.sfp-sample{font-size:12px;color:#8A8A8A;margin:10px 2px 0}

/* frames */
.sfp-frame{border:1px solid #DEDBD5;border-radius:12px;overflow:hidden;background:#F4F2EE;margin:0 auto;transition:max-width .2s}
.sfp-bar{display:flex;align-items:center;gap:6px;background:#EDEBE6;padding:8px 12px;border-bottom:1px solid #DEDBD5}
.sfp-bar i{width:9px;height:9px;border-radius:50%;background:#CFCBC3;display:inline-block}
.sfp-bar span{margin-left:8px;font-size:11px;color:#6B6B6B;background:#fff;border-radius:6px;padding:3px 10px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sfp-frame.is-mobile{max-width:330px;border:9px solid #1A1A1A;border-radius:38px;background:#fff}
.sfp-notch{position:relative;display:flex;justify-content:space-between;align-items:center;height:26px;padding:0 20px;font-size:11px;font-weight:600;background:#fff}
.sfp-notch i{position:absolute;left:50%;top:6px;width:70px;height:16px;margin-left:-35px;border-radius:10px;background:#1A1A1A}
.sfp-static{pointer-events:none;user-select:none}

/* screen: page + drawer side by side (desktop), page slice + sheet (phone) */
.sfp-screen{position:relative;display:flex;background:#fff;min-height:420px}
.sfp-page{flex:1;min-width:0;display:flex;gap:14px;padding:16px;transition:opacity .2s}
.sfp-screen.has-drawer .sfp-page{flex:0 0 38%;flex-direction:column;opacity:.45;filter:saturate(.6)}
.sfp-photo{flex:0 0 32%;aspect-ratio:4/5;background:#F4F2EE;border-radius:6px;display:flex;align-items:center;justify-content:center}
.sfp-screen.has-drawer .sfp-photo{flex:none;width:100%}
.sfp-info{flex:1;min-width:0}
.sfp-name{font-size:16px;font-weight:600;letter-spacing:-.01em}
.sfp-price{font-size:13px;color:#4A4A4A;margin:2px 0 10px}
.sfp-optlabel{font-size:11px;color:#6B6B6B;margin:0 0 6px}
.sfp-sizes{display:flex;gap:5px;flex-wrap:wrap;margin:0 0 12px}
.sfp-sizes span{min-width:30px;height:28px;padding:0 6px;border:1px solid #DEDBD5;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;background:#fff}
.sfp-sizes span.on{border:1.5px solid #1A1A1A;font-weight:600}
.sfp-add{display:flex;justify-content:center;border:1px solid #1A1A1A;border-radius:4px;padding:9px;font-size:12px;font-weight:600;margin-top:12px}
.sfp-warn{font-size:12px;color:#B45309;background:#FFFBEB;border-radius:8px;padding:8px 10px}

/* size card on the page */
.sfp-card{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--sfp-accent) 25%,transparent);border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--sfp-accent) 6%,#fff),color-mix(in srgb,var(--sfp-accent) 2%,#fff))}
.sfp-icon{width:36px;height:36px;border-radius:50%;background:#fff;color:var(--sfp-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 1px color-mix(in srgb,var(--sfp-accent) 20%,transparent)}
.sfp-copy{flex:1;min-width:130px;display:flex;flex-direction:column;gap:1px}
.sfp-card-title{font-size:13px;font-weight:600;line-height:1.3}
.sfp-card-sub{font-size:11px;color:#6B6B6B}
.sfp-cta{flex-shrink:0;background:var(--sfp-accent);color:#fff;border:1px solid var(--sfp-accent);border-radius:999px;padding:7px 12px;font-size:11.5px;font-weight:600;white-space:nowrap}
.sfp-cta.is-outline{background:#fff;color:var(--sfp-accent)}
.sfp-cta.is-soft{background:color-mix(in srgb,var(--sfp-accent) 12%,#fff);border-color:transparent;color:var(--sfp-accent)}
.sfp-screen.has-drawer .sfp-card{flex-wrap:wrap}
.sfp-screen.has-drawer .sfp-cta{display:none}

/* drawer */
.sfp-drawer{flex:1;min-width:0;display:flex;flex-direction:column;background:#fff;border-left:1px solid #EEECE8;box-shadow:-10px 0 30px rgba(0,0,0,.08);font-size:12.5px}
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

/* phone: page slice on top, bottom sheet over it */
.sfp-frame.is-mobile .sfp-screen{flex-direction:column;min-height:520px}
.sfp-frame.is-mobile .sfp-page{flex-direction:column;padding:12px}
.sfp-frame.is-mobile .sfp-photo{flex:none;width:100%;aspect-ratio:16/10}
.sfp-frame.is-mobile .sfp-screen.has-drawer{background:#7B7A77}
.sfp-frame.is-mobile .sfp-screen.has-drawer .sfp-page{flex:none;height:54px;overflow:hidden;opacity:.4}
.sfp-frame.is-mobile .sfp-drawer{border-left:0;border-radius:16px 16px 0 0;box-shadow:0 -10px 30px rgba(0,0,0,.18);margin-top:-12px}
.sfp-frame.is-mobile .sfp-grab{display:block;width:34px;height:4px;border-radius:4px;background:#D9D6D0;margin:7px auto 0}
`;
