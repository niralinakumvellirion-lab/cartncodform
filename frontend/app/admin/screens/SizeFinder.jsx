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
          <p style={ui.muted}>Shoppers enter height, weight, body shape and fit, and get a size from your chart.</p>
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
        <p style={ui.label}>Where it shows</p>
        <p style={ui.muted}>On products that have a Size option.</p>
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
      </section>

      <section style={ui.card} aria-label="Size charts">
        <div style={ui.row}>
          <p style={{ ...ui.label, margin: 0 }}>Size charts</p>
          <span style={ui.seg} role="group" aria-label="Unit">
            {['cm', 'in'].map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} onClick={() => set({ unit: u })} style={unit === u ? ui.segOn : ui.segOff}>
                {u}
              </button>
            ))}
          </span>
        </div>
        <p style={ui.muted}>
          Body measurements for each size. Starter Indian charts are filled in; change them to match your clothes.
          Leave a chart empty to hide that option from shoppers.
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

      <div style={ui.row}>
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

// Settings on the left, live preview pinned on the right; stacked on narrow screens.
const LAYOUT_CSS = `
.sf-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:20px;align-items:start}
.sf-layout{min-height:100vh}
.sf-main{display:flex;flex-direction:column;gap:16px;min-width:0;padding-bottom:40px}
.sf-side{position:sticky;top:16px;min-width:0;overflow:visible}
.sf-fit{transform-origin:top left}
@media (max-width:1100px){.sf-layout{grid-template-columns:minmax(0,1fr)}.sf-side{position:static;height:auto!important}.sf-fit{transform:none!important;width:100%!important}}
`;

const ui = {
  page: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif", WebkitFontSmoothing: 'antialiased', color: '#303030', maxWidth: 1280, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  h1: { fontSize: 20, fontWeight: 550, margin: '0 0 4px', color: '#303030' },
  card: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: 20 },
  label: { fontWeight: 550, fontSize: 14, color: '#4A4A4A', margin: '0 0 6px' },
  muted: { fontSize: 13, color: '#616161', margin: '4px 0 12px' },
  field: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#4A4A4A', fontWeight: 500, marginBottom: 14 },
  input: { padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14, maxWidth: 360 },
  color: { width: 36, height: 36, border: '1px solid #D1D5DB', borderRadius: 6, padding: 2 },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  seg: { display: 'inline-flex', gap: 4, marginLeft: 'auto' },
  segOn: { background: '#303030', color: '#fff', border: '1px solid #303030', borderRadius: 6, padding: '5px 12px', fontSize: 13, cursor: 'pointer' },
  segOff: { background: '#fff', color: '#303030', border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 12px', fontSize: 13, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 8 },
  th: { textAlign: 'left', padding: '6px 6px', fontSize: 12, color: '#616161', fontWeight: 500, borderBottom: '1px solid #E5E7EB' },
  td: { padding: '6px' },
  cell: { width: '100%', maxWidth: 110, padding: '5px 6px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 },
  remove: { background: 'none', border: 'none', color: '#8A8A8A', cursor: 'pointer', fontSize: 14 },
  add: { background: 'none', border: 'none', color: '#4F46E5', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: '4px 0' },
  save: { background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 550, fontSize: 14, cursor: 'pointer' },
  ok: { fontSize: 13, color: '#059669' },
  error: { fontSize: 13, color: '#DC2626' },
  switchWrap: { display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  switchText: { fontSize: 13, fontWeight: 600 },
  toggle: { position: 'relative', display: 'inline-flex', alignItems: 'center', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer' },
  knob: { position: 'absolute', left: 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'transform 0.2s' },
};
