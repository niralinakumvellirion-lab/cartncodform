'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';

function _injectMeta(html) {
  if (!html) return '';
  return html.includes('<base ')
    ? html
    : html.replace(/(<head[^>]*>)/i, '$1\n<base target="_blank">');
}

function _PreviewPlaceholder({ height, children }) {
  return (
    <div style={{ height: height || 120, background: '#f9fafb', borderRadius: 8,
                  border: '1px solid #e5e7eb', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '0 16px' }}>
      {children}
    </div>
  );
}

/* EmailPreviewFrame — shared by desktop and mobile, write and template mode.
 *
 * device='desktop': renders email at 640px logical width, scaled to container.
 *   Wrapper max-height 560px with vertical scroll for tall emails.
 *   Shows Subject + To header above.
 *
 * device='mobile': renders email at 375px logical width inside the phone screen.
 *   Fills 100% of the phone screen height. No black band.
 */
export function EmailPreviewFrame({ html, device, loading, templateMode, subject, customerEmail, warnings }) {
  const wrapperRef = useRef(null);
  const iframeRef  = useRef(null);
  const [containerWidth, setContainerWidth]       = useState(0);
  const [iframeContentHeight, setIframeContentHeight] = useState(0);

  // Read width synchronously so first render already has correct scale.
  useLayoutEffect(() => {
    if (wrapperRef.current) setContainerWidth(wrapperRef.current.offsetWidth);
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset measured height when new HTML arrives.
  useEffect(() => { setIframeContentHeight(0); }, [html]);

  function handleLoad() {
    try {
      const h = iframeRef.current?.contentDocument?.documentElement?.scrollHeight;
      if (h > 0) setIframeContentHeight(h);
    } catch { /* cross-origin guard */ }
  }

  const preparedHtml = _injectMeta(html);

  /* ── MOBILE ─────────────────────────────────────────────────────────── */
  if (device === 'mobile') {
    const LOGICAL = 375;
    const cw    = containerWidth || LOGICAL;
    const scale = cw / LOGICAL;
    // Iframe must be at least tall enough to fill the phone screen visually.
    const minH  = Math.ceil(480 / scale);
    const naturalH = Math.max(iframeContentHeight || 0, minH);

    return (
      <div ref={wrapperRef}
        style={{ height: '100%', background: '#f5f5f5', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, color: '#9ca3af' }}>Loading…</span>
          </div>
        ) : !html ? (
          <div style={{ height: '100%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', padding: '0 12px' }}>
              Preview will appear here
            </span>
          </div>
        ) : (
          <iframe ref={iframeRef} srcDoc={preparedHtml}
            sandbox="allow-same-origin" title="Email preview mobile"
            onLoad={handleLoad}
            style={{ width: LOGICAL, height: naturalH, border: 'none', display: 'block',
                     transform: `scale(${scale})`, transformOrigin: 'top left' }} />
        )}
      </div>
    );
  }

  /* ── DESKTOP ─────────────────────────────────────────────────────────── */
  const LOGICAL = 640;
  const cw      = containerWidth || LOGICAL;
  const scale   = cw / LOGICAL;
  const naturalH = iframeContentHeight || 480;
  const scaledH  = Math.round(naturalH * scale);
  const wrapperH = Math.min(scaledH, 560);
  const needsScroll = scaledH > 560;

  return (
    <div ref={wrapperRef} style={{ flex: '1 1 0', minWidth: 0 }}>
      {/* Subject / To header */}
      {(subject || customerEmail) && (
        <div style={{ fontSize: 11, marginBottom: 6, lineHeight: 1.6 }}>
          {subject    && <div style={{ fontWeight: 700, color: '#111827' }}>{subject}</div>}
          {customerEmail && <div style={{ color: '#6b7280' }}>To: {customerEmail}</div>}
        </div>
      )}

      {loading ? (
        <_PreviewPlaceholder height={200}>Loading preview…</_PreviewPlaceholder>
      ) : !html && templateMode ? (
        <_PreviewPlaceholder>Select a template to see the preview</_PreviewPlaceholder>
      ) : !html ? (
        <_PreviewPlaceholder>Preview appears as you type</_PreviewPlaceholder>
      ) : (
        <div style={{ overflowY: needsScroll ? 'scroll' : 'hidden', overflowX: 'hidden',
                      border: '1px solid #E2E5EB', borderRadius: 8, height: wrapperH }}>
          {/* Spacer sized to scaled content height so scroll distance is correct. */}
          <div style={{ position: 'relative', height: scaledH }}>
            <iframe ref={iframeRef} srcDoc={preparedHtml}
              sandbox="allow-same-origin" title="Email preview desktop"
              onLoad={handleLoad}
              style={{ position: 'absolute', top: 0, left: 0,
                       width: LOGICAL, height: naturalH,
                       border: 'none', display: 'block',
                       transform: `scale(${scale})`, transformOrigin: 'top left' }} />
          </div>
        </div>
      )}

      {warnings?.length > 0 && (
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
          {Array.isArray(warnings) ? warnings.join(' · ') : warnings}
        </div>
      )}
    </div>
  );
}
