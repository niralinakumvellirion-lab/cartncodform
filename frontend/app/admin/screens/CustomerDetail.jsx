'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiSend } from '../../../lib/api';
import { ShimmerBox, ShimmerCard } from '../components/Shimmer';
import { DS, StageBadge, ReachIcons, useWhatsapp } from './customerShared';

const SIGNAL_LABELS = {
  cart_abandon: 'Cart left behind',
  checkout_abandon: 'Reached checkout',
  browse_abandon: "Looked, didn't add",
  high_intent: 'Keeps coming back',
  price_hesitation: 'Stopped at the price',
  price_drop: 'Price dropped',
  back_in_stock: 'Back in stock',
  post_purchase_d3: 'Three days after buying',
  lapsing: 'Going quiet',
  email_capture: 'Ask for an email',
  cod_to_prepaid: 'Offer prepaid on COD',
  winback: 'Win back',
  festival: 'Festival broadcast',
  manual: 'Manual send',
};

const NOTIF_OUTCOME_COLORS = {
  clicked: '#2563eb',
  converted: '#16a34a',
  delivered: '#6b7280',
  failed: '#dc2626',
  skipped: '#9ca3af',
};

const EVENT_LABELS = {
  page_view: 'Visited website',
  push_prompt_shown: 'Popup shown',
  push_prompt_accepted: 'Accepted notifications',
  product_view: 'Viewed product',
};

const EVENT_DOT_COLORS = {
  page_view: '#3b82f6',
  push_prompt_shown: '#f59e0b',
  push_prompt_accepted: '#10b981',
  product_view: '#8b5cf6',
};

// Converts a raw storefront path (e.g. /collections/all,
// /products/some-handle) into a human-readable label for the journey
// timeline.
function getFriendlyPath(path) {
  if (!path) return '';
  // Homepage
  if (path === '/' || path === '') return 'Homepage';
  // Product page
  if (path.startsWith('/products/')) {
    const handle = path.replace('/products/', '').split('?')[0];
    return 'Product: ' + handle.replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  // Collection page
  if (path.startsWith('/collections/')) {
    const handle = path.replace('/collections/', '').split('?')[0];
    if (handle === 'all') return 'All Products';
    return 'Collection: ' + handle.replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  // Cart page
  if (path.startsWith('/cart')) return 'Cart';
  // Checkout
  if (path.startsWith('/checkout') ||
      path.includes('checkouts')) return 'Checkout';
  // Search
  if (path.startsWith('/search')) return 'Search';
  // Pages
  if (path.startsWith('/pages/')) {
    const handle = path.replace('/pages/', '').split('?')[0];
    return 'Page: ' + handle.replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  // Blog
  if (path.startsWith('/blogs/')) return 'Blog';
  // Account
  if (path.startsWith('/account')) return 'Account';
  // Fallback — clean up the path
  return path.split('?')[0].replace(/-/g, ' ').replace(/\//g, ' › ').trim();
}

const CD_AVATAR_COLORS = [
  { bg: '#eef2ff', text: '#4f46e5' },
  { bg: '#dcfce7', text: '#16a34a' },
  { bg: '#dbeafe', text: '#2563eb' },
  { bg: '#fef3c7', text: '#d97706' },
  { bg: '#fce7f3', text: '#be185d' },
];
function getCDAvatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return CD_AVATAR_COLORS[Math.abs(h) % CD_AVATAR_COLORS.length];
}
function getCDStageLabel(customer) {
  const orders = customer.orders?.count || 0;
  if (orders > 1) return 'Repeat buyer';
  if (orders === 1) return 'Bought once';
  if (customer.identifiers?.cartTokens?.length > 0) return 'Has cart';
  return customer.stage === 'lapsed' ? 'Going quiet' : 'Visitor';
}
function formatCDDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Auto-fill suggestions keyed by signal type, shared by every composer
// instance — kept at module scope since it doesn't depend on props/state.
// NOTE: this constant (SUGGESTIONS) was not itself listed in the task's
// Step 5 copy list, but NotificationComposer's own auto-fill useEffect
// below references it directly — omitting it would leave
// NotificationComposer throwing a ReferenceError the moment it renders,
// so it was copied over alongside the composer that needs it.
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

const EMAIL_SUGGESTIONS = [
  {
    category: 'Cart & Purchase',
    color: '#fee2e2',
    textColor: '#dc2626',
    suggestions: [
      {
        label: 'Cart reminder',
        subject: 'You left something behind',
        body: 'Hi there,\n\nYou left items in your cart! Complete your purchase before they sell out.\n\nWarm regards,\nThe Team',
      },
      {
        label: 'Urgency nudge',
        subject: 'Almost gone — complete your order',
        body: 'Hi there,\n\nThe items in your cart are selling fast. Complete your order now before stock runs out!\n\nWarm regards,\nThe Team',
      },
    ],
  },
  {
    category: 'Offers',
    color: '#fef3c7',
    textColor: '#d97706',
    suggestions: [
      {
        label: 'Special discount',
        subject: 'A special offer just for you',
        body: 'Hi there,\n\nWe have an exclusive offer waiting for you. Visit our store and use your discount at checkout.\n\nWarm regards,\nThe Team',
      },
      {
        label: 'Free shipping',
        subject: 'Free shipping on your next order',
        body: 'Hi there,\n\nGood news! Your next order qualifies for free shipping. Shop now and save.\n\nWarm regards,\nThe Team',
      },
    ],
  },
  {
    category: 'Re-engagement',
    color: '#ede9fe',
    textColor: '#7c3aed',
    suggestions: [
      {
        label: 'We miss you',
        subject: "We miss you! Here's something special",
        body: "Hi there,\n\nIt's been a while! We've added exciting new products we think you'll love. Come back and explore.\n\nWarm regards,\nThe Team",
      },
      {
        label: 'New arrivals',
        subject: 'New arrivals you might like',
        body: "Hi there,\n\nWe've just added new products to our collection. Come check out what's new!\n\nWarm regards,\nThe Team",
      },
    ],
  },
  {
    category: 'Post Purchase',
    color: '#dcfce7',
    textColor: '#16a34a',
    suggestions: [
      {
        label: 'Thank you',
        subject: 'Thank you for your order!',
        body: 'Hi there,\n\nThank you for your recent purchase! We hope you love it. Feel free to reach out if you have any questions.\n\nWarm regards,\nThe Team',
      },
      {
        label: 'Review request',
        subject: 'How was your experience?',
        body: "Hi there,\n\nWe hope you're enjoying your purchase! We'd love to hear your feedback. Leave us a review and help other customers.\n\nWarm regards,\nThe Team",
      },
    ],
  },
];

// Product thumbnail shown next to product-specific suggestion cards,
// shared by NotificationComposer and EmailComposer, and next to each row
// in the "Most interested in" list.
// size/radius are optional (default 40/8, the original fixed values)
// so every existing caller (the suggestion-card thumbnails in
// NotificationComposer/EmailComposer) keeps its exact prior size —
// only the "Most interested in" panel row below passes a smaller
// 36/6 explicitly, per FIX 3. See audits/customer-panel-fix-audit.txt.
function ProductThumbnail({ imageUrl, title, size = 40, radius = 8 }) {
  if (imageUrl) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius,
                    overflow: 'hidden', flexShrink: 0,
                    border: '1px solid #e5e7eb' }}>
        <img src={imageUrl} alt={title || 'Product'}
          style={{ width: '100%', height: '100%',
                   objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius,
                  background: '#f3f4f6', border: '1px solid #e5e7eb',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"
        strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    </div>
  );
}

function StatusPill({ outcome, status }) {
  const val = outcome || status;
  const PILL = {
    delivered: { label: 'Delivered', bg: '#dcfce7', color: '#16a34a' },
    clicked:   { label: 'Clicked',   bg: '#dbeafe', color: '#2563eb' },
    converted: { label: 'Converted', bg: '#dcfce7', color: '#16a34a' },
    failed:    { label: 'Failed',    bg: '#fee2e2', color: '#dc2626' },
    sent:      { label: 'Sent',      bg: '#eef2ff', color: '#4f46e5' },
    skipped:   { label: 'Skipped',   bg: '#f3f4f6', color: '#6b7280' },
    cancelled: { label: 'Cancelled', bg: '#f3f4f6', color: '#6b7280' },
  };
  const s = PILL[val] || { label: val || '—', bg: '#f3f4f6', color: '#9ca3af' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 10, fontWeight: 700,
      background: s.bg, color: s.color, flexShrink: 0,
    }}>
      {s.label}
    </span>
  );
}

function NotificationComposer({ customer, shop, onSent, onError }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  const rawTopProductTitle = customer?.topProducts?.[0]?.title || '';
  const hasTopProduct = !!(rawTopProductTitle && !/^\d+$/.test(rawTopProductTitle));
  const productImage = customer?.topProducts?.[0]?.imageUrl || null;

  // Auto-fill based on the customer's top signal whenever the selected
  // customer changes.
  useEffect(() => {
    const signal = customer?.topSignal?.type;
    const rawProduct = customer?.topProducts?.[0]?.title || '';
    const product = /^\d+$/.test(rawProduct) ? '' : rawProduct;
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
        imageUrl: productImage || undefined,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px',
                  width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
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
            {(() => {
              const showThumb = NOTIFICATION_SUGGESTIONS[activeCategory].category === 'Cart & Purchase' ||
                hasTopProduct;
              return NOTIFICATION_SUGGESTIONS[activeCategory].suggestions.map((s, i) => (
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
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {showThumb && <ProductThumbnail imageUrl={productImage} title={rawTopProductTitle} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Headline
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Notification title"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', fontSize: '13px',
            border: '1px solid #e5e7eb', borderRadius: '8px',
            outline: 'none', color: '#111827',
          }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Message
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Notification message"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', fontSize: '13px',
            border: '1px solid #e5e7eb', borderRadius: '8px',
            outline: 'none', color: '#111827', resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  const rawTopProductTitle = customer?.topProducts?.[0]?.title || '';
  const hasTopProduct = !!(rawTopProductTitle && !/^\d+$/.test(rawTopProductTitle));
  const productImage = customer?.topProducts?.[0]?.imageUrl || null;

  useEffect(() => {
    const signal = customer?.topSignal?.type;
    const rawProduct = customer?.topProducts?.[0]?.title || '';
    const product = /^\d+$/.test(rawProduct) ? '' : rawProduct;
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
        imageUrl: productImage || undefined,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px',
                  width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
        Sending to: <strong>{email}</strong>
      </div>

      {/* Suggestion toggle */}
      <div
        onClick={() => setShowSuggestions(s => !s)}
        style={{ display: 'flex', justifyContent: 'space-between',
                 alignItems: 'center', padding: '8px 10px',
                 background: '#f9fafb', borderRadius: 8,
                 cursor: 'pointer', fontSize: 13, color: '#374151',
                 fontWeight: 500, userSelect: 'none' }}
      >
        <span>Email ideas</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: showSuggestions ? 'rotate(180deg)' : 'none',
                   transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {showSuggestions && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10,
                      overflow: 'hidden' }}>
          {/* Category tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb',
                        overflowX: 'auto' }}>
            {EMAIL_SUGGESTIONS.map((cat, i) => (
              <button key={i} onClick={() => setActiveCategory(i)}
                style={{
                  padding: '7px 12px', fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: activeCategory === i ? cat.color : '#fff',
                  color: activeCategory === i ? cat.textColor : '#6b7280',
                  borderBottom: activeCategory === i
                    ? `2px solid ${cat.textColor}` : '2px solid transparent',
                }}>
                {cat.category}
              </button>
            ))}
          </div>
          {/* Suggestion cards */}
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column',
                        gap: 8 }}>
            {(() => {
              const showThumb = EMAIL_SUGGESTIONS[activeCategory].category === 'Cart & Purchase' ||
                hasTopProduct;
              return EMAIL_SUGGESTIONS[activeCategory].suggestions.map((s, i) => (
                <div key={i}
                  onClick={() => {
                    setSubject(s.subject);
                    setBody(s.body);
                    setShowSuggestions(false);
                  }}
                  style={{
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: '1px solid #e5e7eb', background: '#fff',
                    fontSize: 13,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {showThumb && <ProductThumbnail imageUrl={productImage} title={rawTopProductTitle} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#111827',
                                    marginBottom: 2 }}>{s.label}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>
                        {s.subject}
                      </div>
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Subject
        </label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', fontSize: '13px',
            border: '1px solid #e5e7eb', borderRadius: '8px',
            outline: 'none', color: '#111827',
          }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Message
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Email message"
          rows={6}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', fontSize: '13px',
            border: '1px solid #e5e7eb', borderRadius: '8px',
            outline: 'none', color: '#111827',
            resize: 'vertical', fontFamily: 'inherit',
            lineHeight: '1.5',
          }}
        />
      </div>
      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
        Sent from: notifications@shopireachboost.com
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

function DetailSkeleton() {
  return (
    <div>
      <ShimmerBox width="40%" height={22} style={{ marginBottom: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <ShimmerCard rows={6} />
        <div>
          <ShimmerCard rows={3} />
          <ShimmerCard rows={4} />
        </div>
      </div>
    </div>
  );
}

const cardTitle = {
  fontSize: 11, color: '#9ca3af', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
};

export default function CustomerDetail({ shop, profileId, from, fid }) {
  const router = useRouter();
  // Carries `shop` forward on client-side nav (every admin/*/page.js
  // wrapper reads it from searchParams.get('shop')).
  const navigate = (path) => {
    const sep = path.includes('?') ? '&' : '?';
    router.push(`${path}${sep}shop=${encodeURIComponent(shop)}`);
  };

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [notifTab, setNotifTab] = useState('push');
  const [sendResult, setSendResult] = useState('');
  const [isNarrow, setIsNarrow] = useState(false);
  const [isMedium, setIsMedium] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState('all');
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  const [waProfile, setWaProfile] = useState(null);
  const [waProfileLoading, setWaProfileLoading] = useState(false);
  const [showWaOptOutConfirm, setShowWaOptOutConfirm] = useState(false);
  const [waOptingOut, setWaOptingOut] = useState(false);
  const { sendWhatsapp, waError: waSendError, waFallbackUrl, clearWaError } = useWhatsapp();

  // "Notifications sent" section — every ScheduledJob for this customer
  // (brain/automation + festival/manual broadcasts), a separate fetch
  // from the journey load above so a slow/failed notifications call
  // never blocks the rest of the page.
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState('');

  const loadNotifications = useCallback(async (ctl) => {
    if (!shop || !profileId) {
      setNotifLoading(false);
      return;
    }
    setNotifLoading(true);
    setNotifError('');
    try {
      const data = await apiGet(
        `/api/queue/${encodeURIComponent(shop)}/customer/${encodeURIComponent(profileId)}/notifications`
      );
      if (ctl?.aborted) return;
      setNotifications(data?.notifications || []);
    } catch (e) {
      if (ctl?.aborted) return;
      setNotifError(e.message || 'Failed to load notifications');
    } finally {
      if (!ctl?.aborted) setNotifLoading(false);
    }
  }, [shop, profileId]);

  useEffect(() => {
    const ctl = { aborted: false };
    loadNotifications(ctl);
    return () => { ctl.aborted = true; };
  }, [loadNotifications]);

  const loadWaProfile = useCallback(async (ctl) => {
    if (!shop || !profileId) return;
    setWaProfileLoading(true);
    try {
      const data = await apiGet(
        `/api/whatsapp/${encodeURIComponent(shop)}/profile/${encodeURIComponent(profileId)}`
      );
      if (ctl?.aborted) return;
      setWaProfile(data);
    } catch {
      if (ctl?.aborted) return;
      setWaProfile(null);
    } finally {
      if (!ctl?.aborted) setWaProfileLoading(false);
    }
  }, [shop, profileId]);

  useEffect(() => {
    const ctl = { aborted: false };
    loadWaProfile(ctl);
    return () => { ctl.aborted = true; };
  }, [loadWaProfile]);

  useEffect(() => {
    const check = () => {
      setIsNarrow(window.innerWidth < 900);
      setIsMedium(window.innerWidth < 1100);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const load = useCallback(async (ctl) => {
    if (!shop || !profileId) {
      setLoading(false);
      setError('Missing shop or customer id in the URL.');
      return;
    }
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const data = await apiGet(
        `/api/events/${encodeURIComponent(shop)}/journey?profileId=${encodeURIComponent(profileId)}`
      );
      if (ctl?.aborted) return;
      if (data?.customers?.length > 0) {
        setCustomer(data.customers[0]);
      } else {
        setCustomer(null);
        setNotFound(true);
      }
    } catch (e) {
      if (ctl?.aborted) return;
      setError(e.message || 'Failed to load customer');
    } finally {
      if (!ctl?.aborted) setLoading(false);
    }
  }, [shop, profileId]);

  useEffect(() => {
    const ctl = { aborted: false };
    load(ctl);
    return () => { ctl.aborted = true; };
  }, [load]);

  // Default the tab to push when the customer has push, else email.
  useEffect(() => {
    if (customer) {
      setNotifTab(customer.profile?.channels?.push?.subscribed ? 'push' : 'email');
    }
  }, [customer]);

  // Explicit param, not router.back() — predictable regardless of how the
  // page was reached (reload, shared link, etc.), unlike browser history.
  const backButton = from === 'queue' && fid ? (
    <button
      onClick={() => navigate(`/admin/queue/${fid}`)}
      style={{ ...DS.btnSecondary, marginBottom: 16 }}
    >
      ← Back to notification
    </button>
  ) : (
    <button
      onClick={() => navigate('/admin/customers')}
      style={{ ...DS.btnSecondary, marginBottom: 16 }}
    >
      ← Back to customers
    </button>
  );

  if (loading) {
    return (
      <div style={{ ...DS.page, maxWidth: 1100 }}>
        {backButton}
        <DetailSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...DS.page, maxWidth: 1100 }}>
        {backButton}
        <div style={{
          background: DS.dangerLight, border: '1px solid #fecaca',
          borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#b91c1c',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 12,
        }}>
          <span>{error}</span>
          <button onClick={() => load({ aborted: false })} style={DS.btnSecondary}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (notFound || !customer) {
    return (
      <div style={{ ...DS.page, maxWidth: 1100 }}>
        {backButton}
        <div style={{ ...DS.card, textAlign: 'center', padding: '40px 16px',
                      color: '#9ca3af', fontSize: 14 }}>
          Customer not found
        </div>
      </div>
    );
  }

  const profile = customer.profile || {};
  const email = profile.identifiers?.emails?.[0];
  const displayName = email || `Anonymous shopper · #${String(profile._id || profileId).slice(-5)}`;
  const hasPush = !!profile.channels?.push?.subscribed;
  const hasEmail = !!(profile.channels?.email?.address || email);
  const phone = profile.identifiers?.phones?.[0];
  const cdInitial = (email || displayName || '?').charAt(0).toUpperCase();
  const cdAvatarColor = getCDAvatarColor(displayName);

  const events = (customer.recentEvents || []).filter((e) => EVENT_LABELS[e.type]);

  // Health strip stats — derived from already-fetched notifications + topProducts
  const pushSentCount  = notifications.filter(n => n.channel === 'push').length;
  const emailSentCount = notifications.filter(n => n.channel === 'email').length;
  const deliveredCount = notifications.filter(n => n.outcome === 'delivered').length;
  const failedCount    = notifications.filter(n => n.outcome === 'failed').length;
  const heldCount      = notifications.filter(n => ['skipped', 'cancelled'].includes(n.outcome)).length;
  const didntArriveCount  = failedCount + heldCount;
  const distinctProducts  = customer.topProducts?.length || 0;
  const totalProductViews = (customer.topProducts || []).reduce((s, p) => s + (p.count || 0), 0);

  // Warning bar: same signalType sent 5+ times with fewer than half delivered
  const signalGroups = {};
  for (const n of notifications) {
    if (!n.signalType) continue;
    if (!signalGroups[n.signalType]) signalGroups[n.signalType] = { total: 0, delivered: 0 };
    signalGroups[n.signalType].total++;
    if (n.outcome === 'delivered') signalGroups[n.signalType].delivered++;
  }
  const warningEntry       = Object.entries(signalGroups).find(([, v]) => v.total >= 5 && v.delivered < v.total / 2) || null;
  const warningSignalType  = warningEntry?.[0];
  const warningTotal       = warningEntry?.[1]?.total;
  const warningDelivered   = warningEntry?.[1]?.delivered;

  // Merged timeline: notifications + storefront events, newest-first
  const ALL_TIMELINE = [
    ...notifications.map(n => ({ _type: 'sent',  ts: n.sentAt || n.runAt, n })),
    ...events.map(e =>          ({ _type: 'event', ts: e.ts, e })),
  ].filter(x => x.ts).sort((a, b) => new Date(b.ts) - new Date(a.ts));

  const filteredTimeline = ALL_TIMELINE.filter(x =>
    timelineFilter === 'all'  ? true :
    timelineFilter === 'them' ? x._type === 'event' :
    x._type === 'sent'
  );
  const TIMELINE_CAP    = 30;
  const visibleTimeline = showAllTimeline ? filteredTimeline : filteredTimeline.slice(0, TIMELINE_CAP);

  const groupedTimeline = [];
  let lastDay = '';
  for (const item of visibleTimeline) {
    const day = new Date(item.ts).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).toUpperCase();
    if (day !== lastDay) { groupedTimeline.push({ day, items: [] }); lastDay = day; }
    groupedTimeline[groupedTimeline.length - 1].items.push(item);
  }

  const canWa = !!(waProfile && (waProfile.canFollowup || waProfile.canOrder));

  async function optOutWhatsapp() {
    setWaOptingOut(true);
    try {
      await apiSend(`/api/whatsapp/${encodeURIComponent(shop)}/opt-out`, 'POST', { profileId });
      setShowWaOptOutConfirm(false);
      const ctl = { aborted: false };
      await loadWaProfile(ctl);
    } catch (e) {
      setSendResult('Error: ' + (e.message || 'opt-out failed'));
    } finally {
      setWaOptingOut(false);
    }
  }

  const sendCard = (!hasPush && !hasEmail && !canWa) ? (
    <div style={{ ...DS.card, padding: 16, marginBottom: 0, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: '#9ca3af' }}>
        🔕 No push subscription or email on file
      </div>
    </div>
  ) : (
    <div style={{ ...DS.card, padding: 16, marginBottom: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#111827',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Send a message
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {hasPush && (
          <button onClick={() => setNotifTab('push')} style={{
            flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', border: '1px solid #e5e7eb', borderRadius: 8,
            background: notifTab === 'push' ? '#4f46e5' : '#fff',
            color: notifTab === 'push' ? '#fff' : '#6b7280',
          }}>🔔 Push</button>
        )}
        {hasEmail && (
          <button onClick={() => setNotifTab('email')} style={{
            flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', border: '1px solid #e5e7eb', borderRadius: 8,
            background: notifTab === 'email' ? '#4f46e5' : '#fff',
            color: notifTab === 'email' ? '#fff' : '#6b7280',
          }}>✉️ Email</button>
        )}
        {canWa && (
          <button onClick={() => setNotifTab('whatsapp')} style={{
            flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', border: '1px solid #e5e7eb', borderRadius: 8,
            background: notifTab === 'whatsapp' ? '#128C7E' : '#fff',
            color: notifTab === 'whatsapp' ? '#fff' : '#128C7E',
          }} aria-label="WhatsApp tab">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            WhatsApp
          </button>
        )}
      </div>
      {notifTab === 'push' && hasPush && (
        <NotificationComposer customer={customer} shop={shop}
          onSent={() => { setSendResult('Sent successfully!'); setTimeout(() => setSendResult(''), 3000); }}
          onError={(err) => setSendResult('Error: ' + err)} />
      )}
      {notifTab === 'email' && hasEmail && (
        <EmailComposer customer={customer} shop={shop}
          onSent={() => { setSendResult('Sent successfully!'); setTimeout(() => setSendResult(''), 3000); }}
          onError={(err) => setSendResult('Error: ' + err)} />
      )}
      {notifTab === 'whatsapp' && canWa && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* WA send error / fallback */}
          {(waSendError || waFallbackUrl) && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12,
              background: waFallbackUrl ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${waFallbackUrl ? '#bbf7d0' : '#fecaca'}`,
              color: waFallbackUrl ? '#15803d' : '#b91c1c',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              {waFallbackUrl
                ? <span>Popup blocked. <a href={waFallbackUrl} target="_blank" rel="noreferrer" style={{ color: '#128C7E', fontWeight: 600 }}>Open WhatsApp</a></span>
                : <span>{waSendError}</span>}
              <button onClick={clearWaError} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#9ca3af', padding: 0, lineHeight: 1 }}>×</button>
            </div>
          )}

          {/* Primary: followup button */}
          {waProfile?.canFollowup && (
            <button
              onClick={() => sendWhatsapp({ shopDomain: shop, profileId, purpose: 'followup' })}
              style={{ padding: '10px 14px', background: '#25D366', border: 'none', borderRadius: 10,
                       fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer',
                       display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              aria-label="Send WhatsApp follow-up message"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              WhatsApp
            </button>
          )}

          {/* Secondary: order message (shown when canFollowup + canOrder, or when only canOrder) */}
          {waProfile?.canOrder && (
            <button
              onClick={() => sendWhatsapp({ shopDomain: shop, profileId, purpose: 'order' })}
              style={{ padding: '9px 14px', background: '#fff', border: '1px solid #86efac',
                       borderRadius: 10, fontSize: 13, fontWeight: 600,
                       color: '#128C7E', cursor: 'pointer',
                       display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              aria-label="Send WhatsApp order message"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {waProfile.canFollowup ? 'Order message' : 'WhatsApp (order message)'}
            </button>
          )}

          {/* Neither case */}
          {!waProfile?.canFollowup && !waProfile?.canOrder && (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>
              {waProfile?.orderReason === 'opted_out' && 'Customer has opted out of WhatsApp messages.'}
              {waProfile?.orderReason === 'no_phone' && 'No phone number on file.'}
              {waProfile?.orderReason === 'invalid_phone' && 'Phone number could not be normalised to E.164.'}
            </div>
          )}

          {/* Remove from WhatsApp */}
          {waProfile?.whatsapp?.consentedAt && !showWaOptOutConfirm && (
            <button
              onClick={() => setShowWaOptOutConfirm(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                       color: '#9ca3af', textAlign: 'left', padding: 0, marginTop: 2 }}
              aria-label="Remove customer from WhatsApp list"
            >
              Remove from WhatsApp
            </button>
          )}
          {showWaOptOutConfirm && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                          background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
              <span style={{ fontSize: 12, color: '#b91c1c', flex: 1 }}>
                Remove and opt out?
              </span>
              <button
                onClick={optOutWhatsapp}
                disabled={waOptingOut}
                style={{ padding: '4px 10px', background: '#dc2626', border: 'none', borderRadius: 6,
                         fontSize: 12, fontWeight: 600, color: '#fff', cursor: waOptingOut ? 'not-allowed' : 'pointer' }}
                aria-label="Confirm opt-out"
              >
                {waOptingOut ? 'Removing…' : 'Yes, remove'}
              </button>
              <button
                onClick={() => setShowWaOptOutConfirm(false)}
                style={{ padding: '4px 8px', background: '#f3f4f6', border: 'none', borderRadius: 6,
                         fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
                aria-label="Cancel opt-out"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8,
                    display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Quiet hours respected
      </div>
      {sendResult && (
        <div style={{ marginTop: 8, fontSize: 13, textAlign: 'center',
          color: sendResult.startsWith('Error') ? '#dc2626' : '#16a34a' }}>
          {sendResult}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ ...DS.page, maxWidth: 1200, overflowX: 'hidden', width: '100%' }}>
      {backButton}

      {/* === 1. Identity strip === */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px', background: '#fff',
        border: '1px solid #e3e3e3', borderRadius: 12, marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
          background: cdAvatarColor.bg, color: cdAvatarColor.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700,
        }}>
          {cdInitial}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111827', wordBreak: 'break-all' }}>
              {displayName}
            </span>
            <StageBadge customer={profile} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: hasPush ? '#dcfce7' : '#f3f4f6',
              color: hasPush ? '#16a34a' : '#9ca3af',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              Push {hasPush ? 'on' : 'off'}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: hasEmail ? '#dcfce7' : '#f3f4f6',
              color: hasEmail ? '#16a34a' : '#9ca3af',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Email {hasEmail ? 'on' : 'off'}
            </span>
            {phone && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                background: '#f3f4f6', color: '#374151',
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                {phone}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
          {[
            { label: 'First Seen', val: formatCDDate(profile.createdAt) },
            { label: 'Last Seen',  val: formatCDDate(profile.lastSeenAt) },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af',
                            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* === 2. Health strip === */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: 12, marginBottom: 16,
      }}>
        {[
          {
            label: 'Messages Sent',
            value: notifications.length,
            sub: `${pushSentCount} push · ${emailSentCount} email`,
            color: '#111827',
          },
          {
            label: 'Reached Them',
            value: deliveredCount,
            sub: 'confirmed delivered',
            color: '#16a34a',
          },
          {
            label: "Didn't Arrive",
            value: didntArriveCount,
            sub: `${failedCount} failed · ${heldCount} held back`,
            color: '#d97706',
          },
          {
            label: 'Products Viewed',
            value: distinctProducts,
            sub: `${totalProductViews} total view${totalProductViews !== 1 ? 's' : ''}`,
            color: '#111827',
          },
        ].map(({ label, value, sub, color }) => (
          <div key={label} style={{ ...DS.card, padding: '12px 16px', marginBottom: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af',
                          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1, marginBottom: 3 }}>
              {notifLoading ? '—' : value}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* === 3. Warning bar (conditional) === */}
      {!notifLoading && warningEntry && (
        <div style={{
          padding: '10px 16px', background: '#fffbeb',
          border: '1px solid #fcd34d', borderRadius: 10,
          fontSize: 13, color: '#92400e', marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <span>
            <strong>{warningTotal}</strong>{' '}
            {SIGNAL_LABELS[warningSignalType] || warningSignalType} reminders have gone to this person.{' '}
            Only <strong>{warningDelivered}</strong> were confirmed delivered.{' '}
            Consider pausing them, or switching to email.
          </span>
        </div>
      )}

      {/* === 4. Main grid (1.75fr / 1fr) === */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? '1fr' : 'minmax(0, 1.75fr) minmax(0, 1fr)',
        gap: 16,
        alignItems: 'start',
      }}>

        {/* LEFT: Merged timeline */}
        <div style={{ ...DS.card, padding: 16, marginBottom: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 12,
            flexWrap: 'wrap', gap: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827',
                          textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              What&apos;s happened
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { key: 'all',  label: 'Everything' },
                { key: 'them', label: 'They did' },
                { key: 'us',   label: 'We sent' },
              ].map(({ key, label }) => (
                <button key={key}
                  onClick={() => setTimelineFilter(key)}
                  style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99,
                    cursor: 'pointer', border: '1px solid',
                    background: timelineFilter === key ? '#4f46e5' : '#fff',
                    borderColor: timelineFilter === key ? '#4f46e5' : '#e5e7eb',
                    color: timelineFilter === key ? '#fff' : '#6b7280',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {(notifLoading && ALL_TIMELINE.length === 0) ? (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>Loading…</div>
          ) : groupedTimeline.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>No activity yet</div>
          ) : (
            <>
              {groupedTimeline.map(({ day, items }) => (
                <div key={day}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: '#9ca3af',
                    letterSpacing: '0.08em', padding: '8px 0 4px',
                    borderBottom: '1px solid #f3f4f6', marginBottom: 2,
                  }}>
                    {day}
                  </div>
                  {items.map((item, idx) => {
                    const time = new Date(item.ts).toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit',
                    });
                    if (item._type === 'sent') {
                      const n = item.n;
                      return (
                        <div key={n._id || idx} style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0',
                        }}>
                          <span style={{ width: 58, flexShrink: 0, fontSize: 11,
                                         color: '#9ca3af', paddingTop: 2 }}>
                            {time}
                          </span>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            flexShrink: 0, marginTop: 4, background: '#818cf8',
                          }} />
                          <div style={{
                            flex: 1, minWidth: 0,
                            background: '#f7f7fb', border: '1px solid #e8e8f2',
                            borderRadius: 8, padding: '7px 10px',
                          }}>
                            <div style={{
                              display: 'flex', alignItems: 'flex-start',
                              justifyContent: 'space-between', gap: 6, marginBottom: 3,
                            }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#818cf8',
                                            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                You sent
                              </div>
                              <StatusPill outcome={n.outcome} status={n.status} />
                            </div>
                            {n.title && (
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827',
                                            marginBottom: 2, overflow: 'hidden',
                                            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {n.title}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>
                              {SIGNAL_LABELS[n.signalType] || n.signalType || 'Notification'}
                              {n.channel ? ` · ${n.channel}` : ''}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const e = item.e;
                    return (
                      <div key={idx} style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0',
                      }}>
                        <span style={{ width: 58, flexShrink: 0, fontSize: 11,
                                       color: '#9ca3af', paddingTop: 4 }}>
                          {time}
                        </span>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          flexShrink: 0, marginTop: 4,
                          background: EVENT_DOT_COLORS[e.type] || '#d1d5db',
                        }} />
                        <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                          <div style={{ fontSize: 12, color: '#374151' }}>
                            {EVENT_LABELS[e.type]}
                          </div>
                          {e.type === 'product_view' && (e.meta?.productTitle || e.path) && (
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>
                              {e.meta?.productTitle || getFriendlyPath(e.path)}
                            </div>
                          )}
                          {e.type === 'page_view' && e.path && (
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>
                              {getFriendlyPath(e.path)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {!showAllTimeline && filteredTimeline.length > TIMELINE_CAP && (
                <button
                  onClick={() => setShowAllTimeline(true)}
                  aria-label="Show earlier activity"
                  style={{
                    width: '100%', marginTop: 12, padding: '8px',
                    fontSize: 12, fontWeight: 600, color: '#6b7280',
                    background: '#f9fafb', border: '1px solid #e5e7eb',
                    borderRadius: 8, cursor: 'pointer',
                  }}>
                  Show earlier activity ({filteredTimeline.length - TIMELINE_CAP} more)
                </button>
              )}
            </>
          )}
        </div>

        {/* RIGHT: What they want + Send a message */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {customer.topProducts?.length > 0 && (
            <div style={{ ...DS.card, padding: 16, marginBottom: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827',
                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                What they want
              </div>
              {customer.topProducts.map((p, i) => (
                <div key={p.productId}>
                  {i > 0 && (
                    <div style={{ borderTop: '1px solid #f3f4f6', margin: '10px 0' }} />
                  )}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <ProductThumbnail imageUrl={p.imageUrl} title={p.title} size={64} radius={10} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        Viewed {p.count} time{p.count !== 1 ? 's' : ''}
                        {p.lastSeen ? ` · ${formatCDDate(p.lastSeen)}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {sendCard}
        </div>

      </div>
    </div>
  );
}
