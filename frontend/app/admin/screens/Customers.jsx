'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '../../../lib/api';
// ShimmerTable removed — loading state uses inline skeleton cards
import { DS, StageBadge, ReachIcons } from './customerShared';
import DateRangeFilter, { getDateRange, matchDatePreset } from '../components/DateRangeFilter';

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

const AVATAR_COLORS = [
  { bg: '#eef2ff', text: '#4f46e5' },
  { bg: '#dcfce7', text: '#16a34a' },
  { bg: '#dbeafe', text: '#2563eb' },
  { bg: '#fef3c7', text: '#d97706' },
  { bg: '#fce7f3', text: '#be185d' },
];
function getAvatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getStageLabel(customer) {
  const orders = customer.orders?.count || 0;
  if (orders > 1) return 'Repeat buyer';
  if (orders === 1) return 'Bought once';
  if (customer.identifiers?.cartTokens?.length > 0) return 'Has cart';
  return customer.stage === 'lapsed' ? 'Going quiet' : 'Visitor';
}
function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const FILTER_TABS = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'has_cart', label: 'Has a cart' },
  { key: 'bought_once', label: 'Bought once' },
  { key: 'repeat_buyer', label: 'Repeat buyer' },
  { key: 'going_quiet', label: 'Going quiet' },
  { key: 'push_subscribed', label: 'Push subscribers' },
  { key: 'email_captured', label: 'Email captured' },
];

export default function Customers({ shop, initialFilter, initialFrom, initialTo }) {
  const router = useRouter();
  // Carries `shop` forward on client-side nav (every admin/*/page.js
  // wrapper reads it from searchParams.get('shop')).
  const navigate = (path) => {
    const sep = path.includes('?') ? '&' : '?';
    router.push(`${path}${sep}shop=${encodeURIComponent(shop)}`);
  };
  const [profiles, setProfiles] = useState([]);
  const [signalMap, setSignalMap] = useState({});
  const [signalCountMap, setSignalCountMap] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Seeded from the Dashboard's Push Subscribers / Emails Captured
  // tiles. from/to are only meaningful combined with those two filter
  // values (see routes/profiles.js) — kept sticky for the visit, same
  // as Messages.jsx's equivalent seeded params, not re-derived per tab
  // click.
  const [filter, setFilter] = useState(
    FILTER_TABS.some((t) => t.key === initialFilter) ? initialFilter : 'everyone'
  );
  // Date range filter: same preset-matching logic as Messages.jsx.
  const initialPreset = matchDatePreset(initialFrom, initialTo);
  const [dateFilter, setDateFilter] = useState(
    initialPreset || (initialFrom ? 'custom' : '7d')
  );
  const [search, setSearch] = useState('');

  const [isMobileView, setIsMobileView] = useState(false);
  const [gridCols, setGridCols] = useState(4);
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsMobileView(w <= 768);
      setGridCols(w < 600 ? 1 : w < 800 ? 2 : w < 1100 ? 3 : 4);
    };
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
        const { from: rangeFrom, to: rangeTo } = dateFilter === 'custom'
          ? { from: initialFrom || null, to: initialTo || null }
          : getDateRange(dateFilter);
        const params = new URLSearchParams({ limit: '50' });
        if (filter && filter !== 'everyone') params.set('filter', filter);
        if (rangeFrom) params.set('from', rangeFrom);
        if (rangeTo) params.set('to', rangeTo);
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
    [shop, filter, dateFilter, initialFrom, initialTo, search]
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

  return (
    <div style={{ ...DS.page, overflowX: 'hidden', width: '100%' }}>
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

      {/* Date range filter */}
      <div style={{ marginBottom: '12px' }}>
        <DateRangeFilter
          value={dateFilter}
          onChange={setDateFilter}
          customLabel={
            dateFilter === 'custom' && initialFrom && initialTo
              ? `${new Date(initialFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(initialTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
              : undefined
          }
        />
      </div>

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

      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gap: 16,
      }}>
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{
              background: '#fff', border: '1px solid #e5e7eb',
              borderRadius: 14, padding: 16,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#f3f4f6' }} />
              <div style={{ height: 13, background: '#f3f4f6', borderRadius: 4, width: '75%' }} />
              <div style={{ height: 11, background: '#f3f4f6', borderRadius: 4, width: '50%' }} />
              <div style={{ height: 76, background: '#f3f4f6', borderRadius: 8, marginTop: 4 }} />
            </div>
          ))
        ) : profiles.length ? (
          profiles.map((p) => {
            const nameSource = p.identifiers?.emails?.[0] || p.identifiers?.phones?.[0] || null;
            const displayName = nameSource || `Anonymous #${p._id?.toString().slice(-5)}`;
            const initial = displayName.charAt(0).toUpperCase();
            const avatarColor = getAvatarColor(displayName);
            const stageLabel = getStageLabel(p);
            const email = p.identifiers?.emails?.[0] || p.channels?.email?.address;
            const phone = p.identifiers?.phones?.[0];
            // FIRST SEEN: p.createdAt (no firstSeenAt on Profile docs; createdAt is closest)
            const firstSeen = formatShortDate(p.createdAt);
            const lastSeen = p.lastSeenAt ? getRelativeTime(new Date(p.lastSeenAt)) : '—';

            return (
              <div
                key={p._id}
                style={{
                  background: '#fff', border: '1px solid #e5e7eb',
                  borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  display: 'flex', flexDirection: 'column',
                  overflow: 'hidden', position: 'relative',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}
              >
                {/* Stage badge — top right */}
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <StageBadge customer={p} />
                </div>

                {/* Avatar + name + sub-line */}
                <div style={{ padding: '16px 16px 0' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: avatarColor.bg, color: avatarColor.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, fontWeight: 700, marginBottom: 10,
                  }}>
                    {initial}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: '#111827',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    paddingRight: 72, marginBottom: 2,
                  }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{stageLabel}</div>
                </div>

                {/* FIRST SEEN / LAST SEEN */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 16px 0' }}>
                  {[{ label: 'First Seen', val: firstSeen }, { label: 'Last Seen', val: lastSeen }].map(({ label, val }) => (
                    <div key={label}>
                      <div style={{
                        fontSize: 10, fontWeight: 600, color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2,
                      }}>{label}</div>
                      <div style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Contact inset */}
                {(email || phone) && (
                  <div style={{
                    margin: '10px 16px 0', padding: '8px 10px',
                    background: '#f9fafb', border: '1px solid #f3f4f6',
                    borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 5,
                  }}>
                    {email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#374151' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {email}
                        </span>
                      </div>
                    )}
                    {phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#374151' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        <span>{phone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* View button */}
                <div style={{ padding: '12px 16px', marginTop: 'auto' }}>
                  <button
                    type="button"
                    aria-label={`View ${displayName}`}
                    onClick={() => navigate(`/admin/customers/${encodeURIComponent(p._id)}`)}
                    onFocus={e => { e.currentTarget.style.outline = '2px solid #818cf8'; e.currentTarget.style.outlineOffset = '2px'; }}
                    onBlur={e => { e.currentTarget.style.outline = 'none'; }}
                    style={{
                      width: '100%', padding: '8px 0',
                      background: '#4f46e5', color: '#fff',
                      border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    View
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{
            gridColumn: `span ${gridCols}`,
            padding: '32px 16px', textAlign: 'center',
            fontSize: 13, color: '#9ca3af',
            background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb',
          }}>
            No customers match this view.
          </div>
        )}
      </div>
    </div>
  );
}
