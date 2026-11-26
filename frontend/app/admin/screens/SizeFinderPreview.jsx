'use client';

import { useEffect, useState } from 'react';
import { apiSend } from '../../../lib/api';

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const REASON_TEXT = { right: 'Right for your fit', snug: 'A little snug', roomy: 'A little roomy' };
const TITLES = { 1: 'Find your size', 2: 'Tell us about your fit', 3: 'Your size' };
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
// Fit-meter position (0–100) from the chest result — same as ccf-size.js.
export function meterPosition(reasons) {
  const chest = (reasons || []).find((x) => x.area === 'chest');
  if (!chest) return 50;
  return chest.status === 'snug' ? 18 : chest.status === 'roomy' ? 82 : 50;
}

function Ruler() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 15.5 15.5 3 21 8.5 8.5 21z" /><path d="m7 12 2 2M10 9l2 2M13 6l2 2" />
    </svg>
  );
}

/**
 * Live preview of the storefront "Find my size" block — DISPLAY ONLY. Nothing inside the store frame
 * can be clicked or changed; it re-draws from the settings on the page (unsaved): button text and
 * colour, unit, and the size chart for the Women/Men tab open in the chart editor.
 * The result uses a sample shopper and the backend's maths (POST /api/size-finder/:shop/preview),
 * fetched again ~0.4s after the chart changes. Same design as ccf-size.js.
 * The view tabs (Step 1 / Step 2 / Result) and Desktop/Mobile only change what is shown.
 */
export const SAMPLE_SHOPPER = {
  women: { heightCm: 162, weightKg: 60 },
  men: { heightCm: 175, weightKg: 72 },
};
const VIEWS = [[1, 'Step 1'], [2, 'Step 2'], [3, 'Result']];

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

  const sizes = chart.length ? chart.map((r) => r.size) : ['S', 'M', 'L'];
  const picked = view === 3 && result ? result.size : '';
  const lengthText = (v) => (hUnit === 'ft' ? `${Math.round((v / CM_PER_IN) * 10) / 10} in` : `${v} cm`);
  const heightPct = ((sample.heightCm - 140) / (200 - 140)) * 100;
  const weightPct = ((sample.weightKg - 40) / (130 - 40)) * 100;

  return (
    <section className="sfp" style={{ '--sfp-accent': accent, '--sfp-tint': `${accent}14` }} aria-label="Live preview">
      <style>{CSS}</style>
      <div className="sfp-top">
        <p className="sfp-label">Live preview <span className="sfp-muted">· view only, updates as you edit</span></p>
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
        <div className="sfp-bar" aria-hidden="true"><i /><i /><i /><span>yourstore.com/products/cotton-kurta</span></div>
        {/* Display only: inert = no clicks, no keyboard focus inside the store frame. */}
        <div className="sfp-page sfp-static" {...{ inert: '' }}>
          <div className="sfp-product">
            <div className="sfp-photo" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6a2 2 0 1 1 2-2" /><path d="M12 6v1.5L3 14a1.5 1.5 0 0 0 .9 2.7h16.2A1.5 1.5 0 0 0 21 14l-9-6.5" /></svg>
            </div>
            <div className="sfp-title-block">
              <p className="sfp-name">Cotton Kurta</p>
              <p className="sfp-price">₹1,299 <span className="sfp-stars" aria-hidden="true">★★★★★</span></p>
            </div>
            <div className="sfp-sizes" aria-label="Example sizes">
              {sizes.map((s) => <span key={s} className={picked === s ? 'on' : ''}>{s}</span>)}
            </div>
          </div>

          {!genders.length ? (
            <p className="sfp-warn">Both size charts are empty, so shoppers won&apos;t see the button.</p>
          ) : (
            <div className="sfp-info">
              <div className="sfp-card">
                <span className="sfp-icon"><Ruler /></span>
                <span className="sfp-copy">
                  <span className="sfp-card-title">{settings.cardTitle || 'Not sure about your size?'}</span>
                  <span className="sfp-card-sub">{settings.cardText || '3 quick questions · takes 20 seconds'}</span>
                </span>
                <span className="sfp-cta">{settings.buttonText || 'Find my size'} →</span>
              </div>

              <div className="sfp-panel">
                <div className="sfp-head">
                  <div>
                    <p className="sfp-step">Step {view} of 3</p>
                    <p className="sfp-title">{TITLES[view]}</p>
                  </div>
                  <span className="sfp-close" aria-hidden="true">×</span>
                </div>
                <div className="sfp-progress" aria-hidden="true">{[1, 2, 3].map((i) => <span key={i} className={i <= view ? 'on' : ''} />)}</div>
                <div className="sfp-body">
                  {view === 1 && (
                    <>
                      {genders.length > 1 && (
                        <div className="sfp-seg">
                          {genders.map((g) => <span key={g} className={gender === g ? 'on' : ''}>{g === 'men' ? 'Men' : 'Women'}</span>)}
                        </div>
                      )}
                      <div className="sfp-fields">
                        <div className="sfp-field">
                          <div className="sfp-flabel"><span>Height</span><span className="sfp-unit"><span className={hUnit === 'cm' ? 'on' : ''}>cm</span><span className={hUnit === 'ft' ? 'on' : ''}>ft</span></span></div>
                          <div className="sfp-value">{heightLabel(sample.heightCm, hUnit)}</div>
                          <div className="sfp-track"><span style={{ width: `${heightPct}%` }} /><i style={{ left: `${heightPct}%` }} /></div>
                          <div className="sfp-scale"><span>{hUnit === 'cm' ? '140 cm' : '4′ 7″'}</span><span>{hUnit === 'cm' ? '200 cm' : '6′ 7″'}</span></div>
                        </div>
                        <div className="sfp-field">
                          <div className="sfp-flabel"><span>Weight</span><span className="sfp-unit"><span className={wUnit === 'kg' ? 'on' : ''}>kg</span><span className={wUnit === 'lb' ? 'on' : ''}>lb</span></span></div>
                          <div className="sfp-value">{weightLabel(sample.weightKg, wUnit)}</div>
                          <div className="sfp-track"><span style={{ width: `${weightPct}%` }} /><i style={{ left: `${weightPct}%` }} /></div>
                          <div className="sfp-scale"><span>{wUnit === 'kg' ? '40 kg' : '88 lb'}</span><span>{wUnit === 'kg' ? '130 kg' : '287 lb'}</span></div>
                        </div>
                      </div>
                      <div className="sfp-actions"><span className="sfp-main">Continue</span></div>
                    </>
                  )}

                  {view === 2 && (
                    <>
                      <p className="sfp-q">Your body shape</p>
                      <div className="sfp-cards">
                        {SHAPES.map(([v, l, h]) => <span key={v} className={v === 'average' ? 'on' : ''}><b>{l}</b><small>{h}</small></span>)}
                      </div>
                      <p className="sfp-q">How do you like it to fit?</p>
                      <div className="sfp-cards">
                        {FITS.map(([v, l, h]) => <span key={v} className={v === 'regular' ? 'on' : ''}><b>{l}</b><small>{h}</small></span>)}
                      </div>
                      <div className="sfp-check">
                        <span><b>Remember my size</b><small>We save only the size, never your height or weight.</small></span>
                        <i className="sfp-switch" aria-hidden="true" />
                      </div>
                      <div className="sfp-actions"><span className="sfp-ghost">Back</span><span className="sfp-main">See my size</span></div>
                    </>
                  )}

                  {view === 3 && (
                    <>
                      {error && <p className="sfp-err" role="alert">{error}</p>}
                      {!error && !result && <p className="sfp-muted sfp-loading">{loading ? 'Working out the size…' : 'Add sizes to this chart to see a result.'}</p>}
                      {!error && result && (
                        <div className="sfp-result">
                          <div className="sfp-result-top">
                            <div className="sfp-size" aria-label="Recommended size">{result.size}</div>
                            <div className="sfp-summary">
                              <p className="sfp-kicker">We recommend</p>
                              <p className="sfp-verdict">{result.outOfRange ? 'Our largest size — it may feel tight' : 'Best fit for you'}</p>
                              <div className="sfp-meter" aria-hidden="true">
                                <div className="sfp-meter-bar"><span style={{ left: `${meterPosition(result.reasons)}%` }} /></div>
                                <div className="sfp-meter-labels"><span>Snug</span><span>Perfect</span><span>Roomy</span></div>
                              </div>
                            </div>
                          </div>
                          {(result.reasons || []).map((x) => (
                            <div key={x.area} className="sfp-reason">
                              <span>{x.area.charAt(0).toUpperCase() + x.area.slice(1)}</span>
                              {x.status === 'info'
                                ? <span className="sfp-muted">Garment length {lengthText(x.value)}</span>
                                : <span className={x.status === 'right' ? 'sfp-ok' : 'sfp-bad'}>{REASON_TEXT[x.status]}</span>}
                            </div>
                          ))}
                          <span className="sfp-link">View size chart</span>
                          <div className="sfp-actions"><span className="sfp-ghost">Back</span><span className="sfp-main">Select size {result.size}</span></div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
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
.sfp{font-family:Inter,-apple-system,BlinkMacSystemFont,'San Francisco','Segoe UI',Roboto,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;color:#303030}
.sfp *{box-sizing:border-box}
.sfp button,.sfp input{font-family:inherit}
.sfp-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}
.sfp-label{font-weight:500;font-size:14px;margin:0}
.sfp-muted{font-size:12px;color:#616161;margin:2px 0 0}
.sfp-dev{display:inline-flex;background:#F3F4F6;border-radius:8px;padding:3px;flex-shrink:0}
.sfp-dev button{border:0;background:transparent;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:500;color:#616161;cursor:pointer}
.sfp-dev button[aria-pressed="true"]{background:#fff;color:#303030;box-shadow:0 1px 2px rgba(17,24,39,.12)}
.sfp-frame{border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;background:#fff;margin:0 auto;transition:max-width .2s}
.sfp-frame.is-mobile{max-width:375px}
.sfp-bar{display:flex;align-items:center;gap:6px;background:#F3F4F6;padding:8px 12px;border-bottom:1px solid #E5E7EB}
.sfp-bar i{width:9px;height:9px;border-radius:50%;background:#D1D5DB;display:inline-block}
.sfp-bar span{margin-left:8px;font-size:11px;color:#616161;background:#fff;border-radius:6px;padding:3px 10px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sfp-page{padding:16px 18px 18px}
.sfp-frame.is-mobile .sfp-page{padding:14px}
.sfp-product{display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px;padding-bottom:12px;margin-bottom:10px;border-bottom:1px solid #F3F4F6}
.sfp-title-block{min-width:0}
.sfp-photo{background:#F3F4F6;border-radius:10px;width:48px;height:48px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.sfp-brand{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#616161;margin:0}
.sfp-name{font-size:16px;font-weight:600;margin:0 0 2px}
.sfp-stars{font-size:12px;color:#F59E0B;margin-left:6px;font-weight:400}
.sfp-price{font-size:14px;font-weight:500;margin:0}
.sfp-opt{font-size:13px;color:#4A4A4A;margin:0 0 8px}
.sfp-sizes{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto}
.sfp-sizes span{min-width:40px;text-align:center;border:1px solid #D1D5DB;border-radius:8px;padding:5px 9px;font-size:13px}
.sfp-sizes span.on{border:2px solid #303030;padding:4px 8px;font-weight:500}
.sfp-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid color-mix(in srgb,var(--sfp-accent) 25%,transparent);border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--sfp-accent) 6%,#fff),color-mix(in srgb,var(--sfp-accent) 2%,#fff))}
.sfp-icon{width:42px;height:42px;border-radius:50%;background:#fff;color:var(--sfp-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 1px color-mix(in srgb,var(--sfp-accent) 20%,transparent)}
.sfp-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.sfp-card-title{font-size:15px;font-weight:600;line-height:1.3}
.sfp-card-sub{font-size:12.5px;color:#616161}
.sfp-cta{flex-shrink:0;background:var(--sfp-accent);color:#fff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;white-space:nowrap}
.sfp-frame.is-mobile .sfp-card{padding:11px 12px;gap:10px}
.sfp-frame.is-mobile .sfp-icon{width:38px;height:38px}
.sfp-frame.is-mobile .sfp-card-title{font-size:14px}
.sfp-frame.is-mobile .sfp-cta{padding:7px 11px;font-size:12px}
.sfp-warn{font-size:13px;color:#B45309;background:#FFFBEB;border-radius:8px;padding:8px 10px;margin:0}
.sfp-panel{margin-top:10px;border:1px solid #E5E7EB;border-radius:16px;background:#fff;box-shadow:0 10px 30px rgba(17,24,39,.08);overflow:hidden}
.sfp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px 0}
.sfp-step{font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#616161;margin:0 0 4px}
.sfp-title{font-size:17px;font-weight:600;margin:0}
.sfp-close{background:#F3F4F6;border:0;width:28px;height:28px;border-radius:50%;cursor:pointer;color:#4A4A4A;font-size:16px;line-height:28px}
.sfp-progress{display:flex;gap:6px;padding:12px 18px 0}
.sfp-progress span{flex:1;height:4px;border-radius:4px;background:#E5E7EB}
.sfp-progress span.on{background:var(--sfp-accent)}
.sfp-body{padding:14px 18px 16px}
.sfp-seg{display:flex;background:#F3F4F6;border-radius:10px;padding:4px;gap:4px;margin:0 0 12px}
.sfp-seg > span{flex:1;border:0;background:transparent;border-radius:8px;padding:8px;font-size:14px;font-weight:500;color:#616161;cursor:pointer}
.sfp-seg > span.on{background:#fff;color:#303030;box-shadow:0 1px 3px rgba(17,24,39,.12)}
.sfp-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.sfp-field{margin:0 0 12px;min-width:0}
.sfp-flabel{display:flex;justify-content:space-between;align-items:center;margin:0 0 6px}
.sfp-flabel > span:first-child{font-size:13px;font-weight:500;color:#4A4A4A}
.sfp-unit{display:inline-flex;background:#F3F4F6;border-radius:8px;padding:2px}
.sfp-unit > span{border:0;background:transparent;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:500;color:#616161;cursor:pointer}
.sfp-unit > span.on{background:#fff;color:#303030;box-shadow:0 1px 2px rgba(17,24,39,.12)}
.sfp-value{font-size:22px;font-weight:600;letter-spacing:-.01em;margin:0 0 2px}
.sfp-track{position:relative;height:4px;border-radius:4px;background:#E3E3E3;margin:8px 0 6px}
.sfp-track > span{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--sfp-accent)}
.sfp-track > i{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--sfp-accent)}
.sfp-scale{display:flex;justify-content:space-between;font-size:11px;color:#8A8A8A;margin-top:2px}
.sfp-q{font-size:13px;font-weight:500;color:#4A4A4A;margin:0 0 6px}
.sfp-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 12px}
.sfp-cards > span{border:1.5px solid #E5E7EB;background:#fff;border-radius:12px;padding:8px 6px;cursor:pointer;display:flex;flex-direction:column;gap:2px;align-items:center}
.sfp-cards b{font-size:14px;font-weight:500;color:#303030}
.sfp-cards small{font-size:11px;color:#616161}
.sfp-cards > span.on{border-color:var(--sfp-accent);background:var(--sfp-tint)}
.sfp-check{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#F9FAFB;border-radius:12px;padding:9px 12px;cursor:pointer}
.sfp-check b{display:block;font-size:13px}
.sfp-check small{font-size:12px;color:#616161}
.sfp-switch{display:inline-block;appearance:none;-webkit-appearance:none;width:40px;height:22px;border-radius:999px;background:#D1D5DB;position:relative;cursor:pointer;flex-shrink:0;margin:0}
.sfp-switch::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.sfp-actions{display:flex;gap:10px;margin-top:14px}
.sfp-main{flex:2;background:var(--sfp-accent);border:1px solid var(--sfp-accent);color:#fff;border-radius:10px;padding:10px;font-size:14px;font-weight:500;cursor:pointer}
.sfp-main[disabled]{opacity:.7}
.sfp-ghost{flex:1;background:#fff;border:1px solid #D1D5DB;color:#303030;border-radius:10px;padding:10px;font-size:14px;font-weight:500;cursor:pointer}
.sfp-result{text-align:left}
.sfp-result-top{display:flex;align-items:center;gap:16px;margin:0 0 8px}
.sfp-summary{flex:1;min-width:0}
.sfp-kicker{font-size:12px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#616161;margin:0}
.sfp-size{width:68px;height:68px;margin:0;flex-shrink:0;border-radius:50%;border:4px solid var(--sfp-accent);background:var(--sfp-tint);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600}
.sfp-verdict{font-size:16px;font-weight:600;margin:2px 0 8px}
.sfp-meter{margin:0;text-align:left}
.sfp-meter-bar{position:relative;height:6px;border-radius:6px;background:linear-gradient(90deg,#FDE68A,#A7F3D0 35%,#A7F3D0 65%,#FDE68A)}
.sfp-meter-bar span{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;border:3px solid var(--sfp-accent)}
.sfp-meter-labels{display:flex;justify-content:space-between;font-size:11px;color:#616161;margin-top:6px}
.sfp-reason{display:flex;justify-content:space-between;align-items:center;font-size:13px;border-top:1px solid #F3F4F6;padding:8px 2px;text-align:left}
.sfp-reason > span:first-child{font-weight:500;color:#4A4A4A}
.sfp-ok,.sfp-bad{display:inline-flex;align-items:center;gap:6px;font-weight:500}
.sfp-ok{color:#047857}.sfp-bad{color:#B45309}
.sfp-ok::before{content:"✓";width:16px;height:16px;border-radius:50%;background:#D1FAE5;font-size:10px;line-height:16px;text-align:center}
.sfp-bad::before{content:"!";width:16px;height:16px;border-radius:50%;background:#FEF3C7;font-size:10px;line-height:16px;text-align:center}
.sfp-link{background:none;border:0;padding:0;margin-top:6px;color:var(--sfp-accent);text-decoration:underline;text-underline-offset:3px;font-size:13px;font-weight:500;cursor:pointer}
.sfp-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;border:1px solid #E5E7EB}
.sfp-table th{background:#F9FAFB;font-weight:500}
.sfp-table th,.sfp-table td{border-bottom:1px solid #F3F4F6;padding:6px;text-align:center}
.sfp-note{font-size:12px;color:#616161;margin:10px 0 0}
.sfp-err{font-size:13px;color:#B42318;font-weight:500;margin:12px 0 0;background:#FEF2F2;border-radius:8px;padding:8px 10px}
.sfp-views{display:inline-flex;background:#F1F1F1;border-radius:8px;padding:3px;margin:0 0 10px}
.sfp-views button{border:0;background:transparent;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:500;color:#616161;cursor:pointer}
.sfp-views button[aria-pressed="true"]{background:#fff;color:#303030;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.sfp-static{pointer-events:none;user-select:none}
.sfp-close,.sfp-main,.sfp-ghost,.sfp-link{display:inline-flex;align-items:center;justify-content:center}
.sfp-actions .sfp-main,.sfp-actions .sfp-ghost{display:flex}
.sfp-loading{padding:18px 0;text-align:center}
.sfp-sample{font-size:12px;color:#8A8A8A;margin:10px 2px 0}
`;
