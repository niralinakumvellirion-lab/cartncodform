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

function measureNatH(iframe) {
  if (!iframe) return 600;
  try {
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) return 600;
    iframe.style.height = '1px';
    const h = doc.documentElement.scrollHeight || 600;
    iframe.style.height = h + 'px';
    return h;
  } catch {
    return 600;
  }
}

function MailboxSlot({ iframeRef, label, natH, scale, width, rounded }) {
  const visW = Math.max(1, Math.round(width * scale));
  const visH = Math.max(1, Math.round(natH * scale));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span style={{
        fontSize: 9, fontWeight: 700, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1,
      }}>
        {label}
      </span>
      <div style={{
        width: visW, height: visH,
        overflow: 'hidden',
        borderRadius: rounded ? 20 : 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
        position: 'relative',
        background: '#f3f4f6',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: width, height: natH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}>
          <iframe
            ref={iframeRef}
            title={`${label} email preview`}
            sandbox="allow-same-origin"
            tabIndex={-1}
            aria-hidden="true"
            style={{
              display: 'block', width: '100%', height: natH,
              border: 'none', background: '#f3f4f6',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function PreviewStage({ draft, store, deviceView = 'both', onScale }) {
  const containerRef  = useRef(null);
  const deskIframeRef = useRef(null);
  const mobIframeRef  = useRef(null);
  const deskReadyRef  = useRef(false);
  const mobReadyRef   = useRef(false);
  const lastOut       = useRef(null);

  const [deskNatH, setDeskNatH] = useState(600);
  const [mobNatH,  setMobNatH]  = useState(600);
  const [deskScale, setDeskScale] = useState(1);
  const [mobScale,  setMobScale]  = useState(1);

  const fit = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const cH = c.clientHeight;
    const cW = c.clientWidth;
    if (!cH || !cW) return;

    const PAD = 24;
    const GAP = 20;
    const dH = measureNatH(deskIframeRef.current);
    const mH = measureNatH(mobIframeRef.current);
    setDeskNatH(dH);
    setMobNatH(mH);

    const usableH = Math.max(cH - PAD * 2, 1);
    const usableW = Math.max(cW - PAD * 2, 1);

    let kD = 1, kM = 1;

    if (deviceView === 'both') {
      kD = Math.min(1, usableH / dH);
      kM = Math.min(1, usableH / mH);
      const combined = DESKTOP_W * kD + MOBILE_W * kM + GAP;
      if (combined > usableW) {
        const f = usableW / combined;
        kD = Math.max(0.05, kD * f);
        kM = Math.max(0.05, kM * f);
      }
    } else if (deviceView === 'desktop') {
      kD = Math.min(1, usableH / dH, usableW / DESKTOP_W);
      kM = kD;
    } else {
      kM = Math.min(1, usableH / mH, usableW / MOBILE_W);
      kD = kM;
    }

    setDeskScale(kD);
    setMobScale(kM);
    if (onScale) onScale(kD, kM, deviceView);
  }, [deviceView, onScale]);

  // Init iframes on mount
  useEffect(() => {
    const blank = makeDoc('', '');
    const df = deskIframeRef.current;
    const mf = mobIframeRef.current;

    function onDeskLoad() {
      deskReadyRef.current = true;
      if (lastOut.current) {
        try {
          const doc = df.contentDocument;
          const s = doc && doc.getElementById('s');
          if (s) { s.textContent = lastOut.current.css; doc.body.innerHTML = lastOut.current.body; }
        } catch {}
      }
      fit();
    }
    function onMobLoad() {
      mobReadyRef.current = true;
      if (lastOut.current) {
        try {
          const doc = mf.contentDocument;
          const s = doc && doc.getElementById('s');
          if (s) { s.textContent = lastOut.current.css; doc.body.innerHTML = lastOut.current.body; }
        } catch {}
      }
      fit();
    }

    if (df) { df.addEventListener('load', onDeskLoad); df.srcdoc = blank; }
    if (mf) { mf.addEventListener('load', onMobLoad); mf.srcdoc = blank; }
    return () => {
      if (df) df.removeEventListener('load', onDeskLoad);
      if (mf) mf.removeEventListener('load', onMobLoad);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => { fit(); }, [deviceView, fit]);

  // Debounced render on draft/store change
  useEffect(() => {
    if (!draft || !store) return;
    const t = setTimeout(() => {
      if (!renderEmail || !designFromTemplate) return;
      const design = designFromTemplate(draft, store, { placeholder: !draft.imageUrl });
      const out = renderEmail(design);
      lastOut.current = out;
      pushToIframe(deskIframeRef.current, deskReadyRef, out);
      pushToIframe(mobIframeRef.current, mobReadyRef, out);
    }, 120);
    return () => clearTimeout(t);
  }, [draft, store]);

  const showD = deviceView === 'both' || deviceView === 'desktop';
  const showM = deviceView === 'both' || deviceView === 'mobile';

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%', overflow: 'hidden',
        background: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px) 0 0 / 18px 18px, #f1f5f9',
        boxShadow: 'inset 0 6px 16px -8px rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: 24, boxSizing: 'border-box',
      }}
    >
      {showD && (
        <MailboxSlot
          iframeRef={deskIframeRef}
          label="Desktop"
          natH={deskNatH}
          scale={deskScale}
          width={DESKTOP_W}
          rounded={false}
        />
      )}
      {showM && (
        <MailboxSlot
          iframeRef={mobIframeRef}
          label="Mobile"
          natH={mobNatH}
          scale={mobScale}
          width={MOBILE_W}
          rounded={true}
        />
      )}
    </div>
  );
}
