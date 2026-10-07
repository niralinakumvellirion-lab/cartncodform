'use client';
import { useState, useRef, useCallback } from 'react';

const MAX_BYTES = 7 * 1024 * 1024; // 7 MB — safe ceiling given global body parser limit
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Could not read file'));
    fr.readAsDataURL(file);
  });
}

function qualityLabel(w) {
  if (!w) return null;
  if (w < 800) return { text: 'Low resolution — may look blurry', color: '#b45309', bg: '#fef3c7' };
  if (w < 1100) return { text: 'Acceptable resolution', color: '#374151', bg: '#f3f4f6' };
  return { text: 'Good resolution', color: '#166534', bg: '#f0fdf4' };
}

export default function PhotoCard({ draft, uploading, photoError, onUpload, onRemove, onClearError }) {
  const [dragging, setDragging] = useState(false);
  const [localThumb, setLocalThumb] = useState(null);
  const [localFile, setLocalFile] = useState(null); // { name, width, height }
  const inputRef = useRef(null);

  const hasPhoto = !!(localThumb || draft.imageUrl);
  const thumbSrc = localThumb || draft.imageUrl;
  const qual = qualityLabel(localFile ? localFile.width : draft.imgW);

  async function handleFile(file) {
    if (!file) return;
    onClearError();
    if (!ACCEPT.includes(file.type)) {
      onUpload(null, null, 'Only JPEG, PNG, or WebP images are accepted.');
      return;
    }
    if (file.size > MAX_BYTES) {
      onUpload(null, null, `Image is too large. Maximum is ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`);
      return;
    }
    let dataUrl;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      onUpload(null, null, 'Could not read the selected file.');
      return;
    }
    // Show local thumbnail immediately
    const img = new window.Image();
    img.onload = () => {
      setLocalThumb(dataUrl);
      setLocalFile({ name: file.name, width: img.naturalWidth, height: img.naturalHeight });
      onUpload(dataUrl, file);
    };
    img.onerror = () => {
      setLocalThumb(dataUrl);
      setLocalFile({ name: file.name, width: null, height: null });
      onUpload(dataUrl, file);
    };
    img.src = dataUrl;
  }

  function handleInputChange(e) {
    handleFile(e.target.files && e.target.files[0]);
    e.target.value = '';
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  }, []);

  function handleRemove() {
    setLocalThumb(null);
    setLocalFile(null);
    if (inputRef.current) inputRef.current.value = '';
    onRemove();
  }

  const tagStyle = hasPhoto
    ? { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }
    : { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Offer photo</span>
        <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 8px', ...tagStyle }}>
          {hasPhoto ? 'Added' : 'Needed'}
        </span>
      </div>

      {!hasPhoto && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current && inputRef.current.click()}
          style={{
            border: `2px dashed ${dragging ? '#4f46e5' : '#d1d5db'}`,
            borderRadius: 10, padding: '24px 16px', textAlign: 'center',
            cursor: 'pointer', background: dragging ? '#f0f0ff' : '#fafafa',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 6, lineHeight: 1 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>
            Drop photo here or click to choose
          </p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
            JPEG, PNG or WebP · max 7 MB · min 1100 px wide recommended
          </p>
        </div>
      )}

      {hasPhoto && (
        <div>
          {/* Checkerboard backdrop for transparency */}
          <div style={{
            background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 0 0 / 16px 16px',
            borderRadius: 8, overflow: 'hidden', marginBottom: 10, position: 'relative',
          }}>
            {uploading && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, color: '#4f46e5',
              }}>
                Uploading…
              </div>
            )}
            <img
              src={thumbSrc}
              alt="Offer photo"
              style={{ display: 'block', width: '100%', maxHeight: 200, objectFit: 'contain' }}
            />
          </div>

          {localFile && (
            <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 6px' }}>
              {localFile.name}
              {localFile.width ? ` · ${localFile.width}×${localFile.height}` : ''}
            </p>
          )}
          {!localFile && draft.imgW && (
            <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 6px' }}>
              {draft.imgW}×{draft.imgH}
            </p>
          )}

          {qual && (
            <p style={{ fontSize: 11, margin: '0 0 10px', padding: '3px 8px', borderRadius: 6, background: qual.bg, color: qual.color, display: 'inline-block' }}>
              {qual.text}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => inputRef.current && inputRef.current.click()}
              disabled={uploading}
              style={{
                background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb',
                borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Replace
            </button>
            <button
              onClick={handleRemove}
              disabled={uploading}
              style={{
                background: 'none', color: '#9ca3af', border: '1px solid #e5e7eb',
                borderRadius: 8, padding: '5px 12px', fontSize: 11, cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {photoError && (
        <p style={{ fontSize: 12, color: '#dc2626', margin: '10px 0 0' }}>{photoError}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
    </div>
  );
}
