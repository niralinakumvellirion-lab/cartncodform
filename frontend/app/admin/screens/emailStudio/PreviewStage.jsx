'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { GOOGLE_FONTS_HREF } from './lib';
import _eng from '../../lib/emailEngine';

const { renderEmail, designFromTemplate } = _eng || {};

export const DESKTOP_W = 700;
export const MOBILE_W  = 391;

function makeDoc(css, body) {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<link rel="stylesheet" href="${GOOGLE_FONTS_HREF}">` +
    `<style id="s">${css}</style></head>` +
    `<body style="margin:0;padding:0;background:#f3f4f6;">${body}</body></html>`
  );
}

function pushToIframe(iframe, readyRef, out) {
  if (!iframe) return;
  if (readyRef.current) {
    try {
      const doc = iframe.contentDocument;
      const s = doc && doc.getElementById('s');
      if (s) { s.textContent = out.css; doc.body.innerHTML = out.body; return; }
    } catch {}
  }
  readyRef.current = false;
  iframe.srcdoc = makeDoc(out.css, out.body);
}

// Bug A1 fix: blank doc returns scrollHeight≈8 (truthy), never reaching || 600.
// Threshold guard ensures we return 600 for any not-yet-rendered document.
function measureNatH(iframe) {
  if (!iframe) return 600;
  try {
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) return 600;
    iframe.style.height = '1px';
    const h = doc.documentElement.scrollHeight;
    iframe.style.height = h + 'px';
    if (h < 100) return 600;
    return h;
  } catch {
    return 600;
  }
}

export default function PreviewStage({
  draft,
  store,
  deviceView = 'desktop',   // 'desktop' | 'mobile'
  onDeviceViewChange,
  viewMode = 'fit',          // 'fit' | 'actual'
  onViewModeChange,
  noPhoto = false,
}) {
  const containerRef = useRef(null);
  const iframeRef    = useRef(null);
  const readyRef     = useRef(false);
  const lastOut      = useRef(null);

  const [natH, setNatH]   = useState(600);
  const [scale, setScale] = useState(1);

  const fit = useCallback(() => {
    const iW = deviceView === 'desktop' ? DESKTOP_W : MOBILE_W;
    if (viewMode === 'actual') {
      const h = measureNatH(iframeRef.current);
      setNatH(h);
      setScale(1);
      return;
    }
    const c = containerRef.current;
    if (!c) return;
    const cH = c.clientHeight;
    const cW = c.clientWidth;
    if (!cH || !cW) return;
    const BAR_H = 50;
    const PAD   = 16;
    const h = measureNatH(iframeRef.current);
    setNatH(h);
    const usableH = Math.max(cH - BAR_H - PAD * 2, 1);
    const usableW = Math.max(cW - PAD * 2, 1);
    const k = Math.min(1, usableH / h, usableW / iW);
    setScale(k);
  }, [deviceView, viewMode]);

  // Re-init iframe on mount and when deviceView changes.
  // Bug A (additional case): mobile iframe was never initialized when deviceView starts
  // as 'desktop'. Re-init on each deviceView change pushes lastOut and calls fit().
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    readyRef.current = false;

    function onLoad() {
      readyRef.current = true;
      if (lastOut.current) {
        try {
          const doc = iframe.contentDocument;
          const s = doc && doc.getElementById('s');
          if (s) { s.textContent = lastOut.current.css; doc.body.innerHTML = lastOut.current.body; }
        } catch {}
      }
      // Bug A2 fix: fit() after iframe load
      requestAnimationFrame(() => { setTimeout(fit, 50); });
    }

    iframe.addEventListener('load', onLoad);
    iframe.srcdoc = makeDoc('', '');
    return () => iframe.removeEventListener('load', onLoad);
  }, [deviceView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ResizeObserver on the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Re-fit when viewMode changes
  useEffect(() => { fit(); }, [viewMode, fit]);

  // Debounced render on draft/store change
  useEffect(() => {
    if (!draft || !store) return;
    const t = setTimeout(() => {
      if (!renderEmail || !designFromTemplate) return;
      const design = designFromTemplate(draft, store, { placeholder: !draft.imageUrl });
      const out = renderEmail(design);
      lastOut.current = out;
      pushToIframe(iframeRef.current, readyRef, out);
      // Bug A2 fix: fit() after every pushToIframe
      requestAnimationFrame(() => { setTimeout(fit, 50); });
    }, 120);
    return () => clearTimeout(t);
  }, [draft, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const iW   = deviceView === 'desktop' ? DESKTOP_W : MOBILE_W;
  const pct  = Math.round(scale * 100);
  const visW = viewMode === 'actual' ? iW : Math.max(1, Math.round(iW * scale));
  const visH = viewMode === 'actual' ? Math.max(60, natH) : Math.max(1, Math.round(natH * scale));

  const SEG_BTN = (active) => ({
    padding: '5px 14px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
    background: active ? '#16161a' : 'transparent',
    color: active ? '#fff' : '#6a6a76',
    outline: 'none',
  });

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, flexWrap: 'wrap', flexShrink: 0 }}>

        {/* Device segment */}
        <div style={{ display: 'flex', border: '1.5px solid #e5e5ea', borderRadius: 8, overflow: 'hidden' }}>
          {[['desktop', 'Desktop'], ['mobile', 'Mobile']].map(([k, label]) => (
            <button
              key={k} type="button"
              onClick={() => onDeviceViewChange && onDeviceViewChange(k)}
              style={SEG_BTN(deviceView === k)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* View-mode segment */}
        <div style={{ display: 'flex', border: '1.5px solid #e5e5ea', borderRadius: 8, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => onViewModeChange && onViewModeChange('fit')}
            style={SEG_BTN(viewMode === 'fit')}
          >
            {viewMode === 'fit' ? `Fit · ${pct}%` : 'Fit to screen'}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange && onViewModeChange('actual')}
            style={SEG_BTN(viewMode === 'actual')}
          >
            Actual size
          </button>
        </div>

        {/* Photo status pill */}
        {draft && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
            background: noPhoto ? '#fef3c7' : '#f0fdf4',
            color:      noPhoto ? '#b45309' : '#166534',
            border:     `1px solid ${noPhoto ? '#fde68a' : '#bbf7d0'}`,
          }}>
            {noPhoto ? 'No photo yet' : 'Photo added'}
          </span>
        )}
      </div>

      {/* Mailbox area */}
      <div style={{
        flex: 1,
        overflowY: viewMode === 'actual' ? 'auto'   : 'hidden',
        overflowX: viewMode === 'actual' ? 'auto'   : 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: viewMode === 'actual' ? 'flex-start' : 'center',
        padding: 8,
      }}>
        <div style={{
          width: visW, height: visH,
          overflow: 'hidden',
          borderRadius: deviceView === 'mobile' ? 20 : 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
          position: 'relative',
          background: '#f3f4f6',
          flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: iW, height: natH,
            transform: viewMode === 'actual' ? 'none' : `scale(${scale})`,
            transformOrigin: 'top left',
          }}>
            <iframe
              ref={iframeRef}
              title="Email preview"
              sandbox="allow-same-origin"
              tabIndex={-1}
              aria-hidden="true"
              style={{
                display: 'block', width: '100%', height: natH,
                border: 'none', background: '#f3f4f6', pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
