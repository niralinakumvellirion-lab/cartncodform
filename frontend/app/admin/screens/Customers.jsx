'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

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
};

const STAGE_CONFIG = {
  customer: { label: 'Bought once', bg: '#dcfce7', color: '#16a34a' },
  identified: { label: 'Has a cart', bg: '#fef9c3', color: '#ca8a04' },
  anonymous: { label: 'Visitor', bg: '#f3f4f6', color: '#6b7280' },
  lapsed: { label: 'Going quiet', bg: '#fee2e2', color: '#dc2626' },
};

function getRelativeTime(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

const GRID_COLS = '2fr 1fr 2fr minmax(80px, 1fr) 1.5fr 1fr';

const FILTER_TABS = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'has_cart', label: 'Has a cart' },
  { key: 'bought_once', label: 'Bought once' },
  { key: 'repeat_buyer', label: 'Repeat buyer' },
  { key: 'going_quiet', label: 'Going quiet' },
];

// --- Everything below this line through ProductThumbnail/
// NotificationComposer/EmailComposer is copied from
// frontend/app/admin/screens/Journey.jsx, per the Journey-panel merge
// (see audits/customers-journey-merge-build-audit.txt). Journey.jsx
// itself is unchanged and still exists, just unlinked from the nav. ---

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
function StageBadge({ customer }) {
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
      display: 'inline-block',
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

function ReachIcons({ customer }) {
  const hasPush = customer.channels?.push?.subscribed;
  const hasEmail = !!customer.channels?.email?.address;
  const hasPhone = customer.identifiers?.phones?.length > 0;

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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

export default function Customers({ shop }) {
  const [profiles, setProfiles] = useState([]);
  const [signalMap, setSignalMap] = useState({});
  const [signalCountMap, setSignalCountMap] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('everyone');
  const [search, setSearch] = useState('');

  // --- Journey panel state (see audits/customers-journey-merge-build-audit.txt).
  // Replaces the screen's old selectedProfileId/full-screen-ProfileScreen
  // navigation, which a row click can no longer reach — see the audit
  // for why that was retired rather than left as dead code. ---
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadData = useCallback(
    async (signal) => {
      if (!shop) return;
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (filter && filter !== 'everyone') params.set('filter', filter);
        if (search.trim()) params.set('search', search.trim());

        const [profRes, sigRes] = await Promise.all([
          apiGet(`/api/profiles/${encodeURIComponent(shop)}/profiles?${params.toString()}`),
          apiGet(`/api/profiles/${encodeURIComponent(shop)}/signals?limit=200`),
        ]);
        if (signal?.aborted) return;

        setProfiles(Array.isArray(profRes?.profiles) ? profRes.profiles : []);
        setTotal(Number.isFinite(profRes?.total) ? profRes.total : 0);
        setError(null);

        // strongest signal per profile + a per-profile signal count
        const map = {};
        const countMap = {};
        for (const sig of Array.isArray(sigRes?.signals) ? sigRes.signals : []) {
          const pid =
            typeof sig.profileId === 'object' && sig.profileId
              ? sig.profileId._id
              : sig.profileId;
          if (!pid) continue;
          const key = String(pid);
          countMap[key] = (countMap[key] || 0) + 1;
          if (!map[key] || (sig.strength || 0) > (map[key].strength || 0)) {
            map[key] = { type: sig.type, strength: sig.strength || 0 };
          }
        }
        setSignalMap(map);
        setSignalCountMap(countMap);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err.message || 'Failed to load customers');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [shop, filter, search]
  );

  useEffect(() => {
    const controller = { aborted: false };
    // debounce so typing in the search box doesn't fire a request per keystroke
    const t = setTimeout(() => loadData(controller), 300);
    return () => {
      controller.aborted = true;
      clearTimeout(t);
    };
  }, [loadData]);

  // --- Journey panel data loading ---
  // NOTE ON A REAL BACKEND GAP FOUND WHILE IMPLEMENTING THIS: the given
  // task text called this exact endpoint
  // (`/api/events/:shop/journey?profileId=...`) as if profileId filtering
  // already existed. It did not — GET /api/events/:shopDomain/journey
  // (backend/routes/events.js) previously only accepted limit/page and
  // silently ignored any other query param, so this call would have come
  // back with an arbitrary top-50 customer (whoever has the strongest
  // signal / most recent activity), NOT the one actually clicked — and
  // for any profile with zero active signals, no request shape could ever
  // have found it at all, since the old endpoint only ever iterated
  // profiles that have a Signal document. Rather than build a different,
  // ad hoc client-side lookup, backend/routes/events.js was extended to
  // genuinely support `profileId` (see the buildJourneyEntry refactor and
  // audits/customers-journey-merge-build-audit.txt), so this call below
  // now works exactly as the given code intended.
  async function loadCustomerJourney(profileId) {
    if (!shop || !profileId) return;
    setJourneyLoading(true);
    try {
      const data = await apiGet(
        `/api/events/${encodeURIComponent(shop)}/journey?profileId=${profileId}`
      );
      if (data?.customers?.length > 0) {
        setSelectedCustomer(data.customers[0]);
      }
    } catch (e) {
      console.error('[customers] journey load error:', e.message);
    } finally {
      setJourneyLoading(false);
    }
  }

  // --- Send functions (per task Step 6). NOTE: NotificationComposer and
  // EmailComposer above were copied over with their own internal
  // apiSend() calls unmodified (per Step 5's "copy ... full"), so these
  // two wrapper functions are not currently called by anything — kept
  // here anyway per the explicit instruction to add them. See
  // audits/customers-journey-merge-build-audit.txt. ---
  async function sendJourneyPush(profileId, title, body) {
    return apiSend('/api/push/send-journey', 'POST',
      { profileId, title, body, url: '/' });
  }

  async function sendJourneyEmail(profileId, subject, body) {
    return apiSend('/api/push/send-journey-email', 'POST',
      { profileId, subject, body });
  }

  const [sendResult, setSendResult] = useState('');
  const [notifTab, setNotifTab] = useState('push');

  // Default the active tab to 'push' when the newly-selected customer has
  // push, else 'email' — reset every time selectedCustomer itself changes
  // (a fresh row click / journey load), but not on every render, so
  // manually switching tabs for the SAME customer isn't fought (FIX 1;
  // see audits/customer-panel-fix-audit.txt). Uses `notifTab`/
  // `setNotifTab` (the file's existing state) rather than a separately
  // named `activeTab`/`setActiveTab` as the task text's own snippet did,
  // since notifTab is already the single source of truth wired into the
  // tab buttons and composer rendering below — introducing a second,
  // differently-named state for the same purpose would just create two
  // states that could disagree.
  useEffect(() => {
    if (selectedCustomer) {
      const hasPush = selectedCustomer?.profile?.channels?.push?.subscribed;
      setNotifTab(hasPush ? 'push' : 'email');
    }
  }, [selectedCustomer]);

  return (
    <div style={DS.page}>
      <PageHeader
        title="Customers"
        subtitle="All push notification subscribers"
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

      {/* Search + Filter row — stacks on mobile */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          alignItems: 'center',
          flexDirection: isMobileView ? 'column' : 'row',
        }}
      >
        <input
          type="text"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: isMobileView ? 'none' : '1',
            width: isMobileView ? '100%' : undefined,
            minWidth: isMobileView ? 0 : '200px',
            maxWidth: isMobileView ? '100%' : '400px',
            padding: '8px 12px',
            fontSize: '13px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            outline: 'none',
            background: '#fff',
            boxSizing: 'border-box',
          }}
        />

        {/* Filter tabs — horizontal scroll on mobile */}
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
      </div>

      {/* Customer list + Journey right panel — 2-panel layout once a
          customer is selected (see audits/customers-journey-merge-build-audit.txt) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: (selectedCustomer || journeyLoading)
          ? (isMobileView ? '1fr' : '1fr 380px')
          : '1fr',
        gap: 16,
        alignItems: 'start',
      }}>

        {/* Left: existing customer list */}
        <div>
          <div
            style={{ ...DS.card, padding: 0, overflow: 'hidden' }}
          >
            {/* Table header — desktop only */}
            {!isMobileView && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_COLS,
                  padding: '8px 16px',
                  borderBottom: '1px solid #e5e7eb',
                  background: '#f9fafb',
                }}
              >
                {['Customer', 'Stage', 'Most interested in', 'Reach', 'Last messaged', 'Spent'].map(
                  (h) => (
                    <div
                      key={h}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {h}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Rows */}
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  style={{
                    height: '60px',
                    borderBottom: '1px solid #f3f4f6',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px',
                  }}
                >
                  <div
                    style={{
                      width: '60%',
                      height: '14px',
                      background: '#f3f4f6',
                      borderRadius: '4px',
                    }}
                  />
                </div>
              ))
            ) : profiles.length ? (
              profiles.map((p, i) => {
                const sig = signalMap[p._id?.toString()];
                const lastMsg = p.messages?.length
                  ? p.messages[p.messages.length - 1]
                  : null;
                const isSel = selectedCustomer?.profile?._id === p._id;

                const name =
                  p.identifiers?.emails?.[0] || p.identifiers?.phones?.[0] || null;
                const displayName = name
                  ? name
                  : `Anonymous shopper · #${p._id?.toString().slice(-5)}`;

                const lastSeen = p.lastSeenAt
                  ? getRelativeTime(new Date(p.lastSeenAt))
                  : null;

                const interests = p.interests ? Object.entries(p.interests) : [];
                const topInterest = interests.sort((a, b) => b[1] - a[1])[0];

                if (isMobileView) {
                  const sigN = signalCountMap[p._id] || 0;
                  return (
                    <div
                      key={p._id}
                      onClick={() => loadCustomerJourney(p.profileId || p._id)}
                      style={{
                        padding: '14px 16px',
                        borderBottom:
                          i < profiles.length - 1 ? '1px solid #f9fafb' : 'none',
                        cursor: 'pointer',
                        background: isSel ? '#f5f3ff' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSel) e.currentTarget.style.background = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isSel ? '#f5f3ff' : '#fff';
                      }}
                    >
                      {/* Row 1: Name + Stage badge */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '6px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#111827',
                          }}
                        >
                          {p.identifiers?.emails?.[0] ||
                            p.identifiers?.phones?.[0] ||
                            `Anonymous #${p._id?.toString().slice(-5)}`}
                        </div>
                        <div style={{ flexShrink: 0, marginLeft: '8px' }}>
                          <StageBadge customer={p} />
                        </div>
                      </div>

                      {/* Row 2: Last seen + Signal */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '4px',
                        }}
                      >
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                          {p.lastSeenAt
                            ? `seen ${getRelativeTime(new Date(p.lastSeenAt))}`
                            : ''}
                        </div>
                        {sigN > 0 && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#f97316',
                              fontWeight: '500',
                            }}
                          >
                            {sigN} signal{sigN > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Row 3: Channels + LTV */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <ReachIcons customer={p} />
                        {p.orders?.ltv > 0 && (
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#111827',
                            }}
                          >
                            ₹{p.orders.ltv.toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // "Most interested in" truncated to 20 chars, per the
                // redesign spec. NOTE: the task described this as a
                // "product title", but no per-product data is fetched
                // for the list view (topProducts only exists once a
                // customer's Journey panel is loaded, per-row, on
                // click) — the only "most interested in" data actually
                // available for every row up front is the existing
                // topInterest name (from p.interests), so that's what
                // gets truncated here. See
                // audits/customers-ui-redesign-audit.txt.
                const interestRaw = topInterest?.[0] || null;
                const interestDisplay = interestRaw
                  ? (interestRaw.length > 20 ? interestRaw.slice(0, 20) + '…' : interestRaw)
                  : '—';

                const avatarSource = p.identifiers?.emails?.[0];
                const avatarInitial = (avatarSource || '?').charAt(0).toUpperCase();

                return (
                  <div
                    key={p._id}
                    onClick={() => loadCustomerJourney(p.profileId || p._id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID_COLS,
                      padding: '12px 16px',
                      borderBottom:
                        i < profiles.length - 1 ? '1px solid #f3f4f6' : 'none',
                      cursor: 'pointer',
                      background: isSel ? '#f5f3ff' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel) e.currentTarget.style.background = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isSel ? '#f5f3ff' : '#fff';
                    }}
                  >
                    {/* Customer */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%',
                                    background: '#eef2ff', color: '#4f46e5',
                                    display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: 13,
                                    fontWeight: 700, flexShrink: 0 }}>
                        {avatarInitial}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                          {displayName}
                        </div>
                        {lastSeen && (
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>
                            seen {lastSeen}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stage */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <StageBadge customer={p} />
                    </div>

                    {/* Most interested in */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {interestRaw ? (
                        <>
                          <div style={{ fontSize: 12, color: '#374151',
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap' }}>
                            {interestDisplay}
                          </div>
                          {sig && (
                            <div
                              style={{ fontSize: '12px', color: '#6366f1', marginTop: '2px',
                                       overflow: 'hidden', textOverflow: 'ellipsis',
                                       whiteSpace: 'nowrap' }}
                            >
                              {SIGNAL_LABELS[sig.type] || sig.type}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                      )}
                    </div>

                    {/* Reach — channel icons */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <ReachIcons customer={p} />
                    </div>

                    {/* Last messaged */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: 12,
                        color: '#6b7280',
                      }}
                    >
                      {lastMsg ? (
                        getRelativeTime(new Date(lastMsg.sentAt))
                      ) : (
                        <span style={{ color: '#d1d5db' }}>Never</span>
                      )}
                    </div>

                    {/* Spent */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#111827',
                      }}
                    >
                      {p.orders?.ltv > 0 ? (
                        `₹${p.orders.ltv.toLocaleString('en-IN')}`
                      ) : (
                        <span style={{ color: '#d1d5db' }}>—</span>
                      )}
                    </div>
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
                No customers match this view.
              </div>
            )}
          </div>
        </div>

        {/* Right: Journey panel */}
        {(selectedCustomer || journeyLoading) && (
          <div style={{
            position: 'sticky',
            top: 16,
            height: 'calc(100vh - 120px)',
            overflowY: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {journeyLoading && !selectedCustomer ? (
              <div style={{ ...DS.card, marginBottom: 0, textAlign: 'center',
                            padding: '32px 16px', color: '#9ca3af', fontSize: 13,
                            position: 'relative' }}>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  style={{ position: 'absolute', top: 8, right: 8,
                           background: 'none', border: 'none',
                           fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>
                  ✕
                </button>
                Loading journey…
              </div>
            ) : selectedCustomer && (
              <>
                {/* Right panel header — see FIX 2,
                    audits/customer-panel-fix-audit.txt. Replaces the old
                    bare floating close button; the "Customer journey"
                    title that used to live inside the timeline card below
                    was moved up here as the subtitle instead of being
                    shown twice. */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center', marginBottom: 12,
                              paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                      {selectedCustomer?.profile?.identifiers?.emails?.[0]
                        || 'Anonymous customer'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      Customer journey
                    </div>
                  </div>
                  <button onClick={() => setSelectedCustomer(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                             color: '#9ca3af', fontSize: 16, padding: 4 }}>✕</button>
                </div>

                {/* Journey timeline */}
                <div style={{
                  ...DS.card, padding: '16px', marginBottom: 0,
                  flex: '1 1 0', minHeight: 0, overflowY: 'auto',
                }}>
                  {/* Top products */}
                  {selectedCustomer.topProducts?.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{
                        fontSize: 10, color: '#9ca3af', fontWeight: '600',
                        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px',
                      }}>
                        Most interested in
                      </div>
                      {selectedCustomer.topProducts.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center',
                                      gap: 10, padding: '8px 0',
                                      borderBottom: i < selectedCustomer.topProducts.length - 1
                                        ? '1px solid #f3f4f6' : 'none' }}>
                          <ProductThumbnail imageUrl={p.imageUrl} title={p.title} size={36} radius={6} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827',
                                          overflow: 'hidden', textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap' }}>{p.title}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                              {p.count} view{p.count !== 1 ? 's' : ''}
                            </div>
                          </div>
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
                    {(() => {
                      const filteredEvents = (selectedCustomer.recentEvents || [])
                        .filter((e) => EVENT_LABELS[e.type]);

                      if (filteredEvents.length === 0) {
                        return (
                          <div style={{ fontSize: '12px', color: '#9ca3af', padding: '4px 0' }}>
                            No journey data yet
                          </div>
                        );
                      }

                      return filteredEvents.map((e, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: '8px', alignItems: 'flex-start',
                          padding: '4px 0', borderBottom: '1px solid #f9fafb', fontSize: '12px',
                        }}>
                          <span style={{
                            display: 'inline-block',
                            width: '8px', height: '8px',
                            borderRadius: '50%',
                            background: EVENT_DOT_COLORS[e.type],
                            flexShrink: 0, marginTop: '6px',
                          }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ color: '#374151' }}>{EVENT_LABELS[e.type]}</div>
                            {e.type === 'product_view' && (e.meta?.productTitle || e.path) && (
                              <div style={{ color: '#6b7280', fontSize: '11px' }}>
                                {e.meta?.productTitle || getFriendlyPath(e.path)}
                              </div>
                            )}
                            {e.type === 'page_view' && e.path && (
                              <div style={{ color: '#6b7280', fontSize: '11px' }}>
                                {getFriendlyPath(e.path)}
                              </div>
                            )}
                          </div>
                          <span style={{ color: '#9ca3af', flexShrink: 0, fontSize: '11px' }}>
                            {new Date(e.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ));
                    })()}
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
                        ...DS.card, background: DS.gray50, padding: '16px',
                        marginBottom: 0, textAlign: 'center',
                        flex: '0 0 auto', overflowY: 'auto', maxHeight: '45vh',
                      }}>
                        <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                          🔕 No push subscription or email on file — cannot send a notification
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div style={{
                      ...DS.card, padding: '16px', marginBottom: 0,
                      flex: '0 0 auto', overflowY: 'auto', maxHeight: '45vh',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 10 }}>
                        Send notification
                      </div>

                      {/* Push / Email tab switcher — hides an unavailable
                          channel entirely instead of showing a disabled
                          "Not available" tab (FIX 1). NOTE: the
                          "!hasPush && !hasEmail" branch below is
                          currently unreachable in practice — the outer
                          `if (!hasPush && !hasEmail) return (...)` guard
                          just above this whole block already short-
                          circuits with its own "No push subscription or
                          email on file" message before this switcher is
                          ever reached in that case. Implemented anyway,
                          verbatim, per the explicit instruction — see
                          audits/customer-panel-fix-audit.txt. */}
                      <div style={{
                        display: 'flex', gap: 8, marginBottom: 12,
                      }}>
                        {hasPush && (
                          <button
                            onClick={() => setNotifTab('push')}
                            style={{
                              borderRadius: 7, padding: '7px 16px',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              border: 'none',
                              background: notifTab === 'push' ? '#4f46e5' : '#f3f4f6',
                              color: notifTab === 'push' ? '#fff' : '#6b7280',
                            }}
                          >
                            🔔 Push
                          </button>
                        )}
                        {hasEmail && (
                          <button
                            onClick={() => setNotifTab('email')}
                            style={{
                              borderRadius: 7, padding: '7px 16px',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              border: 'none',
                              background: notifTab === 'email' ? '#4f46e5' : '#f3f4f6',
                              color: notifTab === 'email' ? '#fff' : '#6b7280',
                            }}
                          >
                            ✉️ Email
                          </button>
                        )}
                        {!hasPush && !hasEmail && (
                          <div style={{ fontSize: 13, color: '#9ca3af', padding: 16 }}>
                            No contact channels available
                          </div>
                        )}
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
