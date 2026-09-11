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

const NOTIFICATION_SUGGESTIONS = [
  {
    category: 'Cart & Purchase',
    color: '#fee2e2',
    textColor: '#dc2626',
    icon: '🛒',
    suggestions: [
      {
        label: 'Cart reminder',
        title: 'Your cart is waiting!',
        body: 'You left something behind. Complete your order before it sells out.',
      },
      {
        label: 'Checkout nudge',
        title: 'Almost there!',
        body: 'Your order is just one step away. Finish checkout now.',
      },
    ],
  },
  {
    category: 'Offers & Discounts',
    color: '#dcfce7',
    textColor: '#16a34a',
    icon: '🏷️',
    suggestions: [
      {
        label: 'Flash sale',
        title: '⚡ Flash Sale — 24 hours only!',
        body: 'Up to 30% off on selected items. Shop now before it ends.',
      },
      {
        label: 'Exclusive discount',
        title: 'A special offer just for you 🎁',
        body: 'As a valued customer, enjoy an exclusive discount on your next order.',
      },
      {
        label: 'Limited time',
        title: '⏰ Offer expires tonight!',
        body: "Don't miss out — your discount code expires at midnight.",
      },
    ],
  },
  {
    category: 'Product Updates',
    color: '#dbeafe',
    textColor: '#1d4ed8',
    icon: '✨',
    suggestions: [
      {
        label: 'New arrival',
        title: '✨ New collection just dropped!',
        body: 'Fresh styles are here. Be the first to explore our new arrivals.',
      },
      {
        label: 'Back in stock',
        title: "It's back! 🎉",
        body: "The item you were eyeing is back in stock. Grab it before it's gone.",
      },
      {
        label: 'Price drop',
        title: '📉 Price just dropped!',
        body: 'Good news — the price on your saved item just went down.',
      },
    ],
  },
  {
    category: 'Re-engagement',
    color: '#fef9c3',
    textColor: '#ca8a04',
    icon: '💛',
    suggestions: [
      {
        label: 'Win back',
        title: 'We miss you! 💛',
        body: "It's been a while. Come back and see what's new in store.",
      },
      {
        label: 'Loyalty reward',
        title: "You've earned a reward! 🏆",
        body: "Thank you for being a loyal customer. Here's something special for you.",
      },
      {
        label: 'Special occasion',
        title: '🎂 A special treat for you!',
        body: 'Wishing you a wonderful day — enjoy a little something from us.',
      },
    ],
  },
  {
    category: 'Post Purchase',
    color: '#f3e8ff',
    textColor: '#7c3aed',
    icon: '📦',
    suggestions: [
      {
        label: 'Thank you',
        title: 'Thank you for your order! 🙏',
        body: "We're preparing your order. You'll hear from us soon.",
      },
      {
        label: 'Review request',
        title: 'How did we do? ⭐',
        body: "We'd love to hear your feedback on your recent purchase.",
      },
      {
        label: 'Cross-sell',
        title: 'Complete the look 👗',
        body: 'Customers who bought this also loved these items.',
      },
    ],
  },
];

function NotificationComposer({ customer, shop, onSent, onError }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

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
      {/* Suggestions toggle */}
      <div
        onClick={() => setShowSuggestions((s) => !s)}
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          background: '#f8f9ff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          cursor: 'pointer',
          marginBottom: '8px',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f4ff')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#f8f9ff')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>💡</span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#4f46e5' }}>
            Notification ideas
          </span>
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>
            — click to explore
          </span>
        </div>
        <span style={{
          fontSize: '12px', color: '#9ca3af',
          transform: showSuggestions ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s', display: 'inline-block',
        }}>
          ▼
        </span>
      </div>

      {/* Suggestions panel */}
      {showSuggestions && (
        <div style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px', marginBottom: '8px',
          overflow: 'hidden',
        }}>

          {/* Category tabs */}
          <div style={{
            display: 'flex', overflowX: 'auto',
            borderBottom: '1px solid #f3f4f6',
            padding: '8px 8px 0',
          }}>
            {NOTIFICATION_SUGGESTIONS.map((cat, i) => (
              <button
                key={i}
                onClick={() => setActiveCategory(i)}
                style={{
                  padding: '6px 12px', fontSize: '12px',
                  fontWeight: activeCategory === i ? '700' : '400',
                  color: activeCategory === i ? cat.textColor : '#6b7280',
                  background: activeCategory === i ? cat.color : 'transparent',
                  border: 'none', borderRadius: '8px 8px 0 0',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  flexShrink: 0, marginRight: '2px',
                  borderBottom: activeCategory === i
                    ? '2px solid ' + cat.textColor : '2px solid transparent',
                }}
              >
                {cat.icon} {cat.category}
              </button>
            ))}
          </div>

          {/* Suggestion cards */}
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {NOTIFICATION_SUGGESTIONS[activeCategory].suggestions.map((s, i) => (
              <div
                key={i}
                onClick={() => {
                  setTitle(s.title);
                  setBody(s.body);
                  setShowSuggestions(false);
                }}
                style={{
                  padding: '10px 12px',
                  background: NOTIFICATION_SUGGESTIONS[activeCategory].color,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: '1px solid transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.border =
                    '1px solid ' + NOTIFICATION_SUGGESTIONS[activeCategory].textColor + '44';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.border = '1px solid transparent';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: '4px',
                }}>
                  <span style={{
                    fontSize: '11px', fontWeight: '700',
                    color: NOTIFICATION_SUGGESTIONS[activeCategory].textColor,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    {s.label}
                  </span>
                  <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                    click to use →
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '2px' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.4' }}>
                  {s.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

function EmailComposer({ customer, shop, onSent, onError }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const signal = customer?.topSignal?.type;
    const product = customer?.topProducts?.[0]?.title || '';
    const suggestions = {
      cart_abandon: {
        subject: 'You left something behind',
        body: `Hi there,\n\nWe noticed you added ${product || 'some items'} to your cart but didn't complete your purchase.\n\nYour cart is saved and waiting for you. Come back and complete your order before it sells out!\n\nShop now and get free shipping on orders above ₹999.\n\nWarm regards,\nThe Team`,
      },
      high_intent: {
        subject: `Still thinking about ${product || 'your saved item'}?`,
        body: `Hi there,\n\nWe noticed you've been checking out ${product || 'one of our products'} multiple times.\n\nWe think you're going to love it! Here's what makes it special...\n\nDon't wait too long — stock is limited.\n\nWarm regards,\nThe Team`,
      },
      lapsing: {
        subject: "We miss you! Here's something special",
        body: `Hi there,\n\nIt's been a while since your last visit and we miss you!\n\nWe've added exciting new products to our collection that we think you'll love.\n\nCome back and explore — we'd love to see you again.\n\nWarm regards,\nThe Team`,
      },
    };
    const s = suggestions[signal] || {
      subject: 'A message from our store',
      body: 'Hi there,\n\nThank you for being a valued customer. We have something special for you.\n\nWarm regards,\nThe Team',
    };
    setSubject(s.subject);
    setBody(s.body);
  }, [customer]);

  async function send() {
    if (!subject || !body || sending) return;
    setSending(true);
    try {
      await apiSend('/api/push/send-journey-email', 'POST', {
        profileId: customer.profile._id,
        subject,
        body,
      });
      onSent();
    } catch (e) {
      onError(e.message);
    } finally {
      setSending(false);
    }
  }

  const email = customer?.profile?.channels?.email?.address ||
    customer?.profile?.identifiers?.emails?.[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
        Sending to: <strong>{email}</strong>
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Email subject"
        style={{
          padding: '9px 12px', fontSize: '13px',
          border: '1px solid #e5e7eb', borderRadius: '8px',
          outline: 'none', color: '#111827',
        }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Email message"
        rows={6}
        style={{
          padding: '9px 12px', fontSize: '13px',
          border: '1px solid #e5e7eb', borderRadius: '8px',
          outline: 'none', color: '#111827',
          resize: 'vertical', fontFamily: 'inherit',
          lineHeight: '1.5',
        }}
      />
      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
        Sent from: onboarding@resend.dev
      </div>
      <button
        onClick={send}
        disabled={sending || !subject || !body}
        style={{
          padding: '11px', fontSize: '14px', fontWeight: '700', color: '#fff',
          background: sending || !subject || !body ? '#9ca3af' : '#0ea5e9',
          border: 'none', borderRadius: '10px',
          cursor: sending || !subject || !body ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {sending ? '⏳ Sending...' : '✉️ Send email'}
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
  const [notifTab, setNotifTab] = useState('push');

  // Default to whichever channel is actually available whenever the
  // selected customer changes — otherwise picking an email-only customer
  // while notifTab is still 'push' from a previous selection would render
  // an empty panel (neither composer's condition would be met).
  useEffect(() => {
    if (!selectedCustomer) return;
    const hasPush = !!selectedCustomer.profile?.channels?.push?.subscribed;
    const hasEmail = !!(
      selectedCustomer.profile?.channels?.email?.address ||
      selectedCustomer.profile?.identifiers?.emails?.[0]
    );
    if (notifTab === 'push' && !hasPush && hasEmail) setNotifTab('email');
    else if (notifTab === 'email' && !hasEmail && hasPush) setNotifTab('push');
  }, [selectedCustomer]);

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
            {(() => {
              const hasPush = !!selectedCustomer.profile?.channels?.push?.subscribed;
              const hasEmail = !!(
                selectedCustomer.profile?.channels?.email?.address ||
                selectedCustomer.profile?.identifiers?.emails?.[0]
              );

              if (!hasPush && !hasEmail) {
                return (
                  <div style={{
                    background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px',
                    padding: '16px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                      🔕 No push subscription or email on file — cannot send a notification
                    </div>
                  </div>
                );
              }

              return (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                    Send notification
                  </div>

                  {/* Push / Email tab switcher */}
                  <div style={{
                    display: 'flex', gap: '4px', marginBottom: '12px',
                    background: '#f3f4f6', borderRadius: '10px', padding: '4px',
                  }}>
                    {[
                      { key: 'push', label: '🔔 Push', available: hasPush },
                      { key: 'email', label: '✉️ Email', available: hasEmail },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => tab.available && setNotifTab(tab.key)}
                        style={{
                          flex: 1, padding: '8px', fontSize: '13px',
                          fontWeight: notifTab === tab.key ? '600' : '400',
                          color: !tab.available ? '#d1d5db' :
                            notifTab === tab.key ? '#111827' : '#6b7280',
                          background: notifTab === tab.key ? '#fff' : 'transparent',
                          border: 'none', borderRadius: '8px',
                          cursor: tab.available ? 'pointer' : 'not-allowed',
                          boxShadow: notifTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        {tab.label}
                        {!tab.available && (
                          <span style={{ fontSize: '10px', color: '#d1d5db', display: 'block' }}>
                            Not available
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {notifTab === 'push' && hasPush && (
                    <NotificationComposer
                      customer={selectedCustomer}
                      shop={shop}
                      onSent={() => {
                        setSendResult('Sent successfully!');
                        setTimeout(() => setSendResult(''), 3000);
                      }}
                      onError={(err) => setSendResult('Error: ' + err)}
                    />
                  )}

                  {notifTab === 'email' && hasEmail && (
                    <EmailComposer
                      customer={selectedCustomer}
                      shop={shop}
                      onSent={() => {
                        setSendResult('Sent successfully!');
                        setTimeout(() => setSendResult(''), 3000);
                      }}
                      onError={(err) => setSendResult('Error: ' + err)}
                    />
                  )}

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
              );
            })()}

          </div>
        )}
      </div>
    </div>
  );
}
