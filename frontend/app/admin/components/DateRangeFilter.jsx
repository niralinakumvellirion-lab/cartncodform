'use client';

export const DATE_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

export function getDateRange(f) {
  const to = new Date();
  const from = new Date();
  if (f === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (f === 'yesterday') {
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    to.setDate(to.getDate() - 1);
    to.setHours(23, 59, 59, 999);
  } else if (f === '7d') {
    from.setDate(from.getDate() - 7);
  } else if (f === '30d') {
    from.setDate(from.getDate() - 30);
  } else {
    // 'all' or 'custom': no date bounds; caller passes from/to as null
    return { from: null, to: null };
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

// Matches an incoming ISO from/to pair against a DATE_FILTERS key.
// Returns the matching key, or null if nothing matches (caller treats as 'custom').
export function matchDatePreset(fromISO, toISO) {
  if (!fromISO || !toISO) return null;
  const now = new Date();
  const fromDate = new Date(fromISO).toISOString().slice(0, 10);
  const toDate = new Date(toISO).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const offset = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  if (fromDate === today && toDate === today) return 'today';
  if (fromDate === offset(-1) && toDate === offset(-1)) return 'yesterday';
  if (fromDate === offset(-7) && toDate === today) return '7d';
  if (fromDate === offset(-30) && toDate === today) return '30d';
  return null;
}

/**
 * Segmented pill date-range control matching the admin's inline-style language.
 *
 * Props:
 *   value        — a DATE_FILTERS key, or 'custom' when no preset matches
 *   onChange     — called with a DATE_FILTERS key when a preset pill is clicked
 *   customLabel  — label shown in the active pill when value === 'custom'
 *   showAllTime  — include the "All time" pill (default true)
 */
export default function DateRangeFilter({ value, onChange, customLabel, showAllTime = true }) {
  const filters = showAllTime
    ? DATE_FILTERS
    : DATE_FILTERS.filter((f) => f.key !== 'all');

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        background: '#f3f4f6',
        borderRadius: 8,
        flexWrap: 'wrap',
      }}
    >
      {/* Custom range pill — shown only when value==='custom', non-interactive */}
      {value === 'custom' && (
        <button
          type="button"
          disabled
          style={{
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            borderRadius: 6,
            cursor: 'default',
            background: '#4f46e5',
            color: '#fff',
            opacity: 1,
          }}
        >
          {customLabel || 'Custom range'}
        </button>
      )}
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            background: value === f.key ? '#4f46e5' : 'transparent',
            color: value === f.key ? '#fff' : '#6b7280',
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
