'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, BACKEND_URL } from '../../../lib/api';

const FG = '#4f46e5';
const BG = '#eef2ff';
const LIMIT = 20;

// All push notification type labels — matches backend SIGNAL_LABELS in pushUsers.js
const TYPE_LABELS = {
  cart_abandon:      'Cart reminder',
  browse_abandon:    'Browse reminder',
  checkout_abandon:  'Checkout reminder',
  high_intent:       'High intent',
  price_hesitation:  'Price hesitation',
  post_purchase_d3:  'Post-purchase',
  lapsing:           'Going quiet',
  email_capture:     'Email capture',
  cod_to_prepaid:    'Prepaid upgrade',
  winback:           'Win back',
  welcome:           'Welcome',
  festival:          'Campaign',
  manual:            'Manual send',
  followup:          'Follow-up',
  order:             'Order message',
};
const KNOWN_TYPES = Object.entries(TYPE_LABELS).map(([type, label]) => ({ type, label }));

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      .toLowerCase().replace(' am', ' am').replace(' pm', ' pm');
}

function fmtDateOnly(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function rangeStr(from, to) {
  if (!from && !to) return 'All time';
  if (from && to) return `${fmtDateOnly(from)} – ${fmtDateOnly(to)}`;
  return from ? `From ${fmtDateOnly(from)}` : `Until ${fmtDateOnly(to)}`;
}

function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function tlabel(type, label) {
  return label || TYPE_LABELS[type] || (type ? type.replace(/_/g, ' ') : 'Other');
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function PersonIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
      stroke={FG} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx={12} cy={7} r={4}/>
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6"/>
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

function ArrowLeftIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1={19} y1={12} x2={5} y2={12}/>
      <polyline points="12 19 5 12 12 5"/>
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
      <div style={{ display: 'flex', gap: 8 }}>
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

// ─── User row (Sent / All users view) ────────────────────────────────────────

function UserRow({ user, onSelect, rowRef }) {
  const isAnon = !user.email;
  const nameText = user.name || 'Anonymous visitor';
  const subtitle = isAnon
    ? (user.deviceType
        ? user.deviceType.charAt(0).toUpperCase() + user.deviceType.slice(1) + ' visitor'
        : 'Anonymous visitor')
    : user.email;

  return (
    <button
      ref={rowRef}
      onClick={() => onSelect(user)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', height: 64, padding: '0 20px',
        background: 'none', border: 'none', borderBottom: '1px solid #f9fafb',
        cursor: 'pointer', textAlign: 'left', outline: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${FG}`; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      aria-label={`View notifications for ${nameText}`}
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
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11.5, color: '#6b7280' }}>
          {user.lastSentAt ? fmtTime(user.lastSentAt) : '—'}
        </span>
        <ChevronRightIcon />
      </div>
    </button>
  );
}

// ─── Revisited user row ───────────────────────────────────────────────────────

function RevisitedUserRow({ user, onSelect, rowRef }) {
  const isAnon = !user.email;
  const nameText = user.name || 'Anonymous visitor';
  const subtitle = isAnon
    ? (user.deviceType
        ? user.deviceType.charAt(0).toUpperCase() + user.deviceType.slice(1) + ' visitor'
        : 'Anonymous visitor')
    : user.email;

  return (
    <button
      ref={rowRef}
      onClick={() => onSelect(user)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        width: '100%', padding: '14px 20px', minHeight: 64,
        background: 'none', border: 'none', borderBottom: '1px solid #f9fafb',
        cursor: 'pointer', textAlign: 'left', outline: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${FG}`; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      aria-label={`View revisit details for ${nameText}`}
    >
      <div style={{ marginTop: 2, flexShrink: 0 }}>
        <Avatar name={user.name} isAnon={isAnon} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
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
            <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 1 }}>
              Last {fmtTime(user.lastVisitAt)}
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
    </button>
  );
}

// ─── Count panel ─────────────────────────────────────────────────────────────

function CountPanel({ data, loading, error, rLabel }) {
  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ width: '30%', height: 28, background: '#f3f4f6', borderRadius: 6, marginBottom: 8 }} />
            <div style={{ width: '60%', height: 10, background: '#f3f4f6', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return <div style={{ padding: 24, fontSize: 13, color: '#ef4444' }}>Failed to load count data.</div>;
  }
  if (!data) return null;

  const max = Math.max(...(data.byType || []).map((t) => t.count), 1);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: FG, lineHeight: 1 }}>{data.total}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>notifications sent</div>
      <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{rLabel}</div>

      {data.byType && data.byType.length > 0 ? (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.byType.map((t) => (
            <div key={t.type}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <TypePill type={t.type} label={t.label} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{t.count}</span>
              </div>
              <div style={{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 999,
                  width: `${(t.count / max) * 100}%`,
                  background: BG,
                }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 20, fontSize: 13, color: '#9ca3af' }}>No notifications in this period</div>
      )}
    </div>
  );
}

// ─── Revisit panel ────────────────────────────────────────────────────────────

function RevisitPanel({ data, loading, error, page, onPage }) {
  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ flex: 1, background: '#f9fafb', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ width: '50%', height: 9, background: '#e5e7eb', borderRadius: 4, marginBottom: 8 }} />
              <div style={{ width: '40%', height: 20, background: '#e5e7eb', borderRadius: 4 }} />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
            <div style={{ width: '70%', height: 10, background: '#e5e7eb', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return <div style={{ padding: 24, fontSize: 13, color: '#ef4444' }}>Failed to load revisit data.</div>;
  }
  if (!data) return null;

  const { summary, notifications, total } = data;
  const sent = summary?.sent ?? 0;
  const came = summary?.revisitedAfter ?? 0;

  return (
    <div style={{ padding: 24 }}>
      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, background: '#f9fafb', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Sent</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginTop: 2 }}>{sent}</div>
        </div>
        <div style={{ flex: 1, background: '#f9fafb', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Came back after</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: FG, marginTop: 2 }}>{came}</div>
        </div>
      </div>

      {/* Came back through */}
      {summary?.byType && summary.byType.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 11.5, color: '#9ca3af' }}>Came back through</span>
          {summary.byType.map((t) => (
            <span key={t.type} style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 999,
              background: BG, color: FG, fontWeight: 600,
            }}>
              {tlabel(t.type, t.label)} ×{t.count}
            </span>
          ))}
        </div>
      )}

      {/* Notification list */}
      {!notifications || notifications.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9ca3af' }}>No notifications in this period</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                <div key={n.jobId} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                        <TypePill type={n.type} label={n.label} />
                        <span style={{ fontSize: 11.5, color: '#9ca3af' }}>{fmtTime(n.sentAt)}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title || '(no title)'}
                      </div>
                      {isRevisited && n.lastVisitAt && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
                          Last visit {fmtTime(n.lastVisitAt)}
                        </div>
                      )}
                      {isNotTracked && (
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 3 }}>
                          Sent before tracking was added
                        </div>
                      )}
                      {isRevisited && (n.funnel?.addedToCart || n.funnel?.checkout || n.funnel?.purchased) && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                          {n.funnel.addedToCart && (
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999,
                                           background: '#f0fdf4', color: '#16a34a', fontWeight: 600 }}>
                              Added to cart
                            </span>
                          )}
                          {n.funnel.checkout && (
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999,
                                           background: '#fef3c7', color: '#d97706', fontWeight: 600 }}>
                              Checkout
                            </span>
                          )}
                          {n.funnel.purchased && (
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999,
                                           background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>
                              Purchased
                            </span>
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
        </>
      )}
    </div>
  );
}

// ─── Detail view (Count + Revisit tabs) ──────────────────────────────────────

const DETAIL_MENU = [
  { key: 'count',   label: 'Count',   Icon: CountIcon },
  { key: 'revisit', label: 'Revisit', Icon: RevisitIcon },
];

function DetailView({ shop, user, from, to, initialTab, backLabel, onBack }) {
  const [detailTab,    setDetailTab]    = useState(initialTab || 'count');
  const [countData,    setCountData]    = useState(null);
  const [revisitData,  setRevisitData]  = useState(null);
  const [countLoading, setCountLoading] = useState(true);
  const [revisitLoading, setRevisitLoading] = useState(true);
  const [countError,   setCountError]   = useState(false);
  const [revisitError, setRevisitError] = useState(false);
  const [revisitPage,  setRevisitPage]  = useState(0);
  const [isNarrow,     setIsNarrow]     = useState(false);

  const cacheRef   = useRef({});
  const menuBtns   = useRef([]);

  const isAnon  = !user.email;
  const nameText = user.name || 'Anonymous visitor';
  const rLabel  = rangeStr(from, to);
  const rangeKey = `${user.userKey}:${from}:${to}`;

  // Track narrow viewport for horizontal menu at <=520px
  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth <= 520);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch count data
  useEffect(() => {
    const cKey = `count:${rangeKey}`;
    if (cacheRef.current[cKey]) { setCountData(cacheRef.current[cKey]); setCountLoading(false); return; }
    setCountLoading(true); setCountError(false);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    let cancelled = false;
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/push/users/${encodeURIComponent(user.userKey)}/count?${params}`)
      .then((d) => { if (!cancelled) { cacheRef.current[cKey] = d; setCountData(d); } })
      .catch(() => { if (!cancelled) setCountError(true); })
      .finally(() => { if (!cancelled) setCountLoading(false); });
    return () => { cancelled = true; };
  }, [shop, user.userKey, rangeKey, from, to]);

  // Fetch revisit data
  useEffect(() => {
    const rKey = `revisit:${rangeKey}:${revisitPage}`;
    if (cacheRef.current[rKey]) { setRevisitData(cacheRef.current[rKey]); setRevisitLoading(false); return; }
    setRevisitLoading(true); setRevisitError(false);
    const params = new URLSearchParams({ page: String(revisitPage), limit: String(LIMIT) });
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    let cancelled = false;
    apiGet(`/api/dashboard/${encodeURIComponent(shop)}/channels/push/users/${encodeURIComponent(user.userKey)}/revisit?${params}`)
      .then((d) => { if (!cancelled) { cacheRef.current[rKey] = d; setRevisitData(d); } })
      .catch(() => { if (!cancelled) setRevisitError(true); })
      .finally(() => { if (!cancelled) setRevisitLoading(false); });
    return () => { cancelled = true; };
  }, [shop, user.userKey, rangeKey, from, to, revisitPage]);

  // Roving tabindex — arrow keys move between Count / Revisit menu items
  const handleMenuKey = useCallback((e, i) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      menuBtns.current[(i + 1) % DETAIL_MENU.length]?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      menuBtns.current[(i - 1 + DETAIL_MENU.length) % DETAIL_MENU.length]?.focus();
    }
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Top strip */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: '#6b7280', padding: 0, marginBottom: 12,
          }}
          aria-label={`Back to ${backLabel}`}
        >
          <ArrowLeftIcon />
          {backLabel}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={user.name} isAnon={isAnon} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nameText}
            </div>
            {isAnon ? (
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999,
                             background: '#f3f4f6', color: '#6b7280', fontWeight: 600 }}>
                {user.deviceType ? user.deviceType.charAt(0).toUpperCase() + user.deviceType.slice(1) : 'Unknown device'}
              </span>
            ) : (
              <div style={{ fontSize: 12, color: '#6b7280',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Menu + panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isNarrow ? 'column' : 'row', minHeight: 0 }}>
        {/* Tab menu */}
        <div
          role="tablist"
          aria-orientation={isNarrow ? 'horizontal' : 'vertical'}
          style={{
            width: isNarrow ? '100%' : 140, flexShrink: 0,
            borderRight: isNarrow ? 'none' : '1px solid #f3f4f6',
            borderBottom: isNarrow ? '1px solid #f3f4f6' : 'none',
            display: 'flex',
            flexDirection: isNarrow ? 'row' : 'column',
            padding: isNarrow ? '8px 16px' : '12px 0',
            gap: isNarrow ? 4 : 2,
          }}
        >
          {DETAIL_MENU.map(({ key, label, Icon }, i) => {
            const active = detailTab === key;
            return (
              <button
                key={key}
                ref={(el) => { menuBtns.current[i] = el; }}
                role="tab"
                aria-selected={active}
                aria-controls={`detail-panel-${key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setDetailTab(key)}
                onKeyDown={(e) => handleMenuKey(e, i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: isNarrow ? '6px 12px' : '8px 16px',
                  borderRadius: isNarrow ? 999 : 0,
                  background: active ? BG : 'none',
                  color: active ? FG : '#6b7280',
                  border: 'none',
                  borderLeft: !isNarrow ? `3px solid ${active ? FG : 'transparent'}` : 'none',
                  cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  textAlign: 'left',
                }}
              >
                <Icon />
                {label}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div
          id={`detail-panel-${detailTab}`}
          role="tabpanel"
          aria-label={detailTab === 'count' ? 'Notifications sent count' : 'Revisit history'}
          style={{ flex: 1, overflowY: 'auto' }}
        >
          {detailTab === 'count' ? (
            <CountPanel data={countData} loading={countLoading} error={countError} rLabel={rLabel} />
          ) : (
            <RevisitPanel
              data={revisitData} loading={revisitLoading} error={revisitError}
              page={revisitPage} onPage={setRevisitPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function PushUsersPanel({ shop, from, to }) {
  const [viewMode,     setViewMode]     = useState('all');   // 'all' | 'revisited'
  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [originFilter, setOriginFilter] = useState('all');
  const [page,         setPage]         = useState(0);
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [retryCount,   setRetryCount]   = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [fromRevisited, setFromRevisited] = useState(false);

  const rowRefMap      = useRef({});
  const lastClickedKey = useRef(null);

  // 300ms search debounce
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset page when filters / view / date range change
  useEffect(() => { setPage(0); }, [search, typeFilter, originFilter, viewMode, from, to]);

  // Fetch users/revisited
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

    const endpoint = viewMode === 'revisited'
      ? `/api/dashboard/${encodeURIComponent(shop)}/channels/push/revisited?${params}`
      : `/api/dashboard/${encodeURIComponent(shop)}/channels/push/users?${params}`;

    apiGet(endpoint)
      .then((d) => { if (!cancelled) { setData(d); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [shop, viewMode, search, typeFilter, originFilter, page, from, to, retryCount]);

  const handleSelectUser = useCallback((user, fromRev) => {
    lastClickedKey.current = user.userKey;
    setFromRevisited(!!fromRev);
    setSelectedUser(user);
  }, []);

  const handleBack = useCallback(() => {
    const key = lastClickedKey.current;
    setSelectedUser(null);
    // Restore focus after re-render
    setTimeout(() => { rowRefMap.current[key]?.focus(); }, 0);
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

  if (selectedUser) {
    return (
      <DetailView
        shop={shop}
        user={selectedUser}
        from={from}
        to={to}
        initialTab={fromRevisited ? 'revisit' : 'count'}
        backLabel={fromRevisited ? '← Revisited users' : '← All users'}
        onBack={handleBack}
      />
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Filter bar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
        {/* View chips */}
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

        {/* Search + type + origin + export */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
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

          {/* Type */}
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
            {KNOWN_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.label}</option>
            ))}
          </select>

          {/* Origin — All users view only */}
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
              <option value="all">All</option>
              <option value="automated">Automated</option>
              <option value="manual">Manual</option>
            </select>
          )}

          {/* Export — All users view only */}
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

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <ShimmerRow key={i} />)
        ) : error ? (
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
        ) : users.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
            {search
              ? 'No users match your search'
              : viewMode === 'revisited'
                ? 'No revisits yet. A revisit is recorded when a customer opens your store from a notification.'
                : 'No users yet in this date range'}
          </div>
        ) : viewMode === 'revisited' ? (
          <>
            <div style={{ padding: '10px 20px 6px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
              {total} user{total !== 1 ? 's' : ''} came back from notifications
            </div>
            {users.map((user) => (
              <RevisitedUserRow
                key={user.userKey}
                user={user}
                onSelect={(u) => handleSelectUser(u, true)}
                rowRef={(el) => { rowRefMap.current[user.userKey] = el; }}
              />
            ))}
          </>
        ) : (
          users.map((user) => (
            <UserRow
              key={user.userKey}
              user={user}
              onSelect={(u) => handleSelectUser(u, false)}
              rowRef={(el) => { rowRefMap.current[user.userKey] = el; }}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && <Pagination page={page} total={total} onPage={setPage} />}
    </div>
  );
}
