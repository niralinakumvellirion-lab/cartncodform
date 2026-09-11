'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

const SIGNAL_LABELS = {
  cart_abandon: 'Cart left behind',
  checkout_abandon: 'Checkout left behind',
  browse_abandon: "Looked, didn't add",
  high_intent: 'Keeps coming back',
  price_hesitation: 'Stopped at the price',
  price_drop: 'Price dropped',
  back_in_stock: 'Back in stock',
  post_purchase_d3: 'Three days after buying',
  lapsing: 'Going quiet',
  email_capture: 'Ask for an email',
  cod_to_prepaid: 'Offer prepaid on COD',
  winback: 'Been a while',
};

const EVENT_ICONS = {
  page_view: '👁',
  product_view: '🔍',
  add_to_cart: '🛒',
  page_exit: '↗',
  push_prompt_shown: '🔔',
  push_prompt_accepted: '✅',
};

// Auto-fill suggestions keyed by signal type, shared by every composer
// instance — kept at module scope since it doesn't depend on props/state.
const SUGGESTIONS = {
  cart_abandon: {
    title: (product) => (product ? `Your ${product} is waiting` : 'Your cart is waiting'),
    body: () => 'Complete your order before it sells out.',
  },
  high_intent: {
    title: (product) => (product ? `Still thinking about ${product}?` : 'Still interested?'),
    body: () => 'We saved it for you. Come back and take a look.',
  },
  price_hesitation: {
    title: () => 'Worth every rupee',
    body: (product) => (product ? `Here's why ${product} is worth it.` : 'Quality that speaks for itself.'),
  },
  lapsing: {
    title: () => 'We miss you!',
    body: () => 'New arrivals are waiting. Come back and explore.',
  },
  winback: {
    title: () => "It's been a while...",
    body: () => 'New collection just dropped. Come check it out.',
  },
};

function NotificationComposer({ customer, shop, onSent, onError }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Auto-fill based on the customer's top signal whenever the selected
  // customer changes.
  useEffect(() => {
    const signal = customer?.topSignal?.type;
    const product = customer?.topProducts?.[0]?.title || '';
    const suggestion = SUGGESTIONS[signal] || {
      title: () => 'Hello from the store',
      body: () => 'We have something special for you.',
    };
    setTitle(suggestion.title(product));
    setBody(suggestion.body(product));
  }, [customer]);

  async function send() {
    if (!title || !body || sending) return;
    setSending(true);
    try {
      await apiSend('/api/push/send-journey', 'POST', {
        profileId: customer.profile._id,
        title,
        body,
        url: customer.topProducts?.[0]
          ? `https://${shop}/products/${customer.topProducts[0].productId}`
          : `https://${shop}`,
      });
      onSent();
      setTitle('');
      setBody('');
    } catch (e) {
      onError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Notification title"
        style={{
          padding: '9px 12px', fontSize: '13px',
          border: '1px solid #e5e7eb', borderRadius: '8px',
          outline: 'none', color: '#111827',
        }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Notification message"
        rows={3}
        style={{
          padding: '9px 12px', fontSize: '13px',
          border: '1px solid #e5e7eb', borderRadius: '8px',
          outline: 'none', color: '#111827', resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
        Signal: {SIGNAL_LABELS[customer?.topSignal?.type] || '—'} ·
        Strength: {((customer?.topSignal?.strength || 0) * 100).toFixed(0)}%
      </div>
      <button
        onClick={send}
        disabled={sending || !title || !body}
        style={{
          padding: '11px', fontSize: '14px', fontWeight: '700',
          color: '#fff',
          background: sending || !title || !body ? '#9ca3af' : '#4f46e5',
          border: 'none', borderRadius: '10px',
          cursor: sending || !title || !body ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {sending ? '⏳ Sending...' : '🔔 Send notification'}
      </button>
    </div>
  );
}

export default function JourneyScreen({ shop }) {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [sendResult, setSendResult] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/api/events/${encodeURIComponent(shop)}/journey?limit=50`);
      setCustomers(data.customers || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredCustomers = filter === 'all'
    ? customers
    : customers.filter((c) => c.signals?.some((s) => s.type === filter));

  return (
    <div style={{ padding: '0 24px 24px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '0 0 6px' }}>
          Customer Journey
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          Customers with active signals — review their journey and send targeted notifications.
        </p>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: '16px', fontSize: '13px',
          color: '#dc2626', background: '#fef2f2', border: '1px solid #fee2e2',
          borderRadius: '8px',
        }}>
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: '8px', marginBottom: '16px',
        overflowX: 'auto', paddingBottom: '4px',
      }}>
        {[
          { key: 'all', label: 'All signals' },
          { key: 'cart_abandon', label: '🛒 Cart abandon' },
          { key: 'high_intent', label: '🔥 High intent' },
          { key: 'price_hesitation', label: '💰 Price hesitation' },
          { key: 'lapsing', label: '😴 Going quiet' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '6px 14px', fontSize: '13px',
              fontWeight: filter === tab.key ? '600' : '400',
              color: filter === tab.key ? '#111827' : '#6b7280',
              background: filter === tab.key ? '#fff' : 'transparent',
              border: '1px solid',
              borderColor: filter === tab.key ? '#e5e7eb' : 'transparent',
              borderRadius: '20px', cursor: 'pointer',
              flexShrink: 0, whiteSpace: 'nowrap',
              boxShadow: filter === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Two-panel layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedCustomer ? '1fr 400px' : '1fr',
        gap: '16px', alignItems: 'start',
      }}>

        {/* Customer list */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 140px 120px 100px',
            padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6',
          }}>
            {['Customer', 'Top signal', 'Top product', 'Action'].map((h) => (
              <div key={h} style={{
                fontSize: '11px', fontWeight: '600', color: '#9ca3af',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {loading
            ? [1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{
                  height: '56px', borderBottom: '1px solid #f9fafb',
                  display: 'flex', alignItems: 'center', padding: '0 16px',
                }}>
                  <div style={{ width: '50%', height: '12px', background: '#f3f4f6', borderRadius: '4px' }} />
                </div>
              ))
            : filteredCustomers.length === 0
              ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                  No customers with active signals.
                </div>
              )
              : filteredCustomers.map((c, i) => {
                  const profile = c.profile;
                  const identifier =
                    profile?.identifiers?.emails?.[0] ||
                    profile?.identifiers?.phones?.[0] ||
                    `Anonymous ${profile?._id?.toString().slice(-6)}`;
                  const isSelected = selectedCustomer?.profile?._id === profile?._id;
                  const hasPush = profile?.channels?.push?.subscribed;

                  return (
                    <div
                      key={profile?._id || i}
                      onClick={() => setSelectedCustomer(isSelected ? null : c)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 140px 120px 100px',
                        padding: '12px 16px', alignItems: 'center',
                        borderBottom: i < filteredCustomers.length - 1 ? '1px solid #f9fafb' : 'none',
                        cursor: 'pointer',
                        background: isSelected ? '#f0f4ff' : '#fff',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = '#fff';
                      }}
                    >

                      {/* Customer */}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#111827', marginBottom: '2px' }}>
                          {identifier}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                          {c.signals?.length || 0} active signal{c.signals?.length !== 1 ? 's' : ''}
                          {hasPush ? ' · 🔔 push' : ''}
                        </div>
                      </div>

                      {/* Top signal */}
                      <div>
                        <span style={{
                          padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500',
                          background:
                            c.topSignal?.strength > 0.7 ? '#fee2e2' :
                            c.topSignal?.strength > 0.4 ? '#fef9c3' : '#f3f4f6',
                          color:
                            c.topSignal?.strength > 0.7 ? '#dc2626' :
                            c.topSignal?.strength > 0.4 ? '#ca8a04' : '#6b7280',
                        }}>
                          {SIGNAL_LABELS[c.topSignal?.type] || c.topSignal?.type || '—'}
                        </span>
                      </div>

                      {/* Top product */}
                      <div style={{
                        fontSize: '12px', color: '#374151',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.topProducts?.[0]?.title || '—'}
                      </div>

                      {/* Action */}
                      <div>
                        {hasPush ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomer(c);
                            }}
                            style={{
                              padding: '5px 12px', fontSize: '12px', fontWeight: '600',
                              color: '#fff', background: '#4f46e5', border: 'none',
                              borderRadius: '6px', cursor: 'pointer',
                            }}
                          >
                            Notify
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>No push</span>
                        )}
                      </div>
                    </div>
                  );
                })
          }
        </div>

        {/* Right panel — customer detail + send */}
        {selectedCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'sticky', top: '16px' }}>

            {/* Journey timeline */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                Customer journey
              </div>

              {/* Top products */}
              {selectedCustomer.topProducts?.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{
                    fontSize: '11px', color: '#9ca3af', fontWeight: '600',
                    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
                  }}>
                    Most interested in
                  </div>
                  {selectedCustomer.topProducts.map((p, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '4px 0', borderBottom: '1px solid #f9fafb',
                    }}>
                      <span style={{ fontSize: '12px', color: '#374151' }}>{p.title}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {p.count} view{p.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent events */}
              <div style={{
                fontSize: '11px', color: '#9ca3af', fontWeight: '600',
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
              }}>
                Recent activity
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {selectedCustomer.recentEvents?.length > 0
                  ? selectedCustomer.recentEvents.map((e, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: '8px', alignItems: 'flex-start',
                        padding: '4px 0', borderBottom: '1px solid #f9fafb', fontSize: '12px',
                      }}>
                        <span style={{ flexShrink: 0 }}>{EVENT_ICONS[e.type] || '•'}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ color: '#374151' }}>{e.type.replace(/_/g, ' ')}</span>
                          {e.meta?.productTitle && (
                            <span style={{ color: '#6b7280' }}>{' — '}{e.meta.productTitle}</span>
                          )}
                        </div>
                        <span style={{ color: '#9ca3af', flexShrink: 0, fontSize: '11px' }}>
                          {new Date(e.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  : (
                    <div style={{ fontSize: '12px', color: '#9ca3af', padding: '4px 0' }}>
                      No recent activity.
                    </div>
                  )}
              </div>
            </div>

            {/* Send notification panel */}
            {selectedCustomer.profile?.channels?.push?.subscribed ? (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                  Send push notification
                </div>

                <NotificationComposer
                  customer={selectedCustomer}
                  shop={shop}
                  onSent={() => {
                    setSendResult('Sent successfully!');
                    setTimeout(() => setSendResult(''), 3000);
                  }}
                  onError={(err) => setSendResult('Error: ' + err)}
                />

                {sendResult && (
                  <div style={{
                    marginTop: '8px', fontSize: '13px',
                    color: sendResult.startsWith('Error') ? '#dc2626' : '#16a34a',
                    textAlign: 'center',
                  }}>
                    {sendResult}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px',
                padding: '16px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                  🔔 No push subscription — cannot send notification
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
