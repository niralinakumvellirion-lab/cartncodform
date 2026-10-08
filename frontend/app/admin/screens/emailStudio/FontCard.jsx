'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import _eng from '../../lib/emailEngine';

const { FONT_ORDER, FONTS } = _eng || {};

const CARD_STYLE = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 12 };
const LABEL_STYLE = { fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' };

function fontName(key) {
  const f = FONTS && FONTS[key];
  return f ? f.n : key;
}

function fontStack(key) {
  const f = FONTS && FONTS[key];
  return f ? f.st : 'inherit';
}

function FontPopover({ id, label, value, onChange, headingOnly }) {
  const [open, setOpen] = useState(false);
  const btnRef  = useRef(null);
  const popRef  = useRef(null);
  const effectiveVal = value || 'arial';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (popRef.current && !popRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Keyboard nav inside popover
  const handleKeyDown = useCallback((e) => {
    if (!open) return;
    const pop = popRef.current;
    if (!pop) return;
    const opts = Array.from(pop.querySelectorAll('[role="option"]'));
    const cur  = pop.querySelector('[aria-selected="true"]') || opts[0];
    let next = null;

    if (e.key === 'ArrowDown') { next = opts[opts.indexOf(cur) + 1] || opts[0]; }
    else if (e.key === 'ArrowUp') { next = opts[opts.indexOf(cur) - 1] || opts[opts.length - 1]; }
    else if (e.key === 'Home') { next = opts[0]; }
    else if (e.key === 'End')  { next = opts[opts.length - 1]; }
    else if (e.key === 'Enter' || e.key === ' ') {
      if (cur) { onChange(cur.dataset.value); setOpen(false); }
      e.preventDefault(); return;
    } else if (e.key === 'Escape') { setOpen(false); btnRef.current && btnRef.current.focus(); return; }
    else return;

    e.preventDefault();
    if (next) { next.focus(); next.scrollIntoView({ block: 'nearest' }); }
  }, [open, onChange]);

  const allFonts = FONT_ORDER || [];
  const fonts = headingOnly ? allFonts : allFonts.filter(k => !(FONTS && FONTS[k] && FONTS[k].head));

  return (
    <div style={{ position: 'relative', marginBottom: 10 }} onKeyDown={handleKeyDown}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <button
        ref={btnRef}
        id={id + '-btn'}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id + '-pop'}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px', fontSize: 13, border: '1.5px solid #d1d5db', borderRadius: 8,
          background: '#fff', cursor: 'pointer', outline: 'none',
          borderColor: open ? '#4f46e5' : '#d1d5db',
        }}
      >
        <span>
          <small style={{ display: 'block', fontSize: 10, color: '#9ca3af', marginBottom: 1 }}>{label}</small>
          <span style={{ fontFamily: fontStack(effectiveVal) }}>{fontName(effectiveVal)}</span>
          {!value && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>(auto)</span>}
        </span>
        <span aria-hidden="true" style={{ fontSize: 10, color: '#6b7280' }}>▾</span>
      </button>

      {open && (
        <div
          ref={popRef}
          id={id + '-pop'}
          role="listbox"
          aria-labelledby={id + '-btn'}
          style={{
            position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0,
            background: '#fff', border: '1.5px solid #d1d5db', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 280, overflowY: 'auto',
            marginTop: 2, padding: '4px 0',
          }}
        >
          {/* Auto option */}
          <div
            role="option"
            tabIndex={0}
            data-value=""
            aria-selected={!value}
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: !value ? '#eef2ff' : 'transparent',
              color: !value ? '#4f46e5' : '#374151',
              outline: 'none',
            }}
          >
            Auto (arial)
          </div>
          {fonts.map(k => {
            const sel = effectiveVal === k && !!value;
            return (
              <div
                key={k}
                role="option"
                tabIndex={0}
                data-value={k}
                aria-selected={sel}
                onClick={() => { onChange(k); setOpen(false); }}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  background: sel ? '#eef2ff' : 'transparent',
                  color: sel ? '#4f46e5' : '#111827',
                  fontFamily: fontStack(k), fontSize: 13,
                  outline: 'none',
                }}
              >
                {fontName(k)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FontCard({ draft, setDraftField, saveError, bare }) {
  const hFontErr = saveError && typeof saveError === 'object' && saveError.field === 'hFont' ? saveError.error : null;
  const bFontErr = saveError && typeof saveError === 'object' && saveError.field === 'bFont' ? saveError.error : null;

  const inner = (
    <>
      {!bare && <p style={LABEL_STYLE}>Fonts</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <FontPopover
            id="hfont"
            label="Heading font"
            value={draft.hFont}
            onChange={v => setDraftField('hFont', v || null)}
            headingOnly={true}
          />
          {hFontErr && <p style={{ fontSize: 11, color: '#dc2626', margin: '-4px 0 6px' }}>{hFontErr}</p>}
        </div>
        <div>
          <FontPopover
            id="bfont"
            label="Body font"
            value={draft.bFont}
            onChange={v => setDraftField('bFont', v || null)}
            headingOnly={false}
          />
          {bFontErr && <p style={{ fontSize: 11, color: '#dc2626', margin: '-4px 0 6px' }}>{bFontErr}</p>}
        </div>
      </div>

      {/* Radius toggle */}
      <div style={{ marginTop: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Corner style</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['round', 'Rounded'], ['sharp', 'Sharp']].map(([k, label]) => {
            const isOn = (draft.radius || 'round') === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={isOn}
                onClick={() => setDraftField('radius', k)}
                style={{
                  padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none',
                  borderRadius: k === 'round' ? 999 : 4,
                  border: isOn ? '2px solid #4f46e5' : '1.5px solid #e5e7eb',
                  background: isOn ? '#eef2ff' : '#f9fafb',
                  color: isOn ? '#4f46e5' : '#374151',
                }}
              >
                {label}
              </button>
            );
          })}
          {draft.radius && (
            <button
              type="button"
              onClick={() => setDraftField('radius', null)}
              style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 20, cursor: 'pointer', outline: 'none', background: '#f3f4f6', color: '#374151', border: '1.5px solid #e5e7eb' }}
            >
              Auto
            </button>
          )}
        </div>
      </div>
    </>
  );

  return bare ? inner : <div style={CARD_STYLE}>{inner}</div>;
}
