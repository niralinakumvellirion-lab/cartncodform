'use client';
import { useState } from 'react';
import { PALETTE, COLORS, brandShades } from './palette';
import _eng from '../../lib/emailEngine';

const { bgDefaults, DEFAULT_LAYOUT_BY_TYPE } = _eng || {};

const CARD_STYLE = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 12 };
const LABEL_STYLE = { fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' };
const SUB_LABEL_STYLE = { fontSize: 11, fontWeight: 700, color: '#6b7280', margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' };

function Swatch({ color, name, active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={name || color}
      onClick={onClick}
      style={{
        width: 28, height: 28,
        borderRadius: 6,
        border: active ? '2.5px solid #4f46e5' : '1.5px solid rgba(0,0,0,.12)',
        background: color,
        cursor: 'pointer',
        outline: 'none',
        flexShrink: 0,
        boxShadow: active ? '0 0 0 2px #fff, 0 0 0 4px #4f46e5' : 'none',
        transition: 'box-shadow .1s',
      }}
    />
  );
}

function PaletteGrid({ label, value, onPick, allowAuto, autoLabel }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 10 }}>
      <p style={SUB_LABEL_STYLE}>{label}</p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        {allowAuto && (
          <button
            type="button"
            aria-pressed={value === null}
            onClick={() => onPick(null)}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 20, cursor: 'pointer',
              background: value === null ? '#4f46e5' : '#f3f4f6',
              color: value === null ? '#fff' : '#374151',
              border: value === null ? 'none' : '1.5px solid #e5e7eb',
              outline: 'none',
            }}
          >
            {autoLabel || 'Auto'}
          </button>
        )}
        {value && (
          <Swatch color={value} active={true} onClick={() => {}} name="Current" />
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
            background: '#f3f4f6', color: '#374151', border: '1.5px solid #e5e7eb', outline: 'none',
          }}
        >
          {open ? 'Close palette' : 'Pick colour'}
        </button>
      </div>

      {open && (
        <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' }}>
          {PALETTE.map(group => (
            <div key={group.g} style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{group.g}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {group.c.map(([name, hex]) => (
                  <Swatch key={hex} color={hex} name={name} active={value === hex} onClick={() => { onPick(hex); setOpen(false); }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ColourCard({ draft, setDraftField, store, saveError, bare }) {
  const effectiveColor = draft.color || (store && store.primaryColor) || '#4f46e5';
  const shades = brandShades(effectiveColor);

  const effectiveLayout = draft.layout || (DEFAULT_LAYOUT_BY_TYPE && DEFAULT_LAYOUT_BY_TYPE[draft.type]) || 'letter';
  const defaults = bgDefaults ? bgDefaults(effectiveLayout, effectiveColor) : { page: '#f2f2f4', card: '#ffffff' };

  const colorErr  = saveError && typeof saveError === 'object' && saveError.field === 'color'  ? saveError.error : null;
  const pageBgErr = saveError && typeof saveError === 'object' && saveError.field === 'pageBg' ? saveError.error : null;
  const cardBgErr = saveError && typeof saveError === 'object' && saveError.field === 'cardBg' ? saveError.error : null;

  const inner = (
    <>
      {!bare && <p style={LABEL_STYLE}>Colour</p>}

      {/* Brand colour */}
      <p style={SUB_LABEL_STYLE}>Brand colour</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        {COLORS.map(hex => (
          <Swatch key={hex} color={hex} active={effectiveColor === hex} onClick={() => setDraftField('color', hex)} name={hex} />
        ))}
        <label title="Custom colour" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="color"
            value={effectiveColor}
            onChange={e => setDraftField('color', e.target.value)}
            style={{ width: 28, height: 28, padding: 0, border: '1.5px solid rgba(0,0,0,.12)', borderRadius: 6, cursor: 'pointer', outline: 'none', background: 'none' }}
          />
        </label>
        {draft.color && (
          <button
            type="button"
            onClick={() => setDraftField('color', null)}
            style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 20, cursor: 'pointer', background: '#f3f4f6', color: '#374151', border: '1.5px solid #e5e7eb', outline: 'none' }}
          >
            Auto
          </button>
        )}
      </div>
      {!draft.color && (
        <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 6px' }}>Using store brand colour ({effectiveColor})</p>
      )}
      {colorErr && <p style={{ fontSize: 11, color: '#dc2626', margin: '0 0 6px' }}>{colorErr}</p>}

      {/* Brand shades (tints of effective colour) */}
      {shades.length > 0 && (
        <>
          <p style={SUB_LABEL_STYLE}>Shades of brand colour</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {shades.map(({ name, value }) => (
              <Swatch key={value} color={value} name={name}
                active={draft.pageBg === value || draft.cardBg === value}
                onClick={() => {}} />
            ))}
          </div>
        </>
      )}

      {/* Page background */}
      <PaletteGrid
        label={`Page background (auto: ${defaults.page})`}
        value={draft.pageBg}
        onPick={v => setDraftField('pageBg', v)}
        allowAuto
        autoLabel="Auto"
      />
      {pageBgErr && <p style={{ fontSize: 11, color: '#dc2626', margin: '-4px 0 6px' }}>{pageBgErr}</p>}

      {/* Card background */}
      <PaletteGrid
        label={`Card background (auto: ${defaults.card})`}
        value={draft.cardBg}
        onPick={v => setDraftField('cardBg', v)}
        allowAuto
        autoLabel="Auto"
      />
      {cardBgErr && <p style={{ fontSize: 11, color: '#dc2626', margin: '-4px 0 6px' }}>{cardBgErr}</p>}

      {/* Show logo toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          role="switch"
          aria-checked={!!draft.showLogo}
          onClick={() => setDraftField('showLogo', !draft.showLogo)}
          style={{
            width: 36, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer', outline: 'none', flexShrink: 0,
            background: draft.showLogo ? '#4f46e5' : '#d1d5db',
            position: 'relative', transition: 'background .15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: draft.showLogo ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left .15s',
          }} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Show store logo</span>
        {draft.showLogo && store && !store.logoUrl && (
          <span style={{ fontSize: 11, color: '#b45309' }}>No logo set in store settings</span>
        )}
      </div>
    </>
  );

  return bare ? inner : <div style={CARD_STYLE}>{inner}</div>;
}
