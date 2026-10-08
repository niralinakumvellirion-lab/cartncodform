'use client';
import { LAYOUT_INFO, WIRE } from './layoutWires';
import _eng from '../../lib/emailEngine';

const { DEFAULT_LAYOUT_BY_TYPE } = _eng || {};

const CARD_STYLE = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 12 };
const LABEL_STYLE = { fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' };

export default function LayoutCard({ draft, setDraftField, saveError, bare }) {
  const effectiveLayout = draft.layout || (DEFAULT_LAYOUT_BY_TYPE && DEFAULT_LAYOUT_BY_TYPE[draft.type]) || 'letter';

  const err = saveError && typeof saveError === 'object' && saveError.field === 'layout'
    ? saveError.error
    : null;

  const inner = (
    <>
      {!bare && <p style={LABEL_STYLE}>Layout</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {LAYOUT_INFO.map(({ k, n, d }) => {
          const isOn = effectiveLayout === k;
          const isAuto = !draft.layout && effectiveLayout === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={isOn}
              title={d}
              onClick={() => setDraftField('layout', k)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                padding: '8px 4px 6px',
                borderRadius: 9,
                border: isOn ? '2px solid #4f46e5' : '1.5px solid #e5e7eb',
                background: isOn ? '#eef2ff' : '#f9fafb',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <svg
                width="64" height="48" viewBox="0 0 64 48"
                style={{ display: 'block', color: isOn ? '#4f46e5' : '#9ca3af' }}
                dangerouslySetInnerHTML={{ __html: WIRE[k] || '' }}
              />
              <span style={{ fontSize: 10, fontWeight: 700, color: isOn ? '#4f46e5' : '#374151', textAlign: 'center', lineHeight: 1.2 }}>
                {n}{isAuto ? ' *' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {!draft.layout && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9ca3af' }}>
          * Default for this template type. Click any layout to override.
        </p>
      )}

      {err && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#dc2626' }}>{err}</p>}
    </>
  );

  return bare ? inner : <div style={CARD_STYLE}>{inner}</div>;
}
