'use client';

import { useState, useEffect } from 'react';
import { apiGet } from '../../../lib/api';
import { ShimmerRow, ShimmerTable } from '../components/Shimmer';

// Inline SVG icons for the summary tiles — matching Today.jsx's icon set
// (same paths/viewBox), replacing the emoji previously used here.
const CartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="#6366f1" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/>
    <circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);

const CreditCardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="#6366f1" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="#6366f1" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const RepeatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="#6366f1" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>
);

const FILTER_TABS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Custom' },
];

// Same 4 event types as the Today screen's tiles (Phase 3) — kept in sync
// so a merchant recognizes the same icons in both places. `color` is now
// only used for the active-tile border highlight (see the SUMMARY TILES
// JSX below) — the tile's count no longer uses it, per this task.
const ACTIVITY_TYPES = [
  { key: 'add_to_cart', Icon: CartIcon, label: 'Added to cart', color: '#f59e0b' },
  { key: 'checkout_start', Icon: CreditCardIcon, label: 'Started checkout', color: '#8b5cf6' },
  { key: 'purchase', Icon: CheckCircleIcon, label: 'Purchased', color: '#10b981' },
  { key: 'revisit', Icon: RepeatIcon, label: 'Revisited', color: '#3b82f6' },
];

// Table/card activity badge — same colors as ACTIVITY_TYPES above, but the
// task specified slightly different label wording for this badge
// ("Checkout started" vs. the tile's "Started checkout"), used verbatim.
const BADGE_CONFIG = {
  add_to_cart: { icon: '🛒', label: 'Added to cart', color: '#f59e0b' },
  checkout_start: { icon: '💳', label: 'Checkout started', color: '#8b5cf6' },
  purchase: { icon: '✅', label: 'Purchased', color: '#10b981' },
  revisit: { icon: '🔁', label: 'Revisited', color: '#3b82f6' },
};

const GRID_COLS = '2fr 1.5fr 1.3fr 1.5fr';

function getDateRange(f) {
  const to = new Date();
  const from = new Date();
  if (f === 'today') { from.setHours(0, 0, 0, 0); }
  else if (f === 'yesterday') {
    from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0);
    to.setDate(to.getDate() - 1); to.setHours(23, 59, 59, 999);
  }
  else if (f === '7d') { from.setDate(from.getDate() - 7); }
  else if (f === '30d') { from.setDate(from.getDate() - 30); }
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDateTime(ts) {
  const d = new Date(ts);
  const datePart = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart}, ${timePart}`;
}

export default function ActivityScreen({ shop }) {
  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [filter, setFilter] = useState('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeType, setActiveType] = useState(null); // null = show all

  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shop) return;

    const { from, to } = filter === 'custom'
      ? { from: customFrom, to: customTo }
      : getDateRange(filter);

    if (filter === 'custom' && (!customFrom || !customTo)) return;

    let cancelled = false;
    setLoading(true);

    // Collapsed onto one line — the task's given template literal wrapped
    // across two source lines with a bare newline between `&to=${to}` and
    // the eventType part, which would embed a literal "\n" inside the URL.
    let url = `/api/activity?shop=${encodeURIComponent(shop)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    if (activeType) url += `&eventType=${encodeURIComponent(activeType)}`;

    apiGet(url)
      .then((data) => {
        if (cancelled) return;
        setActivity(data);
      })
      .catch(() => {
        if (cancelled) return;
        setActivity(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [shop, filter, customFrom, customTo, activeType]);

  const users = activity?.users || [];
  const summary = activity?.summary || {};

  return (
    <div
      style={{
        padding: isMobileView ? '0 12px 24px' : '0 24px 24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      {/* 1. HEADER */}
      <div style={{ marginBottom: '16px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 4px',
          }}
        >
          Activity
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          Users who engaged after receiving a notification
        </p>
      </div>

      {/* 2. DATE FILTER BAR */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          alignItems: isMobileView ? 'flex-start' : 'center',
          flexDirection: isMobileView ? 'column' : 'row',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            width: isMobileView ? '100%' : 'auto',
            overflowX: 'auto',
            paddingBottom: '4px',
            WebkitOverflowScrolling: 'touch',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
          }}
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: filter === tab.key ? '600' : '400',
                color: filter === tab.key ? '#111827' : '#6b7280',
                background: filter === tab.key ? '#fff' : 'transparent',
                border:
                  filter === tab.key
                    ? '1px solid #d1d5db'
                    : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filter === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{
                padding: '7px 10px',
                fontSize: '13px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                outline: 'none',
                background: '#fff',
                color: '#374151',
              }}
            />
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{
                padding: '7px 10px',
                fontSize: '13px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                outline: 'none',
                background: '#fff',
                color: '#374151',
              }}
            />
          </div>
        )}
      </div>

      {/* 3. SUMMARY TILES */}
      {loading ? (
        <div style={{ marginBottom: '20px' }}>
          <ShimmerRow cols={isMobileView ? 2 : 4} />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {ACTIVITY_TYPES.map(({ key, label, Icon, color }) => {
            const active = activeType === key;
            return (
              <div
                key={key}
                onClick={() => setActiveType(active ? null : key)}
                style={{
                  background: '#fff',
                  border: active ? `2px solid ${color}` : '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ marginBottom: '6px' }}><Icon /></div>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: '800',
                    color: '#111827',
                    lineHeight: 1,
                  }}
                >
                  {summary?.[key] ?? 0}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                  {label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. TABLE / CARD LIST */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        {/* Table header — desktop only */}
        {!isMobileView && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID_COLS,
              padding: '10px 16px',
              borderBottom: '1px solid #f3f4f6',
              background: '#f9fafb',
            }}
          >
            {['Email', 'Activity', 'Notification sent', 'Date & Time'].map((h) => (
              <div
                key={h}
                style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {h}
              </div>
            ))}
          </div>
        )}

        {/* Rows */}
        {loading ? (
          <ShimmerTable rows={6} />
        ) : users.length ? (
          users.map((u, i) => {
            const badge = BADGE_CONFIG[u.eventType] || {
              icon: '•',
              label: u.eventType,
              color: '#6b7280',
            };
            const jobIdShort = u.jobId ? String(u.jobId).slice(0, 8) : 'Unknown';
            const emailDisplay = u.email || 'Anonymous';
            const when = formatDateTime(u.ts);

            const badgeEl = (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '500',
                  background: badge.color + '22',
                  color: badge.color,
                }}
              >
                {badge.icon} {badge.label}
              </span>
            );

            if (isMobileView) {
              return (
                <div
                  key={`${u.jobId || 'nojob'}-${u.sessionId || 'nosession'}-${i}`}
                  style={{
                    padding: '14px 16px',
                    borderBottom: i < users.length - 1 ? '1px solid #f9fafb' : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                      {emailDisplay}
                    </div>
                    {badgeEl}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px',
                      color: '#9ca3af',
                    }}
                  >
                    <span>Notification: {jobIdShort}</span>
                    <span>{when}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${u.jobId || 'nojob'}-${u.sessionId || 'nosession'}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_COLS,
                  padding: '12px 16px',
                  borderBottom: i < users.length - 1 ? '1px solid #f9fafb' : 'none',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '14px', color: '#111827' }}>{emailDisplay}</div>
                <div>{badgeEl}</div>
                <div style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
                  {jobIdShort}
                </div>
                <div style={{ fontSize: '13px', color: '#374151' }}>{when}</div>
              </div>
            );
          })
        ) : (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              fontSize: '13px',
              color: '#9ca3af',
            }}
          >
            No activity found
          </div>
        )}
      </div>
    </div>
  );
}
