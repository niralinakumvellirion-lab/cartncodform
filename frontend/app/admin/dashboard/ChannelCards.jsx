'use client';

import { useState, useEffect, useRef } from 'react';
import { apiGet } from '../../../lib/api';
import { useWhatsapp } from '../screens/customerShared';

const CARD_STYLE = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

export const CHANNEL_COLORS = {
  push:      { fg: '#4f46e5', bg: '#eef2ff' },
  email:     { fg: '#d97706', bg: '#fef3c7' },
  whatsapp:  { fg: '#128C7E', bg: '#f0fdf4' },
};

export function ChannelIcon({ channel, size = 14, color }) {
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

export function ChannelCard({ channel, label, sent, pending, types, loading, onDetails }) {
  const { fg, bg } = CHANNEL_COLORS[channel];
  return (
    <div style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}>
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

      {/* Outcome chip — WA sent shows outcomeChip from AttributedEvent; others show job.outcome */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        {(() => {
          const chip = item.outcomeChip || item.outcome;
          if (!chip) return <span />;
          const isPositive = chip === 'Bought' || chip === 'converted';
          const isMed = chip === 'Added to cart' || chip === 'Started checkout' || chip === 'clicked';
          return (
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
              color: isPositive ? '#16a34a' : isMed ? '#4f46e5' : '#9ca3af',
            }}>
              {chip}
            </span>
          );
        })()}

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

export function ChannelDrawer({ shop, channel, initialStatus, onClose, isMobileView, from, to }) {
  const [activeTab, setActiveTab] = useState(initialStatus);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [waStats, setWaStats] = useState(null);
  const drawerRef = useRef(null);
  const closeBtnRef = useRef(null);
  const previousFocusRef = useRef(null);
  const { sendWhatsapp, waError: waSendError, waFallbackUrl, clearWaError } = useWhatsapp();
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

  // Focus trap
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
    const params = new URLSearchParams({ status: activeTab, page: String(page), limit: String(LIMIT) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/${channel}/items?${params}`)
      .then((data) => { if (!cancelled) { setItems(data.items || []); setTotal(data.total || 0); } })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoadingItems(false); });
    return () => { cancelled = true; };
  }, [shop, channel, activeTab, page, from, to]);

  // WhatsApp header stats
  useEffect(() => {
    if (channel !== 'whatsapp' || !shop) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    apiGet(`/api/whatsapp/${encodeURIComponent(shop)}/stats?${params}`)
      .then((data) => { if (!cancelled) setWaStats(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [shop, channel, from, to]);

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

        {/* WhatsApp outcome summary row */}
        {channel === 'whatsapp' && waStats && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #f3f4f6',
                        flexShrink: 0, fontSize: 12 }}>
            {[
              { label: 'Pending', value: waStats.pending },
              { label: 'Sent', value: waStats.sent },
              { label: 'Visited', value: waStats.clicked },
              { label: 'Carted', value: waStats.carted },
              { label: 'Bought', value: waStats.purchased },
            ].map((s, i, arr) => (
              <div key={s.label} style={{
                flex: 1, padding: '10px 8px', textAlign: 'center',
                borderRight: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>
                  {s.value ?? '—'}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

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
