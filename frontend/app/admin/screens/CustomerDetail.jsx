'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiSend } from '../../../lib/api';
import { ShimmerBox, ShimmerCard } from '../components/Shimmer';
import { DS, StageBadge, ReachIcons, useWhatsapp, getCustomerEmail } from './customerShared';
import { EmailPreviewFrame } from '../components/EmailPreviewFrame';

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
  add_to_cart: 'Added to cart',
  reached_checkout: 'Reached checkout',
  purchase: 'Placed an order',
};

const EVENT_DOT_COLORS = {
  page_view: '#3b82f6',
  push_prompt_shown: '#f59e0b',
  push_prompt_accepted: '#10b981',
  product_view: '#8b5cf6',
  add_to_cart: '#f97316',
  reached_checkout: '#2563eb',
  purchase: '#16a34a',
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

// --- WhatsApp suggestion types -----------------------------------------------
// Each type: { key, purpose, title, reason(customer), preview(customer),
//             eligible(customer, waProfile) }
// purpose 'followup' requires consent; 'order' is non-promotional.

const WA_SUGGESTION_TYPES = [
  {
    key: 'cart_reminder',
    purpose: 'followup',
    title: 'Cart reminder',
    reason: (c) => {
      const cart = c?.profile?.identifiers?.cartTokens;
      return cart?.length ? 'Has an abandoned cart' : 'Cart detected';
    },
    preview: () => "You left something in your cart — complete your order before it sells out.",
    eligible: (c, wa) => !!(wa?.canFollowup && c?.profile?.identifiers?.cartTokens?.length > 0),
  },
  {
    key: 'welcome_offer',
    purpose: 'followup',
    title: 'Welcome + offer',
    reason: () => 'New subscriber, no order yet',
    preview: () => "Welcome! We're glad you're here — explore our collection.",
    eligible: (c, wa) => !!(wa?.canFollowup && (c?.profile?.orders?.count || 0) === 0),
  },
  {
    key: 'cod_confirmation',
    purpose: 'order',
    title: 'COD order confirmation',
    reason: () => 'Cash on Delivery order placed',
    preview: () => "We're confirming your Cash on Delivery order — keep your phone handy for delivery.",
    eligible: (c, wa) => !!(wa?.canOrder && (c?.profile?.orders?.codCount || 0) > 0),
  },
  {
    key: 'order_thank_you',
    purpose: 'order',
    title: 'Order update / thank you',
    reason: (c) => {
      const last = c?.profile?.orders?.lastOrderAt;
      if (!last) return 'Has a recent order';
      const days = Math.floor((Date.now() - new Date(last)) / 86400000);
      return days <= 1 ? 'Ordered today' : `Ordered ${days} day${days > 1 ? 's' : ''} ago`;
    },
    preview: () => "Thank you for your order! We're getting it ready for you.",
    eligible: (c, wa) => !!(wa?.canOrder && (c?.profile?.orders?.count || 0) > 0),
  },
  {
    key: 'win_back',
    purpose: 'followup',
    title: 'Win-back',
    reason: (c) => {
      const last = c?.profile?.lastSeenAt;
      if (!last) return 'Not seen recently';
      const days = Math.floor((Date.now() - new Date(last)) / 86400000);
      return `Not seen for ${days} day${days !== 1 ? 's' : ''}`;
    },
    preview: () => "It's been a while — we miss you! Come check out what's new.",
    eligible: (c, wa) => {
      if (!wa?.canFollowup) return false;
      const last = c?.profile?.lastSeenAt;
      if (!last) return false;
      return (Date.now() - new Date(last)) >= 30 * 86400000;
    },
  },
  {
    key: 'product_followup',
    purpose: 'followup',
    title: 'Product follow-up',
    reason: (c) => {
      const p = c?.topProducts?.[0]?.title;
      return p && !/^\d+$/.test(p) ? `Viewed ${p}` : 'Viewed products, no purchase';
    },
    preview: () => "Still thinking about what you saw? We saved it for you.",
    eligible: (c, wa) =>
      !!(wa?.canFollowup && c?.topProducts?.length > 0 && (c?.profile?.orders?.count || 0) === 0),
  },
];

/**
 * rankWaSuggestions(customer, waProfile) → [recommended, ...alternatives]
 * Returns 1–3 eligible suggestion objects, best first. If none are eligible,
 * returns one neutral 'say_hello' placeholder (purpose: 'followup', needs consent)
 * or an empty array when canFollowup is also false.
 *
 * Priority order (highest first):
 *   cod_confirmation, cart_reminder, order_thank_you, welcome_offer,
 *   win_back, product_followup
 */
const WA_RANK_ORDER = [
  'cod_confirmation', 'cart_reminder', 'order_thank_you',
  'welcome_offer', 'win_back', 'product_followup',
];

function rankWaSuggestions(customer, waProfile) {
  const ranked = WA_RANK_ORDER
    .map(key => WA_SUGGESTION_TYPES.find(t => t.key === key))
    .filter(t => t && t.eligible(customer, waProfile));

  if (ranked.length === 0 && waProfile?.canFollowup) {
    return [{
      key: 'say_hello',
      purpose: 'followup',
      title: 'Say hello',
      reason: () => 'Subscriber with no specific signal',
      preview: () => "Hi there! We have something special waiting for you in our store.",
      eligible: () => true,
    }];
  }

  // canOrder=true but canFollowup=false and no eligible order suggestions
  // (e.g. phone present but opted out of follow-ups, no orders yet).
  // Without this fallback the composer renders with no selectable message.
  if (ranked.length === 0 && waProfile?.canOrder) {
    return [{
      key: 'say_hello',
      purpose: 'order',
      title: 'Say hello',
      reason: () => 'WhatsApp enabled',
      preview: () => "Hi there! We have something for you.",
      eligible: () => true,
    }];
  }

  return ranked.slice(0, 3);
}

// Resolve first name from customer profile (mirrors backend resolveFirstName).
function resolveWaFirstName(customer) {
  const profile = customer?.profile;
  const email =
    profile?.channels?.email?.address ||
    profile?.identifiers?.emails?.[0];
  if (!email) return 'there';
  const local = email.split('@')[0].split(/[._+]/)[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// Full message body per template key — WITHOUT the store link (server appends it).
// Mirrors WA_TEMPLATES in backend/routes/whatsapp.js.
const WA_TEMPLATE_BODY = {
  cart_reminder: (n, s) =>
    `Hi ${n}! 🛒 You left something in your cart at ${s}.\n\n` +
    `Complete your order before it sells out.\n\n` +
    `Reply STOP to opt out.`,
  welcome_offer: (n, s) =>
    `Hi ${n}! Welcome to ${s}. 🎉\n\n` +
    `We're glad you're here. Explore our collection and find something you'll love.\n\n` +
    `Reply STOP to opt out.`,
  cod_confirmation: (n, s) =>
    `Hi ${n}! This is ${s}.\n\n` +
    `We're confirming your Cash on Delivery order. Please keep your phone handy for delivery.\n\n` +
    `Reply STOP to opt out.`,
  order_thank_you: (n, s) =>
    `Hi ${n}! Thank you for your order at ${s}. 🙏\n\n` +
    `We're getting it ready for you.\n\n` +
    `Reply STOP to opt out.`,
  win_back: (n, s) =>
    `Hi ${n}! It's been a while — we miss you at ${s}. 💛\n\n` +
    `Come check out what's new.\n\n` +
    `Reply STOP to opt out.`,
  product_followup: (n, s) =>
    `Hi ${n}! Still thinking about what you saw at ${s}?\n\n` +
    `We saved it for you. Take another look.\n\n` +
    `Reply STOP to opt out.`,
  say_hello: (n, s) =>
    `Hi ${n}! This is ${s}.\n\n` +
    `We have something special for you. Come take a look.\n\n` +
    `Reply STOP to opt out.`,
};

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

function ProductThumb({ imageUrl, size = 40 }) {
  const [imgErr, setImgErr] = useState(false);
  if (!imageUrl || imgErr) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 6, flexShrink: 0,
        background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width={Math.round(size * 0.45)} height={Math.round(size * 0.45)}
          viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
    );
  }
  return (
    <img src={imageUrl} alt="" style={{
      width: size, height: size, borderRadius: 6, objectFit: 'cover', flexShrink: 0,
    }} onError={() => setImgErr(true)} />
  );
}

/* ─── Phone frame (shared by all mobile previews) ─── */
function PhoneFrame({ children, height }) {
  return (
    <div style={{
      width: 252, flexShrink: 0,
      background: '#1C1C1E', borderRadius: 44,
      padding: '14px 8px',
      boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
    }}>
      <div style={{
        width: 88, height: 8, background: '#000',
        borderRadius: 99, margin: '0 auto 10px',
      }} />
      <div style={{
        borderRadius: 30, overflow: 'hidden',
        height: height || 480, background: '#000',
      }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Push previews ─── */
function PushDesktopPreview({ title, body, shop, productImage }) {
  const storeName = (shop || '').split('.')[0] || 'Your store';
  return (
    <div style={{ flex: '1 1 220px', maxWidth: 420 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af',
                    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
        Desktop
      </div>
      <div style={{
        background: '#fff', borderRadius: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        border: '1px solid #e5e7eb', overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4,
                          background: '#4f46e5', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', flex: 1 }}>
              {storeName}
            </span>
            <span style={{ fontSize: 10, color: '#9ca3af' }}>now</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || 'Notification title'}
          </div>
          <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {body || 'Notification body'}
          </div>
        </div>
        {/* Large image banner — shown below text, like Chrome desktop notifications */}
        {productImage && (
          <img src={productImage} alt="Product" style={{
            display: 'block', width: '100%', height: 140,
            objectFit: 'cover',
          }} />
        )}
      </div>
    </div>
  );
}

function PushMobilePreview({ title, body, shop, productImage }) {
  const storeName = (shop || '').split('.')[0] || 'Your store';
  return (
    <div style={{ height: '100%',
                  background: 'linear-gradient(160deg, #1e293b 0%, #0f172a 100%)',
                  display: 'flex', flexDirection: 'column',
                  padding: '22px 10px 10px' }}>
      <div style={{ textAlign: 'center', fontSize: 30, fontWeight: 300,
                    color: '#fff', marginBottom: 2 }}>
        {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.55)',
                    marginBottom: 18 }}>
        {new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.14)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '9px 11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4,
                          background: '#4f46e5', flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.8)',
                           textTransform: 'uppercase', flex: 1 }}>
              {storeName}
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>now</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title || 'Notification title'}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4,
                            overflow: 'hidden', display: '-webkit-box',
                            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {body || 'Notification body'}
              </div>
            </div>
            {productImage && (
              <img src={productImage} alt="Product" style={{
                width: 44, height: 44, borderRadius: 6,
                objectFit: 'cover', flexShrink: 0,
              }} />
            )}
          </div>
        </div>
        {/* Expanded image below — like Android rich notification */}
        {productImage && (
          <img src={productImage} alt="Product" style={{
            display: 'block', width: '100%', height: 80,
            objectFit: 'cover',
          }} />
        )}
      </div>
    </div>
  );
}

/* ─── Email previews ─── */

/* ─── WhatsApp previews ─── */
function WaBubble({ messageText, selectedProduct, shop, firstName, phone, containerStyle, textSize, headerSize, miniLayout }) {
  const WA_GREEN = '#25D366';
  const WA_TEAL = '#128C7E';
  const storeDomain = (shop || '').replace(/\.myshopify\.com$/, '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column',
                  height: '100%', ...containerStyle }}>
      {/* Chat header */}
      <div style={{ background: WA_TEAL, padding: miniLayout ? '7px 9px' : '10px 14px',
                    display: 'flex', alignItems: 'center', gap: miniLayout ? 6 : 10, flexShrink: 0 }}>
        <div style={{
          width: miniLayout ? 26 : 32, height: miniLayout ? 26 : 32,
          borderRadius: '50%', flexShrink: 0,
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: miniLayout ? 11 : 14, color: '#fff', fontWeight: 700,
        }}>
          {(firstName || phone || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: miniLayout ? 11 : 13, fontWeight: 700, color: '#fff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {firstName || phone || 'Customer'}
          </div>
          {phone && !miniLayout && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{phone}</div>
          )}
        </div>
      </div>
      {/* Chat area */}
      <div style={{ flex: 1, background: '#ECE5DD',
                    padding: miniLayout ? '8px 8px' : '12px 12px', overflowY: 'auto' }}>
        {messageText.trim() ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{
              background: WA_GREEN,
              borderRadius: miniLayout ? '10px 10px 2px 10px' : '12px 12px 2px 12px',
              padding: miniLayout ? '6px 9px' : '8px 12px',
              maxWidth: '90%',
            }}>
              {selectedProduct && (
                <div style={{
                  background: 'rgba(0,0,0,0.15)', borderRadius: miniLayout ? 5 : 6,
                  padding: miniLayout ? '4px 6px' : '6px 8px',
                  marginBottom: miniLayout ? 4 : 6,
                  display: 'flex', gap: miniLayout ? 5 : 8, alignItems: 'center',
                }}>
                  {selectedProduct.imageUrl && (
                    <img src={selectedProduct.imageUrl} alt="" style={{
                      width: miniLayout ? 28 : 36, height: miniLayout ? 28 : 36,
                      borderRadius: miniLayout ? 3 : 4, objectFit: 'cover', flexShrink: 0,
                    }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: miniLayout ? 9 : 11, fontWeight: 700, color: '#fff',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {selectedProduct.title || selectedProduct.handle}
                    </div>
                    <div style={{ fontSize: miniLayout ? 8 : 10, color: 'rgba(255,255,255,0.7)' }}>
                      {storeDomain}
                    </div>
                  </div>
                </div>
              )}
              <div style={{
                fontSize: textSize || 13, color: '#fff', lineHeight: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: miniLayout ? 100 : undefined, overflow: miniLayout ? 'hidden' : undefined,
              }}>
                {messageText}
              </div>
              {selectedProduct && (
                <div style={{
                  fontSize: miniLayout ? 9 : 12, color: 'rgba(200,240,220,0.9)',
                  marginTop: miniLayout ? 2 : 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {shop ? `https://${shop}/products/${selectedProduct.handle}` : 'Product link'}
                </div>
              )}
              <div style={{
                fontSize: miniLayout ? 8 : 10, color: 'rgba(255,255,255,0.65)',
                textAlign: 'right', marginTop: miniLayout ? 2 : 4,
              }}>
                {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ✓✓
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: miniLayout ? 9 : 12, color: '#9ca3af',
            textAlign: 'center', paddingTop: miniLayout ? 16 : 20,
          }}>
            Preview appears as you type
          </div>
        )}
      </div>
    </div>
  );
}

function WaMobilePreview({ messageText, selectedProduct, shop, customer }) {
  const firstName = resolveWaFirstName(customer);
  const phone = customer?.profile?.channels?.whatsapp?.phone || customer?.profile?.identifiers?.phones?.[0];
  return (
    <WaBubble messageText={messageText || ''} selectedProduct={selectedProduct}
      shop={shop} firstName={firstName} phone={phone} miniLayout />
  );
}

function WaComposer({
  customer, waProfile, shop, profileId,
  sendWhatsapp, waSendError, waFallbackUrl, clearWaError,
  selectedWaSuggestion, setSelectedWaSuggestion,
  showWaOptOutConfirm, setShowWaOptOutConfirm, optOutWhatsapp, waOptingOut,
  selectedProduct, setSelectedProduct,
  onMessageChange,
}) {
  const suggestions = rankWaSuggestions(customer, waProfile);
  const selected = selectedWaSuggestion || suggestions[0] || null;

  const [messageText, setMessageText] = useState('');
  const [dirtyText, setDirtyText] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const taRef = useRef(null);

  const firstName = resolveWaFirstName(customer);
  const storeName = (shop || '').split('.')[0];
  const MAX_CHARS = 1000;

  function buildBody(key) {
    const fn = WA_TEMPLATE_BODY[key];
    if (fn) return fn(firstName, storeName);
    return selected?.purpose === 'order'
      ? `Hi ${firstName}! This is ${storeName}.\n\nWe wanted to reach out about your order.\n\nReply STOP to opt out.`
      : `Hi ${firstName}! You left something in your cart at ${storeName}.\n\nComplete your order before it sells out.\n\nReply STOP to opt out.`;
  }

  // Refill textarea whenever the selected suggestion changes.
  useEffect(() => {
    if (!selected) return;
    setMessageText(buildBody(selected.key));
    setDirtyText(false);
    setPendingSuggestion(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.key, firstName, storeName]);

  // Notify parent of message text for live preview in right column.
  useEffect(() => {
    if (onMessageChange) onMessageChange(messageText);
  }, [messageText, onMessageChange]);

  // Auto-grow textarea up to ~10 rows (240 px).
  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }
  useEffect(() => { autoGrow(taRef.current); }, [messageText]);

  function insertAt(text) {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = messageText.slice(0, s) + text + messageText.slice(e);
    setMessageText(next);
    setDirtyText(true);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + text.length, s + text.length);
    });
  }

  function handleSuggestionClick(s) {
    if (s.key === selected?.key) return;
    if (dirtyText) { setPendingSuggestion(s); return; }
    setSelectedWaSuggestion(s);
  }

  function confirmReplace() {
    setSelectedWaSuggestion(pendingSuggestion);
    setPendingSuggestion(null);
  }

  function handleSend() {
    const trimmed = messageText.trim();
    if (!selected || !trimmed || trimmed.length > MAX_CHARS) return;
    const tpl = selected.key === 'say_hello' ? undefined : selected.key;
    sendWhatsapp({
      shopDomain: shop, profileId, purpose: selected.purpose,
      template: tpl, message: trimmed,
      productHandle: selectedProduct?.handle || null,
    });
  }

  const charCount = messageText.length;
  const overLimit = charCount > MAX_CHARS;
  const nearLimit = charCount > MAX_CHARS * 0.9 && !overLimit;
  const isEmpty = !messageText.trim();

  const WA_GREEN = '#25D366';
  const WA_TEAL  = '#128C7E';
  const chipStyle = {
    fontSize: 10, fontWeight: 600, padding: '2px 7px',
    border: '1px solid #d1d5db', borderRadius: 99, background: '#f9fafb',
    color: '#374151', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10,
                  width: '100%', boxSizing: 'border-box' }}>

      {/* Error / fallback banner */}
      {(waSendError || waFallbackUrl) && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, fontSize: 12,
          background: waFallbackUrl ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${waFallbackUrl ? '#bbf7d0' : '#fecaca'}`,
          color: waFallbackUrl ? '#15803d' : '#b91c1c',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {waFallbackUrl
            ? <span>Popup blocked. <a href={waFallbackUrl} target="_blank" rel="noreferrer"
                style={{ color: WA_TEAL, fontWeight: 600 }}>Open WhatsApp</a></span>
            : <span>{waSendError}</span>}
          <button onClick={clearWaError} aria-label="Dismiss"
            style={{ background: 'none', border: 'none', cursor: 'pointer',
                     fontSize: 15, color: '#9ca3af', padding: 0, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Suggestion cards */}
      {suggestions.length > 0 && (
        <div role="list" aria-label="Suggested messages"
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {suggestions.map((s, i) => {
            const isSel = selected?.key === s.key;
            return (
              <button
                key={s.key}
                role="listitem"
                aria-pressed={isSel}
                onClick={() => handleSuggestionClick(s)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 12px',
                  background: isSel ? '#f0fdf4' : '#fff',
                  border: `1.5px solid ${isSel ? WA_GREEN : '#e5e7eb'}`,
                  borderRadius: 10, cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i === 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: '0.6px',
                        background: WA_GREEN, color: '#fff',
                        borderRadius: 4, padding: '1px 5px',
                        textTransform: 'uppercase',
                      }}>Recommended</span>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
                      {s.title}
                    </span>
                  </div>
                  {isSel && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke={WA_GREEN} strokeWidth="2.5" strokeLinecap="round"
                      strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                  {s.reason(customer)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Product selector — shown when customer has viewed products */}
      {(Array.isArray(waProfile?.recentProducts) && waProfile.recentProducts.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Link in message
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {waProfile.recentProducts.map((p) => {
              const isSel = selectedProduct?.handle === p.handle;
              return (
                <button key={p.handle} onClick={() => setSelectedProduct(p)} title={p.title}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    background: isSel ? '#f0fdf4' : '#f9fafb',
                    border: `1.5px solid ${isSel ? WA_GREEN : '#e5e7eb'}`,
                    borderRadius: 20, color: isSel ? '#15803d' : '#374151',
                  }}>
                  <ProductThumb imageUrl={p.imageUrl} size={16} />
                  <span style={{ maxWidth: 100, overflow: 'hidden',
                                 textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title || p.handle}
                  </span>
                </button>
              );
            })}
            <button onClick={() => setSelectedProduct(null)}
              style={{
                padding: '4px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: !selectedProduct ? '#f0fdf4' : '#f9fafb',
                border: `1.5px solid ${!selectedProduct ? WA_GREEN : '#e5e7eb'}`,
                borderRadius: 20, color: !selectedProduct ? '#15803d' : '#374151',
              }}>
              Store home
            </button>
          </div>
        </div>
      )}

      {/* Inline replace-edits prompt */}
      {pendingSuggestion && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      flexWrap: 'wrap', gap: 6, padding: '8px 10px',
                      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: '#92400e' }}>
            Replace your edits with &ldquo;{pendingSuggestion.title}&rdquo;?
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={confirmReplace}
              style={{ ...chipStyle, background: '#f59e0b', border: 'none',
                       color: '#fff', fontWeight: 700 }}
            >
              Replace
            </button>
            <button
              onClick={() => setPendingSuggestion(null)}
              style={chipStyle}
            >
              Keep mine
            </button>
          </div>
        </div>
      )}

      {/* Message editor */}
      {selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {/* Label row + quick-insert chips */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        flexWrap: 'wrap', gap: 4 }}>
            <label htmlFor="wa-msg-edit" style={{
              fontSize: 10, fontWeight: 700, color: '#6b7280',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Message
            </label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => insertAt(firstName)} style={chipStyle}
                aria-label="Insert customer name">
                + Name
              </button>
              <button onClick={() => insertAt(storeName)} style={chipStyle}
                aria-label="Insert store name">
                + Store
              </button>
              {dirtyText && (
                <button
                  onClick={() => { setMessageText(buildBody(selected.key)); setDirtyText(false); }}
                  style={{ ...chipStyle, color: '#6b7280' }}
                  aria-label="Reset to suggestion text"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            id="wa-msg-edit"
            ref={taRef}
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              setDirtyText(true);
              autoGrow(e.target);
            }}
            aria-label="WhatsApp message"
            aria-describedby="wa-char-count wa-link-note"
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 12px', fontSize: 13, lineHeight: 1.5,
              border: `1px solid ${overLimit ? '#fca5a5' : '#e5e7eb'}`,
              borderRadius: 8, outline: 'none', color: '#111827',
              resize: 'none', fontFamily: 'inherit', overflowY: 'auto',
              minHeight: '80px', maxHeight: '240px',
            }}
          />

          {/* Character counter */}
          <div id="wa-char-count" style={{
            fontSize: 11, textAlign: 'right',
            color: overLimit ? '#dc2626' : nearLimit ? '#d97706' : '#9ca3af',
          }}>
            {charCount} / {MAX_CHARS}{overLimit ? ' — too long' : ''}
          </div>

          {/* Link preview card — shown when a product is selected */}
          {selectedProduct && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 8,
              border: '1px solid #e5e7eb', background: '#f9fafb',
            }}>
              <ProductThumb imageUrl={selectedProduct.imageUrl} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#111827',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedProduct.title || selectedProduct.handle}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                  {(shop || '').replace(/\.myshopify\.com$/, '')}
                </div>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#6b7280',
                background: '#e5e7eb', borderRadius: 4, padding: '1px 5px',
                textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
              }}>Link preview</span>
            </div>
          )}

          {/* Link note — non-editable */}
          <div id="wa-link-note" role="note" style={{
            fontSize: 11, color: '#6b7280', background: '#f9fafb',
            border: '1px solid #e5e7eb', borderRadius: 6,
            padding: '6px 8px', display: 'flex', alignItems: 'flex-start', gap: 5,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            {selectedProduct
              ? <>Product link added: <strong>{selectedProduct.title || selectedProduct.handle}</strong> — opens product page for WhatsApp link preview.</>
              : 'Opens WhatsApp. Press Send there to finish. History will show \'Opened in WhatsApp\'.'}
          </div>
        </div>
      )}

      {/* Neither eligible */}
      {!waProfile?.canFollowup && !waProfile?.canOrder && (
        <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>
          {waProfile?.orderReason === 'opted_out' && 'Customer has opted out of WhatsApp messages.'}
          {waProfile?.orderReason === 'no_phone' && 'No phone number on file.'}
          {waProfile?.orderReason === 'invalid_phone' && 'Phone number could not be normalised to E.164.'}
        </div>
      )}

      {/* Send button */}
      {selected && (
        <>
          <button
            onClick={handleSend}
            disabled={isEmpty || overLimit}
            style={{
              padding: '10px 14px',
              background: isEmpty || overLimit ? '#9ca3af' : WA_GREEN,
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
              color: '#fff', cursor: isEmpty || overLimit ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, width: '100%', boxSizing: 'border-box',
              transition: 'background 0.2s',
            }}
            aria-label={`Send WhatsApp: ${selected.title}`}
            aria-disabled={isEmpty || overLimit}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Open in WhatsApp
          </button>
          {isEmpty && (
            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
              Message is empty — add some text above to send.
            </div>
          )}
        </>
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
          <span style={{ fontSize: 12, color: '#b91c1c', flex: 1 }}>Remove and opt out?</span>
          <button
            onClick={optOutWhatsapp}
            disabled={waOptingOut}
            style={{ padding: '4px 10px', background: '#dc2626', border: 'none', borderRadius: 6,
                     fontSize: 12, fontWeight: 600, color: '#fff',
                     cursor: waOptingOut ? 'not-allowed' : 'pointer' }}
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
  );
}

function NotificationComposer({ customer, shop, onSent, onError, onTitleChange, onBodyChange }) {
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
    // Keep push titles short — truncate product name to ≤22 chars.
    const shortProduct = product.length > 22 ? product.slice(0, 22).trimEnd() + '…' : product;
    const suggestion = SUGGESTIONS[signal] || {
      title: () => 'Hello from the store',
      body: () => 'We have something special for you.',
    };
    setTitle(suggestion.title(shortProduct));
    setBody(suggestion.body(product));
  }, [customer]);

  // Notify parent for live right-column preview.
  useEffect(() => { if (onTitleChange) onTitleChange(title); }, [title, onTitleChange]);
  useEffect(() => { if (onBodyChange) onBodyChange(body); }, [body, onBodyChange]);

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
      <button
        onClick={send}
        disabled={sending || !title || !body}
        style={{
          padding: '11px', fontSize: '14px', fontWeight: '700',
          color: '#fff',
          background: sending || !title || !body ? '#9ca3af' : '#4f46e5',
          border: 'none', borderRadius: '10px', minHeight: 44,
          cursor: sending || !title || !body ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {sending ? '⏳ Sending...' : '🔔 Send notification'}
      </button>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
        Sends right away to this customer.
      </div>
      {(hasTopProduct || productImage) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {hasTopProduct && (
            <span style={{ fontSize: 11, background: '#f3f4f6', border: '1px solid #e5e7eb',
                           borderRadius: 20, padding: '2px 8px', color: '#374151',
                           display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#9ca3af' }}>Opens:</span> {rawTopProductTitle}
            </span>
          )}
          {productImage && (
            <span style={{ fontSize: 11, background: '#f3f4f6', border: '1px solid #e5e7eb',
                           borderRadius: 20, padding: '2px 8px', color: '#374151',
                           display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#9ca3af' }}>Image:</span> {rawTopProductTitle || 'product'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function EmailComposer({
  customer, shop, onSent, onError,
  onPreviewHtmlChange, onPreviewLoadingChange,
  onPreviewSubjectChange, onPreviewWarningsChange, onEmailModeChange,
}) {
  const [emailMode, setEmailMode] = useState('write');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templateSending, setTemplateSending] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer  = useRef(null);
  const reqCountRef   = useRef(0);

  // Fetch the template list. Called on mount, on mode switch, and on tab focus.
  const fetchTemplates = useCallback(() => {
    if (!shop) return;
    apiGet(`/api/email-templates?shop=${encodeURIComponent(shop)}`)
      .then((d) => setTemplates(d?.templates || []))
      .catch(() => {});
  }, [shop]);

  // Initial fetch on mount + whenever shop changes.
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Re-fetch when the user opens "Use a template" mode so they always see the
  // current saved version (covers the case where they edited a template in
  // another tab or in the Email Templates screen without causing a full remount).
  useEffect(() => {
    if (emailMode === 'template') fetchTemplates();
  }, [emailMode, fetchTemplates]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when the tab regains focus (e.g. user navigated to Email Templates,
  // saved a change, and switched back to this tab).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') fetchTemplates();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchTemplates]);

  useEffect(() => {
    if (emailMode !== 'write') return;
    const profileId = customer?.profile?._id;
    if (!subject || !body || !profileId) {
      if (onPreviewHtmlChange) onPreviewHtmlChange('');
      return;
    }
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      if (onPreviewLoadingChange) onPreviewLoadingChange(true);
      try {
        const res = await apiSend('/api/push/preview-journey-email', 'POST',
          { profileId, subject, body });
        const html = res?.html || '';
        if (onPreviewHtmlChange) onPreviewHtmlChange(html);
      } catch (_) {
        if (onPreviewHtmlChange) onPreviewHtmlChange('');
      } finally {
        setPreviewLoading(false);
        if (onPreviewLoadingChange) onPreviewLoadingChange(false);
      }
    }, 600);
    return () => clearTimeout(previewTimer.current);
  }, [subject, body, customer?.profile?._id, emailMode]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Sync subject to parent for the desktop preview header (write mode only).
  useEffect(() => {
    if (emailMode === 'write' && onPreviewSubjectChange) onPreviewSubjectChange(subject);
  }, [subject, emailMode]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Clear preview when switching modes; tell parent which mode is active.
  useEffect(() => {
    if (onPreviewHtmlChange) onPreviewHtmlChange('');
    if (onPreviewLoadingChange) onPreviewLoadingChange(false);
    if (onPreviewSubjectChange) onPreviewSubjectChange('');
    if (onPreviewWarningsChange) onPreviewWarningsChange(null);
    if (onEmailModeChange) onEmailModeChange(emailMode);
    setSelectedTemplateId(null);
  }, [emailMode]);  // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ── template-mode helpers ── */
  async function loadTemplatePreview(id) {
    const myReq = ++reqCountRef.current;
    setTemplateLoading(true);
    if (onPreviewLoadingChange) onPreviewLoadingChange(true);
    try {
      const res = await apiGet(`/api/email-templates/${encodeURIComponent(id)}/preview`);
      if (myReq !== reqCountRef.current) return; // stale — a newer request is in flight
      const html = res?.html || '';
      const warns = res?.warnings || null;
      if (onPreviewHtmlChange) onPreviewHtmlChange(html);
      if (onPreviewWarningsChange) onPreviewWarningsChange(warns);
    } catch (_) {
      if (myReq !== reqCountRef.current) return;
      if (onPreviewHtmlChange) onPreviewHtmlChange('');
      if (onPreviewWarningsChange) onPreviewWarningsChange(null);
    } finally {
      if (myReq === reqCountRef.current) {
        setTemplateLoading(false);
        if (onPreviewLoadingChange) onPreviewLoadingChange(false);
      }
    }
  }

  async function sendTemplate() {
    const profileId = customer?.profile?._id;
    if (!selectedTemplateId || !profileId || templateSending) return;
    setTemplateSending(true);
    try {
      await apiSend(`/api/email-templates/${encodeURIComponent(selectedTemplateId)}/send`, 'POST',
        { profileId });
      onSent();
    } catch (e) {
      onError(e.message);
    } finally {
      setTemplateSending(false);
    }
  }

  function handleSelectTemplate(t) {
    setSelectedTemplateId(t._id);
    if (onPreviewSubjectChange) onPreviewSubjectChange(t.subject || '');
    loadTemplatePreview(t._id);
  }

  function templateTypeChip(type) {
    const map = {
      special_offer: { bg: '#eff6ff', color: '#1d4ed8', label: 'Special offer' },
      festival:      { bg: '#fff7ed', color: '#c2410c', label: 'Festival' },
    };
    const s = map[type] || { bg: '#f3f4f6', color: '#374151', label: type || 'Template' };
    return (
      <span style={{ fontSize: 10, background: s.bg, color: s.color,
                     borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>
        {s.label}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px',
                  width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
        Sending to: <strong>{email}</strong>
      </div>

      {/* Segmented control */}
      <div role="group" style={{ display: 'flex', gap: 2, background: '#f3f4f6',
                                  borderRadius: 8, padding: 2, width: 'fit-content' }}>
        {[['write', 'Write a message'], ['template', 'Use a template']].map(([mode, label]) => (
          <button key={mode} onClick={() => setEmailMode(mode)}
            style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 600,
              border: 'none', borderRadius: 6, cursor: 'pointer',
              background: emailMode === mode ? '#fff' : 'transparent',
              color: emailMode === mode ? '#2459D6' : '#6b7280',
              boxShadow: emailMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {emailMode === 'write' && (
        <>
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
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', overflowX: 'auto' }}>
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
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(() => {
                  const showThumb = EMAIL_SUGGESTIONS[activeCategory].category === 'Cart & Purchase' ||
                    hasTopProduct;
                  return EMAIL_SUGGESTIONS[activeCategory].suggestions.map((s, i) => (
                    <div key={i}
                      onClick={() => { setSubject(s.subject); setBody(s.body); setShowSuggestions(false); }}
                      style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                               border: '1px solid #e5e7eb', background: '#fff', fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        {showThumb && <ProductThumbnail imageUrl={productImage} title={rawTopProductTitle} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#111827', marginBottom: 2 }}>{s.label}</div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>{s.subject}</div>
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
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '13px',
                       border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', color: '#111827' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280',
                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Message
            </label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Email message" rows={6}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '13px',
                       border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', color: '#111827',
                       resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            Sent from: notifications@shopireachboost.com
          </div>
          <button onClick={send} disabled={sending || !subject || !body}
            style={{ padding: '11px', fontSize: '14px', fontWeight: '700', color: '#fff', minHeight: 44,
                     background: sending || !subject || !body ? '#9ca3af' : '#0ea5e9',
                     border: 'none', borderRadius: '10px',
                     cursor: sending || !subject || !body ? 'not-allowed' : 'pointer',
                     transition: 'background 0.2s' }}>
            {sending ? '⏳ Sending...' : '✉️ Send email'}
          </button>
        </>
      )}

      {emailMode === 'template' && (
        <>
          {templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 16px',
                          background: '#f9fafb', borderRadius: 10,
                          border: '1px dashed #e5e7eb' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                No templates yet
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                Create templates in Settings to use them here.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {templates.map((t) => {
                const isSelected = selectedTemplateId === t._id;
                return (
                  <button key={t._id}
                    onClick={() => handleSelectTemplate(t)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                      border: `1.5px solid ${isSelected ? '#2459D6' : '#e5e7eb'}`,
                      background: isSelected ? '#F5F8FE' : '#fff',
                      cursor: 'pointer', width: '100%',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}
                  >
                    <span style={{ marginTop: 2, flexShrink: 0,
                                   width: 14, height: 14, borderRadius: '50%',
                                   border: `2px solid ${isSelected ? '#2459D6' : '#d1d5db'}`,
                                   background: isSelected ? '#2459D6' : 'transparent',
                                   display: 'inline-block' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t.name}</span>
                        {templateTypeChip(t.type)}
                      </div>
                      {t.subject && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2,
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.subject}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedTemplateId && (
            <>
              <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                The template&apos;s own content is sent — you cannot edit it here.
              </div>
              <button onClick={sendTemplate}
                disabled={templateSending || templateLoading}
                style={{ padding: '11px', fontSize: '14px', fontWeight: '700', color: '#fff', minHeight: 44,
                         background: templateSending || templateLoading ? '#9ca3af' : '#0ea5e9',
                         border: 'none', borderRadius: '10px',
                         cursor: templateSending || templateLoading ? 'not-allowed' : 'pointer',
                         transition: 'background 0.2s' }}>
                {templateSending ? '⏳ Sending...' : '✉️ Send template'}
              </button>
            </>
          )}
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            <a href="/admin/email-templates"
              style={{ color: '#2459D6', textDecoration: 'underline' }}>
              Manage templates
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── SendSection — two-column send card ─── */
function SendSection({
  hasPush, hasEmail, canWa,
  customer, shop, waProfile, isNarrow,
  sendWhatsapp, waSendError, waFallbackUrl, clearWaError,
  selectedWaSuggestion, setSelectedWaSuggestion,
  showWaOptOutConfirm, setShowWaOptOutConfirm, optOutWhatsapp, waOptingOut,
  selectedProduct, setSelectedProduct,
  notifTab, setNotifTab,
  sendResult, setSendResult,
  loadNotifications,
}) {
  const activeTab = notifTab;
  const setActiveTab = setNotifTab;
  const profileId = customer?.profile?._id;

  // Preview state lifted up from composers.
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [emailPreviewHtml, setEmailPreviewHtml] = useState('');
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const [emailPreviewSubject, setEmailPreviewSubject] = useState('');
  const [emailPreviewWarnings, setEmailPreviewWarnings] = useState(null);
  const [emailIsTemplateMode, setEmailIsTemplateMode] = useState(false);
  const [waMessageText, setWaMessageText] = useState('');

  const pushProductImage = customer?.topProducts?.[0]?.imageUrl || null;

  function handleSent() {
    setSendResult('Sent!');
    if (loadNotifications) loadNotifications({ aborted: false });
    setTimeout(() => setSendResult(''), 3000);
  }
  function handleError(msg) {
    setSendResult('Error: ' + (msg || 'Something went wrong'));
  }

  const ACC = '#2459D6';
  const tabs = [
    hasPush    && { key: 'push',      label: 'Push',      accent: ACC,      status: 'Subscribed' },
    hasEmail   && { key: 'email',     label: 'Email',     accent: '#0ea5e9', status: 'Message or template' },
    canWa      && { key: 'whatsapp',  label: 'WhatsApp',  accent: '#128C7E', status: 'Opted in' },
  ].filter(Boolean);

  if (tabs.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14,
                    padding: 20, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
        No push subscription, email, or WhatsApp consent on file.
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14,
                  overflow: 'hidden' }}>
      {/* Card header + tabs */}
      <div style={{ padding: '16px 20px 0', borderBottom: '1px solid #E2E5EB' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#15181E', marginBottom: 12 }}>
          Send a message
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} role="tab" aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '9px 16px', fontSize: 13, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: isActive ? '#F5F8FE' : 'transparent',
                  color: isActive ? tab.accent : '#5A6272',
                  borderBottom: isActive ? `2.5px solid ${tab.accent}` : '2.5px solid transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: 1, minWidth: 80,
                  outline: 'none',
                }}
                onFocus={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${tab.accent}44`}
                onBlur={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <span>{tab.label}</span>
                <span style={{ fontSize: 10, fontWeight: 500,
                               color: isActive ? tab.accent : '#9ca3af' }}>
                  {tab.status}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-column body */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? '1fr' : 'minmax(0, 460px) 1fr',
        alignItems: 'start',
      }}>
        {/* LEFT — editor */}
        <div style={{
          padding: 20,
          borderRight: isNarrow ? 'none' : '1px solid #E2E5EB',
          borderBottom: isNarrow ? '1px solid #E2E5EB' : 'none',
        }}>
          {activeTab === 'push' && hasPush && (
            <NotificationComposer
              customer={customer} shop={shop}
              onTitleChange={setPushTitle} onBodyChange={setPushBody}
              onSent={handleSent} onError={handleError}
            />
          )}
          {activeTab === 'email' && hasEmail && (
            <EmailComposer
              customer={customer} shop={shop}
              onPreviewHtmlChange={setEmailPreviewHtml}
              onPreviewLoadingChange={setEmailPreviewLoading}
              onPreviewSubjectChange={setEmailPreviewSubject}
              onPreviewWarningsChange={setEmailPreviewWarnings}
              onEmailModeChange={(mode) => setEmailIsTemplateMode(mode === 'template')}
              onSent={handleSent} onError={handleError}
            />
          )}
          {activeTab === 'whatsapp' && canWa && (
            <WaComposer
              customer={customer} waProfile={waProfile} shop={shop} profileId={profileId}
              sendWhatsapp={sendWhatsapp} waSendError={waSendError} waFallbackUrl={waFallbackUrl}
              clearWaError={clearWaError}
              selectedWaSuggestion={selectedWaSuggestion}
              setSelectedWaSuggestion={setSelectedWaSuggestion}
              showWaOptOutConfirm={showWaOptOutConfirm}
              setShowWaOptOutConfirm={setShowWaOptOutConfirm}
              optOutWhatsapp={optOutWhatsapp} waOptingOut={waOptingOut}
              selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct}
              onMessageChange={setWaMessageText}
            />
          )}
          {sendResult && (
            <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, textAlign: 'center',
                          color: sendResult.startsWith('Error') ? '#dc2626' : '#16a34a' }}>
              {sendResult}
            </div>
          )}
        </div>

        {/* RIGHT — preview */}
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
            Preview
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {activeTab === 'push' && (
              <>
                <PushDesktopPreview title={pushTitle} body={pushBody}
                  shop={shop} productImage={pushProductImage} />
                <PhoneFrame>
                  <PushMobilePreview title={pushTitle} body={pushBody} shop={shop} productImage={pushProductImage} />
                </PhoneFrame>
              </>
            )}
            {activeTab === 'email' && (
              <>
                <EmailPreviewFrame
                  html={emailPreviewHtml}
                  device="desktop"
                  loading={emailPreviewLoading}
                  templateMode={emailIsTemplateMode}
                  subject={emailPreviewSubject}
                  customerEmail={customer?.profile?.channels?.email?.address
                    || customer?.profile?.identifiers?.emails?.[0]}
                  warnings={emailPreviewWarnings}
                />
                <PhoneFrame>
                  <EmailPreviewFrame
                    html={emailPreviewHtml}
                    device="mobile"
                    loading={emailPreviewLoading}
                  />
                </PhoneFrame>
              </>
            )}
            {activeTab === 'whatsapp' && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af',
                              textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  Mobile
                </div>
                <PhoneFrame>
                  <WaMobilePreview messageText={waMessageText}
                    selectedProduct={selectedProduct} shop={shop} customer={customer} />
                </PhoneFrame>
              </div>
            )}
          </div>
        </div>
      </div>
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

function formatActiveHoursRange(hours) {
  if (!hours || hours.length === 0) return null;
  const sorted = [...hours].sort((a, b) => a - b);
  const fmtH = (h) => {
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12} ${ampm}`;
  };
  return `${fmtH(sorted[0])} – ${fmtH(sorted[sorted.length - 1])}`;
}

function CollapsibleCard({ title, hint, open, onToggle, children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14,
      marginBottom: 0, overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '16px 20px',
          background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', minHeight: 44,
          outline: 'none',
        }}
        onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 3px #2459D640')}
        onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
      >
        <span style={{ fontSize: 17, fontWeight: 700, color: '#15181E' }}>{title}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="#5A6272" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {!open && (
        <div style={{ padding: '0 20px 14px', fontSize: 12, color: '#5A6272' }}>{hint}</div>
      )}
      {open && (
        <>
          <div style={{ borderTop: '1px solid #E2E5EB' }} />
          <div style={{ padding: '16px 20px' }}>{children}</div>
        </>
      )}
    </div>
  );
}

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
  const [whatTheyWantOpen, setWhatTheyWantOpen] = useState(false);
  const [whatsHappenedOpen, setWhatsHappenedOpen] = useState(false);

  const [waProfile, setWaProfile] = useState(null);
  const [waProfileLoading, setWaProfileLoading] = useState(false);
  const [showWaOptOutConfirm, setShowWaOptOutConfirm] = useState(false);
  const [waOptingOut, setWaOptingOut] = useState(false);
  const [selectedWaSuggestion, setSelectedWaSuggestion] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
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
      setSelectedProduct(data?.recentProducts?.[0] || null);
    } catch {
      if (ctl?.aborted) return;
      setWaProfile(null);
      setSelectedProduct(null);
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
    if (!shop || !profileId || profileId === 'undefined') {
      setLoading(false);
      setNotFound(true);
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
  const email = getCustomerEmail(profile);
  const displayName = email || `Anonymous shopper · #${String(profile._id || profileId).slice(-5)}`;
  const hasPush = !!profile.channels?.push?.subscribed;
  const hasEmail = !!(profile.channels?.email?.address || email);
  const phone = profile.channels?.whatsapp?.phone || profile.identifiers?.phones?.[0];
  const cdInitial = (email || displayName || '?').charAt(0).toUpperCase();
  const cdAvatarColor = getCDAvatarColor(displayName);

  const events = (customer.recentEvents || []).filter((e) => EVENT_LABELS[e.type]);

  // Stats — derived from already-fetched notifications + topProducts
  const pushSentCount  = notifications.filter(n => n.channel === 'push').length;
  const emailSentCount = notifications.filter(n => n.channel === 'email').length;
  const waSentCount    = notifications.filter(n => n.channel === 'whatsapp').length;
  const deliveredCount = notifications.filter(n => n.outcome === 'delivered').length;
  const failedCount    = notifications.filter(n => n.outcome === 'failed').length;
  const heldCount      = notifications.filter(n => ['skipped', 'cancelled'].includes(n.outcome)).length;
  const distinctProducts  = customer.topProducts?.length || 0;
  // Use the API-supplied total (all products) if available; fall back to summing top-3
  const totalProductViews = customer.totalProductViews
    || (customer.topProducts || []).reduce((s, p) => s + (p.count || 0), 0);

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


  // Stat tile sub-label for "Messages sent"
  const msgSentParts = [
    pushSentCount  > 0 ? `${pushSentCount} push`      : null,
    emailSentCount > 0 ? `${emailSentCount} email`     : null,
    waSentCount    > 0 ? `${waSentCount} WhatsApp`     : null,
  ].filter(Boolean);
  const msgSentSub = msgSentParts.length > 0 ? msgSentParts.join(' · ') : 'no breakdown yet';

  // Stat tile sub-label for "Didn't arrive"
  const didntArriveSub = heldCount > 0 ? `failed · +${heldCount} held back` : 'failed';

  const statTiles = [
    {
      label: 'Messages sent',
      value: notifications.length,
      sub: msgSentSub,
      color: '#15181E',
    },
    {
      label: 'Reached them',
      value: deliveredCount,
      sub: 'confirmed delivered',
      color: '#16a34a',
    },
    {
      label: "Didn't arrive",
      value: failedCount,
      sub: didntArriveSub,
      color: '#d97706',
    },
    {
      label: 'Products viewed',
      value: totalProductViews,
      sub: `views across ${distinctProducts} product${distinctProducts !== 1 ? 's' : ''}`,
      color: '#15181E',
    },
  ];

  const activeHoursLabel = formatActiveHoursRange(customer.activeHours);

  // Attribution lookup for timeline WA send rows
  const attrByJob = {};
  for (const a of (waProfile?.attribution || [])) {
    attrByJob[a.jobId] = a;
  }

  return (
    <div style={{ ...DS.page, maxWidth: 1200, overflowX: 'hidden', width: '100%' }}>
      {backButton}

      {/* === 1. User card === */}
      <div style={{
        background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14,
        padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{
          display: 'flex', gap: 24,
          flexDirection: isNarrow ? 'column' : 'row',
          alignItems: isNarrow ? 'stretch' : 'flex-start',
        }}>
          {/* Left: avatar + identity + channel chips */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: cdAvatarColor.bg, color: cdAvatarColor.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17, fontWeight: 700,
              }}>
                {cdInitial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#15181E',
                              wordBreak: 'break-all', lineHeight: 1.3 }}>
                  {displayName}
                </div>
                {phone && (
                  <div style={{ fontSize: 12, color: '#5A6272', marginTop: 2 }}>{phone}</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <StageBadge customer={profile} />
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
            </div>
          </div>

          {/* Right: 4 stat tiles in one row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            flex: isNarrow ? 'none' : '1 1 0',
            width: isNarrow ? '100%' : undefined,
          }}>
            {statTiles.map(({ label, value, sub, color }) => (
              <div key={label} style={{
                background: '#F7F8FA', border: '1px solid #E2E5EB', borderRadius: 10,
                padding: '10px 12px',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1, marginBottom: 3 }}>
                  {notifLoading ? '—' : value}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#15181E',
                              textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 11, color: '#5A6272' }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === 2. Warning bar (conditional) === */}
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

      {/* === 3. Two collapsible columns === */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr',
        gap: 16, marginBottom: 16,
        alignItems: 'start',
      }}>

        {/* LEFT: What they want */}
        <CollapsibleCard
          title="What they want"
          hint="Click to see what they are looking for"
          open={whatTheyWantOpen}
          onToggle={() => setWhatTheyWantOpen((x) => !x)}
        >
          {/* Cart signal callout */}
          {customer.topSignal?.type === 'cart_abandon' && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 8, padding: '8px 12px', fontSize: 12,
              color: '#92400e', marginBottom: 12, display: 'flex', gap: 6,
            }}>
              <span>🛒</span>
              <span>They abandoned their cart — high purchase intent.</span>
            </div>
          )}

          {/* Top products */}
          {customer.topProducts?.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#5A6272',
                            textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Most viewed
                {totalProductViews > 0 && distinctProducts > 0 && (
                  <span style={{ fontWeight: 400, color: '#9ca3af' }}>
                    {' '}· top {Math.min(3, distinctProducts)} of {totalProductViews} view{totalProductViews !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {customer.topProducts.map((p, i) => (
                <div key={p.productId}>
                  {i > 0 && <div style={{ borderTop: '1px solid #F0F1F3', margin: '10px 0' }} />}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <ProductThumbnail imageUrl={p.imageUrl} title={p.title} size={56} radius={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#15181E', marginBottom: 3,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#5A6272' }}>
                        Viewed {p.count} time{p.count !== 1 ? 's' : ''}
                        {p.lastSeen ? ` · ${formatCDDate(p.lastSeen)}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: '4px 0' }}>No product views yet</div>
          )}

          {/* Best time to reach */}
          {activeHoursLabel && (
            <div style={{
              marginTop: 16, padding: '10px 12px',
              background: '#F0F7FF', border: '1px solid #C7DCFA',
              borderRadius: 8, fontSize: 12, color: '#1D4ED8',
              display: 'flex', gap: 6, alignItems: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Best time to reach: {activeHoursLabel}
            </div>
          )}
        </CollapsibleCard>

        {/* RIGHT: What's happened */}
        <CollapsibleCard
          title="What's happened"
          hint="Click to view customer details and timeline"
          open={whatsHappenedOpen}
          onToggle={() => setWhatsHappenedOpen((x) => !x)}
        >
          {/* Customer details grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
            marginBottom: 16,
          }}>
            {[
              { label: 'Email', val: email || '—' },
              { label: 'Phone', val: phone || '—' },
              { label: 'First seen', val: formatCDDate(profile.createdAt) },
              { label: 'Last seen', val: formatCDDate(profile.lastSeenAt) },
              { label: 'Orders', val: profile.orders?.count > 0 ? `${profile.orders.count} order${profile.orders.count !== 1 ? 's' : ''}` : '—' },
              { label: 'Stage', val: profile.stage || '—' },
            ].map(({ label, val }) => (
              <div key={label}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af',
                              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 12, color: '#374151', fontWeight: 500,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #F0F1F3', marginBottom: 12 }} />

          {/* Timeline header + filter */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 10,
            flexWrap: 'wrap', gap: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6272',
                          textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Timeline
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
                    padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 99,
                    cursor: 'pointer', border: '1px solid',
                    background: timelineFilter === key ? '#2459D6' : '#fff',
                    borderColor: timelineFilter === key ? '#2459D6' : '#e5e7eb',
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
                      const isWa = n.channel === 'whatsapp';
                      const attr = isWa ? attrByJob[String(n._id)] : null;
                      const attrChips = attr ? [
                        attr.revisit        && { label: 'Revisited', color: '#3b82f6', bg: '#eff6ff' },
                        attr.add_to_cart    && { label: 'Added to cart', color: '#f97316', bg: '#fff7ed' },
                        attr.checkout_start && { label: 'Reached checkout', color: '#2563eb', bg: '#eff6ff' },
                        attr.purchase       && { label: 'Placed order', color: '#16a34a', bg: '#f0fdf4' },
                      ].filter(Boolean) : [];
                      return (
                        <div key={n._id || idx} style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0',
                        }}>
                          <span style={{ width: 52, flexShrink: 0, fontSize: 11,
                                         color: '#9ca3af', paddingTop: 2 }}>
                            {time}
                          </span>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            flexShrink: 0, marginTop: 4,
                            background: isWa ? '#25D366' : '#818cf8',
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
                              <div style={{
                                fontSize: 10, fontWeight: 700,
                                color: isWa ? '#25D366' : '#818cf8',
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                              }}>
                                {isWa ? 'Opened in WhatsApp' : 'You sent'}
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
                            {attrChips.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                                {attrChips.map((chip) => (
                                  <span key={chip.label} style={{
                                    fontSize: 10, fontWeight: 600, padding: '2px 6px',
                                    borderRadius: 99, background: chip.bg, color: chip.color,
                                    border: `1px solid ${chip.color}30`,
                                  }}>
                                    {chip.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    const e = item.e;
                    return (
                      <div key={idx} style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0',
                      }}>
                        <span style={{ width: 52, flexShrink: 0, fontSize: 11,
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
                          {(e.type === 'product_view' || e.type === 'add_to_cart') &&
                              (e.meta?.productTitle || e.path) && (
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
        </CollapsibleCard>

      </div>

      {/* === 4. Send a message (full-width below) === */}
      <SendSection
        hasPush={hasPush} hasEmail={hasEmail} canWa={canWa}
        customer={customer} shop={shop} waProfile={waProfile} isNarrow={isNarrow}
        sendWhatsapp={sendWhatsapp} waSendError={waSendError} waFallbackUrl={waFallbackUrl}
        clearWaError={clearWaError}
        selectedWaSuggestion={selectedWaSuggestion}
        setSelectedWaSuggestion={setSelectedWaSuggestion}
        showWaOptOutConfirm={showWaOptOutConfirm}
        setShowWaOptOutConfirm={setShowWaOptOutConfirm}
        optOutWhatsapp={optOutWhatsapp} waOptingOut={waOptingOut}
        selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct}
        notifTab={notifTab} setNotifTab={setNotifTab}
        sendResult={sendResult} setSendResult={setSendResult}
        loadNotifications={loadNotifications}
      />

    </div>
  );
}
