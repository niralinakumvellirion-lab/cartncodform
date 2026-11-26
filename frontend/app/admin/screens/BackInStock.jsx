'use client';

import { useEffect, useRef, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';
import ThemeBlockSetup from '../components/ThemeBlockSetup';
import BackInStockPreview, { RESTOCK_TEXT_DEFAULTS, RESTOCK_TEXT_MAX } from './BackInStockPreview';
import { fitScale } from './SizeFinder';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** Corner value 0–24 (24 = round); the default is 8. */
export function cornerValue(v) {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? 8 : Math.min(24, Math.max(0, Math.round(n)));
}
export function formatMoney(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
export function waitingSince(date, now = Date.now()) {
  const days = Math.floor((now - new Date(date).getTime()) / (24 * 3600 * 1000));
  if (!(days >= 1)) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * "Back in stock": on/off, the "Notify me" box (words, colour, corners, push/email), the message
 * texts, a live preview, the waiting list and last-30-day results.
 */
export default function BackInStockScreen({ shop }) {
  const [settings, setSettings] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [previewShow, setPreviewShow] = useState('both');
  const [highlight, setHighlight] = useState(null);
  const [boxView, setBoxView] = useState('form');
  const fitRef = useRef(null);
  const layoutRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  const loaded = settings !== null;
  const enabled = !!(settings && settings.enabled);

  useEffect(() => {
    const el = fitRef.current;
    if (!el || typeof window === 'undefined') return undefined;
    const update = () => {
      const height = el.offsetHeight;
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
  }, [loaded, enabled]);

  useEffect(() => {
    if (!shop) return;
    apiGet(`/api/restock/${shop}/config`)
      .then((d) => setSettings(d.settings))
      .catch((e) => setLoadError(e.message || 'Could not load the back in stock settings'));
    apiGet(`/api/restock/${shop}/overview`)
      .then((d) => setOverview(d))
      .catch(() => setOverview({ failed: true }));
  }, [shop]);

  if (loadError) return <p style={ui.error} role="alert">{loadError}</p>;
  if (!settings) return <p style={ui.muted}>Loading…</p>;

  const texts = settings.texts || {};
  const channels = settings.channels || { push: true, email: true };

  function set(patch) {
    setSettings((s) => ({ ...s, ...patch }));
    setMessage('');
  }
  function setText(k, v) { set({ texts: { ...texts, [k]: v } }); }
  function setChannel(k, v) {
    const next = { ...channels, [k]: v };
    if (!next.push && !next.email) return; // keep at least one
    set({ channels: next });
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const d = await apiSend(`/api/restock/${shop}/config`, 'PUT', { settings });
      setSettings(d.settings);
      setMessage('Saved');
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  // Focus/click in a section → preview shows that part and outlines the field's element (data-hl).
  function focusArea(area) {
    const pick = (e) => {
      setPreviewShow(area);
      const el = e.target && e.target.closest ? e.target.closest('[data-hl]') : null;
      if (!el) { setHighlight(null); return; }
      const key = el.getAttribute('data-hl');
      setHighlight({ key, label: el.getAttribute('data-hl-label') || '' });
      if (key === 'successText') setBoxView('done');
      else if (area === 'box') setBoxView('form');
    };
    return { onFocusCapture: pick, onMouseDownCapture: pick };
  }

  function textField(label, k, opts = {}) {
    const Tag = opts.multiline ? 'textarea' : 'input';
    return (
      <label key={k} style={ui.field} data-hl={k} data-hl-label={label}>{label}
        <Tag
          type={opts.multiline ? undefined : 'text'}
          maxLength={RESTOCK_TEXT_MAX[k]}
          value={texts[k] ?? RESTOCK_TEXT_DEFAULTS[k]}
          onChange={(e) => setText(k, e.target.value)}
          placeholder={RESTOCK_TEXT_DEFAULTS[k]}
          style={opts.multiline ? { ...ui.input, height: 76, padding: '8px 10px', resize: 'vertical', maxWidth: 'none' } : ui.input}
          aria-label={label}
        />
        {opts.hint && <span style={ui.hint}>{opts.hint}</span>}
      </label>
    );
  }
  function channelSwitch(k, title, text) {
    const on = channels[k];
    return (
      <div key={k} style={ui.toggleRow} data-hl={k === 'push' ? 'channelPush' : 'channelEmail'} data-hl-label={title}>
        <span>
          <span style={ui.sectionTitle}>{title}</span>
          <span style={{ ...ui.sectionText, fontSize: 12.5 }}>{text}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`Notify by ${k}`}
          onClick={() => setChannel(k, !on)}
          style={{ ...ui.toggle, background: on ? '#303030' : '#C9C9C9', flexShrink: 0 }}
        >
          <span style={{ ...ui.knob, transform: on ? 'translateX(20px)' : 'translateX(0)' }} />
        </button>
      </div>
    );
  }

  const ov = overview && !overview.failed ? overview : null;
  const corner = cornerValue(settings.buttonRadius);

  return (
    <div style={ui.page}>
      <style>{LAYOUT_CSS}</style>
      <div className={`bis-layout${enabled ? '' : ' is-off'}`} ref={layoutRef}>
        <div className="bis-main">
          <div style={ui.head}>
            <div>
              <h1 style={ui.h1}>Back in stock</h1>
              <p style={{ ...ui.muted, margin: '0 0 10px' }}>When a size is sold out, shoppers tap “Notify me”. We send them a push or email the moment it’s back.</p>
              <span style={{ ...ui.pill, ...(enabled ? ui.pillOn : ui.pillOff) }}>
                <span style={{ ...ui.dot, background: enabled ? '#047857' : '#B45309' }} />
                {enabled ? 'Showing on sold-out sizes' : 'Hidden — turn on and save to show it'}
              </span>
            </div>
            <span style={ui.switchWrap}>
              <span aria-hidden="true" style={{ ...ui.switchText, color: enabled ? '#065F46' : '#B45309' }}>{enabled ? 'On' : 'Off'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Turn on Back in stock"
                onClick={() => set({ enabled: !enabled })}
                style={{ ...ui.toggle, background: enabled ? '#4F46E5' : '#9CA3AF' }}
              >
                <span style={{ ...ui.knob, transform: enabled ? 'translateX(20px)' : 'translateX(0)' }} />
              </button>
            </span>
          </div>

          <section style={ui.card} aria-label="Results">
            <SectionHead icon="chart" title="Results" text="Last 30 days." />
            <div className="bis-stats">
              <Stat label="Waiting now" value={ov ? ov.waitingTotal : '—'} />
              <Stat label="Alerts sent" value={ov ? ov.last30.sent : '—'} />
              <Stat label="Clicked" value={ov ? ov.last30.clicked : '—'} />
              <Stat label="Sales" value={ov ? formatMoney(ov.last30.revenue) : '—'} sub={ov ? `${ov.last30.orders} order${ov.last30.orders === 1 ? '' : 's'}` : ''} />
            </div>
            <p style={{ ...ui.group, marginTop: 16 }}>Waiting list · restock these first</p>
            {overview && overview.failed && <p style={ui.error}>Could not load the waiting list.</p>}
            {ov && ov.waiting.length === 0 && (
              <p style={ui.tip}>No one is waiting yet. When shoppers tap “Notify me” on a sold-out size, it shows up here.</p>
            )}
            {ov && ov.waiting.length > 0 && (
              <table style={ui.table} aria-label="Waiting list">
                <thead>
                  <tr>
                    <th style={ui.th}>Product</th>
                    <th style={ui.th}>Size</th>
                    <th style={{ ...ui.th, textAlign: 'right' }}>Waiting</th>
                    <th style={ui.th}>By</th>
                    <th style={ui.th}>Since</th>
                  </tr>
                </thead>
                <tbody>
                  {ov.waiting.map((w) => (
                    <tr key={w.variantId}>
                      <td style={ui.td}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {w.imageUrl
                            ? <img src={w.imageUrl} alt="" width={28} height={28} style={{ borderRadius: 6, objectFit: 'cover' }} />
                            : <span style={ui.thumb} />}
                          {w.productTitle || 'Product'}
                        </span>
                      </td>
                      <td style={ui.td}>{w.variantTitle || '—'}</td>
                      <td style={{ ...ui.td, textAlign: 'right', fontWeight: 600 }}>{w.count}</td>
                      <td style={{ ...ui.td, color: '#616161' }}>{[w.push ? `${w.push} push` : '', w.email ? `${w.email} email` : ''].filter(Boolean).join(' · ')}</td>
                      <td style={{ ...ui.td, color: '#616161' }}>{waitingSince(w.since)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {!enabled ? (
            <section style={ui.offCard} aria-label="Back in stock is off">
              <span style={ui.offIcon} aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              </span>
              <p style={ui.offTitle}>Back in stock is off</p>
              <p style={ui.offText}>Turn it on to show a “Notify me” box on sold-out sizes and set the messages, with a live preview.</p>
              <button type="button" style={ui.save} onClick={() => set({ enabled: true })}>Turn on Back in stock</button>
            </section>
          ) : (<>
            <section style={ui.card} aria-label="Notify me box" {...focusArea('box')}>
              <SectionHead icon="bell" title="“Notify me” box" text="Shows under Add to cart when the chosen size is sold out." />
              <p style={ui.group}>How shoppers get the alert</p>
              <div style={ui.toggles}>
                {channelSwitch('push', 'Push notification', 'One tap, no typing. Needs the “ShopiReachBoost AI Push” app embed on.')}
                {channelSwitch('email', 'Email', 'Shoppers type their email.')}
              </div>
              <p style={{ ...ui.group, marginTop: 16 }}>Words</p>
              <div className="bis-grid2">
                {textField('Heading', 'boxTitle')}
                {textField('Small text', 'boxText')}
                {textField('Button text', 'buttonText')}
                {textField('Email box hint', 'emailPlaceholder')}
              </div>
              {textField('After sign-up', 'successText', { hint: '{size} becomes the size, e.g. M' })}

              <p style={ui.group}>Look</p>
              <label style={ui.field} data-hl="accentColor" data-hl-label="Colour">Colour
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={HEX_RE.test(settings.accentColor) ? settings.accentColor : '#111827'}
                    onChange={(e) => set({ accentColor: e.target.value })}
                    style={ui.color}
                    aria-label="Colour picker"
                  />
                  <input
                    type="text"
                    maxLength={7}
                    value={settings.accentColor}
                    onChange={(e) => set({ accentColor: e.target.value })}
                    style={{ ...ui.input, width: 100 }}
                    aria-label="Colour hex"
                  />
                </span>
              </label>
              <div style={ui.field} data-hl="buttonRadius" data-hl-label="Button corners">
                <span>Button corners</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 420 }}>
                  <input
                    type="range" min={0} max={24} step={1} value={corner}
                    onChange={(e) => set({ buttonRadius: Number(e.target.value) })}
                    style={{ flex: 1, minWidth: 0, accentColor: '#303030' }}
                    aria-label="Button corner radius"
                  />
                  <input
                    type="number" min={0} max={24} step={1} value={corner}
                    onChange={(e) => { if (e.target.value !== '') set({ buttonRadius: cornerValue(e.target.value) }); }}
                    style={{ ...ui.input, width: 68, textAlign: 'center' }}
                    aria-label="Button corner radius in px"
                  />
                  <span style={ui.hint}>px</span>
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Corner presets">
                  {[[0, 'Square'], [4, '4'], [8, '8'], [12, '12'], [24, 'Round']].map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={corner === v}
                      onClick={() => set({ buttonRadius: v })}
                      style={{ ...(corner === v ? ui.segOn : ui.segOff), padding: '4px 10px', fontSize: 12, borderRadius: v === 24 ? 999 : Math.max(v, 4) }}
                    >
                      {l}
                    </button>
                  ))}
                </span>
              </div>
            </section>

            <section style={ui.card} aria-label="Messages" {...focusArea('messages')}>
              <SectionHead icon="send" title="Message when it’s back" text="Sent once, as soon as the size can be bought again. {product} and {size} are filled in." />
              {channels.push && (<>
                <p style={ui.group}>Push notification</p>
                {textField('Push title', 'pushTitle')}
                {textField('Push text', 'pushBody', { multiline: true })}
              </>)}
              {channels.email && (<>
                <p style={ui.group}>Email</p>
                {textField('Email subject', 'emailSubject')}
                {textField('Email text', 'emailBody', { multiline: true })}
              </>)}
              <p style={ui.tip}>
                Alerts go out in small groups (25 every 5 minutes) so a small restock doesn’t sell out to the first few. Quiet hours and your plan’s monthly message limit apply.
              </p>
            </section>

            <ThemeBlockSetup
              shop={shop}
              handle="back-in-stock"
              blockName="Back in stock"
              place="under the Add to cart button"
              whenLive="Shoppers see the box on sold-out sizes once Back in stock is turned on and saved."
            />
          </>)}

          <div className="bis-savebar" style={ui.row}>
            <button type="button" onClick={save} disabled={saving} style={ui.save}>{saving ? 'Saving…' : 'Save'}</button>
            {message && <span style={ui.ok}>✓ {message}</span>}
            {error && <span style={ui.error} role="alert">{error}</span>}
          </div>
        </div>
        {enabled && (
          <aside className="bis-side" style={fit.height ? { height: Math.ceil(fit.height * fit.scale) } : undefined}>
            <div ref={fitRef} className="bis-fit" style={{ transform: `scale(${fit.scale})`, width: `${100 / fit.scale}%` }}>
              <BackInStockPreview
                settings={settings}
                show={previewShow}
                onShowBoth={() => setPreviewShow('both')}
                highlight={highlight}
                boxView={boxView}
                onBoxViewChange={setBoxView}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={ui.stat}>
      <span style={ui.statLabel}>{label}</span>
      <span style={ui.statValue}>{value}</span>
      {sub ? <span style={ui.hint}>{sub}</span> : null}
    </div>
  );
}

const ICONS = {
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
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

const LAYOUT_CSS = `
.bis-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.9fr);gap:20px;align-items:start;min-height:100vh}
.bis-layout.is-off{grid-template-columns:minmax(0,760px);justify-content:center;min-height:0}
.bis-main{display:flex;flex-direction:column;gap:16px;min-width:0;padding-bottom:40px}
.bis-side{position:sticky;top:16px;min-width:0;overflow:visible}
.bis-fit{transform-origin:top left}
.bis-main input[type=text],.bis-main input[type=number],.bis-main textarea{transition:border-color .15s,box-shadow .15s;font-family:inherit}
.bis-main input[type=text]:focus,.bis-main input[type=number]:focus,.bis-main textarea:focus{outline:none;border-color:#303030;box-shadow:0 0 0 3px rgba(48,48,48,.12)}
.bis-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
.bis-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
@media (max-width:640px){.bis-grid2{grid-template-columns:minmax(0,1fr)}.bis-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
.bis-main tbody tr:hover td{background:#FAFAFA}
.bis-savebar{position:sticky;bottom:0;z-index:2;background:rgba(246,246,247,.92);backdrop-filter:blur(6px);padding:12px 0;margin:0!important;border-top:1px solid #E3E3E3}
@media (max-width:1100px){.bis-layout{grid-template-columns:minmax(0,1fr)}.bis-side{position:static;height:auto!important}.bis-fit{transform:none!important;width:100%!important}}
`;

const ui = {
  page: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif", WebkitFontSmoothing: 'antialiased', color: '#303030', maxWidth: 1280, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  h1: { fontSize: 20, fontWeight: 550, margin: '0 0 4px', color: '#303030' },
  card: { background: '#fff', border: '1px solid #E3E3E3', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,.04)' },
  muted: { fontSize: 13, color: '#616161', margin: '4px 0 12px' },
  hint: { fontSize: 12, color: '#616161', fontWeight: 400 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#303030', fontWeight: 500, marginBottom: 16 },
  input: { height: 36, padding: '0 10px', border: '1px solid #D4D4D4', borderRadius: 8, fontSize: 14, width: '100%', maxWidth: 420, background: '#fff', color: '#303030' },
  color: { width: 36, height: 36, border: '1px solid #D1D5DB', borderRadius: 6, padding: 2 },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  segOn: { background: '#303030', color: '#fff', border: '1px solid #303030', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  segOff: { background: '#fff', color: '#303030', border: '1px solid #D4D4D4', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 6px', fontSize: 11, color: '#616161', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: '1px solid #E3E3E3' },
  td: { padding: '8px 6px', fontSize: 13, borderBottom: '1px solid #F1F1F1' },
  thumb: { width: 28, height: 28, borderRadius: 6, background: '#EEE', display: 'inline-block' },
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
  stat: { display: 'flex', flexDirection: 'column', gap: 2, background: '#F7F7F7', borderRadius: 10, padding: '10px 12px' },
  statLabel: { fontSize: 12, color: '#616161' },
  statValue: { fontSize: 20, fontWeight: 600, color: '#303030' },
  offCard: { background: '#fff', border: '1px dashed #C9C9C9', borderRadius: 12, padding: '36px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  offIcon: { width: 56, height: 56, borderRadius: '50%', background: '#F1F1F1', color: '#303030', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  offTitle: { fontSize: 16, fontWeight: 600, margin: 0, color: '#303030' },
  offText: { fontSize: 13.5, color: '#616161', margin: '0 0 6px', maxWidth: 440, lineHeight: 1.5 },
  tip: { fontSize: 12.5, color: '#616161', background: '#F7F7F7', borderRadius: 8, padding: '8px 12px', margin: '0 0 4px' },
  switchWrap: { display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  switchText: { fontSize: 13, fontWeight: 600 },
  toggle: { position: 'relative', display: 'inline-flex', alignItems: 'center', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer' },
  knob: { position: 'absolute', left: 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'transform 0.2s' },
};
