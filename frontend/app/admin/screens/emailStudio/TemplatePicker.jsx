'use client';
import { useRef, useEffect } from 'react';
import { TYPE_LABELS, VALID_TYPES, MAX_LEN } from './lib';

const TYPE_COLORS = {
  special_offer: { bg: '#fef3c7', color: '#92400e' },
  festival:      { bg: '#ede9fe', color: '#5b21b6' },
  normal:        { bg: '#f3f4f6', color: '#374151' },
};

const DS = {
  input: {
    width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db',
    borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#111827',
  },
  label: { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' },
  btnSecondary: {
    background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb',
    borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  btnDanger: {
    background: '#fee2e2', color: '#dc2626', border: 'none',
    borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
};

export default function TemplatePicker({
  templates, selectedId, isNew, filter,
  onFilterChange, onSelect, onNew,
  draft, setDraftField,
  confirmDel, setConfirmDel, onDelete, deleting,
  compact,
}) {
  const selectedCardRef = useRef(null);

  useEffect(() => {
    if (selectedCardRef.current) {
      selectedCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [selectedId, isNew]);

  // eslint-disable-next-line no-unused-vars
  const grouped = VALID_TYPES.reduce((acc, type) => {
    acc[type] = templates.filter(t => t.type === type);
    return acc;
  }, {});

  const FILTER_TABS = [
    { key: 'all', label: 'All' },
    ...VALID_TYPES.map(k => ({ key: k, label: TYPE_LABELS[k] })),
  ];

  const filtered = filter === 'all' ? templates : templates.filter(t => t.type === filter);
  const selectValue = isNew ? '__new__' : (selectedId || '');

  function handleSelectChange(e) {
    const val = e.target.value;
    if (val === '__new__') { onNew(); return; }
    if (!val) return;
    const t = templates.find(t => t._id === val);
    if (t) onSelect(t);
  }

  const showEditor = isNew || !!selectedId;

  // ── COMPACT: visible card strip ────────────────────────────────────────────
  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Row 1: filter chips (left) · + New · Delete (right) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 5, flex: 1, overflow: 'hidden', minWidth: 0 }}>
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onFilterChange(tab.key)}
                style={{
                  flexShrink: 0,
                  padding: '4px 10px', fontSize: 11, fontWeight: 600,
                  borderRadius: 6, cursor: 'pointer',
                  background: filter === tab.key ? '#4f46e5' : '#f3f4f6',
                  color:      filter === tab.key ? '#fff'    : '#374151',
                  border:     filter === tab.key ? 'none'    : '1px solid #e5e7eb',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            style={{ ...DS.btnSecondary, flexShrink: 0, fontSize: 11, padding: '4px 10px' }}
            onClick={onNew}
          >
            + New
          </button>
          {showEditor && selectedId && !confirmDel && (
            <button
              type="button"
              style={{ ...DS.btnDanger, flexShrink: 0, fontSize: 11, padding: '4px 10px' }}
              onClick={() => setConfirmDel(true)}
            >
              Delete
            </button>
          )}
        </div>

        {/* Delete confirmation */}
        {showEditor && confirmDel && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '5px 10px', background: '#fef2f2', borderRadius: 8,
          }}>
            <span style={{ fontSize: 12, color: '#374151' }}>Delete this template?</span>
            <button
              type="button"
              style={{ ...DS.btnDanger, padding: '4px 8px', fontSize: 11 }}
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              type="button"
              style={{ ...DS.btnSecondary, padding: '4px 8px', fontSize: 11 }}
              onClick={() => setConfirmDel(false)}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Row 2: horizontally scrollable template card strip */}
        <div style={{
          display: 'flex', gap: 6,
          overflowX: 'auto', overflowY: 'hidden',
          paddingBottom: 4,
          scrollbarWidth: 'thin',
          WebkitOverflowScrolling: 'touch',
        }}>
          {/* "New template (unsaved)" card — shown when isNew */}
          {isNew && (
            <button
              ref={selectedCardRef}
              type="button"
              aria-pressed={true}
              onClick={onNew}
              style={{
                flexShrink: 0, minWidth: 140,
                padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                border: '2px solid #4f46e5', background: '#eff0fe',
                textAlign: 'left',
              }}
            >
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#4f46e5',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                marginBottom: 2,
              }}>
                New template
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                background: '#e0e7ff', color: '#3730a3',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                unsaved
              </span>
            </button>
          )}

          {/* Empty state */}
          {filtered.length === 0 && !isNew ? (
            <span style={{
              fontSize: 12, color: '#9ca3af',
              padding: '6px 2px', alignSelf: 'center', flexShrink: 0,
            }}>
              No templates match this filter.
            </span>
          ) : filtered.map(t => {
            const isSelected = !isNew && t._id === selectedId;
            const tc = TYPE_COLORS[t.type] || TYPE_COLORS.normal;
            return (
              <button
                key={t._id}
                ref={isSelected ? selectedCardRef : null}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(t)}
                style={{
                  flexShrink: 0, minWidth: 160,
                  padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                  border:      isSelected ? '2px solid #4f46e5' : '1.5px solid #e5e7eb',
                  background:  isSelected ? '#eff0fe'           : '#fff',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  color: isSelected ? '#4f46e5' : '#111827',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  marginBottom: 2,
                }}>
                  {t.name}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                  background: tc.bg, color: tc.color,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {TYPE_LABELS[t.type] || t.type}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── NON-COMPACT: original <select> behaviour (unchanged) ──────────────────

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Filter row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(tab => (
          <button key={tab.key} onClick={() => onFilterChange(tab.key)} style={{
            padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
            background: filter === tab.key ? '#4f46e5' : '#f3f4f6',
            color: filter === tab.key ? '#fff' : '#374151',
            border: filter === tab.key ? 'none' : '1px solid #e5e7eb',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Template select + New button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <select
          style={{ ...DS.input, flex: 1, cursor: 'pointer', minWidth: 0 }}
          value={selectValue}
          onChange={handleSelectChange}
        >
          <option value="">Pick a template…</option>
          {VALID_TYPES.map(type => {
            const group = filter === 'all' ? templates.filter(t => t.type === type) : filtered.filter(t => t.type === type);
            if (!group.length) return null;
            return (
              <optgroup key={type} label={TYPE_LABELS[type]}>
                {group.map(t => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </optgroup>
            );
          })}
          {isNew && <option value="__new__">New template (unsaved)</option>}
        </select>
        <button style={{ ...DS.btnSecondary, flexShrink: 0 }} onClick={onNew}>
          + New
        </button>
      </div>

      {/* Delete confirm */}
      {showEditor && confirmDel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', background: '#fef2f2', borderRadius: 8 }}>
          <span style={{ fontSize: 13, color: '#374151' }}>Delete this template?</span>
          <button style={{ ...DS.btnDanger, padding: '5px 10px', fontSize: 11 }} onClick={onDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button style={{ ...DS.btnSecondary, padding: '5px 10px', fontSize: 11 }} onClick={() => setConfirmDel(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* Name + type (non-compact only, moved to Words tab when compact) */}
      {showEditor && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={DS.label}>Template name</label>
            <input
              style={DS.input}
              value={draft.name}
              maxLength={MAX_LEN.name}
              onChange={e => setDraftField('name', e.target.value)}
              placeholder="e.g. Diwali 2026 sale"
            />
          </div>

          {isNew && (
            <div style={{ marginBottom: 12 }}>
              <label style={DS.label}>Type</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {VALID_TYPES.map(key => (
                  <button
                    key={key}
                    onClick={() => setDraftField('type', key)}
                    style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                      background: draft.type === key ? '#4f46e5' : '#f3f4f6',
                      color: draft.type === key ? '#fff' : '#374151',
                      border: draft.type === key ? 'none' : '1px solid #e5e7eb',
                    }}
                  >
                    {TYPE_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Delete in full mode */}
          {selectedId && !confirmDel && (
            <button style={{ ...DS.btnDanger, fontSize: 11, padding: '5px 10px' }} onClick={() => setConfirmDel(true)}>
              Delete template
            </button>
          )}
        </>
      )}
    </div>
  );
}
