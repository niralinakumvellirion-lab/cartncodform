'use client';

import { useEffect, useRef, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';
import ThemeBlockSetup from '../components/ThemeBlockSetup';
import SizeFinderPreview from './SizeFinderPreview';

const CM_PER_IN = 2.54;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
export const AREAS = [
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'length', label: 'Length' },
];

// Show a cm value in the chosen unit (1 decimal for inches), and back.
export function toUnit(cm, unit) {
  const n = Number(cm) || 0;
  if (!n) return '';
  return unit === 'in' ? String(Math.round((n / CM_PER_IN) * 10) / 10) : String(n);
}
export function fromUnit(value, unit) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return unit === 'in' ? Math.round(n * CM_PER_IN * 10) / 10 : n;
}

/**
 * Zoom for the pinned preview so ALL of it fits on screen (16px gap top and bottom): 1 when it
 * already fits, smaller when it is taller than the screen, never below 0.85 (text stays readable). The preview then stays
 * fixed while the settings scroll — no scrolling of its own.
 */
export function fitScale(previewHeight, viewportHeight) {
  const avail = viewportHeight - 32;
  if (!(previewHeight > 0) || previewHeight <= avail) return 1;
  return Math.max(0.85, Math.round((avail / previewHeight) * 1000) / 1000);
}

/**
 * "Find my size" settings: on/off, which products, button text and colour, unit, and the
 * Women / Men size charts (body measurements, stored in cm).
 */
export default function SizeFinderScreen({ shop }) {
  const [settings, setSettings] = useState(null);
  const [gender, setGender] = useState('women');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fitRef = useRef(null);
  const layoutRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  const loaded = settings !== null;

  // Keep the whole preview on screen and still (see fitScale). offsetHeight ignores the CSS zoom,
  // so it is the preview's natural height even while scaled.
  useEffect(() => {
    const el = fitRef.current;
    if (!el || typeof window === 'undefined') return undefined;
    const update = () => {
      const height = el.offsetHeight;
      // Space the page has below our layout (Shopify reserves room for its Sidekick bar). The pinned
      // preview cannot go lower than the layout's end, so it must also fit above that space.
      const layout = layoutRef.current;
      const below = layout
        ? Math.max(0, document.documentElement.scrollHeight - (layout.getBoundingClientRect().bottom + window.scrollY))
        : 0;
      const scale = fitScale(height, window.innerHeight - below);
      setFit((f) => (f.scale === scale && f.height === height ? f : { scale, height }));
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [loaded]);

  useEffect(() => {
    if (!shop) return;
    apiGet(`/api/size-finder/${shop}/config`)
      .then((d) => setSettings(d.settings))
      .catch((e) => setLoadError(e.message || 'Could not load the size finder settings'));
  }, [shop]);

  if (loadError) return <p style={ui.error} role="alert">{loadError}</p>;
  if (!settings) return <p style={ui.muted}>Loading…</p>;

  const unit = settings.unit;
  const rows = settings.charts[gender] || [];

  function set(patch) {
    setSettings((s) => ({ ...s, ...patch }));
    setMessage('');
  }
  function setRows(next) {
    setSettings((s) => ({ ...s, charts: { ...s.charts, [gender]: next } }));
    setMessage('');
  }
  function editCell(i, key, value) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [key]: key === 'size' ? value : fromUnit(value, unit) } : r)));
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const d = await apiSend(`/api/size-finder/${shop}/config`, 'PUT', { settings });
      setSettings(d.settings);
      setMessage('Saved');
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={ui.page}>
      <style>{LAYOUT_CSS}</style>
      <div className="sf-layout" ref={layoutRef}>
      <div className="sf-main">
      <div style={ui.head}>
        <div>
          <h1 style={ui.h1}>Find my size</h1>
          <p style={{ ...ui.muted, margin: '0 0 10px' }}>A size advisor on your product pages: shoppers enter height, weight and fit, and get the right size from your chart.</p>
          <span style={{ ...ui.pill, ...(settings.enabled ? ui.pillOn : ui.pillOff) }}>
            <span style={{ ...ui.dot, background: settings.enabled ? '#047857' : '#B45309' }} />
            {settings.enabled ? 'Showing on your store' : 'Hidden — turn on and save to show it'}
          </span>
        </div>
        <span style={ui.switchWrap}>
          <span aria-hidden="true" style={{ ...ui.switchText, color: settings.enabled ? '#065F46' : '#B45309' }}>
            {settings.enabled ? 'On' : 'Off'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            aria-label="Turn on Find my size"
            onClick={() => set({ enabled: !settings.enabled })}
            style={{ ...ui.toggle, background: settings.enabled ? '#4F46E5' : '#9CA3AF' }}
          >
            <span style={{ ...ui.knob, transform: settings.enabled ? 'translateX(20px)' : 'translateX(0)' }} />
          </button>
        </span>
      </div>
      <section style={ui.card}>
        <SectionHead icon="pin" title="Where it shows" text="Every product that has a Size option. Add a tag to show it only on some products." />
        <label style={ui.field}>Only on products with this tag (optional)
          <input
            type="text"
            maxLength={60}
            value={settings.productTag}
            onChange={(e) => set({ productTag: e.target.value })}
            placeholder="size-finder"
            style={ui.input}
            aria-label="Product tag"
          />
        </label>
      </section>

      <section style={ui.card} aria-label="Card on the product page">
        <SectionHead icon="card" title="Card on the product page" text="Shoppers see this card right under the Size buttons. The preview updates as you type." />
        <label style={ui.field}>Heading
          <input
            type="text"
            maxLength={60}
            value={settings.cardTitle ?? ''}
            onChange={(e) => set({ cardTitle: e.target.value })}
            placeholder="Not sure about your size?"
            style={ui.input}
            aria-label="Card heading"
          />
        </label>
        <label style={ui.field}>Small text
          <input
            type="text"
            maxLength={80}
            value={settings.cardText ?? ''}
            onChange={(e) => set({ cardText: e.target.value })}
            placeholder="3 quick questions · takes 20 seconds"
            style={ui.input}
            aria-label="Card small text"
          />
        </label>
        <label style={ui.field}>Button text
          <input
            type="text"
            maxLength={40}
            value={settings.buttonText}
            onChange={(e) => set({ buttonText: e.target.value })}
            style={ui.input}
            aria-label="Button text"
          />
        </label>
        <label style={ui.field}>Button colour
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={HEX_RE.test(settings.accentColor) ? settings.accentColor : '#111827'}
              onChange={(e) => set({ accentColor: e.target.value })}
              style={ui.color}
              aria-label="Button colour picker"
            />
            <input
              type="text"
              maxLength={7}
              value={settings.accentColor}
              onChange={(e) => set({ accentColor: e.target.value })}
              style={{ ...ui.input, width: 100 }}
              aria-label="Button colour hex"
            />
          </span>
        </label>
        <div style={ui.field}>
          <span>Button style</span>
          <span style={{ display: 'flex', gap: 4, marginTop: 6 }} role="group" aria-label="Button style">
            {[['filled', 'Filled'], ['outline', 'Outline'], ['soft', 'Soft']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={(settings.buttonStyle || 'filled') === v}
                onClick={() => set({ buttonStyle: v })}
                style={(settings.buttonStyle || 'filled') === v ? ui.segOn : ui.segOff}
              >
                {l}
              </button>
            ))}
          </span>
        </div>
        <label style={ui.field}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Button corners</span>
            <span style={ui.muted}>{radiusLabel(settings.buttonRadius)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={24}
            step={1}
            value={radiusValue(settings.buttonRadius)}
            onChange={(e) => set({ buttonRadius: Number(e.target.value) })}
            style={{ width: '100%', maxWidth: 360, accentColor: '#303030', marginTop: 6 }}
            aria-label="Button corner radius"
          />
        </label>
      </section>

      <section style={ui.card} aria-label="Size charts">
        <div style={ui.row}>
          <SectionHead icon="chart" title="Size charts" text="Body measurements for each size." />
          <span style={ui.seg} role="group" aria-label="Unit">
            {['cm', 'in'].map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} onClick={() => set({ unit: u })} style={unit === u ? ui.segOn : ui.segOff}>
                {u}
              </button>
            ))}
          </span>
        </div>
        <p style={ui.tip}>
          Starter Indian charts are filled in — change them to match your clothes. Leave a chart empty to hide
          Womenswear or Menswear from shoppers.
        </p>
        <div style={ui.row} role="group" aria-label="Chart">
          {[{ v: 'women', l: 'Women' }, { v: 'men', l: 'Men' }].map((g) => (
            <button key={g.v} type="button" aria-pressed={gender === g.v} onClick={() => setGender(g.v)} style={gender === g.v ? ui.segOn : ui.segOff}>
              {g.l} ({(settings.charts[g.v] || []).length})
            </button>
          ))}
        </div>
        <table style={ui.table} aria-label={`${gender} size chart`}>
          <thead>
            <tr>
              <th style={ui.th}>Size</th>
              {AREAS.map((a) => <th key={a.key} style={ui.th}>{a.label} ({unit})</th>)}
              <th style={ui.th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={ui.td}>
                  <input value={r.size} maxLength={10} onChange={(e) => editCell(i, 'size', e.target.value)} style={ui.cell} aria-label={`Row ${i + 1} size`} />
                </td>
                {AREAS.map((a) => (
                  <td key={a.key} style={ui.td}>
                    <input
                      type="number"
                      step="0.1"
                      value={toUnit(r[a.key], unit)}
                      onChange={(e) => editCell(i, a.key, e.target.value)}
                      style={ui.cell}
                      aria-label={`Row ${i + 1} ${a.label}`}
                    />
                  </td>
                ))}
                <td style={ui.td}>
                  <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} style={ui.remove} aria-label={`Remove row ${i + 1}`}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length < 12 && (
          <button type="button" style={ui.add} onClick={() => setRows([...rows, { size: '', chest: '', waist: '', length: '' }])}>
            + Add a size
          </button>
        )}
      </section>

      <ThemeBlockSetup
        shop={shop}
        handle="size-finder"
        blockName="Find My Size"
        place="under the size picker"
        whenLive="Shoppers see the button once Find my size is turned on and saved."
      />

      <div className="sf-savebar" style={ui.row}>
        <button type="button" onClick={save} disabled={saving} style={ui.save}>{saving ? 'Saving…' : 'Save'}</button>
        {message && <span style={ui.ok}>✓ {message}</span>}
        {error && <span style={ui.error} role="alert">{error}</span>}
      </div>
      </div>
      <aside className="sf-side" style={fit.height ? { height: Math.ceil(fit.height * fit.scale) } : undefined}>
        <div
          ref={fitRef}
          className="sf-fit"
          style={{ transform: `scale(${fit.scale})`, width: `${100 / fit.scale}%` }}
        >
          <SizeFinderPreview shop={shop} settings={settings} gender={gender} />
        </div>
      </aside>
      </div>
    </div>
  );
}

const ICONS = {
  pin: <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
  card: <><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M7 12h6M16 12h1" /></>,
  chart: <path d="M3 15.5 15.5 3 21 8.5 8.5 21zM7 12l2 2M10 9l2 2M13 6l2 2" />,
};
function SectionHead({ icon, title, text }) {
  return (
    <div style={ui.sectionHead}>
      <span style={ui.sectionIcon} aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon]}</svg>
      </span>
      <span>
        <span style={ui.sectionTitle}>{title}</span>
        <span style={ui.sectionText}>{text}</span>
      </span>
    </div>
  );
}

// Settings on the left, live preview pinned on the right; stacked on narrow screens.
const LAYOUT_CSS = `
.sf-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:20px;align-items:start}
.sf-layout{min-height:100vh}
.sf-main{display:flex;flex-direction:column;gap:16px;min-width:0;padding-bottom:40px}
.sf-side{position:sticky;top:16px;min-width:0;overflow:visible}
.sf-fit{transform-origin:top left}
.sf-main input[type=text],.sf-main input[type=number]{transition:border-color .15s,box-shadow .15s}
.sf-main input[type=text]:focus,.sf-main input[type=number]:focus{outline:none;border-color:#303030;box-shadow:0 0 0 3px rgba(48,48,48,.12)}
.sf-main tbody tr:hover td{background:#FAFAFA}
.sf-savebar{position:sticky;bottom:0;z-index:2;background:rgba(246,246,247,.92);backdrop-filter:blur(6px);padding:12px 0;margin:0!important;border-top:1px solid #E3E3E3}
@media (max-width:1100px){.sf-layout{grid-template-columns:minmax(0,1fr)}.sf-side{position:static;height:auto!important}.sf-fit{transform:none!important;width:100%!important}}
`;

/** Corner slider: 0 = square … 24 = fully round (the default). */
export function radiusValue(v) {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? 24 : Math.min(24, Math.max(0, Math.round(n)));
}
export function radiusLabel(v) {
  const n = radiusValue(v);
  return n === 0 ? 'Square' : n >= 24 ? 'Round' : `${n} px`;
}

const ui = {
  page: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif", WebkitFontSmoothing: 'antialiased', color: '#303030', maxWidth: 1280, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  h1: { fontSize: 20, fontWeight: 550, margin: '0 0 4px', color: '#303030' },
  card: { background: '#fff', border: '1px solid #E3E3E3', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,.04)' },
  label: { fontWeight: 550, fontSize: 14, color: '#4A4A4A', margin: '0 0 6px' },
  muted: { fontSize: 13, color: '#616161', margin: '4px 0 12px' },
  field: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#303030', fontWeight: 500, marginBottom: 16 },
  input: { height: 36, padding: '0 10px', border: '1px solid #D4D4D4', borderRadius: 8, fontSize: 14, width: '100%', maxWidth: 420, background: '#fff', color: '#303030' },
  color: { width: 36, height: 36, border: '1px solid #D1D5DB', borderRadius: 6, padding: 2 },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  seg: { display: 'inline-flex', gap: 4, marginLeft: 'auto' },
  segOn: { background: '#303030', color: '#fff', border: '1px solid #303030', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  segOff: { background: '#fff', color: '#303030', border: '1px solid #D4D4D4', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 8 },
  th: { textAlign: 'left', padding: '8px 6px', fontSize: 11, color: '#616161', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: '1px solid #E3E3E3' },
  td: { padding: '6px' },
  cell: { width: '100%', maxWidth: 110, height: 34, padding: '0 8px', border: '1px solid #D4D4D4', borderRadius: 8, fontSize: 14 },
  remove: { background: 'none', border: 'none', color: '#8A8A8A', cursor: 'pointer', fontSize: 14 },
  add: { background: '#fff', border: '1px dashed #C9C9C9', borderRadius: 8, color: '#303030', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: '8px 14px', marginTop: 4 },
  save: { background: '#303030', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 1px 0 rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.12)' },
  ok: { fontSize: 13, color: '#059669' },
  error: { fontSize: 13, color: '#DC2626' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, borderRadius: 999, padding: '3px 10px' },
  pillOn: { background: '#ECFDF5', color: '#065F46' },
  pillOff: { background: '#FFF7ED', color: '#9A3412' },
  dot: { width: 7, height: 7, borderRadius: '50%' },
  sectionHead: { display: 'flex', gap: 12, alignItems: 'flex-start', margin: '0 0 16px', flex: 1, minWidth: 0 },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, background: '#F1F1F1', color: '#303030', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectionTitle: { display: 'block', fontSize: 15, fontWeight: 600, color: '#303030' },
  sectionText: { display: 'block', fontSize: 13, color: '#616161', marginTop: 2 },
  tip: { fontSize: 12.5, color: '#616161', background: '#F7F7F7', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' },
  switchWrap: { display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  switchText: { fontSize: 13, fontWeight: 600 },
  toggle: { position: 'relative', display: 'inline-flex', alignItems: 'center', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer' },
  knob: { position: 'absolute', left: 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'transform 0.2s' },
};
