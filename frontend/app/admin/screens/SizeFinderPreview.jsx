'use client';

import { useEffect, useMemo, useState } from 'react';
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
 * Live preview of the storefront "Find my size" block, in a store-page frame, using the UNSAVED
 * settings on the page (button text and colour, charts, unit). Same design as ccf-size.js.
 * The size comes from the backend (POST /api/size-finder/:shop/preview) — the shoppers' maths.
 */
export default function SizeFinderPreview({ shop, settings }) {
  const accent = HEX_RE.test(settings.accentColor || '') ? settings.accentColor : '#111827';
  const genders = ['women', 'men'].filter((g) => (settings.charts[g] || []).length > 0);
  const [device, setDevice] = useState('desktop');
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(1);
  const [gender, setGender] = useState(genders[0] || 'women');
  const [heightCm, setHeightCm] = useState(162);
  const [weightKg, setWeightKg] = useState(60);
  const [hUnit, setHUnit] = useState(settings.unit === 'in' ? 'ft' : 'cm');
  const [wUnit, setWUnit] = useState('kg');
  const [shape, setShape] = useState('average');
  const [fit, setFit] = useState('regular');
  const [remember, setRemember] = useState(false);
  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showChart, setShowChart] = useState(false);

  const chart = settings.charts[gender] || [];
  const chartKey = useMemo(() => JSON.stringify(settings.charts), [settings.charts]);

  // A changed chart can change the answer: go back to the questions.
  useEffect(() => {
    setResult(null);
    setPicked('');
    setStep((s) => (s === 3 ? 2 : s));
    if (!genders.includes(gender) && genders[0]) setGender(genders[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartKey]);

  useEffect(() => { setHUnit(settings.unit === 'in' ? 'ft' : 'cm'); }, [settings.unit]);

  async function seeSize() {
    setBusy(true);
    setError('');
    try {
      const d = await apiSend(`/api/size-finder/${shop}/preview`, 'POST', {
        chart,
        answers: { gender, heightCm: Math.round(heightCm), weightKg: Math.round(weightKg), shape, fit },
      });
      setResult(d);
      setStep(3);
    } catch (e) {
      setError(e.message || 'Could not work out a size');
    } finally {
      setBusy(false);
    }
  }

  const sizes = chart.length ? chart.map((r) => r.size) : ['S', 'M', 'L'];
  const lengthText = (v) => (hUnit === 'ft' ? `${Math.round((v / CM_PER_IN) * 10) / 10} in` : `${v} cm`);

  return (
    <section className="sfp" style={{ '--sfp-accent': accent, '--sfp-tint': `${accent}14` }} aria-label="Live preview">
      <style>{CSS}</style>
      <div className="sfp-top">
        <p className="sfp-label">Live preview <span className="sfp-muted">· updates as you edit, before you save</span></p>
        <div className="sfp-dev" role="group" aria-label="Preview size">
          {[['desktop', 'Desktop'], ['mobile', 'Mobile']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={device === v} onClick={() => setDevice(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className={`sfp-frame ${device === 'mobile' ? 'is-mobile' : ''}`}>
        <div className="sfp-bar" aria-hidden="true"><i /><i /><i /><span>yourstore.com/products/cotton-kurta</span></div>
        <div className="sfp-page">
          <div className="sfp-product">
            <div className="sfp-photo" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6a2 2 0 1 1 2-2" /><path d="M12 6v1.5L3 14a1.5 1.5 0 0 0 .9 2.7h16.2A1.5 1.5 0 0 0 21 14l-9-6.5" /></svg>
            </div>
            <div className="sfp-title-block">
              <p className="sfp-name">Cotton Kurta</p>
              <p className="sfp-price">₹1,299 <span className="sfp-stars" aria-hidden="true">★★★★★</span></p>
            </div>
            <div className="sfp-sizes" aria-label="Example sizes">
              {sizes.map((s) => <span key={s} className={picked === s ? 'on' : ''}>{s}</span>)}
            </div>
          </div>
          <div className="sfp-info">

            {!genders.length ? (
              <p className="sfp-warn">Both size charts are empty, so shoppers won&apos;t see the button.</p>
            ) : (
              <>
                <div className="sfp-trigger">
                  <button type="button" className="sfp-open" aria-expanded={open} onClick={() => { setOpen((o) => !o); if (result) setStep(3); }}>
                    <Ruler />{picked ? `Your size: ${picked}` : (settings.buttonText || 'Find my size')}
                  </button>
                  <span className="sfp-hint">Takes 20 seconds</span>
                </div>

                {open && (
                  <div className="sfp-panel">
                    <div className="sfp-head">
                      <div>
                        <p className="sfp-step">Step {step} of 3</p>
                        <p className="sfp-title">{TITLES[step]}</p>
                      </div>
                      <button type="button" className="sfp-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
                    </div>
                    <div className="sfp-progress" aria-hidden="true">{[1, 2, 3].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
                    <div className="sfp-body">
                      {step === 1 && (
                        <>
                          {genders.length > 1 && (
                            <div className="sfp-seg" role="group" aria-label="Women or men">
                              {genders.map((g) => (
                                <button key={g} type="button" aria-pressed={gender === g} onClick={() => setGender(g)}>{g === 'men' ? 'Men' : 'Women'}</button>
                              ))}
                            </div>
                          )}
                          <div className="sfp-fields">
                          <div className="sfp-field">
                            <div className="sfp-flabel">
                              <span>Height</span>
                              <span className="sfp-unit" role="group" aria-label="Height unit">
                                {['cm', 'ft'].map((u) => <button key={u} type="button" aria-pressed={hUnit === u} onClick={() => setHUnit(u)}>{u}</button>)}
                              </span>
                            </div>
                            <div className="sfp-value">{heightLabel(heightCm, hUnit)}</div>
                            <input type="range" min={140} max={200} step={1} value={heightCm} onChange={(e) => setHeightCm(Number(e.target.value))} aria-label="Preview height" />
                            <div className="sfp-scale"><span>{hUnit === 'cm' ? '140 cm' : '4′ 7″'}</span><span>{hUnit === 'cm' ? '200 cm' : '6′ 7″'}</span></div>
                          </div>
                          <div className="sfp-field">
                            <div className="sfp-flabel">
                              <span>Weight</span>
                              <span className="sfp-unit" role="group" aria-label="Weight unit">
                                {['kg', 'lb'].map((u) => <button key={u} type="button" aria-pressed={wUnit === u} onClick={() => setWUnit(u)}>{u}</button>)}
                              </span>
                            </div>
                            <div className="sfp-value">{weightLabel(weightKg, wUnit)}</div>
                            <input type="range" min={40} max={130} step={1} value={weightKg} onChange={(e) => setWeightKg(Number(e.target.value))} aria-label="Preview weight" />
                            <div className="sfp-scale"><span>{wUnit === 'kg' ? '40 kg' : '88 lb'}</span><span>{wUnit === 'kg' ? '130 kg' : '287 lb'}</span></div>
                          </div>
                          </div>
                          <div className="sfp-actions"><button type="button" className="sfp-main" onClick={() => setStep(2)}>Continue</button></div>
                        </>
                      )}

                      {step === 2 && (
                        <>
                          <p className="sfp-q">Your body shape</p>
                          <div className="sfp-cards">
                            {SHAPES.map(([v, l, h]) => (
                              <button key={v} type="button" aria-label={l} aria-pressed={shape === v} onClick={() => setShape(v)}><b>{l}</b><small>{h}</small></button>
                            ))}
                          </div>
                          <p className="sfp-q">How do you like it to fit?</p>
                          <div className="sfp-cards">
                            {FITS.map(([v, l, h]) => (
                              <button key={v} type="button" aria-label={l} aria-pressed={fit === v} onClick={() => setFit(v)}><b>{l}</b><small>{h}</small></button>
                            ))}
                          </div>
                          <label className="sfp-check">
                            <span><b>Remember my size</b><small>We save only the size, never your height or weight.</small></span>
                            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} aria-label="Remember my size" />
                          </label>
                          <div className="sfp-actions">
                            <button type="button" className="sfp-ghost" onClick={() => setStep(1)}>Back</button>
                            <button type="button" className="sfp-main" onClick={seeSize} disabled={busy}>{busy ? 'Working it out…' : 'See my size'}</button>
                          </div>
                        </>
                      )}

                      {step === 3 && result && (
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
                          <button type="button" className="sfp-link" onClick={() => setShowChart((v) => !v)}>{showChart ? 'Hide size chart' : 'View size chart'}</button>
                          {showChart && (
                            <table className="sfp-table">
                              <thead><tr><th>Size</th><th>Chest</th><th>Waist</th><th>Length</th></tr></thead>
                              <tbody>
                                {chart.map((r) => (
                                  <tr key={r.size}>
                                    <td>{r.size}</td>
                                    {[r.chest, r.waist, r.length].map((n, i) => <td key={i}>{!Number(n) ? '—' : hUnit === 'ft' ? Math.round((n / CM_PER_IN) * 10) / 10 : n}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <div className="sfp-actions">
                            <button type="button" className="sfp-ghost" onClick={() => { setStep(1); setResult(null); }}>Back</button>
                            <button type="button" className="sfp-main" onClick={() => { setPicked(result.size); setOpen(false); }}>Select size {result.size}</button>
                          </div>
                          <p className="sfp-note">A guide based on your answers and this store&apos;s size chart.</p>
                        </div>
                      )}

                      {error && <p className="sfp-err" role="alert">{error}</p>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
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
.sfp-trigger{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sfp-open{display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:4px 0;color:var(--sfp-accent);font-size:14px;font-weight:500;cursor:pointer;text-decoration:underline;text-underline-offset:4px}
.sfp-hint{font-size:12px;color:#616161}
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
.sfp-seg button{flex:1;border:0;background:transparent;border-radius:8px;padding:8px;font-size:14px;font-weight:500;color:#616161;cursor:pointer}
.sfp-seg button[aria-pressed="true"]{background:#fff;color:#303030;box-shadow:0 1px 3px rgba(17,24,39,.12)}
.sfp-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.sfp-field{margin:0 0 12px;min-width:0}
.sfp-flabel{display:flex;justify-content:space-between;align-items:center;margin:0 0 6px}
.sfp-flabel > span:first-child{font-size:13px;font-weight:500;color:#4A4A4A}
.sfp-unit{display:inline-flex;background:#F3F4F6;border-radius:8px;padding:2px}
.sfp-unit button{border:0;background:transparent;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:500;color:#616161;cursor:pointer}
.sfp-unit button[aria-pressed="true"]{background:#fff;color:#303030;box-shadow:0 1px 2px rgba(17,24,39,.12)}
.sfp-value{font-size:22px;font-weight:600;letter-spacing:-.01em;margin:0 0 2px}
.sfp-field input[type=range]{width:100%;accent-color:var(--sfp-accent);margin:0}
.sfp-scale{display:flex;justify-content:space-between;font-size:11px;color:#8A8A8A;margin-top:2px}
.sfp-q{font-size:13px;font-weight:500;color:#4A4A4A;margin:0 0 6px}
.sfp-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 12px}
.sfp-cards button{border:1.5px solid #E5E7EB;background:#fff;border-radius:12px;padding:8px 6px;cursor:pointer;display:flex;flex-direction:column;gap:2px;align-items:center}
.sfp-cards b{font-size:14px;font-weight:500;color:#303030}
.sfp-cards small{font-size:11px;color:#616161}
.sfp-cards button[aria-pressed="true"]{border-color:var(--sfp-accent);background:var(--sfp-tint)}
.sfp-check{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#F9FAFB;border-radius:12px;padding:9px 12px;cursor:pointer}
.sfp-check b{display:block;font-size:13px}
.sfp-check small{font-size:12px;color:#616161}
.sfp-check input{appearance:none;-webkit-appearance:none;width:40px;height:22px;border-radius:999px;background:#D1D5DB;position:relative;cursor:pointer;flex-shrink:0;margin:0}
.sfp-check input::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.sfp-check input:checked{background:var(--sfp-accent)}
.sfp-check input:checked::after{left:20px}
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
`;
