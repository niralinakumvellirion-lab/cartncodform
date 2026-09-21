// Shared between Customers.jsx (list) and CustomerDetail.jsx.

export const DS = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '24px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    padding: '20px 24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    marginBottom: 16,
  },
  cardFlat: {
    background: '#ffffff',
    border: '1px solid #f0f0f0',
    borderRadius: 14,
    padding: '20px 24px',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#0f0f0f',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    margin: '4px 0 0',
    fontWeight: 400,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 10,
  },
  primary: '#4f46e5',
  primaryLight: '#eef2ff',
  success: '#16a34a',
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  gray900: '#111827',
  btnPrimary: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #e5e7eb',
    borderRadius: 9,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

// --- Stage badge + reach icons, redesigned (see
// audits/customers-ui-redesign-audit.txt). Replaces the old
// getStageLabel/getStageBg/getStageColor helpers and the 3 emoji
// spans, used by both the desktop and mobile row renders below.
//
// NOTE ON TWO REAL BUGS FOUND IN THE GIVEN StageBadge CODE, FIXED HERE:
//  1. `const orders = customer.orders || 0` then `orders > 1` /
//     `orders === 1` — but a profile's `orders` field is an OBJECT
//     ({ count, ltv }), never a plain number (confirmed throughout
//     this file's own pre-existing code: p.orders?.count,
//     p.orders?.ltv). `orders > 1` on an object coerces via
//     Object.prototype.toString -> "[object Object]" -> NaN, so that
//     comparison (and orders === 1) would ALWAYS be false — "Repeat
//     buyer" and "Bought once" would never render for ANY customer,
//     no matter how many orders they have. Fixed to read
//     customer.orders?.count.
//  2. `customer.stage === 'lapsing'` — this file's own STAGE_CONFIG
//     (still defined above, now otherwise unused) and every other
//     stage check in this codebase use the PROFILE STAGE value
//     'lapsed', not 'lapsing' ('lapsing' is a SIGNAL TYPE elsewhere
//     in this app — a different enum). 'lapsing' would never match a
//     real profile.stage value, so the "Going quiet" branch would
//     never fire; every non-buying, no-cart profile would show
//     "Visitor" even if actually lapsed. Fixed to check 'lapsed'.
export function StageBadge({ customer }) {
  const orders = customer.orders?.count || 0;
  const hasCart = customer.identifiers?.cartTokens?.length > 0;

  let label, color, bg;
  if (orders > 1) {
    label = 'Repeat buyer'; color = '#16a34a'; bg = '#dcfce7';
  } else if (orders === 1) {
    label = 'Bought once'; color = '#2563eb'; bg = '#dbeafe';
  } else if (hasCart) {
    label = 'Has cart'; color = '#d97706'; bg = '#fef3c7';
  } else {
    label = customer.stage === 'lapsed' ? 'Going quiet' : 'Visitor';
    color = '#6b7280'; bg = '#f3f4f6';
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      color,
      background: bg,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export function ReachIcons({ customer }) {
  const hasPush = customer.channels?.push?.subscribed;
  const hasEmail = !!customer.channels?.email?.address;
  const hasPhone = customer.identifiers?.phones?.length > 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Push bell */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={hasPush ? '#4f46e5' : '#d1d5db'} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        title="Push subscriber">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      {/* Email */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={hasEmail ? '#4f46e5' : '#d1d5db'} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        title="Email subscriber">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2
          2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
      {/* Phone */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={hasPhone ? '#4f46e5' : '#d1d5db'} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        title="Phone">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0
          0 1-8.63-3.07A19.5 19.5 0 0 1 4.69
          12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1
          3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361
          1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91
          8.77a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0
          0 1 2.11-.45c.907.339 1.85.573 2.81.7A2
          2 0 0 1 22 16.92z"/>
      </svg>
    </div>
  );
}
