'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Page } from '@shopify/polaris';
import { apiGet, apiSend } from '../../../lib/api';
import { useWhatsapp } from './customerShared';

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

const DATE_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

const CHANNEL_COLORS = {
  push:      { fg: '#4f46e5', bg: '#eef2ff' },
  email:     { fg: '#d97706', bg: '#fef3c7' },
  whatsapp:  { fg: '#128C7E', bg: '#f0fdf4' },
};

function ChannelIcon({ channel, size = 14, color }) {
  const c = color || CHANNEL_COLORS[channel]?.fg || '#6b7280';
  if (channel === 'push') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    );
  }
  if (channel === 'email') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function ChannelCard({ channel, label, sent, pending, types, loading, onDetails }) {
  const { fg, bg } = CHANNEL_COLORS[channel];
  return (
    <div style={{ ...DS.card, padding: 0, overflow: 'hidden', marginBottom: 0 }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ChannelIcon channel={channel} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{label}</span>
        </div>
        <button
          onClick={onDetails}
          style={{ fontSize: 11, color: fg, cursor: 'pointer', fontWeight: 600,
                   background: 'none', border: 'none', padding: '4px 0' }}
          aria-label={`View ${label} details`}
        >
          Details →
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ flex: 1, padding: '14px 16px', borderRight: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Sent</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: loading ? '#d1d5db' : fg }}>
            {loading ? '—' : sent}
          </div>
        </div>
        <div style={{ flex: 1, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Pending</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: loading ? '#d1d5db' : '#374151' }}>
            {loading ? '—' : pending}
          </div>
        </div>
      </div>

      {!loading && types && types.length > 0 ? (
        <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {types.slice(0, 3).map((t) => (
            <span key={t.type} style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 999,
              background: bg, color: fg, fontWeight: 600, whiteSpace: 'nowrap',
            }}>
              {t.label}{t.sent > 0 ? ` ${t.sent}` : ''}
              {t.pending > 0 ? ` · ${t.pending} pending` : ''}
            </span>
          ))}
          {types.length > 3 && (
            <span style={{ fontSize: 11, color: '#9ca3af', padding: '3px 0' }}>
              +{types.length - 3} more
            </span>
          )}
        </div>
      ) : !loading ? (
        <div style={{ padding: '12px 16px', fontSize: 12, color: '#9ca3af' }}>
          No activity in this period
        </div>
      ) : null}
    </div>
  );
}

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

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

const SIGNAL_LABELS = {
  cart_abandon: 'Cart left behind',
  checkout_abandon: 'Reached checkout',
  browse_abandon: "Looked, didn't add",
  high_intent: 'Keeps coming back',
  price_hesitation: 'Stopped at the price',
  price_drop: 'Price dropped on a saved item',
  back_in_stock: 'Back in stock',
  post_purchase_d3: 'Three days after buying',
  lapsing: 'Going quiet',
  email_capture: 'Ask for an email',
  cod_to_prepaid: 'Offer prepaid on COD',
  winback: 'Win back',
};

// ─── Channel drawer ───────────────────────────────────────────────────────────

function DrawerItem({ item, channel, shop, sendWhatsapp }) {
  const { fg, bg } = CHANNEL_COLORS[channel];
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f9fafb' }}>
      {/* Customer + type */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.customer?.name || item.customer?.email || 'Anonymous'}
          </div>
          {item.customer?.email && item.customer?.name && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.customer.email}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 600, background: bg,
                         color: fg, padding: '2px 7px', borderRadius: 999 }}>
            {item.label}
          </span>
          {item.time && (
            <span style={{ fontSize: 10, color: '#9ca3af' }}>
              {new Date(item.time).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>

      {/* Push preview */}
      {channel === 'push' && item.preview?.title && (
        <div style={{ background: '#f3f4f6', borderRadius: 10, padding: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 30, height: 30, background: '#4f46e5', borderRadius: 7,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          fontSize: 14 }}>
              🔔
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{item.preview.title}</div>
              {item.preview.body && (
                <div style={{ fontSize: 11, color: '#374151', marginTop: 2, lineHeight: 1.5 }}>{item.preview.body}</div>
              )}
            </div>
          </div>
          {item.preview.imageUrl && (
            <img src={item.preview.imageUrl} alt=""
              style={{ width: '100%', borderRadius: 7, marginTop: 8, objectFit: 'cover', maxHeight: 120, display: 'block' }} />
          )}
        </div>
      )}

      {/* Email preview */}
      {channel === 'email' && item.preview?.subject && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: '#f3f4f6', padding: '7px 12px', fontSize: 12,
                        fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
            {item.preview.subject}
          </div>
          {item.preview.body && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#374151',
                          lineHeight: 1.6, maxHeight: 80, overflow: 'hidden' }}>
              {item.preview.body}
            </div>
          )}
        </div>
      )}

      {/* WhatsApp bubble */}
      {channel === 'whatsapp' && item.preview?.message && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ background: '#dcf8c6', borderRadius: '12px 12px 2px 12px',
                        padding: '8px 12px', maxWidth: '85%', fontSize: 12, color: '#111827', lineHeight: 1.5 }}>
            {item.preview.message}
          </div>
        </div>
      )}

      {/* Outcome + WhatsApp send button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        {item.outcome ? (
          <span style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
            color: item.outcome === 'converted' ? '#16a34a'
                 : item.outcome === 'clicked' ? '#4f46e5'
                 : '#9ca3af',
          }}>
            {item.outcome}
          </span>
        ) : <span />}

        {channel === 'whatsapp' && item.status === 'pending' && (
          <button
            onClick={() => sendWhatsapp({ shopDomain: shop, profileId: item.customer?.profileId, purpose: 'followup' })}
            aria-label={`Send WhatsApp to ${item.customer?.name || item.customer?.email || 'customer'}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', background: '#25D366', border: 'none',
              borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#fff',
            }}
          >
            <ChannelIcon channel="whatsapp" size={12} color="#fff" />
            WhatsApp
          </button>
        )}
      </div>
    </div>
  );
}

function ChannelDrawer({ shop, channel, initialStatus, onClose, isMobileView, dateFilter }) {
  const [activeTab, setActiveTab] = useState(initialStatus);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const drawerRef = useRef(null);
  const closeBtnRef = useRef(null);
  const previousFocusRef = useRef(null);
  const { sendWhatsapp, waError: waSendError, waFallbackUrl, clearWaError } = useWhatsapp();
  const { from, to } = getDateRange(dateFilter);
  const LIMIT = 20;

  const CHANNEL_LABEL = { push: 'Push', email: 'Email', whatsapp: 'WhatsApp' };

  // Save + restore focus
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    return () => { previousFocusRef.current?.focus(); };
  }, []);

  // Focus close button on open
  useEffect(() => { closeBtnRef.current?.focus(); }, []);

  // Esc to close
  useEffect(() => {
    const handle = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  // Focus trap — keep Tab/Shift+Tab inside the drawer
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const handle = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = [...el.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener('keydown', handle);
    return () => el.removeEventListener('keydown', handle);
  }, []);

  // Fetch items
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setLoadingItems(true);
    const params = new URLSearchParams({
      status: activeTab, page: String(page), limit: String(LIMIT), from, to,
    });
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/${channel}/items?${params}`)
      .then((data) => { if (!cancelled) { setItems(data.items || []); setTotal(data.total || 0); } })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoadingItems(false); });
    return () => { cancelled = true; };
  }, [shop, channel, activeTab, page, from, to]);

  const handleTabChange = (tab) => { setPage(0); setActiveTab(tab); };

  const { fg } = CHANNEL_COLORS[channel];

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          zIndex: 1000, WebkitTapHighlightColor: 'transparent',
        }}
      />

      {/* Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-label={`${CHANNEL_LABEL[channel]} details`}
        aria-modal="true"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: isMobileView ? '100%' : 480,
          background: '#fff',
          zIndex: 1001,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
          maxWidth: '100vw',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '16px 20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: CHANNEL_COLORS[channel].bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChannelIcon channel={channel} size={16} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
              {CHANNEL_LABEL[channel]}
            </span>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                     background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer',
                     fontSize: 18, color: '#6b7280', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '0 20px', flexShrink: 0 }}>
          {['sent', 'pending'].map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              style={{
                padding: '12px 16px', fontSize: 13, fontWeight: 600,
                border: 'none', borderBottom: activeTab === tab ? `2px solid ${fg}` : '2px solid transparent',
                background: 'none', color: activeTab === tab ? fg : '#9ca3af',
                cursor: 'pointer', marginBottom: -1,
              }}
            >
              {tab === 'sent' ? 'Sent' : 'Pending'}
            </button>
          ))}
        </div>

        {/* WA error/fallback banner */}
        {channel === 'whatsapp' && (waSendError || waFallbackUrl) && (
          <div style={{ padding: '10px 20px', background: waFallbackUrl ? '#f0fdf4' : '#fef2f2',
                        borderBottom: '1px solid #f3f4f6', fontSize: 13,
                        color: waFallbackUrl ? '#15803d' : '#b91c1c',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            {waFallbackUrl
              ? <span>Popup blocked. <a href={waFallbackUrl} target="_blank" rel="noreferrer"
                  style={{ color: '#128C7E', fontWeight: 600 }}>Open WhatsApp</a></span>
              : <span>{waSendError}</span>}
            <button onClick={clearWaError} aria-label="Dismiss"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
          </div>
        )}

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingItems ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              {activeTab === 'pending' ? 'No pending items' : 'Nothing sent in this period'}
            </div>
          ) : items.map((item) => (
            <DrawerItem
              key={item.id}
              item={item}
              channel={channel}
              shop={shop}
              sendWhatsapp={sendWhatsapp}
            />
          ))}
        </div>

        {/* Pagination */}
        {!loadingItems && total > LIMIT && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 20px', borderTop: '1px solid #f3f4f6', flexShrink: 0,
                        fontSize: 12, color: '#6b7280' }}>
            <span>{page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Previous page"
                style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 6,
                         background: 'none', cursor: page === 0 ? 'not-allowed' : 'pointer',
                         fontSize: 12, color: page === 0 ? '#d1d5db' : '#374151' }}
              >← Prev</button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * LIMIT >= total}
                aria-label="Next page"
                style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 6,
                         background: 'none', cursor: (page + 1) * LIMIT >= total ? 'not-allowed' : 'pointer',
                         fontSize: 12, color: (page + 1) * LIMIT >= total ? '#d1d5db' : '#374151' }}
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Today({ shop }) {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [pushStats, setPushStats] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dateFilter, setDateFilter] = useState('7d');
  // Header Refresh button — bumping this re-runs the channel-stats effect below.
  const [refreshKey, setRefreshKey] = useState(0);

  // Channel cards — Push / Email / WhatsApp, keyed on dateFilter + refreshKey.
  const [channelStats, setChannelStats] = useState(null);
  const [channelLoading, setChannelLoading] = useState(true);
  // Which channel detail drawer is open — set in STEP 3. { channel, status }
  const [openChannel, setOpenChannel] = useState(null);

  // Phase 1 — real-time new subscriber alerts.
  const [newSubscribers, setNewSubscribers] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState(null);
  const [sendResults, setSendResults] = useState({});

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    const { from, to } = getDateRange(dateFilter);
    setChannelLoading(true);
    apiGet(
      `/api/dashboard/${encodeURIComponent(shop)}/channels?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    )
      .then((data) => { if (!cancelled) setChannelStats(data); })
      .catch(() => { if (!cancelled) setChannelStats(null); })
      .finally(() => { if (!cancelled) setChannelLoading(false); });
    return () => { cancelled = true; };
  }, [shop, dateFilter, refreshKey]);

  // Phase 1 — poll for customers who subscribed to push in the last 24h
  // and haven't been notified yet, so the alert below can appear without
  // the merchant needing to reload the page.
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;

    function fetchNewSubs() {
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/new-subscribers`)
        .then(data => {
          if (!cancelled) setNewSubscribers(data.subscribers || []);
        })
        .catch(() => {});
    }

    fetchNewSubs(); // fetch immediately on mount
    const interval = setInterval(fetchNewSubs, 30000); // poll every 30s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [shop]);

  async function sendNow(profileId) {
    setSendingTo(profileId);
    try {
      await apiSend(
        `/api/push/send-now`, 'POST', { profileId }
      );
      setSendResults(prev => ({
        ...prev,
        [profileId]: { success: true, msg: 'Queued!' }
      }));
      // Remove from list after 3s
      setTimeout(() => {
        setNewSubscribers(prev =>
          prev.filter(s => s.profileId !== profileId)
        );
      }, 3000);
    } catch (e) {
      setSendResults(prev => ({
        ...prev,
        [profileId]: { success: false, msg: 'Failed' }
      }));
    } finally {
      setSendingTo(null);
    }
  }

  // No client-side navigation hook/pattern exists anywhere in this app yet
  // (Customers.jsx and Messages.jsx have none; the only precedent is the
  // NavMenu's own <a href> links, which are plain browser navigations that
  // Shopify's embedded-app shell reinjects shop/host into). router.push()
  // is a same-document SPA transition that bypasses that shell entirely, so
  // shop is carried forward explicitly here — every admin/*/page.js wrapper
  // in this app reads shop via `searchParams.get('shop')`, and a future
  // /admin/activity page (this route doesn't exist yet — Phase 3 only adds
  // the links, not the destination) would silently break without it.
  const navigate = (path) => {
    const sep = path.includes('?') ? '&' : '?';
    router.push(`${path}${sep}shop=${encodeURIComponent(shop)}`);
  };

  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.allSettled([
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/push-stats`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/signals?limit=20`),
      apiGet(`/api/stores/${encodeURIComponent(shop)}/orders`),
    ]).then(([ps, sg]) => {
      if (cancelled) return;
      if (ps.status === 'fulfilled') setPushStats(ps.value || null);
      if (sg.status === 'fulfilled') {
        setSignals(Array.isArray(sg.value?.signals) ? sg.value.signals : []);
      }
      if (ps.status === 'rejected' && sg.status === 'rejected') {
        setError(ps.reason?.message || 'Failed to load Today');
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [shop]);

  const groupedSignals = signals
    ? Object.values(
        signals.reduce((acc, sig) => {
          if (!acc[sig.type]) {
            acc[sig.type] = { ...sig, count: 1 };
          } else {
            acc[sig.type].count += 1;
            // Keep highest strength
            if (sig.strength > acc[sig.type].strength) {
              acc[sig.type].strength = sig.strength;
            }
          }
          return acc;
        }, {})
      ).sort((a, b) => b.strength - a.strength)
    : [];

  const todaySubtitle = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const refreshButton = (
    <button
      onClick={() => setRefreshKey(k => k + 1)}
      disabled={channelLoading}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        ...DS.btnSecondary,
        cursor: channelLoading ? 'not-allowed' : 'pointer',
        opacity: channelLoading ? 0.6 : 1,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36
          A9 9 0 0 0 20.49 15"/>
      </svg>
      {channelLoading ? 'Refreshing...' : 'Refresh'}
    </button>
  );

  return (
    <Page>
    <div style={DS.page}>
      <PageHeader
        title="Today"
        subtitle={todaySubtitle}
        action={refreshButton}
      />

      {/* Redesign — date filter + notification/activity stat rows,
          rendered first per task spec ("BEFORE any existing content"). */}

      {/* SECTION 1 — Date filter bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          background: '#f3f4f6',
          borderRadius: 8,
          width: 'fit-content',
          marginBottom: 20,
        }}
      >
        {DATE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setDateFilter(f.key)}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              background: dateFilter === f.key ? '#4f46e5' : 'transparent',
              color: dateFilter === f.key ? '#fff' : '#6b7280',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Phase 1 — new subscriber alerts */}
      {newSubscribers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center',
                        gap: 8, marginBottom: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%',
                          background: '#10b981',
                          boxShadow: '0 0 0 3px rgba(16,185,129,0.2)',
                          animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 600,
                            color: '#111827' }}>
              {newSubscribers.length} new subscriber
              {newSubscribers.length > 1 ? 's' : ''} — send them
              a welcome notification
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column',
                        gap: 8 }}>
            {newSubscribers.map(sub => (
              <div key={sub.profileId}
                style={{ ...DS.card, display: 'flex', alignItems: 'center',
                         justifyContent: 'space-between',
                         padding: '10px 14px', marginBottom: 0,
                         gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600,
                                color: '#111827' }}>
                    {sub.email || 'Anonymous subscriber'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af',
                                marginTop: 2 }}>
                    Subscribed {sub.subscribedAt
                      ? new Date(sub.subscribedAt).toLocaleTimeString(
                          [], {hour: '2-digit', minute: '2-digit'})
                      : 'recently'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center',
                              gap: 8 }}>
                  {sendResults[sub.profileId] && (
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: sendResults[sub.profileId].success
                        ? '#10b981' : '#ef4444'
                    }}>
                      {sendResults[sub.profileId].msg}
                    </span>
                  )}
                  <button
                    onClick={() => sendNow(sub.profileId)}
                    disabled={sendingTo === sub.profileId}
                    style={{
                      padding: '7px 14px', borderRadius: 7,
                      border: 'none', cursor: sendingTo === sub.profileId
                        ? 'not-allowed' : 'pointer',
                      background: sendingTo === sub.profileId
                        ? '#e5e7eb' : '#4f46e5',
                      color: sendingTo === sub.profileId
                        ? '#9ca3af' : '#fff',
                      fontSize: 12, fontWeight: 600,
                      opacity: sendingTo === sub.profileId ? 0.7 : 1,
                    }}
                  >
                    {sendingTo === sub.profileId
                      ? 'Sending...' : 'Send now'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2 — Channel cards: Push / Email / WhatsApp */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobileView ? '1fr' : 'repeat(3, 1fr)',
        gap: 16,
        marginBottom: 20,
      }}>
        <ChannelCard
          channel="push"
          label="Push"
          sent={channelStats?.push?.sent ?? 0}
          pending={channelStats?.push?.pending ?? 0}
          types={channelStats?.push?.types ?? []}
          loading={channelLoading}
          onDetails={() => setOpenChannel({ channel: 'push', status: 'sent' })}
        />
        <ChannelCard
          channel="email"
          label="Email"
          sent={channelStats?.email?.sent ?? 0}
          pending={channelStats?.email?.pending ?? 0}
          types={channelStats?.email?.types ?? []}
          loading={channelLoading}
          onDetails={() => setOpenChannel({ channel: 'email', status: 'sent' })}
        />
        <ChannelCard
          channel="whatsapp"
          label="WhatsApp"
          sent={channelStats?.whatsapp?.sent ?? 0}
          pending={channelStats?.whatsapp?.pending ?? 0}
          types={[
            ...(channelStats?.whatsapp?.sentFollowup ? [{ type: 'followup', label: 'Follow-up', sent: channelStats.whatsapp.sentFollowup, pending: 0 }] : []),
            ...(channelStats?.whatsapp?.sentOrder ? [{ type: 'order', label: 'Order msg', sent: channelStats.whatsapp.sentOrder, pending: 0 }] : []),
          ]}
          loading={channelLoading}
          onDetails={() => setOpenChannel({ channel: 'whatsapp', status: 'pending' })}
        />
      </div>

      {error && (
        <div
          style={{
            background: DS.dangerLight,
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '14px 20px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#b91c1c',
          }}
        >
          {error}
        </div>
      )}

      {/* Two column layout: Planned for today (left) + Yesterday (right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobileView ? '1fr' : '1fr 1fr',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        {/* LEFT — Planned for today */}
        <div
          style={{ ...DS.card, padding: '18px 20px', marginBottom: 0 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
              Planned for today
            </span>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              {groupedSignals.length} signal types, one message each
            </span>
          </div>

          {/* Signal rows */}
          {loading ? (
            [1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  height: '28px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                  marginBottom: '8px',
                }}
              />
            ))
          ) : groupedSignals.length ? (
            groupedSignals.map((sig) => (
              <div
                key={sig.type}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 0',
                  borderBottom: '1px solid #f9fafb',
                }}
              >
                <span style={{ fontSize: '13px', color: '#374151' }}>
                  {SIGNAL_LABELS[sig.type] || sig.type.replace(/_/g, ' ')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                      background: '#f3f4f6',
                      padding: '2px 8px',
                      borderRadius: '20px',
                    }}
                  >
                    {sig.channel || 'push'}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#111827',
                      minWidth: '16px',
                      textAlign: 'right',
                    }}
                  >
                    {sig.count}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
              No signals right now.
            </p>
          )}
        </div>

        {/* RIGHT — Yesterday */}
        <div
          style={{ ...DS.card, padding: '18px 20px', marginBottom: 0 }}
        >
          <div
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '16px',
            }}
          >
            Yesterday
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Sent */}
            <div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                Sent
              </div>
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: '700',
                  color: '#111827',
                  lineHeight: 1,
                }}
              >
                {stats?.messagesSent ?? '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                {pushStats?.deliveredLast7d ?? 0} push ·{' '}
                {stats?.messagesSent
                  ? Math.max(
                      0,
                      stats.messagesSent - (pushStats?.deliveredLast7d || 0)
                    )
                  : 0}{' '}
                email
              </div>
            </div>

            {/* Opened or clicked */}
            <div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                Opened or clicked
              </div>
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: '700',
                  color: '#111827',
                  lineHeight: 1,
                }}
              >
                {pushStats?.deliveredLast7d ?? '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                {pushStats?.rateLast7d != null
                  ? `${(pushStats.rateLast7d * 100).toFixed(0)}% —`
                  : ''}{' '}
                push{' '}
                {pushStats?.rateLast7d != null
                  ? `${(pushStats.rateLast7d * 100).toFixed(0)}%`
                  : '—'}
              </div>
            </div>

            {/* Came back and bought */}
            <div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                Came back and bought
              </div>
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: '700',
                  color: '#111827',
                  lineHeight: 1,
                }}
              >
                {stats?.conversions ?? '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                {stats?.messagesSent
                  ? `${((stats.conversions / stats.messagesSent) * 100).toFixed(1)}% of sends`
                  : ''}
              </div>
            </div>

            {/* Recovered */}
            <div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                Recovered
              </div>
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: '700',
                  color: '#16a34a',
                  lineHeight: 1,
                }}
              >
                ₹{(stats?.revenueRecovered || 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                ↑ this week
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recovered this week chart */}
      <div>
        <div
          style={{ ...DS.card, padding: '18px 20px', marginBottom: 0 }}
        >
          <div
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '4px',
            }}
          >
            Recovered this week
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
            ₹{(stats?.revenueRecovered || 0).toLocaleString('en-IN')} from{' '}
            {stats?.messagesSent || 0} messages
          </div>

          {/* Simple bar chart using divs */}
          {(() => {
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const today = new Date().getDay();
            // Distribute revenueRecovered across days (placeholder until
            // we have per-day data — use a simple curve)
            const total = stats?.revenueRecovered || 0;
            const bars = days.map((day, i) => ({
              day,
              value: i < today ? Math.round(total * Math.random() * 0.3) : 0,
            }));
            const maxVal = Math.max(...bars.map((b) => b.value), 1);
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '8px',
                  height: '80px',
                }}
              >
                {bars.map((bar) => (
                  <div
                    key={bar.day}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${(bar.value / maxVal) * 70}px`,
                        background: bar.value > 0 ? '#16a34a' : '#e5e7eb',
                        borderRadius: '3px 3px 0 0',
                        minHeight: bar.value > 0 ? '4px' : '2px',
                      }}
                    />
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>{bar.day}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
    </Page>

    {/* Channel detail drawer */}
    {openChannel && (
      <ChannelDrawer
        shop={shop}
        channel={openChannel.channel}
        initialStatus={openChannel.status}
        onClose={() => setOpenChannel(null)}
        isMobileView={isMobileView}
        dateFilter={dateFilter}
      />
    )}
  );
}
