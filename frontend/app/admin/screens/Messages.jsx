'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../../../lib/api';

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

export default function Messages({ shop }) {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const load = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(
        `/api/profiles/${encodeURIComponent(shop)}/messages?limit=50`
      );
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setTotal(Number.isFinite(data?.total) ? data.total : 0);
    } catch (err) {
      setError(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredMessages = messages.filter((m) => {
    if (filter === 'push') return m.channel === 'push';
    if (filter === 'email') return m.channel === 'email';
    if (filter === 'converted') return m.outcome === 'converted';
    return true;
  });

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

      {/* Filter tabs — horizontally scrollable on mobile */}
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
                  style={{
                    padding: '14px 16px',
                    borderBottom:
                      i < filteredMessages.length - 1
                        ? '1px solid #f9fafb'
                        : 'none',
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
                    <span
                      style={{ fontSize: '13px', color: '#9ca3af', flexShrink: 0 }}
                    >
                      {m.channel === 'email' ? '✉️' : '🔔'}
                    </span>
                    <span
                      style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.4' }}
                    >
                      {m.payload?.body || m.payload?.title || '—'}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={m._id}
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
                <div style={{ fontSize: '14px', color: '#9ca3af' }}>
                  {m.channel === 'email' ? '✉️' : '🔔'}
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
                  {m.payload?.body || m.payload?.title || '—'}
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
    </div>
  );
}
