// Pure formatting helpers for the Finance screen.
// No imports — safe to unit-test with plain node.

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** '$9.99' from 9.99 */
export function fmtMoney(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return `$${Number(n).toFixed(2)}`;
}

/** '+$9.99' / '-$9.99' / '$0.00' */
export function fmtSignedMoney(n) {
  if (n == null || isNaN(Number(n))) return '—';
  const v = Number(n);
  const abs = Math.abs(v).toFixed(2);
  if (v > 0) return `+$${abs}`;
  if (v < 0) return `-$${abs}`;
  return `$0.00`;
}

/** '2024-06' → 'Jun 2024' */
export function fmtMonthLabel(m) {
  if (!m || typeof m !== 'string') return '';
  const parts = m.split('-');
  const yr  = parts[0];
  const mo  = parseInt(parts[1], 10);
  if (isNaN(mo) || mo < 1 || mo > 12) return m;
  return `${MONTHS[mo - 1]} ${yr}`;
}

/** Compact date 'Jun 15 2024' from an ISO string or Date */
export function fmtShortDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
