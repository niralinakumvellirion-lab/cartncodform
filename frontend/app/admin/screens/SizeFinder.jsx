'use client';

import { useEffect, useRef, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';
import ThemeBlockSetup from '../components/ThemeBlockSetup';
import SizeFinderPreview, { ADVISOR_TEXT_DEFAULTS, ADVISOR_TEXT_MAX, ADVISOR_OPTION_DEFAULTS } from './SizeFinderPreview';

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
  const [previewView, setPreviewView] = useState(3);
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

  const texts = { ...ADVISOR_TEXT_DEFAULTS, ...(settings.texts || {}) };
  const options = { ...ADVISOR_OPTION_DEFAULTS, ...(settings.options || {}) };
  function setText(k, v) { set({ texts: { ...(settings.texts || {}), [k]: v } }); }
  function setOption(k, v) { set({ options: { ...options, [k]: v } }); }

  // Small field components share the page state; focusing one shows that step in the preview.
  function textField(label, k, view, hint) {
    return (
      <label key={k} style={ui.field}>{label}
        <input
          type="text"
          maxLength={ADVISOR_TEXT_MAX[k]}
          value={(settings.texts && settings.texts[k] != null) ? settings.texts[k] : ADVISOR_TEXT_DEFAULTS[k]}
          onChange={(e) => setText(k, e.target.value)}
          onFocus={() => setPreviewView(view)}
          placeholder={ADVISOR_TEXT_DEFAULTS[k]}
          style={ui.input}
          aria-label={label}
        />
        {hint && <span style={{ ...ui.muted, margin: 0, fontWeight: 400 }}>{hint}</span>}
      </label>
    );
  }
  function optionSwitch(k, view, title, text) {
    const on = options[k];
    return (
      <div key={k} style={ui.toggleRow}>
        <span>
          <span style={ui.sectionTitle}>{title}</span>
          <span style={{ ...ui.sectionText, fontSize: 12.5 }}>{text}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`Show ${title.replace(/[“”]/g, '')}`}
          onClick={() => { setOption(k, !on); setPreviewView(view); }}
          style={{ ...ui.toggle, background: on ? '#303030' : '#C9C9C9', flexShrink: 0 }}
        >
          <span style={{ ...ui.knob, transform: on ? 'translateX(20px)' : 'translateX(0)' }} />
        </button>
      </div>
    );
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
        <div style={ui.field}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Button corners</span>
            <span style={ui.muted}>{radiusLabel(settings.buttonRadius)}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 420 }}>
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={radiusValue(settings.buttonRadius)}
              onChange={(e) => set({ buttonRadius: Number(e.target.value) })}
              style={{ flex: 1, minWidth: 0, accentColor: '#303030' }}
              aria-label="Button corner radius"
            />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={0}
                max={24}
                step={1}
                value={radiusValue(settings.buttonRadius)}
                onChange={(e) => { if (e.target.value !== '') set({ buttonRadius: radiusValue(e.target.value) }); }}
                style={{ ...ui.input, width: 68, textAlign: 'center' }}
                aria-label="Button corner radius in px"
              />
              <span style={ui.muted}>px</span>
            </span>
          </span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Corner presets">
            {[[0, 'Square'], [4, '4'], [8, '8'], [12, '12'], [16, '16'], [24, 'Round']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={radiusValue(settings.buttonRadius) === v}
                onClick={() => set({ buttonRadius: v })}
                style={{ ...(radiusValue(settings.buttonRadius) === v ? ui.segOn : ui.segOff), padding: '4px 10px', fontSize: 12, borderRadius: v === 24 ? 999 : Math.max(v, 4) }}
              >
                {l}
              </button>
            ))}
          </span>
        </div>
      </section>

      <section style={ui.card} aria-label="Size advisor">
        <SectionHead icon="panel" title="Size advisor" text="The panel that opens when shoppers click the card. Click a box and the preview jumps to that step." />

        <p style={ui.group}>Womenswear / Menswear buttons</p>
        <div className="sf-grid2">
          {textField('Womenswear button', 'womenLabel', 1)}
          {textField('Menswear button', 'menLabel', 1)}
        </div>

        <p style={ui.group}>Panel</p>
        {textField('Panel title', 'advisorTitle', 1)}

        <p style={ui.group}>Step 1 · Measurements</p>
        <div className="sf-grid2">
          {textField('Step 1 heading', 'step1Title', 1)}
          {textField('Step 1 small text', 'step1Text', 1)}
        </div>

        <p style={ui.group}>Step 2 · Fit</p>
        <div className="sf-grid2">
          {textField('Step 2 heading', 'step2Title', 2)}
          {textField('Step 2 small text', 'step2Text', 2)}
        </div>

        <p style={ui.group}>Result</p>
        <div className="sf-grid2">
          {textField('Result heading', 'resultTitle', 3)}
          {textField('Add to bag button', 'addToBagText', 3, '{size} becomes the size, e.g. M')}
        </div>

        <p style={ui.group}>Show in the size advisor</p>
        <div style={ui.toggles}>
          {optionSwitch('liveEstimate', 1, 'Live estimate', 'Shows a size while shoppers move the sliders (step 1).')}
          {optionSwitch('rememberSize', 2, '“Remember my size”', 'Lets shoppers save their size for next time (step 2).')}
          {optionSwitch('addToBag', 3, 'Add to bag button', 'Picks the size and adds it to the cart in one tap.')}
          {optionSwitch('sizeChart', 3, '“View size chart” link', 'Shows your size chart under the result.')}
        </div>
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
          {texts.womenLabel} or {texts.menLabel} from shoppers.
        </p>
        <div style={ui.row} role="group" aria-label="Chart">
          {[{ v: 'women', l: texts.womenLabel }, { v: 'men', l: texts.menLabel }].map((g) => (
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
          <SizeFinderPreview shop={shop} settings={settings} gender={gender} view={previewView} onViewChange={setPreviewView} />
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
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14 4v16M17 9h1M17 12h1" /></>,
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
.sf-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
@media (max-width:640px){.sf-grid2{grid-template-columns:minmax(0,1fr)}}
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
  group: { fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8A8A', margin: '6px 0 8px' },
  toggles: { display: 'flex', flexDirection: 'column', gap: 8 },
  toggleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#F7F7F7', borderRadius: 10, padding: '10px 12px' },
  tip: { fontSize: 12.5, color: '#616161', background: '#F7F7F7', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' },
  switchWrap: { display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  switchText: { fontSize: 13, fontWeight: 600 },
  toggle: { position: 'relative', display: 'inline-flex', alignItems: 'center', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer' },
  knob: { position: 'absolute', left: 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'transform 0.2s' },
};
