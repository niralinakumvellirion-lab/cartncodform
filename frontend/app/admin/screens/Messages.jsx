'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../../../lib/api';

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
    <div
      style={{
        padding: isMobileView ? '0 12px 24px' : '0 24px 24px',
        maxWidth: '1000px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 6px',
          }}
        >
          Messages
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          Every message, why it went, and what happened after.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
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
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
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
