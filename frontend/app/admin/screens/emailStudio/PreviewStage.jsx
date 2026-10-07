'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { GOOGLE_FONTS_HREF, STICKY_TOP } from './lib';

// Import the engine. emailEngine.js uses module.exports so webpack gives us
// the exports object as the default import.
import _eng from '../../lib/emailEngine';

const { renderEmail, designFromTemplate } = _eng || {};

const DESKTOP_W = 600;
const MOBILE_W  = 380;

const INIT_SRCDOC = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${GOOGLE_FONTS_HREF}"><style id="s"></style></head><body style="margin:0;padding:0;background:#f3f4f6;"></body></html>`;

export default function PreviewStage({ draft, store }) {
  const [previewWidth, setPreviewWidth] = useState('desktop'); // 'desktop' | 'mobile'
  const [viewMode, setViewMode]         = useState('fit');      // 'fit' | 'actual'
  const [scale, setScale]               = useState(1);

  const iframeRef = useRef(null);
  const barRef    = useRef(null);
  const scalerRef = useRef(null);
  const mailboxRef= useRef(null);
  const iframeReadyRef = useRef(false);

  // On mount: initialise iframe srcdoc; on load set ready flag.
  useEffect(() => {
    const f = iframeRef.current;
    if (!f) return;
    function onLoad() {
      iframeReadyRef.current = true;
      // Push current design in once the iframe is ready
      if (draft && store) doPut(draft, store);
    }
    f.addEventListener('load', onLoad);
    f.srcdoc = INIT_SRCDOC;
    return () => f.removeEventListener('load', onLoad);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when viewMode or previewWidth changes (after render).
  useEffect(() => {
    fitFrame();
  }, [viewMode, previewWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced render on draft/store change.
  useEffect(() => {
    if (!draft || !store) return;
    const t = setTimeout(() => { doPut(draft, store); }, 120);
    return () => clearTimeout(t);
  }, [draft, store]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit on window resize.
  useEffect(() => {
    function onResize() { fitFrame(); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  function doPut(d, s) {
    if (!renderEmail || !designFromTemplate) return;
    const f = iframeRef.current;
    if (!f) return;
    const design = designFromTemplate(d, s, { placeholder: !d.imageUrl });
    const out = renderEmail(design);
    if (iframeReadyRef.current) {
      try {
        const doc = f.contentDocument;
        const styleEl = doc && doc.getElementById('s');
        if (styleEl) {
          styleEl.textContent = out.css;
          doc.body.innerHTML = out.body;
          fitFrame();
          return;
        }
      } catch (_e) { /* cross-origin guard */ }
    }
    // Fallback: full srcdoc (triggers reload, which re-fires onLoad → doPut again)
    iframeReadyRef.current = false;
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${GOOGLE_FONTS_HREF}"><style id="s">${out.css}</style></head><body style="margin:0;padding:0;background:#f3f4f6;">${out.body}</body></html>`;
  }

  function fitFrame() {
    const f = iframeRef.current;
    if (!f) return;
    // Measure natural email height
    let naturalH = 600;
    try {
      const doc = f.contentDocument;
      if (doc && doc.documentElement) {
        f.style.height = '1px';
        naturalH = doc.documentElement.scrollHeight || 600;
        f.style.height = naturalH + 'px';
      }
    } catch (_e) {}

    const mb = mailboxRef.current;
    const sc = scalerRef.current;
    if (!mb || !sc) return;

    if (viewMode === 'fit') {
      const barH = barRef.current ? barRef.current.offsetHeight : 52;
      const avail = window.innerHeight - STICKY_TOP - 14 - barH - 12 - 14;
      const mbH   = mb.offsetHeight || naturalH;
      const k     = avail > 0 && mbH > 0 ? Math.min(1, avail / mbH) : 1;
      mb.style.transformOrigin = 'top center';
      mb.style.transform = `scale(${k})`;
      sc.style.height = Math.ceil(mbH * k) + 'px';
      setScale(k);
    } else {
      mb.style.transform = '';
      mb.style.transformOrigin = '';
      sc.style.height = '';
      setScale(1);
    }
  }

  const mailboxW = previewWidth === 'desktop' ? DESKTOP_W : MOBILE_W;

  const stageStyle = {
    position: viewMode === 'fit' ? 'sticky' : 'static',
    top: viewMode === 'fit' ? STICKY_TOP : undefined,
    background: '#f3f4f6',
    borderRadius: 14,
    padding: '14px',
    minWidth: 0,
    overflow: 'hidden',
  };

  const noPhotoTag = draft && !draft.imageUrl;
  const storeName = (store && (store.shopName || store.shopDomain)) || 'Your store';

  return (
    <div style={stageStyle}>
      {/* Toolbar */}
      <div ref={barRef} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Width toggle */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db', flexShrink: 0 }}>
          {[['desktop', 'Desktop'], ['mobile', 'Mobile']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPreviewWidth(k)}
              style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: previewWidth === k ? '#4f46e5' : '#f9fafb',
                color: previewWidth === k ? '#fff' : '#374151',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scale toggle */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db', flexShrink: 0 }}>
          {[['fit', 'Fit'], ['actual', 'Actual']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setViewMode(k)}
              style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: viewMode === k ? '#4f46e5' : '#f9fafb',
                color: viewMode === k ? '#fff' : '#374151',
              }}
            >
              {k === 'fit' ? `Fit ${Math.round(scale * 100)}%` : label}
            </button>
          ))}
        </div>

        {/* Status pill */}
        {noPhotoTag && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', flexShrink: 0 }}>
            No photo yet
          </span>
        )}
        {!noPhotoTag && draft && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', flexShrink: 0 }}>
            Photo added
          </span>
        )}
      </div>

      {/* Mail header strip */}
      {draft && (
        <div style={{ background: '#fff', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #e5e7eb', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: '#4f46e5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {storeName.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {storeName}
            </p>
            <p style={{ fontSize: 11, color: '#6b7280', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {draft.subject || '(no subject)'}
            </p>
          </div>
        </div>
      )}

      {/* Scaler + mailbox */}
      <div ref={scalerRef} style={{ overflow: 'hidden', background: '#e5e7eb', borderRadius: '0 0 8px 8px' }}>
        <div
          ref={mailboxRef}
          style={{ width: mailboxW, margin: '0 auto', transformOrigin: 'top center' }}
        >
          <iframe
            ref={iframeRef}
            title="Email preview"
            sandbox="allow-same-origin"
            style={{ display: 'block', width: '100%', border: 'none', minHeight: 200, background: '#f3f4f6' }}
          />
        </div>
      </div>
    </div>
  );
}
