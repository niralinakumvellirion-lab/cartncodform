// en-IN numbers with tabular figures (CSS class handles tabular-nums, this
// just formats the value).
export function fmtNumber(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN').format(Number(n));
}

// Push delivery rate.
// rateLast7d is computed in backend/services/pushHygiene.js as
//   deliveredLast7d / attemptedLast7d
// It is always a 0-1 float (or 0 when no attempts). Multiply by 100 to display.
export function fmtDeliveryRate(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return `${Math.round(Number(n) * 100)}%`;
}

// Relative time without an external library.
export function relativeTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)  return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30)   return `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12)  return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// Full, human-readable date string for title attributes.
export function fmtDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// Action code → plain English sentence for the audit history tab.
const ACTION_LABELS = {
  login:              'signed in',
  login_refused:      'sign-in was refused',
  shopper_revealed:   "revealed one shopper's contact details",
  shoppers_listed:    'viewed the shoppers list',
  store_report:       'downloaded the store report',
  store_opened:       'opened this store',
  store_suspended:    'suspended this store',
  store_unsuspended:  'unsuspended this store',
  staff_added:        'added a staff member',
  staff_role_changed: "changed a staff member's role",
  staff_deactivated:  'deactivated a staff member',
  staff_reactivated:  'reactivated a staff member',
};

export function auditActionLabel(action) {
  return ACTION_LABELS[action] ?? action;
}

// Status helpers.
export function statusLabel(status) {
  if (status === 'needs_reconnect') return 'Needs reconnect';
  if (status === 'suspended')       return 'Suspended';
  return 'Active';
}

export function statusDotClass(status) {
  if (status === 'needs_reconnect') return 'bg-[#C98A0B]';
  if (status === 'suspended')       return 'bg-[#B3261E]';
  return 'bg-[#1F8A5B]';
}
