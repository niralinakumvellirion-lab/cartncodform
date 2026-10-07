'use client';
import { TYPE_LABELS, VALID_TYPES, MAX_LEN } from './lib';

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
}) {
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

      {/* Name + type (only when editing) */}
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

          {/* Delete */}
          {selectedId && !confirmDel && (
            <button style={{ ...DS.btnDanger, fontSize: 11, padding: '5px 10px' }} onClick={() => setConfirmDel(true)}>
              Delete template
            </button>
          )}
          {confirmDel && (
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
        </>
      )}
    </div>
  );
}
