'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../../../lib/api';
import DateRangeFilter, { getDateRange, matchDatePreset, DATE_FILTERS } from '../components/DateRangeFilter';

const DS = {
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

function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start' }}>
        <div>
          <h1 style={DS.pageTitle}>{title}</h1>
          {subtitle && (
            <p style={DS.pageSubtitle}>{subtitle}</p>
          )}
        </div>
        {action && (
          <div style={{ flexShrink: 0, marginTop: 2 }}>{action}</div>
        )}
      </div>
      <div style={{ height: 3, background: 'linear-gradient(90deg, #4f46e5, #818cf8)',
                    borderRadius: 2, marginTop: 12, width: 48 }} />
    </div>
  );
}

const SIGNAL_LABELS = {
  cart_abandon: 'Cart left behind',
  checkout_abandon: 'Checkout left behind',
  browse_abandon: "Looked, didn't add",
  high_intent: 'Keeps coming back',
  price_hesitation: 'Stopped at the price',
  price_drop: 'Price dropped on a saved item',
  back_in_stock: 'Back in stock',
  post_purchase_d3: 'Three days after buying',
  lapsing: 'Going quiet',
  email_capture: 'Ask for an email',
  cod_to_prepaid: 'Offer prepaid on COD',
  winback: 'Been a while',
};

function formatMessageTime(date) {
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const time = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return `${days[d.getDay()]} ${time}`;
}

function getStatusConfig(status, outcome, revenue) {
  if (outcome === 'converted')
    return {
      label: `converted · ₹${(revenue || 0).toLocaleString('en-IN')}`,
      bg: '#dcfce7',
      color: '#16a34a',
      bold: true,
    };
  if (outcome === 'clicked')
    return {
      label: 'clicked',
      bg: '#f3f4f6',
      color: '#374151',
      bold: false,
    };
  if (status === 'skipped')
    return {
      label: 'skipped — bought first',
      bg: 'transparent',
      color: '#9ca3af',
      bold: false,
      italic: true,
    };
  if (status === 'failed')
    return {
      label: 'failed',
      bg: '#fee2e2',
      color: '#dc2626',
      bold: false,
    };
  if (status === 'pending') {
    return {
      label: 'scheduled',
      bg: '#fef9c3',
      color: '#ca8a04',
      bold: false,
      scheduled: true,
    };
  }
  const outcomeMap = {
    opened: { label: 'opened', bg: '#f3f4f6', color: '#374151' },
  };
  return (
    outcomeMap[outcome] || {
      label: status === 'sent' ? 'delivered' : status,
      bg: '#f3f4f6',
      color: '#374151',
      bold: false,
    }
  );
}

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
  { key: 'converted', label: 'Led to a sale' },
];

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <rect width="20" height="16" x="2" y="4" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  );
}

export default function Messages({ shop, initialChannel, initialStatus, initialFrom, initialTo }) {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Seeded from the Dashboard's Push Sent / Emails Sent tiles. 'push'/
  // 'email' now drive a SERVER-side channel filter (see load() below) —
  // previously this whole tab set only ever filtered the single
  // already-fetched page of up to 50 rows client-side, which meant the
  // Push/Email tabs' counts and pagination were wrong whenever there
  // were more than 50 messages total (e.g. 30 push + 30 email: clicking
  // "Push" could show fewer than the true push count, since some push
  // rows might have been pushed off the fetched page by newer email
  // ones). 'converted' stays client-side — the backend has no outcome
  // filter, out of scope here — filtering an already-fetched page for
  // it is the same behaviour as before, just now applied on top of
  // whatever the server-side channel/status/date filter already
  // narrowed down to.
  const [filter, setFilter] = useState(
    initialChannel === 'push' || initialChannel === 'email' ? initialChannel : 'all'
  );
  const [statusParam] = useState(initialStatus || '');
  // Date range filter: try to match the incoming from/to against a named preset
  // so the merchant sees "Last 7 days" highlighted rather than a raw ISO range.
  // matchDatePreset returns null when nothing matches (e.g. the Dashboard sent a
  // precise mid-day timestamp that's a few minutes off the calendar-date boundary) —
  // that case shows a "Custom range" pill so the range is still visible. Clicking
  // any preset pill overrides it and triggers a fresh fetch.
  const initialPreset = matchDatePreset(initialFrom, initialTo);
  const [dateFilter, setDateFilter] = useState(
    initialPreset || (initialFrom ? 'custom' : '7d')
  );

  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!preview) return;
    const onKey = (e) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const load = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setError('');
    try {
      const { from: rangeFrom, to: rangeTo } = dateFilter === 'custom'
        ? { from: initialFrom || null, to: initialTo || null }
        : getDateRange(dateFilter);
      const params = new URLSearchParams({ limit: '50' });
      if (filter === 'push' || filter === 'email') params.set('channel', filter);
      if (statusParam) params.set('status', statusParam);
      if (rangeFrom) params.set('from', rangeFrom);
      if (rangeTo) params.set('to', rangeTo);
      const data = await apiGet(
        `/api/profiles/${encodeURIComponent(shop)}/messages?${params.toString()}`
      );
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setTotal(Number.isFinite(data?.total) ? data.total : 0);
    } catch (err) {
      setError(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [shop, filter, statusParam, dateFilter, initialFrom, initialTo]);

  useEffect(() => {
    load();
  }, [load]);

  // channel is already applied server-side (see load() above); only
  // 'converted' still needs a client-side pass, on whatever page the
  // channel/status/date-filtered fetch returned.
  const filteredMessages = filter === 'converted'
    ? messages.filter((m) => m.outcome === 'converted')
    : messages;

  return (
    <div style={DS.page}>
      <PageHeader
        title="Messages"
        subtitle="Notification history and performance"
      />

      {error && (
        <div
          style={{
            background: DS.dangerLight,
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#b91c1c',
          }}
        >
          {error}
        </div>
      )}

      {/* Date range filter + status context badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <DateRangeFilter
          value={dateFilter}
          onChange={setDateFilter}
          customLabel={
            dateFilter === 'custom' && initialFrom && initialTo
              ? `${new Date(initialFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(initialTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
              : undefined
          }
        />
        {statusParam && (
          <span
            style={{
              fontSize: 12,
              color: '#6b7280',
              background: '#f3f4f6',
              borderRadius: 20,
              padding: '4px 12px',
              flexShrink: 0,
            }}
          >
            {statusParam === 'sent' ? 'Sent only' : statusParam}
          </span>
        )}
      </div>

      {/* Channel / outcome tabs — horizontally scrollable on mobile */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          overflowX: 'auto',
          paddingBottom: '4px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: filter === tab.key ? '600' : '400',
              color: filter === tab.key ? '#111827' : '#6b7280',
              background: '#fff',
              border:
                filter === tab.key ? '2px solid #111827' : '1px solid #e5e7eb',
              borderRadius: '20px',
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Message list */}
      <div
        style={{ ...DS.card, padding: 0, overflow: 'hidden' }}
      >
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                height: '56px',
                borderBottom: '1px solid #f3f4f6',
                display: 'flex',
                alignItems: 'center',
                padding: '0 20px',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '80px',
                  height: '12px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                }}
              />
              <div
                style={{
                  width: '120px',
                  height: '12px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: '12px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                }}
              />
            </div>
          ))
        ) : filteredMessages.length === 0 ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '14px',
            }}
          >
            No messages yet.
          </div>
        ) : (
          filteredMessages.map((m, i) => {
            const profile = m.profileId;
            const identifier =
              profile?.identifiers?.emails?.[0] ||
              profile?.identifiers?.phones?.[0] ||
              `Anonymous #${m.cartToken?.slice(-4) || '????'}`;
            const signalLabel =
              SIGNAL_LABELS[m.signalType] || m.reason || '—';
            const timeStr = formatMessageTime(
              m.sentAt || m.createdAt || m.updatedAt
            );
            const statusCfg = getStatusConfig(
              m.status,
              m.outcome,
              m.recoveredRevenue || 0
            );

            if (isMobileView) {
              return (
                <div
                  key={m._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreview(m)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreview(m); } }}
                  style={{
                    padding: '14px 16px',
                    borderBottom:
                      i < filteredMessages.length - 1
                        ? '1px solid #f9fafb'
                        : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {/* Row 1: time + status */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                      {timeStr}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: statusCfg.bold ? '600' : '400',
                        fontStyle: statusCfg.italic ? 'italic' : 'normal',
                        background: statusCfg.bg,
                        color: statusCfg.color,
                      }}
                    >
                      {statusCfg.scheduled && m.runAt
                        ? `scheduled · ${formatMessageTime(m.runAt)}`
                        : statusCfg.label}
                    </span>
                  </div>
                  {/* Row 2: customer + signal */}
                  <div style={{ marginBottom: '4px' }}>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#111827',
                      }}
                    >
                      {identifier}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#6366f1',
                        marginLeft: '8px',
                      }}
                    >
                      {signalLabel}
                    </span>
                  </div>
                  {/* Row 3: channel icon + message copy */}
                  <div
                    style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}
                  >
                    <span style={{ lineHeight: 0, flexShrink: 0 }}>
                      {m.channel === 'email' ? <EnvelopeIcon /> : <BellIcon />}
                    </span>
                    <span
                      style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.4' }}
                    >
                      {m.payload?.body || m.payload?.title || signalLabel || '—'}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={m._id}
                role="button"
                tabIndex={0}
                onClick={() => setPreview(m)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreview(m); } }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 180px 24px 1fr auto',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px 20px',
                  borderBottom:
                    i < filteredMessages.length - 1
                      ? '1px solid #f9fafb'
                      : 'none',
                  cursor: 'pointer',
                }}
              >
                {/* Time */}
                <div
                  style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {timeStr}
                </div>

                {/* Customer + signal */}
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#111827',
                      marginBottom: '2px',
                    }}
                  >
                    {identifier}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6366f1' }}>
                    {signalLabel}
                  </div>
                </div>

                {/* Channel icon */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {m.channel === 'email' ? <EnvelopeIcon /> : <BellIcon />}
                </div>

                {/* Message copy */}
                <div
                  style={{
                    fontSize: '13px',
                    color: '#374151',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.payload?.body || m.payload?.title || signalLabel || '—'}
                </div>

                {/* Status badge */}
                <div
                  style={{
                    padding: '3px 10px',
                    background: statusCfg.bg,
                    color: statusCfg.color,
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: statusCfg.bold ? '600' : '400',
                    fontStyle: statusCfg.italic ? 'italic' : 'normal',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {statusCfg.scheduled && m.runAt
                    ? `scheduled · ${formatMessageTime(m.runAt)}`
                    : statusCfg.label}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Notification preview modal */}
      {preview && (() => {
        const p = preview.profileId;
        const modalId = p?.identifiers?.emails?.[0]
          || p?.identifiers?.phones?.[0]
          || `Anonymous #${preview.cartToken?.slice(-4) || '????'}`;
        const modalSignal = SIGNAL_LABELS[preview.signalType] || preview.reason || '';
        const modalStatus = getStatusConfig(preview.status, preview.outcome, 0);
        const modalTime = formatMessageTime(preview.sentAt || preview.createdAt || preview.updatedAt);
        const hasCopy = Boolean(
          preview.payload?.title || preview.payload?.body || preview.payload?.subject
        );

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notification preview"
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
            onClick={() => setPreview(null)}
          >
            <div
              style={{
                background: '#fff', borderRadius: 16, padding: '24px',
                width: '100%', maxWidth: 400, position: 'relative',
                maxHeight: '85vh', overflowY: 'auto',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                autoFocus
                onClick={() => setPreview(null)}
                aria-label="Close preview"
                style={{
                  position: 'absolute', top: 14, right: 14,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 22, color: '#9ca3af', lineHeight: 1, padding: '2px 6px',
                  borderRadius: 6,
                }}
              >×</button>

              {/* Title */}
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12, paddingRight: 28 }}>
                Notification Preview
              </div>

              {/* Meta */}
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: '1.9', marginBottom: 16 }}>
                <div><span style={{ color: '#9ca3af' }}>To: </span>{modalId}</div>
                {modalSignal && <div><span style={{ color: '#9ca3af' }}>Signal: </span>{modalSignal}</div>}
                <div><span style={{ color: '#9ca3af' }}>Channel: </span>{preview.channel === 'email' ? 'Email' : 'Push'}</div>
                <div>
                  <span style={{ color: '#9ca3af' }}>Status: </span>
                  <span style={{ color: modalStatus.color, fontWeight: modalStatus.bold ? 600 : 400 }}>
                    {modalStatus.label}
                  </span>
                </div>
                <div><span style={{ color: '#9ca3af' }}>Sent: </span>{modalTime}</div>
              </div>

              <div style={{ height: 1, background: '#f3f4f6', marginBottom: 16 }} />

              {/* Preview content */}
              {!hasCopy ? (
                /* Historical automated row — content was never saved */
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>
                    {preview.channel === 'email' ? '✉️' : '🔔'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    {modalSignal || '(no signal)'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                    Content wasn&apos;t recorded for this notification.
                  </div>
                </div>
              ) : preview.channel === 'email' ? (
                /* Email preview */
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', fontSize: 13 }}>
                  <div style={{ background: '#f9fafb', padding: '10px 14px', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Subject</div>
                    <div style={{ fontWeight: 700, color: '#111827' }}>
                      {preview.payload?.subject || '(no subject)'}
                    </div>
                  </div>
                  <div style={{
                    padding: '12px 14px', color: '#374151',
                    lineHeight: '1.6', whiteSpace: 'pre-wrap', fontSize: 13,
                  }}>
                    {preview.payload?.body || '(no body)'}
                  </div>
                </div>
              ) : (
                /* Push notification preview */
                <div>
                  <div style={{
                    border: '1px solid #e5e7eb', borderRadius: 12,
                    padding: '12px 14px', background: '#f9fafb',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}>
                    <div style={{ fontSize: 20, flexShrink: 0 }}>🔔</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 3 }}>
                        {preview.payload?.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                        {preview.payload?.body}
                      </div>
                    </div>
                  </div>
                  {preview.payload?.imageUrl ? (
                    <img
                      src={preview.payload.imageUrl}
                      alt=""
                      style={{
                        width: '100%', borderRadius: 8, marginTop: 8,
                        objectFit: 'cover', maxHeight: 180, display: 'block',
                      }}
                    />
                  ) : null}
                  {preview.payload?.url ? (
                    <div style={{
                      fontSize: 11, color: '#9ca3af', marginTop: 8,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {preview.payload.url}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
