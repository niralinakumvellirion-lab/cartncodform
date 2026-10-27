'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, BACKEND_URL } from '../../../lib/api';

const FG = '#4f46e5';
const BG = '#eef2ff';
const LIMIT = 20;

const TYPE_LABELS = {
  cart_abandon:      'Cart reminder',
  browse_abandon:    'Browse reminder',
  price_drop:        'Price drop',
  back_in_stock:     'Back in stock',
  high_intent:       'High intent',
  lapsing:           'Going quiet',
  email_capture:     'Email capture',
  cod_to_prepaid:    'Prepaid upgrade',
  winback:           'Win back',
  welcome:           'Welcome',
  festival:          'Campaign',
  manual:            'Manual send',
  order_confirm:     'Order confirm',
  order_shipped:     'Shipped',
  order_delivered:   'Delivered',
};

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true });
}

function rangeStr(from, to) {
  if (!from && !to) return 'All time';
  const fmt = (s) => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '…';
  return `${fmt(from)} – ${fmt(to)}`;
}

function initials(name) {
  if (!name || name === 'Anonymous visitor') return '?';
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

function tlabel(type, label) {
  return label || TYPE_LABELS[type] || type || 'Unknown';
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PersonIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx={12} cy={7} r={4}/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1={12} y1={15} x2={12} y2={3}/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
      stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx={11} cy={11} r={8}/>
      <line x1={21} y1={21} x2={16.65} y2={16.65}/>
    </svg>
  );
}

function CountIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1={18} y1={20} x2={18} y2={10}/>
      <line x1={12} y1={20} x2={12} y2={4}/>
      <line x1={6} y1={20} x2={6} y2={14}/>
    </svg>
  );
}

function RevisitIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
    </svg>
  );
}

function ChevronDownIcon({ expanded }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

// ─── Shared small pieces ──────────────────────────────────────────────────────

function TypePill({ type, label }) {
  return (
    <span style={{
      fontSize: 11, padding: '3px 8px', borderRadius: 999,
      background: BG, color: FG, fontWeight: 600,
      whiteSpace: 'nowrap', display: 'inline-block', lineHeight: '16px',
    }}>
      {tlabel(type, label)}
    </span>
  );
}

function Avatar({ name, isAnon }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', background: BG, color: FG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, flexShrink: 0,
    }}>
      {isAnon ? <PersonIcon /> : initials(name)}
    </div>
  );
}

function ShimmerRow() {
  return (
    <div style={{ height: 64, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12,
                  borderBottom: '1px solid #f9fafb' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f3f4f6', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ width: '42%', height: 11, background: '#f3f4f6', borderRadius: 4 }} />
        <div style={{ width: '58%', height: 9, background: '#f3f4f6', borderRadius: 4 }} />
      </div>
      <div style={{ width: 72, height: 9, background: '#f3f4f6', borderRadius: 4 }} />
    </div>
  );
}

function Pagination({ page, total, onPage }) {
  const prevDisabled = page === 0;
  const nextDisabled = (page + 1) * LIMIT >= total;
  if (total <= LIMIT) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 20px', borderTop: '1px solid #f3f4f6', flexShrink: 0,
                  fontSize: 12, color: '#6b7280' }}>
      <span>{page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onPage((p) => Math.max(0, p - 1))} disabled={prevDisabled}
          aria-label="Previous page"
          style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 6,
                   background: 'none', cursor: prevDisabled ? 'not-allowed' : 'pointer',
                   fontSize: 12, color: prevDisabled ? '#d1d5db' : '#374151' }}>← Prev</button>
        <button onClick={() => onPage((p) => p + 1)} disabled={nextDisabled}
          aria-label="Next page"
          style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 6,
                   background: 'none', cursor: nextDisabled ? 'not-allowed' : 'pointer',
                   fontSize: 12, color: nextDisabled ? '#d1d5db' : '#374151' }}>Next →</button>
      </div>
    </div>
  );
}

// ─── Anon subtitle helper ─────────────────────────────────────────────────────

function anonSubtitle(userKey, deviceType) {
  const last4 = userKey.slice(-4);
  let type = 'Device';
  if (deviceType) {
    const dt = deviceType.toLowerCase();
    if (dt === 'desktop' || dt === 'web') type = 'Desktop';
    else type = 'Mobile';
  }
  return `${type} - ...${last4}`;
}

// ─── Left vertical menu (Count / Revisit) ────────────────────────────────────

const MENU_ITEMS = [
  { key: 'count',   label: 'Count',   Icon: CountIcon },
  { key: 'revisit', label: 'Revisit', Icon: RevisitIcon },
];

function LeftMenu({ active, onChange, isNarrow }) {
  const btns = useRef([]);

  const handleKey = useCallback((e, i) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      btns.current[(i + 1) % MENU_ITEMS.length]?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      btns.current[(i - 1 + MENU_ITEMS.length) % MENU_ITEMS.length]?.focus();
    }
  }, []);

  if (isNarrow) {
    return (
      <div
        role="tablist"
        aria-orientation="horizontal"
        style={{
          display: 'flex', gap: 4, padding: '8px 16px',
          borderBottom: '1px solid #f3f4f6', flexShrink: 0,
        }}
      >
        {MENU_ITEMS.map(({ key, label, Icon }, i) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              ref={(el) => { btns.current[i] = el; }}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(key)}
              onKeyDown={(e) => handleKey(e, i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 14px', borderRadius: 999,
                background: isActive ? BG : 'none',
                color: isActive ? FG : '#6b7280',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              <Icon />{label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      style={{
        width: 120, flexShrink: 0,
        borderRight: '1px solid #f3f4f6',
        display: 'flex', flexDirection: 'column',
        padding: '12px 0', gap: 2,
      }}
    >
      {MENU_ITEMS.map(({ key, label, Icon }, i) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            ref={(el) => { btns.current[i] = el; }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={(e) => handleKey(e, i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              height: 40, padding: '0 16px',
              borderRadius: 10,
              background: isActive ? BG : 'none',
              color: isActive ? FG : '#6b7280',
              border: 'none',
              borderLeft: `3px solid ${isActive ? FG : 'transparent'}`,
              cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#f3f4f6'; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'none'; }}
          >
            <Icon />{label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Revisit status chip ──────────────────────────────────────────────────────

function RevisitChip({ revisited }) {
  let bg, color, text;
  if (revisited === true) {
    bg = '#dcfce7'; color = '#16a34a'; text = 'Revisited';
  } else if (revisited === 'not_tracked') {
    bg = '#fef3c7'; color = '#92400e'; text = 'Not tracked';
  } else {
    bg = '#f3f4f6'; color = '#6b7280'; text = 'No revisit yet';
  }
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999,
                   background: bg, color, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

// ─── Count expand panel (inset) ───────────────────────────────────────────────

function CountExpandPanel({ data, loading, error, onRetry }) {
  if (loading) {
    return (
      <div style={{ padding: 12 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ width: '35%', height: 10, background: '#e5e7eb', borderRadius: 4, marginBottom: 6 }} />
            <div style={{ width: '60%', height: 6, background: '#e5e7eb', borderRadius: 999 }} />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: '#ef4444' }}>
        Failed to load.{' '}
        <button onClick={onRetry}
          style={{ color: FG, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  const max = Math.max(...(data.byType || []).map((t) => t.count), 1);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.byType && data.byType.length > 0 ? (
        data.byType.map((t) => (
          <div key={t.type}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <TypePill type={t.type} label={t.label} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{t.count}</span>
            </div>
            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999,
                width: `${(t.count / max) * 100}%`,
                background: FG,
              }} />
            </div>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>No notifications in this period</div>
      )}
    </div>
  );
}

// ─── Revisit expand panel (notifications list) ────────────────────────────────

function RevisitExpandPanel({ data, loading, error, page, onPage, onRetry }) {
  if (loading) {
    return (
      <div style={{ padding: 12 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ background: '#f3f4f6', borderRadius: 8, padding: '10px 12px', marginBottom: 6 }}>
            <div style={{ width: '70%', height: 9, background: '#e5e7eb', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: '#ef4444' }}>
        Failed to load.{' '}
        <button onClick={onRetry}
          style={{ color: FG, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { notifications, total } = data;

  if (!notifications || notifications.length === 0) {
    return <div style={{ padding: 12, fontSize: 12, color: '#9ca3af' }}>No notifications in this period</div>;
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {notifications.map((n) => {
          const isRevisited  = n.status === 'revisited';
          const isNotTracked = n.status === 'not_tracked';

          let chipBg, chipColor, chipText;
          if (isRevisited) {
            chipBg = '#dcfce7'; chipColor = '#16a34a';
            chipText = `Revisited · ${n.visits} visit${n.visits !== 1 ? 's' : ''}`;
          } else if (isNotTracked) {
            chipBg = '#fef3c7'; chipColor = '#92400e';
            chipText = 'Not tracked';
          } else {
            chipBg = '#f3f4f6'; chipColor = '#6b7280';
            chipText = 'No revisit yet';
          }

          return (
            <div key={n.jobId} style={{ background: '#f3f4f6', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <TypePill type={n.type} label={n.label} />
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{fmtTime(n.sentAt)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.title || '(no title)'}
                  </div>
                  {isRevisited && n.lastVisitAt && (
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      Last visit {fmtTime(n.lastVisitAt)}
                    </div>
                  )}
                  {isNotTracked && (
                    <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>
                      Sent before tracking was added
                    </div>
                  )}
                  {isRevisited && (n.funnel?.addedToCart || n.funnel?.checkout || n.funnel?.purchased) && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {n.funnel.addedToCart && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999,
                                       background: '#f0fdf4', color: '#16a34a', fontWeight: 600 }}>Added to cart</span>
                      )}
                      {n.funnel.checkout && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999,
                                       background: '#fef3c7', color: '#d97706', fontWeight: 600 }}>Checkout</span>
                      )}
                      {n.funnel.purchased && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999,
                                       background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>Purchased</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999,
                    background: chipBg, color: chipColor, whiteSpace: 'nowrap',
                  }}>
                    {chipText}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Pagination page={page} total={total} onPage={onPage} />
    </div>
  );
}

// ─── Accordion user row (All users view) ─────────────────────────────────────

function AccordionUserRow({ user, menuTab, expanded, onToggle, shop, from, to, expandCache }) {
  const isAnon    = !user.email;
  const nameText  = user.name || 'Anonymous visitor';
  const subtitle  = isAnon ? anonSubtitle(user.userKey, user.deviceType) : user.email;

  const panelId = `expand-panel-${user.userKey}`;

  const [countData,       setCountData]       = useState(null);
  const [countLoading,    setCountLoading]    = useState(false);
  const [countError,      setCountError]      = useState(false);
  const [revisitData,     setRevisitData]     = useState(null);
  const [revisitLoading,  setRevisitLoading]  = useState(false);
  const [revisitError,    setRevisitError]    = useState(false);
  const [revisitPage,     setRevisitPage]     = useState(0);

  useEffect(() => {
    if (!expanded || menuTab !== 'count') return;
    const cKey = `count:${user.userKey}:${from}:${to}`;
    const cached = expandCache.current[cKey];
    if (cached) { setCountData(cached); return; }
    let cancelled = false;
    setCountLoading(true); setCountError(false);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/push/users/${encodeURIComponent(user.userKey)}/count?${params}`)
      .then((d) => { if (!cancelled) { expandCache.current[cKey] = d; setCountData(d); } })
      .catch(() => { if (!cancelled) setCountError(true); })
      .finally(() => { if (!cancelled) setCountLoading(false); });
    return () => { cancelled = true; };
  }, [expanded, menuTab, user.userKey, from, to, shop]);

  useEffect(() => {
    if (!expanded || menuTab !== 'revisit') return;
    const rKey = `revisit:${user.userKey}:${from}:${to}:${revisitPage}`;
    const cached = expandCache.current[rKey];
    if (cached) { setRevisitData(cached); return; }
    let cancelled = false;
    setRevisitLoading(true); setRevisitError(false);
    const params = new URLSearchParams({ page: String(revisitPage), limit: String(LIMIT) });
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/push/users/${encodeURIComponent(user.userKey)}/revisit?${params}`)
      .then((d) => { if (!cancelled) { expandCache.current[rKey] = d; setRevisitData(d); } })
      .catch(() => { if (!cancelled) setRevisitError(true); })
      .finally(() => { if (!cancelled) setRevisitLoading(false); });
    return () => { cancelled = true; };
  }, [expanded, menuTab, user.userKey, from, to, revisitPage, shop]);

  const handleRetryCount = useCallback(() => {
    const cKey = `count:${user.userKey}:${from}:${to}`;
    delete expandCache.current[cKey];
    setCountData(null); setCountError(false); setCountLoading(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/push/users/${encodeURIComponent(user.userKey)}/count?${params}`)
      .then((d) => { expandCache.current[cKey] = d; setCountData(d); })
      .catch(() => setCountError(true))
      .finally(() => setCountLoading(false));
  }, [user.userKey, from, to, shop]);

  const handleRetryRevisit = useCallback(() => {
    const rKey = `revisit:${user.userKey}:${from}:${to}:${revisitPage}`;
    delete expandCache.current[rKey];
    setRevisitData(null); setRevisitError(false); setRevisitLoading(true);
    const params = new URLSearchParams({ page: String(revisitPage), limit: String(LIMIT) });
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/push/users/${encodeURIComponent(user.userKey)}/revisit?${params}`)
      .then((d) => { expandCache.current[rKey] = d; setRevisitData(d); })
      .catch(() => setRevisitError(true))
      .finally(() => setRevisitLoading(false));
  }, [user.userKey, from, to, revisitPage, shop]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(user.userKey); }
  };

  return (
    <div style={{ borderBottom: '1px solid #f9fafb' }}>
      <button
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => onToggle(user.userKey)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          width: '100%',
          minHeight: 64,
          padding: menuTab === 'revisit' ? '10px 20px' : '0 20px',
          background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', outline: 'none',
          height: menuTab === 'count' ? 64 : undefined,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onFocus={(e) => { e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${FG}`; }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${nameText}`}
      >
        <Avatar name={user.name} isAnon={isAnon} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nameText}
          </div>
          <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
          {menuTab === 'revisit' && (
            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <RevisitChip revisited={user.revisited} />
              {user.cameBackVia && user.cameBackVia.length > 0 && user.cameBackVia.map((v) => (
                <span key={v.type} style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 999,
                  background: BG, color: FG, fontWeight: 600,
                }}>
                  {tlabel(v.type, v.label)} ×{v.count}
                </span>
              ))}
            </div>
          )}
        </div>
        {menuTab === 'count' && (
          <div style={{ flexShrink: 0, textAlign: 'right', marginRight: 6 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>
              {user.sentCount}
            </div>
            <div style={{ fontSize: 11.5, color: '#9ca3af' }}>sent</div>
          </div>
        )}
        <ChevronDownIcon expanded={expanded} />
      </button>

      {expanded && (
        <div
          id={panelId}
          style={{
            background: '#f9fafb', border: '1px solid #eef0f4', borderRadius: 10,
            margin: '0 20px 12px 68px',
          }}
        >
          {menuTab === 'count' ? (
            <CountExpandPanel data={countData} loading={countLoading} error={countError} onRetry={handleRetryCount} />
          ) : (
            <RevisitExpandPanel
              data={revisitData} loading={revisitLoading} error={revisitError}
              page={revisitPage} onPage={setRevisitPage} onRetry={handleRetryRevisit}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Accordion revisited user row ─────────────────────────────────────────────

function AccordionRevisitedRow({ user, expanded, onToggle, shop, from, to, expandCache }) {
  const isAnon   = !user.email;
  const nameText = user.name || 'Anonymous visitor';
  const subtitle = isAnon ? anonSubtitle(user.userKey, user.deviceType) : user.email;

  const panelId = `revisited-panel-${user.userKey}`;

  const [revisitData,     setRevisitData]     = useState(null);
  const [revisitLoading,  setRevisitLoading]  = useState(false);
  const [revisitError,    setRevisitError]    = useState(false);
  const [revisitPage,     setRevisitPage]     = useState(0);

  useEffect(() => {
    if (!expanded) return;
    const rKey = `revisited:${user.userKey}:${from}:${to}:${revisitPage}`;
    const cached = expandCache.current[rKey];
    if (cached) { setRevisitData(cached); return; }
    let cancelled = false;
    setRevisitLoading(true); setRevisitError(false);
    const params = new URLSearchParams({ page: String(revisitPage), limit: String(LIMIT) });
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/push/users/${encodeURIComponent(user.userKey)}/revisit?${params}`)
      .then((d) => { if (!cancelled) { expandCache.current[rKey] = d; setRevisitData(d); } })
      .catch(() => { if (!cancelled) setRevisitError(true); })
      .finally(() => { if (!cancelled) setRevisitLoading(false); });
    return () => { cancelled = true; };
  }, [expanded, user.userKey, from, to, revisitPage, shop]);

  const handleRetry = useCallback(() => {
    const rKey = `revisited:${user.userKey}:${from}:${to}:${revisitPage}`;
    delete expandCache.current[rKey];
    setRevisitData(null); setRevisitError(false); setRevisitLoading(true);
    const params = new URLSearchParams({ page: String(revisitPage), limit: String(LIMIT) });
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/push/users/${encodeURIComponent(user.userKey)}/revisit?${params}`)
      .then((d) => { expandCache.current[rKey] = d; setRevisitData(d); })
      .catch(() => setRevisitError(true))
      .finally(() => setRevisitLoading(false));
  }, [user.userKey, from, to, revisitPage, shop]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(user.userKey); }
  };

  return (
    <div style={{ borderBottom: '1px solid #f9fafb' }}>
      <button
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => onToggle(user.userKey)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          width: '100%', minHeight: 64, padding: '10px 20px',
          background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', outline: 'none',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onFocus={(e) => { e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${FG}`; }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${nameText}`}
      >
        <div style={{ marginTop: 2, flexShrink: 0 }}>
          <Avatar name={user.name} isAnon={isAnon} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nameText}
              </div>
              <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 1,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subtitle}
              </div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                {user.revisits} visit{user.revisits !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          {user.cameBackVia && user.cameBackVia.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 2 }}>Came back through</span>
              {user.cameBackVia.map((v) => (
                <span key={v.type} style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 999,
                  background: BG, color: FG, fontWeight: 600,
                }}>
                  {tlabel(v.type, v.label)} ×{v.count}
                </span>
              ))}
            </div>
          )}
        </div>
        <ChevronDownIcon expanded={expanded} />
      </button>

      {expanded && (
        <div
          id={panelId}
          style={{
            background: '#f9fafb', border: '1px solid #eef0f4', borderRadius: 10,
            margin: '0 20px 12px 68px',
          }}
        >
          <RevisitExpandPanel
            data={revisitData} loading={revisitLoading} error={revisitError}
            page={revisitPage} onPage={setRevisitPage} onRetry={handleRetry}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function PushUsersPanel({ shop, from, to }) {
  const [viewMode,     setViewMode]     = useState('all');   // 'all' | 'revisited'
  const [menuTab,      setMenuTab]      = useState('count'); // 'count' | 'revisit'
  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [originFilter, setOriginFilter] = useState('all');
  const [page,         setPage]         = useState(0);
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [retryCount,   setRetryCount]   = useState(0);
  const [expandedKey,  setExpandedKey]  = useState(null);
  const [isNarrow,     setIsNarrow]     = useState(false);

  const expandCache = useRef({});

  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth <= 520);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); setExpandedKey(null); }, [search, typeFilter, originFilter, viewMode, menuTab, from, to]);

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    if (search)     params.set('q', search);
    if (typeFilter) params.set('type', typeFilter);
    if (viewMode === 'all' && originFilter !== 'all') params.set('origin', originFilter);
    if (viewMode === 'all' && menuTab === 'revisit') params.set('includeVia', '1');

    const endpoint = viewMode === 'revisited'
      ? `/api/dashboard/${encodeURIComponent(shop)}/channels/push/revisited?${params}`
      : `/api/dashboard/${encodeURIComponent(shop)}/channels/push/users?${params}`;

    apiGet(endpoint)
      .then((d) => { if (!cancelled) { setData(d); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [shop, viewMode, menuTab, search, typeFilter, originFilter, page, from, to, retryCount]);

  const handleToggle = useCallback((key) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  const handleExport = useCallback(async () => {
    const params = new URLSearchParams();
    if (from)   params.set('from', from);
    if (to)     params.set('to', to);
    if (search)     params.set('q', search);
    if (typeFilter) params.set('type', typeFilter);
    if (originFilter !== 'all') params.set('origin', originFilter);
    const url = `${BACKEND_URL}/api/dashboard/${encodeURIComponent(shop)}/channels/push/users.csv?${params}`;
    try {
      const token = await window.shopify.idToken();
      const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const text  = await res.text();
      const blob  = new Blob([text], { type: 'text/csv' });
      const a     = document.createElement('a');
      a.href      = URL.createObjectURL(blob);
      a.download  = `push-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('CSV export failed', e.message);
    }
  }, [shop, from, to, search, typeFilter, originFilter]);

  const rLabel = rangeStr(from, to);
  const users  = data?.users || [];
  const total  = data?.total || 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Filter bar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[
            { key: 'all',      label: 'All users' },
            { key: 'revisited', label: 'Revisited users' },
          ].map(({ key, label }) => {
            const active = viewMode === key;
            return (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                aria-pressed={active}
                style={{
                  height: 32, padding: '0 14px', borderRadius: 999,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${active ? '#c7d2fe' : '#e5e7eb'}`,
                  background: active ? BG : '#fff',
                  color: active ? FG : '#6b7280',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: isNarrow ? 'wrap' : 'nowrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1, minWidth: 160 }}>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <SearchIcon />
            </div>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search users"
              style={{
                width: '100%', height: 36, paddingLeft: 30, paddingRight: searchInput ? 28 : 10,
                border: '1px solid #e5e7eb', borderRadius: 10,
                fontSize: 12.5, color: '#374151', background: '#fff',
                boxSizing: 'border-box', outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = FG; }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                aria-label="Clear search"
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#9ca3af', fontSize: 15, lineHeight: 1, padding: 2,
                }}
              >×</button>
            )}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
            aria-label="Filter by type"
            style={{
              height: 36, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 8,
              fontSize: 12, color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>

          {viewMode === 'all' && (
            <select
              value={originFilter}
              onChange={(e) => { setOriginFilter(e.target.value); setPage(0); }}
              aria-label="Filter by origin"
              style={{
                height: 36, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: 12, color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="all">All sources</option>
              <option value="automated">Automated</option>
              <option value="manual">Manual</option>
            </select>
          )}

          {viewMode === 'all' && (
            <button
              onClick={handleExport}
              aria-label="Export users as CSV"
              style={{
                height: 36, padding: '0 12px', border: '1px solid #e5e7eb', borderRadius: 8,
                background: '#fff', color: '#374151', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 600, flexShrink: 0,
              }}
            >
              <DownloadIcon />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Summary line */}
      <div style={{ padding: '5px 20px 4px', flexShrink: 0 }}>
        <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
          {loading ? '…' : `${total} user${total !== 1 ? 's' : ''} · ${rLabel}`}
        </span>
      </div>

      {/* Content area: left menu + list (or full-width revisited) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {viewMode === 'all' && !isNarrow && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <LeftMenu active={menuTab} onChange={(k) => { setMenuTab(k); setExpandedKey(null); }} isNarrow={false} />
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: 96 }}>
              {renderList()}
            </div>
          </div>
        )}
        {viewMode === 'all' && isNarrow && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <LeftMenu active={menuTab} onChange={(k) => { setMenuTab(k); setExpandedKey(null); }} isNarrow={true} />
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
              {renderList()}
            </div>
          </div>
        )}
        {viewMode === 'revisited' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
            {renderList()}
          </div>
        )}
      </div>

      {!loading && !error && <Pagination page={page} total={total} onPage={setPage} />}
    </div>
  );

  function renderList() {
    if (loading) {
      return Array.from({ length: 6 }).map((_, i) => <ShimmerRow key={i} />);
    }
    if (error) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Failed to load users</div>
          <button
            onClick={() => setRetryCount((c) => c + 1)}
            style={{
              padding: '7px 16px', background: FG, color: '#fff', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    if (users.length === 0) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
          {search
            ? 'No users match your search'
            : viewMode === 'revisited'
              ? 'No revisits yet. A revisit is recorded when a customer opens your store from a notification.'
              : 'No users yet in this date range'}
        </div>
      );
    }
    if (viewMode === 'revisited') {
      return (
        <>
          <div style={{ padding: '10px 20px 6px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            {total} user{total !== 1 ? 's' : ''} came back from notifications
          </div>
          {users.map((user) => (
            <AccordionRevisitedRow
              key={user.userKey}
              user={user}
              expanded={expandedKey === user.userKey}
              onToggle={handleToggle}
              shop={shop}
              from={from}
              to={to}
              expandCache={expandCache}
            />
          ))}
        </>
      );
    }
    return users.map((user) => (
      <AccordionUserRow
        key={user.userKey}
        user={user}
        menuTab={menuTab}
        expanded={expandedKey === user.userKey}
        onToggle={handleToggle}
        shop={shop}
        from={from}
        to={to}
        expandCache={expandCache}
      />
    ));
  }
}
