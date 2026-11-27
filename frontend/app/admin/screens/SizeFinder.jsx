'use client';

import { useEffect, useRef, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';
import ThemeBlockSetup from '../components/ThemeBlockSetup';
import SizeFinderPreview, { ADVISOR_TEXT_DEFAULTS, ADVISOR_TEXT_MAX, ADVISOR_OPTION_DEFAULTS } from './SizeFinderPreview';
import StoreTypePicker, { StoreTypeCard, NotNeededCard } from './StoreTypePicker';

const CM_PER_IN = 2.54;
const CLOTHING_CAPTION = '3 quick questions · takes 20 seconds';
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
  // From the backend with the settings: search words per store type, and each measure type's words/ranges.
  const [meta, setMeta] = useState({ storeTypes: [], measureTypes: {} });
  const [choosing, setChoosing] = useState(false); // the store-type search is open
  const [lastQuery, setLastQuery] = useState('');
  const [gender, setGender] = useState('women');
  const [previewView, setPreviewView] = useState(5);
  // The step open on the left: chart · button · features · words · live.
  const [tab, setTab] = useState('chart');
  const [highlight, setHighlight] = useState(null); // { key, label } of the field being edited
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fitRef = useRef(null);
  const layoutRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  const loaded = settings !== null;
  const enabled = !!(settings && settings.enabled);

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
  }, [loaded, enabled]); // the preview only exists while Find my size is on

  useEffect(() => {
    if (!shop) return;
    apiGet(`/api/size-finder/${shop}/config`)
      .then((d) => {
        setSettings(d.settings);
        setMeta({ storeTypes: d.storeTypes || [], measureTypes: d.measureTypes || {} });
      })
      .catch((e) => setLoadError(e.message || 'Could not load the size finder settings'));
  }, [shop]);

  if (loadError) return <p style={ui.error} role="alert">{loadError}</p>;
  if (!settings) return <p style={ui.muted}>Loading…</p>;

  const unit = settings.unit;
  const rows = settings.charts[gender] || [];
  // Settings saved before store types existed have none → clothing.
  const storeType = settings.storeType === undefined ? 'clothing' : settings.storeType;
  const typeInfo = meta.storeTypes.find((t) => t.id === storeType) || null;
  const measure = meta.measureTypes[storeType] || null; // shoes / rings / bangles
  const isOn = storeType !== '' && storeType !== 'none';
  const showPicker = storeType === '' || choosing;
  const measureRows = (measure && settings.measureCharts && settings.measureCharts[storeType]) || [];
  // Preview screens: clothing 1–5; measure types 1 Measure · 2 Result.
  const mv = (v) => (measure ? (v >= 4 ? 2 : 1) : v);

  function pickType(id, query) {
    const first = storeType === '';
    // The caption follows the kind of store while the seller hasn't written their own.
    const captions = [CLOTHING_CAPTION, ...Object.values(meta.measureTypes).map((m) => m.caption)];
    const nextCaption = meta.measureTypes[id] ? meta.measureTypes[id].caption : CLOTHING_CAPTION;
    setSettings((s) => ({
      ...s,
      storeType: id,
      enabled: id === 'none' ? false : (first ? true : s.enabled),
      cardText: !s.cardText || captions.includes(s.cardText) ? nextCaption : s.cardText,
    }));
    setChoosing(false);
    setLastQuery(query || '');
    setMessage('');
    setPreviewView(meta.measureTypes[id] ? 2 : 5);
    setHighlight(null);
  }
  function setMeasureRows(next) {
    setSettings((s) => ({ ...s, measureCharts: { ...(s.measureCharts || {}), [storeType]: next } }));
    setMessage('');
  }

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

  // Clicking or typing anywhere in a section shows that section's preview on the right.
  // The field (data-hl) being edited is highlighted in the preview, which also jumps to its step.
  function focusArea() {
    const pick = (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-hl]') : null;
      if (!el) { setHighlight(null); return; }
      const key = el.getAttribute('data-hl');
      setHighlight({ key, label: el.getAttribute('data-hl-label') || '' });
      if (HL_VIEW[key]) setPreviewView(mv(HL_VIEW[key]));
    };
    return { onFocusCapture: pick, onMouseDownCapture: pick };
  }

  const texts = { ...ADVISOR_TEXT_DEFAULTS, ...(settings.texts || {}) };
  const options = { ...ADVISOR_OPTION_DEFAULTS, ...(settings.options || {}) };
  function setText(k, v) { set({ texts: { ...(settings.texts || {}), [k]: v } }); }
  function setOption(k, v) { set({ options: { ...options, [k]: v } }); }

  // Steps on the left, each with a short live status. The preview follows the open step.
  const chartCount = measure ? measureRows.length : (settings.charts.women || []).length + (settings.charts.men || []).length;
  const featuresOn = Object.keys(ADVISOR_OPTION_DEFAULTS).filter((k) => options[k]).length;
  const wordsChanged = Object.keys(ADVISOR_TEXT_DEFAULTS).filter((k) => settings.texts && typeof settings.texts[k] === 'string'
    && settings.texts[k].trim() && settings.texts[k].trim() !== ADVISOR_TEXT_DEFAULTS[k]).length;
  const STYLE_NAME = { filled: 'Filled', outline: 'Outline', soft: 'Soft' };
  // badge: a short count on the tab; hint: the full status, read out and shown on hover.
  const steps = [
    { id: 'chart', title: 'Size chart', badge: String(chartCount), hint: chartCount ? `${chartCount} sizes` : 'No sizes yet' },
    { id: 'button', title: 'Button', badge: '', hint: `${STYLE_NAME[settings.buttonStyle] || 'Outline'} · ${radiusLabel(settings.buttonRadius)}` },
    { id: 'features', title: 'Shopper features', badge: `${featuresOn}/4`, hint: `${featuresOn} of 4 on` },
    { id: 'words', title: 'Words', badge: wordsChanged ? 'Edited' : '', hint: wordsChanged ? `${wordsChanged} changed` : 'Default words' },
    { id: 'live', title: 'Go live', badge: settings.productTag ? 'Tag' : '', hint: settings.productTag ? `Tag: ${settings.productTag}` : 'All products with sizes' },
  ];
  const stepAt = steps.findIndex((x) => x.id === tab);
  function goStep(id) {
    setTab(id);
    setHighlight(null);
    if (id === 'chart') setPreviewView(mv(5));
    if (id === 'words') setPreviewView(mv(1));
  }
  const previewShow = tab === 'button' ? 'card' : tab === 'live' ? 'both' : 'advisor';

  // A feature the shopper sees, as a tile with its switch.
  function featureTile(k, view, title, text, icon) {
    const on = options[k];
    const name = title.replace(/[“”]/g, '');
    return (
      <div key={k} className="sf-feature" data-hl={k} data-hl-label={name}>
        <span className="sf-featureicon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{FEATURE_ICONS[icon]}</svg>
        </span>
        <span className="sf-featurecopy"><span className="sf-featurename">{title}</span><span className="sf-help">{text}</span></span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`Show ${name}`}
          onClick={() => { setOption(k, !on); setPreviewView(mv(view)); }}
          style={{ ...ui.toggle, background: on ? '#303030' : '#B5B5B5', flexShrink: 0 }}
        >
          <span style={{ ...ui.knob, transform: on ? 'translateX(14px)' : 'translateX(0)' }} />
        </button>
      </div>
    );
  }

  // Small field components share the page state; focusing one shows that step in the preview.
  function textField(label, k, view, hint) {
    return (
      <label key={k} style={ui.field} data-hl={k} data-hl-label={label}>{label}
        <input
          type="text"
          maxLength={ADVISOR_TEXT_MAX[k]}
          value={(settings.texts && settings.texts[k] != null) ? settings.texts[k] : ADVISOR_TEXT_DEFAULTS[k]}
          onChange={(e) => setText(k, e.target.value)}
          onFocus={() => setPreviewView(mv(view))}
          placeholder={ADVISOR_TEXT_DEFAULTS[k]}
          style={ui.input}
          aria-label={label}
        />
        {hint && <span style={{ ...ui.muted, margin: 0, fontWeight: 400 }}>{hint}</span>}
      </label>
    );
  }

  const resetWords = wordsChanged > 0 && (
    <button type="button" className="sf-reset" onClick={() => set({ texts: {} })}>Reset to default words</button>
  );

  return (
    <div style={ui.page}>
      <style>{LAYOUT_CSS}</style>
      <div className={`sf-layout${settings.enabled && isOn && !showPicker ? '' : ' is-off'}`} ref={layoutRef}>
      <div className="sf-main">
      <header className="sf-pagehead">
        <div style={{ minWidth: 0 }}>
          <div className="sf-titlerow">
            <h1 className="sf-h1">Find my size</h1>
            {isOn && !showPicker && (
              <span className={`sf-badge${settings.enabled ? ' is-on' : ''}`}>{settings.enabled ? 'Active' : 'Off'}</span>
            )}
          </div>
          <p className="sf-subtitle">
            {showPicker
              ? 'Help shoppers pick the right size before they buy, set up for what your store sells.'
              : measure
              ? `Shoppers measure their ${measure.value.toLowerCase()} and get the right size from your chart.`
              : storeType === 'clothing'
                ? 'Shoppers enter their height, weight and build, and get the right size from your chart.'
                : 'Help shoppers pick the right size before they buy, set up for what your store sells.'}
          </p>
        </div>
        {isOn && !showPicker && (
        <label className="sf-switchwrap">
          <span>Show on store</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            aria-label="Turn on Find my size"
            onClick={() => set({ enabled: !settings.enabled })}
            style={{ ...ui.toggle, background: settings.enabled ? '#303030' : '#B5B5B5' }}
          >
            <span style={{ ...ui.knob, transform: settings.enabled ? 'translateX(14px)' : 'translateX(0)' }} />
          </button>
        </label>
        )}
      </header>
      {!showPicker && <StoreTypeCard type={typeInfo} onChange={() => setChoosing(true)} />}
      {showPicker ? (
        <StoreTypePicker
          catalog={meta.storeTypes}
          current={storeType}
          onPick={pickType}
          onCancel={storeType !== '' ? () => setChoosing(false) : null}
        />
      ) : (<>
      {storeType === 'none' ? (
        <NotNeededCard shop={shop} query={lastQuery} />
      ) : !settings.enabled ? (
        <section style={ui.offCard} aria-label="Find my size is off">
          <span style={ui.offIcon} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 15.5 15.5 3 21 8.5 8.5 21z" /><path d="m7 12 2 2M10 9l2 2M13 6l2 2" /></svg>
          </span>
          <p style={ui.offTitle}>Find my size is off</p>
          <p style={ui.offText}>
            Turn it on to set up the button, the size helper and your size chart, with a live preview.
            Shoppers don&apos;t see anything while it&apos;s off.
          </p>
          <button type="button" style={ui.save} onClick={() => set({ enabled: true })}>Turn on Find my size</button>
        </section>
      ) : (<>
      <nav className="sf-tabs" role="tablist" aria-label="Set up steps">
        {steps.map((st) => (
          <button
            key={st.id}
            type="button"
            role="tab"
            aria-selected={tab === st.id}
            aria-controls="sf-panel"
            aria-description={st.hint}
            title={st.hint}
            className={`sf-tab${tab === st.id ? ' is-on' : ''}`}
            onClick={() => goStep(st.id)}
          >
            <span className="sf-tabname">{st.title}</span>
            {st.badge && <span className="sf-tabbadge">{st.badge}</span>}
          </button>
        ))}
      </nav>
      <div id="sf-panel" role="tabpanel" aria-label={steps[stepAt].title} className="sf-panel">
      {tab === 'live' && (
      <section style={ui.card} {...focusArea()}>
        <SectionHead icon="pin" title="Where it shows" text="Shown on every product that has a Size option. Add a tag to limit it to some products." />
        <label style={ui.field} data-hl="productTag" data-hl-label="Product tag">Only on products with this tag (optional)
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
      )}

      {tab === 'button' && (
      <section style={ui.card} aria-label="Button on the product page" {...focusArea()}>
        <SectionHead icon="card" title="Button on the product page" text="A full-width button under the size options that opens the size helper. The preview updates as you type." />
        <label style={ui.field} data-hl="buttonText" data-hl-label="Button text">Button text
          <input
            type="text"
            maxLength={40}
            value={settings.buttonText}
            onChange={(e) => set({ buttonText: e.target.value })}
            style={ui.input}
            aria-label="Button text"
          />
        </label>
        <label style={ui.field} data-hl="cardText" data-hl-label="Caption under the button">Caption under the button (optional)
          <input
            type="text"
            maxLength={80}
            value={settings.cardText ?? ''}
            onChange={(e) => set({ cardText: e.target.value })}
            placeholder="3 quick questions · takes 20 seconds"
            style={ui.input}
            aria-label="Caption under the button"
          />
        </label>
        <label style={ui.field} data-hl="accentColor" data-hl-label="Button colour">Button colour
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
        <div style={ui.field} data-hl="buttonStyle" data-hl-label="Button style">
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
        <div style={ui.field} data-hl="buttonRadius" data-hl-label="Button corners">
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
      )}

      {tab === 'features' && (
      <section style={ui.card} aria-label="Shopper features" {...focusArea()}>
        <SectionHead icon="spark" title="Shopper features" text="Choose what shoppers can use in the size helper. The preview shows each change." />
        <div className="sf-features">
          {featureTile('liveEstimate', measure ? 1 : 2, 'Likely size', measure ? 'Shows a size while shoppers move the slider.' : 'Shows a size while shoppers move the height and weight sliders.', 'eye')}
          {featureTile('rememberSize', measure ? 1 : 3, '“Remember my size”', 'Saves the size for next time, never the measurements.', 'save')}
          {featureTile('addToBag', 5, 'Add to cart button', 'Picks the size and adds it to the cart in one tap.', 'cart')}
          {featureTile('sizeChart', 5, '“View size chart” link', 'Shows your size chart under the result.', 'table')}
        </div>
      </section>
      )}

      {tab === 'words' && (measure ? (
      <section style={ui.card} aria-label="Size helper" {...focusArea()}>
        <SectionHead icon="panel" title="Words" text="Optional. The default words work well; edit any line and the preview jumps to that screen." />
        <p style={{ ...ui.group, borderTop: 0, paddingTop: 0 }}>Panel</p>
        <div className="sf-grid2">
          {textField('Panel title', 'advisorTitle', 1)}
          {textField('Privacy note', 'privacyText', 1)}
        </div>
        <p style={ui.group}>Result</p>
        <div className="sf-grid2">
          {textField('Result heading', 'resultTitle', 5)}
          {textField('Add to cart button', 'addToBagText', 5, '{size} becomes the size, e.g. 7')}
        </div>
        {resetWords}
      </section>
      ) : (
      <section style={ui.card} aria-label="Size advisor" {...focusArea()}>
        <SectionHead icon="panel" title="Words" text="Optional. The default words work well; edit any line and the preview jumps to that screen." />

        <p style={{ ...ui.group, borderTop: 0, paddingTop: 0 }}>Panel</p>
        <div className="sf-grid2">
          {textField('Panel title', 'advisorTitle', 1)}
          {textField('Privacy note', 'privacyText', 1)}
        </div>

        <p style={ui.group}>Step 1 · Avatar base</p>
        <div className="sf-grid2">
          {textField('Step 1 heading', 'step1Title', 1)}
          {textField('Step 1 small text', 'step1Text', 1)}
          {textField('Woman label', 'womenLabel', 1)}
          {textField('Man label', 'menLabel', 1)}
        </div>

        <p style={ui.group}>Step 2 · Height and weight</p>
        <div className="sf-grid2">
          {textField('Step 2 heading', 'step2Title', 2)}
          {textField('Step 2 small text', 'step2Text', 2)}
        </div>

        <p style={ui.group}>Step 3 · Build</p>
        <div className="sf-grid2">
          {textField('Step 3 heading', 'step3Title', 3)}
          {textField('Step 3 small text', 'step3Text', 3)}
        </div>

        <p style={ui.group}>Step 4 · Creating</p>
        {textField('Creating heading', 'creatingTitle', 4)}

        <p style={ui.group}>Result</p>
        <div className="sf-grid2">
          {textField('Result heading', 'resultTitle', 5)}
          {textField('Add to cart button', 'addToBagText', 5, '{size} becomes the size, e.g. M')}
        </div>
        {resetWords}
      </section>
      ))}

      {tab === 'chart' && (measure ? (
      <section style={ui.card} aria-label="Size chart" {...focusArea()}>
        <SectionHead icon="chart" title="Size chart" text={`${measure.value} for each size, in ${measure.unit}, smallest first.`} />
        <p style={ui.tip}>
          A starter Indian chart is filled in. Size names must match the sizes on your products (for example “7” or “UK 7”).
          Shoppers get the smallest size that fits their {measure.value.toLowerCase()}.
        </p>
        <table style={ui.table} aria-label="Size chart" data-hl="chart" data-hl-label="Size chart">
          <thead>
            <tr>
              <th style={ui.th}>Size</th>
              <th style={ui.th}>{measure.value} ({measure.unit})</th>
              <th style={ui.th} />
            </tr>
          </thead>
          <tbody>
            {measureRows.map((r, i) => (
              <tr key={i}>
                <td style={ui.td}>
                  <input value={r.size} maxLength={10} onChange={(e) => setMeasureRows(measureRows.map((x, idx) => (idx === i ? { ...x, size: e.target.value } : x)))} style={ui.cell} aria-label={`Row ${i + 1} size`} />
                </td>
                <td style={ui.td}>
                  <input
                    type="number"
                    step={measure.step}
                    min={measure.min}
                    max={measure.max}
                    value={r.value === '' || r.value == null ? '' : r.value}
                    onChange={(e) => setMeasureRows(measureRows.map((x, idx) => (idx === i ? { ...x, value: e.target.value === '' ? '' : Number(e.target.value) } : x)))}
                    style={{ ...ui.cell, maxWidth: 150 }}
                    aria-label={`Row ${i + 1} ${measure.value}`}
                  />
                </td>
                <td style={ui.td}>
                  <button type="button" onClick={() => setMeasureRows(measureRows.filter((_, idx) => idx !== i))} style={ui.remove} aria-label={`Remove row ${i + 1}`}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {measureRows.length < 30 && (
          <button type="button" style={ui.add} data-hl="chart" data-hl-label="Size chart" onClick={() => setMeasureRows([...measureRows, { size: '', value: '' }])}>
            + Add a size
          </button>
        )}
      </section>
      ) : (
      <section style={ui.card} aria-label="Size charts" {...focusArea()}>
        <div style={ui.row}>
          <SectionHead icon="chart" title="Size charts" text="Body measurements for each size." />
          <span style={ui.seg} role="group" aria-label="Unit" data-hl="unit" data-hl-label="Unit (cm / in)">
            {['cm', 'in'].map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} onClick={() => set({ unit: u })} style={unit === u ? ui.segOn : ui.segOff}>
                {u}
              </button>
            ))}
          </span>
        </div>
        <p style={ui.tip}>
          Starter Indian charts are filled in — change them to match your clothes. Leave a chart empty to hide{" "}
          {texts.womenLabel} or {texts.menLabel} from shoppers.
        </p>
        <div style={ui.row} role="group" aria-label="Chart" data-hl="chart" data-hl-label="Size chart">
          {[{ v: 'women', l: texts.womenLabel }, { v: 'men', l: texts.menLabel }].map((g) => (
            <button key={g.v} type="button" aria-pressed={gender === g.v} onClick={() => setGender(g.v)} style={gender === g.v ? ui.segOn : ui.segOff}>
              {g.l} ({(settings.charts[g.v] || []).length})
            </button>
          ))}
        </div>
        <table style={ui.table} aria-label={`${gender} size chart`} data-hl="chart" data-hl-label="Size chart">
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
          <button type="button" style={ui.add} data-hl="chart" data-hl-label="Size chart" onClick={() => setRows([...rows, { size: '', chest: '', waist: '', length: '' }])}>
            + Add a size
          </button>
        )}
      </section>
      ))}

      {tab === 'live' && (
      <ThemeBlockSetup
        shop={shop}
        handle="size-finder"
        blockName="Find My Size"
        place="under the size picker"
        whenLive="Shoppers see the button once Find my size is turned on and saved."
      />
      )}
      <div className="sf-stepnav">
        {stepAt > 0
          ? <button type="button" className="sf-back" onClick={() => goStep(steps[stepAt - 1].id)}>← {steps[stepAt - 1].title}</button>
          : <span />}
        {stepAt < steps.length - 1 && (
          <button type="button" className="sf-next" onClick={() => goStep(steps[stepAt + 1].id)}>Next: {steps[stepAt + 1].title} →</button>
        )}
      </div>
      </div>
      </>)}
      </>)}

      {storeType !== '' && !choosing && (
      <div className="sf-savebar" style={ui.row}>
        <button type="button" onClick={save} disabled={saving} style={ui.save}>{saving ? 'Saving…' : 'Save'}</button>
        {message && <span style={ui.ok}>✓ {message}</span>}
        {error && <span style={ui.error} role="alert">{error}</span>}
      </div>
      )}
      </div>
      {settings.enabled && isOn && !showPicker && (
      <aside className="sf-side" style={fit.height ? { height: Math.ceil(fit.height * fit.scale) } : undefined}>
        <div
          ref={fitRef}
          className="sf-fit"
          style={{ transform: `scale(${fit.scale})`, width: `${100 / fit.scale}%` }}
        >
          <SizeFinderPreview
            shop={shop}
            settings={settings}
            gender={gender}
            view={previewView}
            onViewChange={setPreviewView}
            show={previewShow}
            highlight={highlight}
            storeType={storeType}
            measure={measure}
            measureChart={measureRows}
          />
        </div>
      </aside>
      )}
      </div>
    </div>
  );
}

// Fields whose preview part lives on one step: editing them opens that step.
const HL_VIEW = { chart: 5, unit: 2 };

const FEATURE_ICONS = {
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  save: <><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>,
};

function SectionHead({ title, text }) {
  return (
    <div className="sf-cardhead">
      <h2 className="sf-cardtitle">{title}</h2>
      {text && <p className="sf-help">{text}</p>}
    </div>
  );
}

// Settings on the left, live preview pinned on the right; stacked on narrow screens.
const LAYOUT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap');
.sf-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:20px;align-items:start}
.sf-layout{min-height:100vh}
.sf-layout.is-off{grid-template-columns:minmax(0,860px);justify-content:center;min-height:0}
.sf-main{display:flex;flex-direction:column;gap:16px;min-width:0;padding-bottom:40px}
.sf-side{position:sticky;top:16px;min-width:0;overflow:visible}
.sf-fit{transform-origin:top left}
.sf-main input[type=text],.sf-main input[type=number],.sf-main input[type=search]{transition:border-color .12s,box-shadow .12s}
.sf-main input[type=text]:hover,.sf-main input[type=number]:hover{border-color:#616161}
.sf-main input[type=text]:focus,.sf-main input[type=number]:focus{outline:none;border-color:#303030;box-shadow:0 0 0 1px #303030}
.sf-main tbody tr:hover td{background:#F7F7F7}
.sf-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}
@media (max-width:640px){.sf-grid2{grid-template-columns:minmax(0,1fr)}}
.sf-pagehead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:4px 2px 0}
.sf-titlerow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sf-h1{font-size:20px;line-height:28px;font-weight:650;margin:0;color:#303030;letter-spacing:-.01em}
.sf-subtitle{font-size:13px;line-height:20px;font-weight:450;color:#616161;margin:2px 0 0}
.sf-badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:8px;background:#E3E3E3;color:#303030;font-size:12px;font-weight:550}
.sf-badge.is-on{background:#CDFEE1;color:#0C5132}
.sf-switchwrap{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:450;color:#303030;flex-shrink:0;margin-top:4px;cursor:pointer}
.sf-tabs{display:flex;gap:4px;flex-wrap:wrap;padding:2px 0}
.sf-tab{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:#616161;font-size:13px;font-weight:550;cursor:pointer;font-family:inherit;transition:background .12s,color .12s}
.sf-tab:hover{background:#EBEBEB;color:#303030}
.sf-tab.is-on{background:#fff;color:#303030;box-shadow:0 1px 0 rgba(26,26,26,.07),0 0 0 1px #E3E3E3}
.sf-tab:focus-visible{outline:2px solid #005BD3;outline-offset:1px}
.sf-tabbadge{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:6px;background:#E3E3E3;color:#4A4A4A;font-size:11px;font-weight:550}
.sf-tab.is-on .sf-tabbadge{background:#F1F1F1}
.sf-panel{display:flex;flex-direction:column;gap:16px}
.sf-cardhead{margin:0 0 16px}
.sf-cardtitle{font-size:14px;line-height:20px;font-weight:650;margin:0;color:#303030}
.sf-help{display:block;font-size:13px;line-height:20px;font-weight:450;color:#616161;margin:2px 0 0}
.sf-features{border:1px solid #EBEBEB;border-radius:10px;overflow:hidden}
.sf-feature{display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid #EBEBEB;background:#fff}
.sf-feature:first-child{border-top:0}
.sf-featureicon{width:28px;height:28px;border-radius:8px;background:#F1F1F1;color:#4A4A4A;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sf-featurecopy{display:flex;flex-direction:column;flex:1;min-width:0}
.sf-featurename{font-size:13px;line-height:20px;font-weight:550;color:#303030}
.sf-featurecopy .sf-help{margin:0}
.sf-stepnav{display:flex;justify-content:space-between;align-items:center;gap:10px}
.sf-back,.sf-next,.sf-reset{height:32px;border-radius:8px;padding:0 12px;font-size:13px;font-weight:550;cursor:pointer;font-family:inherit}
.sf-back{background:transparent;border:0;color:#616161}
.sf-back:hover{color:#303030;background:#EBEBEB}
.sf-next,.sf-reset{background:#fff;border:0;color:#303030;box-shadow:0 1px 0 #E3E3E3,inset 0 -1px 0 #B5B5B5,0 0 0 1px #E3E3E3}
.sf-next:hover,.sf-reset:hover{background:#F7F7F7}
.sf-reset{margin-top:4px}
.sf-savebar{position:sticky;bottom:0;z-index:2;background:rgba(241,241,241,.94);backdrop-filter:blur(6px);padding:12px 0;margin:0!important;border-top:1px solid #E3E3E3}
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

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
const CARD_SHADOW = '0 1px 0 0 rgba(26,26,26,.07), inset 0 -1px 0 0 rgba(0,0,0,.08), inset 1px 0 0 0 rgba(0,0,0,.04), inset -1px 0 0 0 rgba(0,0,0,.04), inset 0 1px 0 0 rgba(255,255,255,.9)';
const ui = {
  page: { fontFamily: FONT, WebkitFontSmoothing: 'antialiased', color: '#303030', fontSize: 13, fontWeight: 450, maxWidth: 1280, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: '#fff', borderRadius: 12, padding: 16, boxShadow: CARD_SHADOW },
  muted: { fontSize: 13, color: '#616161', margin: '4px 0 12px', fontWeight: 450 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: '20px', color: '#303030', fontWeight: 450, marginBottom: 14 },
  input: { height: 32, padding: '0 12px', border: '1px solid #8A8A8A', borderRadius: 8, fontSize: 13, fontWeight: 450, width: '100%', maxWidth: 420, background: '#FDFDFD', color: '#303030', fontFamily: 'inherit' },
  color: { width: 32, height: 32, border: '1px solid #8A8A8A', borderRadius: 8, padding: 2, background: '#fff' },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  seg: { display: 'inline-flex', gap: 0, marginLeft: 'auto', background: '#F1F1F1', borderRadius: 8, padding: 2 },
  segOn: { background: '#fff', color: '#303030', border: 0, borderRadius: 6, padding: '0 12px', height: 28, fontSize: 13, fontWeight: 550, cursor: 'pointer', boxShadow: '0 1px 0 rgba(26,26,26,.07), 0 0 0 1px #E3E3E3', fontFamily: 'inherit' },
  segOff: { background: 'transparent', color: '#616161', border: 0, borderRadius: 6, padding: '0 12px', height: 28, fontSize: 13, fontWeight: 550, cursor: 'pointer', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 8 },
  th: { textAlign: 'left', padding: '8px 6px', fontSize: 12, color: '#616161', fontWeight: 550, borderBottom: '1px solid #E3E3E3', background: '#F7F7F7' },
  td: { padding: '6px', borderBottom: '1px solid #F1F1F1' },
  cell: { width: '100%', maxWidth: 110, height: 32, padding: '0 10px', border: '1px solid #8A8A8A', borderRadius: 8, fontSize: 13, background: '#FDFDFD', fontFamily: 'inherit' },
  remove: { background: 'none', border: 'none', color: '#8A8A8A', cursor: 'pointer', fontSize: 13, width: 28, height: 28, borderRadius: 6 },
  add: { background: '#fff', border: 0, borderRadius: 8, color: '#303030', cursor: 'pointer', fontSize: 13, fontWeight: 550, height: 32, padding: '0 12px', marginTop: 6, boxShadow: '0 1px 0 #E3E3E3, inset 0 -1px 0 #B5B5B5, 0 0 0 1px #E3E3E3', fontFamily: 'inherit' },
  save: { background: 'linear-gradient(180deg,#3B3B3B,#303030)', color: '#fff', border: 'none', borderRadius: 8, height: 32, padding: '0 16px', fontWeight: 550, fontSize: 13, cursor: 'pointer', boxShadow: '0 -1px 0 1px rgba(0,0,0,.8) inset, 0 0 0 1px #303030 inset, 0 .5px 0 1.5px rgba(255,255,255,.25) inset', fontFamily: 'inherit' },
  ok: { fontSize: 13, color: '#0C5132', fontWeight: 450 },
  error: { fontSize: 13, color: '#8E1F0B', fontWeight: 450 },
  group: { fontSize: 13, lineHeight: '20px', fontWeight: 650, color: '#303030', margin: '6px 0 8px', paddingTop: 12, borderTop: '1px solid #EBEBEB' },
  offCard: { background: '#fff', borderRadius: 12, padding: '32px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, boxShadow: CARD_SHADOW },
  offIcon: { width: 44, height: 44, borderRadius: 12, background: '#F1F1F1', color: '#4A4A4A', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  offTitle: { fontSize: 14, fontWeight: 650, margin: 0, color: '#303030' },
  offText: { fontSize: 13, color: '#616161', margin: '0 0 8px', maxWidth: 440, lineHeight: '20px' },
  tip: { fontSize: 13, lineHeight: '20px', color: '#616161', background: '#F7F7F7', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' },
  toggle: { position: 'relative', display: 'inline-flex', alignItems: 'center', width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 },
  knob: { position: 'absolute', left: 2, width: 14, height: 14, background: '#fff', borderRadius: '50%', transition: 'transform 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' },
};

