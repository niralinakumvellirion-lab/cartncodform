'use client';

import { useState } from 'react';

// Shared mobile/desktop notification-image upload widget — used by both
// the Dashboard editor and the Queue edit modal so the two don't carry
// duplicate copies of this markup/logic. Each side just reads a local
// file into a base64 data: URI via FileReader; there is no client-side
// Cloudinary call anywhere in this app — the backend uploads a data: URI
// to Cloudinary itself at send time (see backend/routes/push.js's
// uploadToCloudinary), so this component only needs to hand the parent a
// data: URI (or an existing https:// URL) string per side.
export function ImageUploadPair({
  mobileImageUrl,
  desktopImageUrl,
  onMobileChange,
  onDesktopChange,
}) {
  const [showImageInfo, setShowImageInfo] = useState(false);

  function readFileAsDataUrl(file, onChange) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Label row with info button */}
      <div style={{ display: 'flex', alignItems: 'center',
                    gap: 6, marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600,
                        color: '#374151' }}>
          Notification Images
        </label>
        <button
          onClick={() => setShowImageInfo(s => !s)}
          style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '1.5px solid #9ca3af', background: 'none',
            color: '#9ca3af', fontSize: 10, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', lineHeight: 1, padding: 0,
            flexShrink: 0,
          }}
          title="Image size guidance"
        >
          i
        </button>
      </div>

      {/* Info tooltip/box */}
      {showImageInfo && (
        <div style={{
          background: '#f0f9ff', border: '1px solid #bae6fd',
          borderRadius: 8, padding: '10px 12px', marginBottom: 10,
          fontSize: 12, color: '#0369a1', lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            📐 Recommended Image Size
          </div>
          <div>• <strong>360 × 180px</strong> — best for all platforms</div>
          <div>• Ratio: <strong>2:1</strong> (wide landscape)</div>
          <div>• Format: <strong>JPG or PNG</strong></div>
          <div>• Max size: <strong>under 1MB</strong></div>
          <div style={{ marginTop: 6, color: '#0284c7', fontSize: 11 }}>
            Tip: Avoid text in the image — it gets cropped on mobile screens.
          </div>
        </div>
      )}

      {/* Two upload boxes side by side. The className (internal-only —
          this component's props/API are unchanged) is a hook for an
          external <600px media query; see QueueScreen.jsx, which injects
          the actual rule once (same pattern as DashboardScreen's own
          one-time <style> injection for its spinner/toast keyframes). */}
      <div className="ccf-upload-pair-grid" style={{ display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10 }}>

        {/* Mobile upload box */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600,
                        color: '#6b7280', marginBottom: 4,
                        textAlign: 'center' }}>
            📱 Mobile
          </div>
          <label style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 4, padding: '12px 8px',
            borderRadius: 8, border: '2px dashed #d1d5db',
            background: mobileImageUrl ? '#f0fdf4' : '#f9fafb',
            cursor: 'pointer', fontSize: 11, color: '#6b7280',
            fontWeight: 500, minHeight: 80,
            boxSizing: 'border-box', width: '100%',
            position: 'relative', overflow: 'hidden',
          }}>
            {mobileImageUrl ? (
              <>
                <img src={mobileImageUrl} alt="mobile"
                  style={{ width: '100%', height: 60,
                           objectFit: 'cover', borderRadius: 6 }} />
                <span style={{ fontSize: 10, color: '#16a34a',
                               fontWeight: 600 }}>✓ Uploaded</span>
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24"
                  fill="none" stroke="#9ca3af" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Upload</span>
              </>
            )}
            <input type="file" accept="image/*"
                   style={{ display: 'none' }}
              onChange={(e) => readFileAsDataUrl(e.target.files?.[0], onMobileChange)}
            />
          </label>
          {mobileImageUrl && (
            <button onClick={() => onMobileChange('')}
              style={{ width: '100%', marginTop: 4, fontSize: 10,
                       color: '#dc2626', background: 'none',
                       border: 'none', cursor: 'pointer', padding: 0,
                       textAlign: 'center' }}>
              Remove
            </button>
          )}
        </div>

        {/* Desktop upload box */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600,
                        color: '#6b7280', marginBottom: 4,
                        textAlign: 'center' }}>
            🖥️ Desktop
          </div>
          <label style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 4, padding: '12px 8px',
            borderRadius: 8, border: '2px dashed #d1d5db',
            background: desktopImageUrl ? '#f0fdf4' : '#f9fafb',
            cursor: 'pointer', fontSize: 11, color: '#6b7280',
            fontWeight: 500, minHeight: 80,
            boxSizing: 'border-box', width: '100%',
            position: 'relative', overflow: 'hidden',
          }}>
            {desktopImageUrl ? (
              <>
                <img src={desktopImageUrl} alt="desktop"
                  style={{ width: '100%', height: 60,
                           objectFit: 'cover', borderRadius: 6 }} />
                <span style={{ fontSize: 10, color: '#16a34a',
                               fontWeight: 600 }}>✓ Uploaded</span>
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24"
                  fill="none" stroke="#9ca3af" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Upload</span>
              </>
            )}
            <input type="file" accept="image/*"
                   style={{ display: 'none' }}
              onChange={(e) => readFileAsDataUrl(e.target.files?.[0], onDesktopChange)}
            />
          </label>
          {desktopImageUrl && (
            <button onClick={() => onDesktopChange('')}
              style={{ width: '100%', marginTop: 4, fontSize: 10,
                       color: '#dc2626', background: 'none',
                       border: 'none', cursor: 'pointer', padding: 0,
                       textAlign: 'center' }}>
              Remove
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
