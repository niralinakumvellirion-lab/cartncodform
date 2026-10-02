'use client';

export default function FilterDropdown({ options, value, onChange, 'aria-label': ariaLabel }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '6px 10px',
        fontSize: 13,
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        background: '#fff',
        color: '#374151',
        cursor: 'pointer',
        minWidth: 160,
        maxWidth: 220,
      }}
    >
      {options.map((opt) => (
        <option key={opt.key} value={opt.key}>{opt.label}</option>
      ))}
    </select>
  );
}
