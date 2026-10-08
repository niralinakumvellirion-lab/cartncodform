'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiGet, apiSend } from '../../../lib/api';
import { GOOGLE_FONTS_HREF, SEGMENTS, EMPTY_DRAFT, draftFromTemplate } from './emailStudio/lib';
import TemplatePicker from './emailStudio/TemplatePicker';
import PhotoCard from './emailStudio/PhotoCard';
import LayoutCard from './emailStudio/LayoutCard';
import ColourCard from './emailStudio/ColourCard';
import FontCard from './emailStudio/FontCard';
import WordsCard from './emailStudio/WordsCard';
import PreviewStage, { DESKTOP_W, MOBILE_W } from './emailStudio/PreviewStage';
import _eng from '../lib/emailEngine';

const { PRESETS: ENGINE_PRESETS, DEFAULT_LAYOUT_BY_TYPE, renderEmail, designFromTemplate } = _eng || {};

// ── Constants ──────────────────────────────────────────────────────────────────
const STARTER_TYPES = ['special_offer', 'festival', 'normal'];
const DEFAULT_RATIO = 0.42;
const LS_RATIO_KEY = 'ccf:emailWorkspace:editorRatio';
const DEFAULT_WIDTH_RATIO = 0.42;
const LS_WIDTH_RATIO_KEY = 'ccf:emailWorkspace:editorWidthRatio';

function clampRatio(r) { return Math.max(0.30, Math.min(0.60, r)); }
function readRatio() {
  try { const v = parseFloat(localStorage.getItem(LS_RATIO_KEY)); return isNaN(v) ? DEFAULT_RATIO : clampRatio(v); }
  catch { return DEFAULT_RATIO; }
}
function writeRatio(r) { try { localStorage.setItem(LS_RATIO_KEY, r); } catch {} }

function clampWidthRatio(r) { return Math.max(0.34, Math.min(0.55, r)); }
function readWidthRatio() {
  try { const v = parseFloat(localStorage.getItem(LS_WIDTH_RATIO_KEY)); return isNaN(v) ? DEFAULT_WIDTH_RATIO : clampWidthRatio(v); }
  catch { return DEFAULT_WIDTH_RATIO; }
}
function writeWidthRatio(r) { try { localStorage.setItem(LS_WIDTH_RATIO_KEY, r); } catch {} }

const FIELD_TAB = {
  imageUrl: 'photo',
  layout: 'layout',
  color: 'colours', pageBg: 'colours', cardBg: 'colours', showLogo: 'colours',
  hFont: 'fonts', bFont: 'fonts', radius: 'fonts',
  subject: 'words', eyebrow: 'words', headline: 'words', offerText: 'words',
  body: 'words', ctaLabel: 'words', ctaUrl: 'words', note: 'words',
  name: 'words', type: 'words',
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const DS = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  btnPrimary: {
    background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 9,
    padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 9,
    padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  btnDanger: {
    background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 9,
    padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
};

// ── Tab icon SVGs ─────────────────────────────────────────────────────────────
const ICON = {
  photo: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  layout: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  colours: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10c0 2.21-1.343 4-3 4s-3-1.79-3-4a1 1 0 0 0-2 0c0 2.21-1.343 4-3 4s-3-1.79-3-4"/>
    </svg>
  ),
  fonts: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
    </svg>
  ),
  words: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/>
      <line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>
    </svg>
  ),
  send: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  lock: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
};

const TABS = [
  { id: 'photo',   label: 'Photo' },
  { id: 'layout',  label: 'Layout' },
  { id: 'colours', label: 'Colours' },
  { id: 'fonts',   label: 'Fonts' },
  { id: 'words',   label: 'Words' },
  { id: 'send',    label: 'Send' },
];

// ── Splitter (horizontal = row resize, vertical = column resize) ──────────────
function Splitter({ orientation = 'horizontal', wsRef, wsDim, ratio, onRatioChange, clampFn, minVal, maxVal, defaultRatio }) {
  function onPointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = wsRef.current && wsRef.current.getBoundingClientRect();
    if (!r) return;
    if (orientation === 'vertical') {
      onRatioChange(clampFn((e.clientX - r.left) / r.width));
    } else {
      onRatioChange(clampFn((r.bottom - e.clientY - 5) / wsDim));
    }
  }
  function onKeyDown(e) {
    const step = 16 / Math.max(1, wsDim);
    if (orientation === 'vertical') {
      if (e.key === 'ArrowRight') { e.preventDefault(); onRatioChange(clampFn(ratio + step)); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onRatioChange(clampFn(ratio - step)); }
      if (e.key === 'Home')       { e.preventDefault(); onRatioChange(minVal); }
      if (e.key === 'End')        { e.preventDefault(); onRatioChange(maxVal); }
    } else {
      if (e.key === 'ArrowUp')   { e.preventDefault(); onRatioChange(clampFn(ratio + step)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onRatioChange(clampFn(ratio - step)); }
      if (e.key === 'Home')      { e.preventDefault(); onRatioChange(maxVal); }
      if (e.key === 'End')       { e.preventDefault(); onRatioChange(minVal); }
    }
  }
  const isV = orientation === 'vertical';
  return (
    <div
      role="separator" aria-orientation={orientation}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={Math.round(minVal * 100)}
      aria-valuemax={Math.round(maxVal * 100)}
      aria-label={isV ? 'Resize editor and preview' : 'Resize preview and editor'}
      tabIndex={0}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => {}}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onRatioChange(defaultRatio)}
      style={isV ? {
        width: 10, cursor: 'col-resize', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f1f5f9', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0',
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', outline: 'none',
        alignSelf: 'stretch',
      } : {
        height: 10, cursor: 'row-resize', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f1f5f9', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', outline: 'none',
      }}
    >
      {isV ? (
        <svg width="4" height="28" viewBox="0 0 4 28" fill="none" aria-hidden="true">
          {[2, 6, 10, 14, 18, 22, 26].map(y => <circle key={y} cx={2} cy={y} r={1.5} fill="#9ca3af" />)}
        </svg>
      ) : (
        <svg width="28" height="4" viewBox="0 0 28 4" fill="none" aria-hidden="true">
          {[2, 6, 10, 14, 18, 22, 26].map(x => <circle key={x} cx={x} cy={2} r={1.5} fill="#9ca3af" />)}
        </svg>
      )}
    </div>
  );
}

// ── Tab strip ─────────────────────────────────────────────────────────────────
function TabStrip({ activeTab, onTabChange, hasPhoto, dirty, saveError, presets, onPreset, looksMenuOpen, setLooksMenuOpen, bandWide }) {
  const tabRefs = useRef([]);
  function handleTabKey(e, idx) {
    const len = TABS.length;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % len;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + len) % len;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = len - 1;
    if (next < 0) return;
    e.preventDefault();
    onTabChange(TABS[next].id);
    tabRefs.current[next] && tabRefs.current[next].focus();
  }
  const wordsErr = saveError && typeof saveError === 'object' && FIELD_TAB[saveError.field] === 'words';
  return (
    <div
      role="tablist"
      aria-label="Email editor sections"
      style={{
        display: 'flex', alignItems: 'stretch', flexShrink: 0,
        borderBottom: '1px solid #e5e7eb', background: '#fff',
        overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}
    >
      {TABS.map((tab, idx) => {
        const isActive = activeTab === tab.id;
        const photoBadge = tab.id === 'photo' && !hasPhoto;
        const wordsBadge = tab.id === 'words' && !!wordsErr;
        const sendLocked = tab.id === 'send' && dirty;
        return (
          <button
            key={tab.id}
            ref={el => { tabRefs.current[idx] = el; }}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={e => handleTabKey(e, idx)}
            style={{
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 10, fontWeight: isActive ? 700 : 600,
              color: isActive ? '#4f46e5' : '#6b7280',
              position: 'relative', flexShrink: 0, outline: 'none',
            }}
          >
            {ICON[tab.id]}
            <span style={{ whiteSpace: 'nowrap' }}>{tab.label}</span>
            {sendLocked && <span style={{ position: 'absolute', top: 4, right: 4 }}>{ICON.lock}</span>}
            {photoBadge && <span style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />}
            {wordsBadge && <span style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />}
            <span style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
              background: isActive ? '#4f46e5' : 'transparent',
              borderRadius: '1px 1px 0 0',
            }} />
          </button>
        );
      })}
      <div style={{ flex: 1, minWidth: 4 }} />
      {/* Looks presets */}
      {presets && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0, position: 'relative' }}>
          {bandWide ? (
            <>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Looks:</span>
              {Object.keys(presets).map(k => {
                const p = presets[k];
                return (
                  <button key={k} type="button" onClick={() => onPreset(k)} title={p.name} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
                    background: '#f3f4f6', color: '#374151', border: '1.5px solid #e5e7eb', outline: 'none',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                    {p.name}
                  </button>
                );
              })}
              <button type="button" onClick={() => { const ks = Object.keys(presets); onPreset(ks[Math.floor(Math.random() * ks.length)]); }}
                style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 999, cursor: 'pointer', background: '#4f46e5', color: '#fff', border: 'none', outline: 'none' }}>
                Surprise
              </button>
            </>
          ) : (
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={() => setLooksMenuOpen(o => !o)}
                aria-haspopup="listbox" aria-expanded={looksMenuOpen}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                  background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', outline: 'none',
                }}>
                Looks <span aria-hidden="true">▾</span>
              </button>
              {looksMenuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', zIndex: 300, marginTop: 4,
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: '4px 0', minWidth: 140,
                }}>
                  {Object.keys(presets).map(k => {
                    const p = presets[k];
                    return (
                      <button key={k} type="button" onClick={() => { onPreset(k); setLooksMenuOpen(false); }} style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: 'transparent', border: 'none', color: '#374151', outline: 'none',
                      }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                        {p.name}
                      </button>
                    );
                  })}
                  <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 4 }}>
                    <button type="button" onClick={() => { const ks = Object.keys(presets); onPreset(ks[Math.floor(Math.random() * ks.length)]); setLooksMenuOpen(false); }} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: '#4f46e5', border: 'none', color: '#fff', outline: 'none',
                    }}>
                      Surprise me
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Full size modal ────────────────────────────────────────────────────────────
function FullSizeModal({ draft, store, initialDevice, onClose }) {
  const [device, setDevice] = useState(initialDevice || 'desktop');
  const overlayRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    closeBtnRef.current && closeBtnRef.current.focus();
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const modal = overlayRef.current;
      if (!modal) return;
      const focusable = Array.from(modal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      role="dialog" aria-modal="true" aria-label="Full size email preview"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.65)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
        padding: 24, overflow: 'auto',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
        width: Math.min((device === 'desktop' ? DESKTOP_W : MOBILE_W) + 48, (typeof window !== 'undefined' ? window.innerWidth : 800) - 48),
        maxWidth: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            {[['desktop', 'Desktop'], ['mobile', 'Mobile']].map(([k, label]) => (
              <button key={k} onClick={() => setDevice(k)} style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: device === k ? '#4f46e5' : '#f9fafb',
                color: device === k ? '#fff' : '#374151',
              }}>{label}</button>
            ))}
          </div>
          <span style={{ flex: 1, fontSize: 12, color: '#9ca3af' }}>Full size · 100%</span>
          <button ref={closeBtnRef} onClick={onClose} aria-label="Close full size preview"
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280', lineHeight: 1, padding: '2px 6px', borderRadius: 6, outline: 'none' }}>
            ×
          </button>
        </div>
        <div style={{ padding: '16px', overflow: 'auto' }}>
          <ModalIframe draft={draft} store={store} device={device} />
        </div>
      </div>
    </div>
  );
}

function ModalIframe({ draft, store, device }) {
  const ref = useRef(null);
  const w = device === 'desktop' ? DESKTOP_W : MOBILE_W;
  useEffect(() => {
    const f = ref.current;
    if (!f || !renderEmail || !designFromTemplate) return;
    function onLoad() {
      const design = designFromTemplate(draft, store, { placeholder: !draft.imageUrl });
      const out = renderEmail(design);
      try {
        const doc = f.contentDocument;
        const s = doc && doc.getElementById('s');
        if (s) {
          s.textContent = out.css; doc.body.innerHTML = out.body;
          f.style.height = '1px';
          f.style.height = (doc.documentElement.scrollHeight || 600) + 'px';
        }
      } catch {}
    }
    f.addEventListener('load', onLoad);
    const design = designFromTemplate(draft, store, { placeholder: !draft.imageUrl });
    const out = renderEmail(design);
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${GOOGLE_FONTS_HREF}"><style id="s">${out.css}</style></head><body style="margin:0;padding:0;background:#f3f4f6;">${out.body}</body></html>`;
    return () => f.removeEventListener('load', onLoad);
  }, [draft, store, device]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <iframe ref={ref} title="Full size email preview" sandbox="allow-same-origin"
      style={{ display: 'block', width: w, maxWidth: '100%', border: 'none', minHeight: 400 }} />
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function EmailTemplatesScreen() {
  const searchParams = useSearchParams();
  const shopParam     = searchParams ? (searchParams.get('shop')     || '') : '';
  const templateParam = searchParams ? (searchParams.get('template') || '') : '';
  const focusParam    = searchParams ? (searchParams.get('focus')    || '') : '';

  const photoCardRef        = useRef(null);
  const templateAutoSelected = useRef(false);
  const wsRef               = useRef(null);
  const tabContentRef       = useRef(null);
  const bandRef             = useRef(null);
  const fullSizeBtnRef      = useRef(null);

  // Store brand data
  const [store, setStore] = useState({ shopName: '', logoUrl: null, primaryColor: null, shopDomain: '' });

  // Template list
  const [templates, setTemplates]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [seeding, setSeeding]       = useState(false);
  const [seedError, setSeedError]   = useState('');
  const [seedCount, setSeedCount]   = useState(0);
  const [justSeeded, setJustSeeded] = useState(false);
  const [seedDismissed, setSeedDismissed] = useState(false);

  // Selection
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew]           = useState(false);
  const [filter, setFilter]         = useState('all');
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  // Draft + dirty
  const [draft, setDraft]         = useState(EMPTY_DRAFT);
  const [savedDraft, setSavedDraft] = useState(null);
  const dirty = useMemo(() =>
    !!savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft),
  [draft, savedDraft]);

  const [pendingNav, setPendingNav] = useState(null);

  // Save
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveOk, setSaveOk]     = useState(false);

  // Photo upload
  const [uploading, setUploading]     = useState(false);
  const [photoError, setPhotoError]   = useState('');
  const [photoCardKey, setPhotoCardKey] = useState(0);

  // Generate with AI
  const [generating, setGenerating]   = useState(false);
  const [genError, setGenError]       = useState('');
  const [genNotice, setGenNotice]     = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [genConfirm, setGenConfirm]   = useState(false);

  // Send test
  const [sendRecipient, setSendRecipient] = useState('');
  const [sending, setSending]             = useState(false);
  const [sendResult, setSendResult]       = useState(null);

  // Broadcast
  const [broadcastSegment, setBroadcastSegment]       = useState('everyone');
  const [broadcastCount, setBroadcastCount]           = useState(null);
  const [broadcastCountLoading, setBroadcastCountLoading] = useState(false);
  const [broadcastConfirm, setBroadcastConfirm]       = useState(false);
  const [broadcasting, setBroadcasting]               = useState(false);
  const [broadcastResult, setBroadcastResult]         = useState(null);

  // ── Workspace layout state ────────────────────────────────────────────────
  const [wsH, setWsH]                       = useState(620);
  const [wsW, setWsW]                       = useState(1200);
  const [editorRatio, setEditorRatio]       = useState(DEFAULT_RATIO);
  const [editorWidthRatio, setEditorWidthRatio] = useState(DEFAULT_WIDTH_RATIO);
  const [deviceView, setDeviceView]         = useState('desktop');
  const [previewScale, setPreviewScale]     = useState({ d: 1, m: 1 });
  const [activeTab, setActiveTab]           = useState('photo');
  const [fullSizeOpen, setFullSizeOpen]     = useState(false);
  const [fullSizeDev, setFullSizeDev]       = useState('desktop');
  const [looksMenuOpen, setLooksMenuOpen]   = useState(false);

  // ── Derived layout values ─────────────────────────────────────────────────
  const isSideBySide = wsW >= 640;
  const editorW  = isSideBySide ? Math.round(clampWidthRatio(editorWidthRatio) * wsW) : 0;
  const rightColW = isSideBySide ? wsW - editorW - 10 : 0;
  const hideBoth  = isSideBySide && rightColW < 500;
  // bandWide: controls Looks inline vs dropdown — uses editor column width in side-by-side
  const bandWide  = isSideBySide ? editorW >= 560 : wsW >= 900;
  // editorH only used in stacked mode
  const editorH = isSideBySide ? 0 : Math.round(clampRatio(editorRatio) * wsH);

  // ── Workspace measurement ─────────────────────────────────────────────────
  useLayoutEffect(() => {
    setEditorRatio(readRatio());
    setEditorWidthRatio(readWidthRatio());

    function measure() {
      const el = wsRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setWsH(Math.max(620, window.innerHeight - top - 8));
      setWsW(el.clientWidth);
    }
    measure();
    // Set initial deviceView after first measure
    const el = wsRef.current;
    if (el) {
      const bw = el.clientWidth;
      const sideBySide = bw >= 640;
      setDeviceView(sideBySide ? 'desktop' : bw >= 560 ? 'desktop' : 'mobile');
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch away from 'both' when right column becomes too narrow
  useEffect(() => {
    if (hideBoth && deviceView === 'both') setDeviceView('desktop');
  }, [hideBoth, deviceView]);

  // Auto-switch to tab that owns a save error field
  useEffect(() => {
    if (!saveError || typeof saveError !== 'object' || !saveError.field) return;
    const tab = FIELD_TAB[saveError.field];
    if (tab) setActiveTab(tab);
  }, [saveError]);

  // Scroll tab content to top on tab switch
  useEffect(() => {
    if (tabContentRef.current) tabContentRef.current.scrollTop = 0;
  }, [activeTab]);

  // Load Google Fonts once
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector(`link[href*="fonts.googleapis.com"][data-etpl]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_HREF;
    link.setAttribute('data-etpl', '1');
    document.head.appendChild(link);
  }, []);

  // Load brand data
  useEffect(() => {
    const shop = shopParam || (typeof window !== 'undefined' && window.shopify?.config?.shop) || '';
    if (!shop) return;
    setStore(s => ({ ...s, shopDomain: shop }));
    apiGet(`/api/profiles/${encodeURIComponent(shop)}/settings`)
      .then(data => {
        setStore({ shopName: data.shopName || '', logoUrl: data.logoUrl || null, primaryColor: data.primaryColor || null, shopDomain: shop });
      })
      .catch(() => {});
  }, [shopParam]);

  useEffect(() => { loadTemplates(); }, []);

  // Auto-select from URL param
  useEffect(() => {
    if (!templateParam || templateAutoSelected.current || templates.length === 0) return;
    const match = templates.find(t => t._id === templateParam);
    if (match) {
      templateAutoSelected.current = true;
      _doSelectTemplate(match);
      if (focusParam === 'photo') {
        setTimeout(() => {
          setActiveTab('photo');
          const el = photoCardRef.current;
          if (!el) return;
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
      }
    }
  }, [templates, templateParam, focusParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast count
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    async function doFetch() {
      setBroadcastCountLoading(true);
      setBroadcastCount(null);
      try {
        const data = await apiGet(`/api/email-templates/count?segment=${encodeURIComponent(broadcastSegment)}`);
        if (!cancelled) setBroadcastCount(data.count);
      } catch {
        if (!cancelled) setBroadcastCount(null);
      } finally {
        if (!cancelled) setBroadcastCountLoading(false);
      }
    }
    doFetch();
    return () => { cancelled = true; };
  }, [selectedId, broadcastSegment]);

  // ── Data helpers ──────────────────────────────────────────────────────────

  async function loadTemplates() {
    setLoading(true);
    setLoadError('');
    setSeedError('');
    try {
      const data = await apiGet('/api/email-templates');
      const list = data.templates || [];
      setTemplates(list);
      const presentTypes = new Set(list.map(t => t.type));
      if (STARTER_TYPES.some(type => !presentTypes.has(type))) {
        setLoading(false);
        await runSeed(list.length);
        return;
      }
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runSeed(prevCount = 0) {
    setSeeding(true);
    setSeedError('');
    try {
      const data = await apiSend('/api/email-templates/seed', 'POST', {});
      const newList = data.templates || [];
      setTemplates(newList);
      const added = newList.length - prevCount;
      if (data.seeded && added > 0) { setSeedCount(added); setJustSeeded(true); }
    } catch (e) {
      setSeedError(e.message || 'Could not generate starter templates.');
    } finally {
      setSeeding(false);
    }
  }

  function setDraftField(field, value) {
    setDraft(d => ({ ...d, [field]: value }));
    setSaveOk(false);
    setSaveError(null);
  }

  function tryNavigate(action) {
    if (dirty || uploading) { setPendingNav(() => action); }
    else { action(); }
  }

  function executeNav() {
    if (pendingNav) { pendingNav(); setPendingNav(null); }
  }

  function _doSelectTemplate(t) {
    const d = draftFromTemplate(t);
    setSelectedId(t._id); setIsNew(false);
    setDraft(d); setSavedDraft(d);
    setSaveError(null); setSaveOk(false); setConfirmDel(false);
    setSendResult(null); setSendRecipient(''); setProductTitle('');
    setGenError(''); setGenNotice(''); setGenConfirm(false);
    setBroadcastSegment('everyone'); setBroadcastCount(null);
    setBroadcastCountLoading(false); setBroadcastConfirm(false); setBroadcastResult(null);
    setPhotoError(''); setPhotoCardKey(k => k + 1);
  }

  function _doStartNew() {
    setSelectedId(null); setIsNew(true);
    setDraft(EMPTY_DRAFT); setSavedDraft(EMPTY_DRAFT);
    setSaveError(null); setSaveOk(false); setConfirmDel(false);
    setSendResult(null); setSendRecipient(''); setProductTitle('');
    setGenError(''); setGenNotice(''); setGenConfirm(false);
    setBroadcastSegment('everyone'); setBroadcastCount(null);
    setBroadcastCountLoading(false); setBroadcastConfirm(false); setBroadcastResult(null);
    setPhotoError(''); setPhotoCardKey(k => k + 1);
  }

  function selectTemplate(t) { tryNavigate(() => _doSelectTemplate(t)); }
  function startNew()         { tryNavigate(_doStartNew); }

  async function saveTemplate() {
    if (saving || uploading) return;
    setSaving(true); setSaveError(null); setSaveOk(false);
    try {
      let saved;
      if (selectedId) {
        const res = await apiSend(`/api/email-templates/${selectedId}`, 'PATCH', draft);
        saved = res.template;
        setTemplates(ts => ts.map(t => (t._id === selectedId ? saved : t)));
      } else {
        const res = await apiSend('/api/email-templates', 'POST', draft);
        saved = res.template;
        setTemplates(ts => [saved, ...ts]);
        setSelectedId(saved._id); setIsNew(false);
      }
      const d = draftFromTemplate(saved);
      setDraft(d); setSavedDraft(d); setSaveOk(true);
    } catch (e) {
      setSaveError(e.field ? { error: e.message, field: e.field } : e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate() {
    if (!selectedId || deleting) return;
    setDeleting(true);
    try {
      await apiSend(`/api/email-templates/${selectedId}`, 'DELETE', {});
      setTemplates(ts => ts.filter(t => t._id !== selectedId));
      setSelectedId(null); setIsNew(false);
      setDraft(EMPTY_DRAFT); setSavedDraft(null); setConfirmDel(false);
      setPhotoCardKey(k => k + 1);
    } catch (e) {
      setSaveError(e.message); setConfirmDel(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePhotoUpload(dataUrl, _file, clientErr) {
    if (clientErr) { setPhotoError(clientErr); return; }
    if (!dataUrl) return;
    setUploading(true); setPhotoError('');
    try {
      const data = await apiSend('/api/email-templates/photo', 'POST', { dataUrl });
      setDraft(d => ({ ...d, imageUrl: data.url, imgW: data.width, imgH: data.height }));
      setSavedDraft(sd => sd ? { ...sd, imageUrl: data.url, imgW: data.width, imgH: data.height } : sd);
    } catch (e) {
      setPhotoError(e.message);
    } finally {
      setUploading(false);
    }
  }

  function handlePhotoRemove() {
    setDraft(d => ({ ...d, imageUrl: null, imgW: null, imgH: null }));
    setSaveOk(false);
  }

  function handleGenerateClick() {
    setGenError(''); setGenNotice('');
    if (draft.subject.trim() || draft.body.trim()) { setGenConfirm(true); }
    else { runGenerate(); }
  }

  async function runGenerate() {
    setGenConfirm(false);
    if (generating) return;
    setGenerating(true); setGenError(''); setGenNotice('');
    try {
      const payload = { type: draft.type };
      if (productTitle.trim()) payload.productTitle = productTitle.trim();
      const data = await apiSend('/api/email-templates/generate', 'POST', payload);
      setDraft(d => ({
        ...d,
        subject:   data.subject   || d.subject,
        body:      data.body      || d.body,
        offerText: data.offerText != null ? (data.offerText || '') : d.offerText,
      }));
      setSaveOk(false);
      if (data.fallback) setGenNotice('AI unavailable — starter draft filled in.');
    } catch (e) {
      setGenError(e.message || 'Generate failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function sendEmail() {
    const recipient = sendRecipient.trim();
    if (!selectedId || !recipient || sending) return;
    setSending(true); setSendResult(null);
    try {
      const isEmail = recipient.includes('@');
      const data = await apiSend(`/api/email-templates/${selectedId}/send`, 'POST',
        isEmail ? { email: recipient } : { profileId: recipient }
      );
      const tip = data.warnings && data.warnings.includes('no_photo') ? ' Tip: this email has no offer photo.' : '';
      setSendResult({ ok: true, id: data.id, tip });
    } catch (e) {
      setSendResult({ ok: false, error: e.message });
    } finally {
      setSending(false);
    }
  }

  async function sendBroadcast() {
    if (!selectedId || broadcasting) return;
    setBroadcasting(true); setBroadcastConfirm(false); setBroadcastResult(null);
    try {
      const data = await apiSend(`/api/email-templates/${selectedId}/broadcast`, 'POST', { segment: broadcastSegment });
      const tip = data.warnings && data.warnings.includes('no_photo') ? ' Tip: this email has no offer photo.' : '';
      setBroadcastResult({ ok: true, sent: data.sent, failed: data.failed, tip });
    } catch (e) {
      setBroadcastResult({ ok: false, error: e.message });
    } finally {
      setBroadcasting(false);
    }
  }

  function applyPreset(k) {
    if (!ENGINE_PRESETS || !ENGINE_PRESETS[k]) return;
    const p = ENGINE_PRESETS[k];
    setDraftField('layout', p.layout);
    setDraftField('color',  p.color);
    setDraftField('hFont',  p.hFont);
    setDraftField('bFont',  p.bFont);
    setDraftField('radius', p.radius);
    setDraftField('pageBg', null);
    setDraftField('cardBg', null);
  }

  const showEditor = isNew || !!selectedId;
  const sendDisabled = dirty || uploading;
  const sendDisabledHint = sendDisabled ? 'Save your changes first' : '';
  const noPhoto = showEditor && !draft.imageUrl;

  // ── Shared sub-JSX ────────────────────────────────────────────────────────

  const headerJSX = (
    <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0, ...(isSideBySide ? { gridColumn: '1 / -1' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 6 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <TemplatePicker
            templates={templates}
            selectedId={selectedId}
            isNew={isNew}
            filter={filter}
            onFilterChange={setFilter}
            onSelect={selectTemplate}
            onNew={startNew}
            draft={draft}
            setDraftField={setDraftField}
            confirmDel={confirmDel}
            setConfirmDel={setConfirmDel}
            onDelete={deleteTemplate}
            deleting={deleting}
            compact={true}
          />
        </div>
        {dirty && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#fffbeb', color: '#b45309', border: '1.5px solid #fde68a', flexShrink: 0 }}>
            Unsaved changes
          </span>
        )}
        {saveOk && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#f0fdf4', color: '#166534', border: '1.5px solid #bbf7d0', flexShrink: 0 }}>
            Saved
          </span>
        )}
        {showEditor && (
          <button
            style={{ ...DS.btnPrimary, opacity: saving || uploading ? 0.7 : 1, flexShrink: 0 }}
            onClick={saveTemplate}
            disabled={saving || uploading}
          >
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        )}
        {dirty && (
          <button
            style={{ ...DS.btnSecondary, flexShrink: 0 }}
            onClick={() => {
              if (savedDraft) { setDraft(savedDraft); setSaveError(null); setSaveOk(false); }
              else _doStartNew();
            }}
          >
            Discard
          </button>
        )}
      </div>
      {pendingNav && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#92400e', flex: 1 }}>Unsaved changes — discard and continue?</span>
          <button style={{ ...DS.btnDanger, fontSize: 12, padding: '4px 10px' }} onClick={executeNav}>Discard</button>
          <button style={{ ...DS.btnSecondary, fontSize: 12, padding: '4px 10px' }} onClick={() => setPendingNav(null)}>Keep editing</button>
        </div>
      )}
      {saveError && (
        <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0' }}>
          {typeof saveError === 'string' ? saveError : saveError.error}
        </p>
      )}
      {(loading || seeding) && (
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
          {seeding ? 'Setting up starter templates…' : 'Loading…'}
        </p>
      )}
      {!loading && !seeding && seedError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 0' }}>
          <p style={{ fontSize: 12, color: '#dc2626', margin: 0, flex: 1 }}>{seedError}</p>
          <button style={{ ...DS.btnSecondary, fontSize: 11, padding: '3px 8px' }} onClick={() => runSeed(templates.length)}>Try again</button>
        </div>
      )}
      {!loading && loadError && <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0' }}>{loadError}</p>}
      {justSeeded && !seedDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '5px 10px', margin: '6px 0 0' }}>
          <p style={{ fontSize: 12, color: '#166534', margin: 0, flex: 1 }}>
            {seedCount} starter template{seedCount !== 1 ? 's' : ''} ready. Edit them or send as-is.
          </p>
          <button style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#166534', padding: 0 }} onClick={() => setSeedDismissed(true)} aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  );

  const deviceOptions = [['both', 'Both'], ['desktop', 'Desktop'], ['mobile', 'Mobile']]
    .filter(([k]) => !(k === 'both' && hideBoth));

  const previewToolbarJSX = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb', flexShrink: 0 }}>
        {deviceOptions.map(([k, label]) => (
          <button key={k} onClick={() => setDeviceView(k)} style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: deviceView === k ? '#4f46e5' : '#f9fafb',
            color: deviceView === k ? '#fff' : '#374151',
          }}>{label}</button>
        ))}
      </div>
      <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>
        {deviceView === 'both'
          ? `D ${Math.round(previewScale.d * 100)}% · M ${Math.round(previewScale.m * 100)}%`
          : deviceView === 'desktop'
          ? `${Math.round(previewScale.d * 100)}%`
          : `${Math.round(previewScale.m * 100)}%`}
      </span>
      {showEditor && (
        <button
          ref={fullSizeBtnRef}
          onClick={() => { setFullSizeDev(deviceView === 'mobile' ? 'mobile' : 'desktop'); setFullSizeOpen(true); }}
          style={{ ...DS.btnSecondary, padding: '3px 10px', fontSize: 11, flexShrink: 0 }}
        >
          Full size
        </button>
      )}
      {showEditor && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
          background: noPhoto ? '#fef3c7' : '#f0fdf4',
          color: noPhoto ? '#b45309' : '#166534',
          border: `1px solid ${noPhoto ? '#fde68a' : '#bbf7d0'}`,
        }}>
          {noPhoto ? 'No photo yet' : 'Photo added'}
        </span>
      )}
      <div style={{ flex: 1 }} />
    </div>
  );

  const tabContentJSX = !showEditor ? (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af' }}>
      <p style={{ fontSize: 22, margin: '0 0 10px', lineHeight: 1 }}>✉</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>Select a template or create a new one</p>
      <p style={{ fontSize: 12, margin: 0 }}>The preview updates as you type.</p>
    </div>
  ) : (
    <>
      {activeTab === 'photo' && (
        <div ref={photoCardRef}>
          <PhotoCard
            key={photoCardKey}
            draft={draft}
            uploading={uploading}
            photoError={photoError}
            onUpload={handlePhotoUpload}
            onRemove={handlePhotoRemove}
            onClearError={() => setPhotoError('')}
            bare
          />
        </div>
      )}
      {activeTab === 'layout' && (
        <LayoutCard draft={draft} setDraftField={setDraftField} saveError={saveError} bare />
      )}
      {activeTab === 'colours' && (
        <ColourCard draft={draft} setDraftField={setDraftField} store={store} saveError={saveError} bare />
      )}
      {activeTab === 'fonts' && (
        <FontCard draft={draft} setDraftField={setDraftField} saveError={saveError} bare />
      )}
      {activeTab === 'words' && (
        <>
          {isNew && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Type</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['special_offer', 'festival', 'normal'].map(key => (
                  <button key={key} onClick={() => setDraftField('type', key)} style={{
                    padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                    background: draft.type === key ? '#4f46e5' : '#f3f4f6',
                    color: draft.type === key ? '#fff' : '#374151',
                    border: draft.type === key ? 'none' : '1px solid #e5e7eb',
                  }}>
                    {{ special_offer: 'Special offer', festival: 'Festival', normal: 'Normal' }[key]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <WordsCard draft={draft} setDraftField={setDraftField} saveError={saveError} bare showName isNew={isNew} />
        </>
      )}
      {activeTab === 'send' && (
        <div className="etpl-send-grid">
          <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Generate with AI</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Product (optional)</label>
                <input
                  style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#111827' }}
                  value={productTitle}
                  onChange={e => { setProductTitle(e.target.value); setGenError(''); setGenNotice(''); setGenConfirm(false); }}
                  placeholder="e.g. Banarasi Silk Kurti"
                />
              </div>
              <button
                style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: generating ? 0.7 : 1, flexShrink: 0 }}
                onClick={handleGenerateClick}
                disabled={generating}
              >
                {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
            {genConfirm && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>Replace subject, body, and offer line?</span>
                <button style={{ ...DS.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={runGenerate}>Replace</button>
                <button style={{ ...DS.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={() => setGenConfirm(false)}>Cancel</button>
              </div>
            )}
            {genNotice && <p style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '5px 8px', margin: '8px 0 0' }}>{genNotice}</p>}
            {genError  && <p style={{ fontSize: 11, color: '#dc2626', margin: '8px 0 0' }}>{genError}</p>}
          </div>
          {selectedId && (
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Send test</p>
              {sendDisabledHint && <p style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '4px 8px', margin: '0 0 8px' }}>{sendDisabledHint}</p>}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Customer email</label>
                  <input
                    style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#111827' }}
                    type="email"
                    value={sendRecipient}
                    onChange={e => { setSendRecipient(e.target.value); setSendResult(null); }}
                    placeholder="customer@example.com"
                    disabled={sendDisabled}
                  />
                </div>
                <button
                  style={{ ...DS.btnPrimary, opacity: sendDisabled ? 0.5 : 1, flexShrink: 0 }}
                  onClick={sendEmail}
                  disabled={sendDisabled || sending || !sendRecipient.trim()}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
              {sendResult?.ok && <p style={{ fontSize: 12, color: '#16a34a', margin: '8px 0 0' }}>Sent! ID: {sendResult.id}{sendResult.tip}</p>}
              {sendResult && !sendResult.ok && <p style={{ fontSize: 12, color: '#dc2626', margin: '8px 0 0' }}>{sendResult.error}</p>}
            </div>
          )}
          {selectedId && (
            <div style={{ gridColumn: '1 / -1', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Send to customers</p>
              {sendDisabledHint && <p style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '4px 8px', margin: '0 0 8px' }}>{sendDisabledHint}</p>}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Segment</label>
                  <select
                    style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#111827', cursor: 'pointer' }}
                    value={broadcastSegment}
                    disabled={sendDisabled}
                    onChange={e => { setBroadcastSegment(e.target.value); setBroadcastConfirm(false); setBroadcastResult(null); }}
                  >
                    {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              {broadcastCountLoading && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>Counting…</p>}
              {!broadcastCountLoading && broadcastCount === 0 && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>No customers match this segment.</p>}
              {!broadcastCountLoading && broadcastCount !== null && broadcastCount > 0 && broadcastCount <= 90 && (
                <p style={{ fontSize: 12, color: '#374151', margin: '0 0 8px' }}>{broadcastCount} customers will receive this.</p>
              )}
              {!broadcastCountLoading && broadcastCount !== null && broadcastCount > 90 && (
                <p style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '5px 8px', margin: '0 0 8px' }}>
                  Free plan sends up to ~90 at once. {broadcastCount} match — narrow the segment.
                </p>
              )}
              {!broadcastConfirm ? (
                <button
                  style={{ ...DS.btnPrimary, opacity: sendDisabled ? 0.5 : 1 }}
                  disabled={sendDisabled || broadcasting || broadcastCountLoading || broadcastCount === null || broadcastCount === 0 || broadcastCount > 90}
                  onClick={() => setBroadcastConfirm(true)}
                >
                  Send to {broadcastCount ?? '…'} customers
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#374151' }}>Send to {broadcastCount} customers? This can&apos;t be undone.</span>
                  <button style={DS.btnPrimary} onClick={sendBroadcast} disabled={broadcasting}>{broadcasting ? 'Sending…' : 'Confirm send'}</button>
                  <button style={DS.btnSecondary} onClick={() => setBroadcastConfirm(false)}>Cancel</button>
                </div>
              )}
              {broadcastResult?.ok && (
                <p style={{ fontSize: 12, color: '#16a34a', margin: '8px 0 0' }}>
                  Sent to {broadcastResult.sent}{broadcastResult.failed > 0 ? `, failed ${broadcastResult.failed}` : ''}.{broadcastResult.tip}
                </p>
              )}
              {broadcastResult && !broadcastResult.ok && (
                <p style={{ fontSize: 12, color: '#dc2626', margin: '8px 0 0' }}>{broadcastResult.error}</p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );

  const tabStripJSX = (
    <TabStrip
      activeTab={activeTab}
      onTabChange={setActiveTab}
      hasPhoto={!!draft.imageUrl}
      dirty={dirty}
      saveError={saveError}
      presets={ENGINE_PRESETS}
      onPreset={applyPreset}
      looksMenuOpen={looksMenuOpen}
      setLooksMenuOpen={setLooksMenuOpen}
      bandWide={bandWide}
    />
  );

  const tabPanelJSX = (
    <div
      ref={tabContentRef}
      id={`tabpanel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`tab-${activeTab}`}
      style={{
        flex: 1,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        scrollbarGutter: 'stable',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      {tabContentJSX}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={wsRef}
      style={{
        height: wsH, minHeight: 620,
        overflow: wsH <= 620 ? 'visible' : 'hidden',
        display: 'grid',
        ...(isSideBySide
          ? { gridTemplateRows: 'auto 1fr', gridTemplateColumns: `${editorW}px 10px 1fr` }
          : { gridTemplateRows: `auto 1fr 10px ${editorH}px` }
        ),
        fontFamily: DS.fontFamily,
        background: '#f8fafc',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Header (all cols in side-by-side, Row 0 in stacked) ── */}
      {headerJSX}

      {isSideBySide ? (
        <>
          {/* ── Col 1: editor pane ── */}
          <div
            className="etpl-editor-col"
            style={{
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            {tabStripJSX}
            {tabPanelJSX}
          </div>

          {/* ── Col 2: vertical splitter ── */}
          <Splitter
            orientation="vertical"
            wsRef={wsRef}
            wsDim={wsW}
            ratio={editorWidthRatio}
            onRatioChange={r => { setEditorWidthRatio(r); writeWidthRatio(r); }}
            clampFn={clampWidthRatio}
            minVal={0.34}
            maxVal={0.55}
            defaultRatio={DEFAULT_WIDTH_RATIO}
          />

          {/* ── Col 3: preview pane ── */}
          <div style={{
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: '#f1f5f9',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            {previewToolbarJSX}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <PreviewStage
                draft={showEditor ? draft : null}
                store={store}
                deviceView={deviceView}
                onScale={(d, m) => setPreviewScale({ d, m })}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* ── Row 1: preview band ── */}
          <div ref={bandRef} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 240 }}>
            {previewToolbarJSX}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <PreviewStage
                draft={showEditor ? draft : null}
                store={store}
                deviceView={deviceView}
                onScale={(d, m) => setPreviewScale({ d, m })}
              />
            </div>
          </div>

          {/* ── Row 2: horizontal splitter ── */}
          <Splitter
            orientation="horizontal"
            wsRef={wsRef}
            wsDim={wsH}
            ratio={editorRatio}
            onRatioChange={r => { setEditorRatio(r); writeRatio(r); }}
            clampFn={clampRatio}
            minVal={0.30}
            maxVal={0.60}
            defaultRatio={DEFAULT_RATIO}
          />

          {/* ── Row 3: editor panel ── */}
          <div
            className="etpl-editor-col"
            style={{
              height: editorH, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              background: '#fff',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              boxShadow: '0 -1px 0 #e5e7eb',
            }}
          >
            {tabStripJSX}
            {tabPanelJSX}
          </div>
        </>
      )}

      {/* Full size modal */}
      {fullSizeOpen && showEditor && (
        <FullSizeModal
          draft={draft}
          store={store}
          initialDevice={fullSizeDev}
          onClose={() => { setFullSizeOpen(false); fullSizeBtnRef.current && fullSizeBtnRef.current.focus(); }}
        />
      )}

      {/* Global styles */}
      <style dangerouslySetInnerHTML={{__html:`
        .etpl-editor-col{container-type:inline-size}
        .etpl-words-grid{display:grid;grid-template-columns:1fr;gap:0}
        @container(min-width:600px){.etpl-words-grid{grid-template-columns:1fr 1fr;column-gap:16px}}
        .etpl-send-grid{display:grid;grid-template-columns:1fr;gap:12px}
        @container(min-width:600px){.etpl-send-grid{grid-template-columns:1fr 1fr}}
        [role=tablist]::-webkit-scrollbar{display:none}
        [role=tabpanel]::-webkit-scrollbar{width:6px}
        [role=tabpanel]::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:3px}
        [role=separator]:focus-visible{outline:2px solid #4f46e5;outline-offset:0}
      `}} />
    </div>
  );
}
