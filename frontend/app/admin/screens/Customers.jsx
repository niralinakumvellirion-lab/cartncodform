'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '../../../lib/api';
import { ShimmerTable } from '../components/Shimmer';
import { DS, StageBadge, ReachIcons } from './customerShared';

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

const GRID_COLS = 'minmax(180px,2fr) 100px minmax(100px,1fr) 90px 110px 70px';

const FILTER_TABS = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'has_cart', label: 'Has a cart' },
  { key: 'bought_once', label: 'Bought once' },
  { key: 'repeat_buyer', label: 'Repeat buyer' },
  { key: 'going_quiet', label: 'Going quiet' },
];

export default function Customers({ shop }) {
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
  const [filter, setFilter] = useState('everyone');
  const [search, setSearch] = useState('');

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

        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div
            style={{ ...DS.card, padding: 0, overflow: 'hidden',
                     overflowX: 'auto', minWidth: 600 }}
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
              <ShimmerTable rows={8} />
            ) : profiles.length ? (
              profiles.map((p, i) => {
                // `sig` (this profile's strongest signal, from signalMap)
                // is no longer read here — the rebuilt desktop row's
                // "Most interested in" column dropped the secondary
                // signal-type sub-line the earlier design had (the given
                // rebuild JSX's column is a single non-wrapping line with
                // no room for a second line). signalMap/signalCountMap
                // state itself is untouched — see
                // audits/customers-row-rebuild-audit.txt.
                const lastMsg = p.messages?.length
                  ? p.messages[p.messages.length - 1]
                  : null;

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
                      onClick={() => navigate(`/admin/customers/${encodeURIComponent(p._id)}`)}
                      style={{
                        padding: '14px 16px',
                        borderBottom:
                          i < profiles.length - 1 ? '1px solid #f9fafb' : 'none',
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#fff';
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
                // customer's detail page is loaded, per-row, on
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

                // Rebuilt row (see audits/customers-row-rebuild-audit.txt).
                // NOTE: the task's given JSX referenced customer.email,
                // customer.lastSeenLabel, customer.topInterest,
                // customer.lastMessaged, customer.ltv, and
                // customer.profileId — NONE of these fields exist on the
                // Profile documents this screen actually fetches (GET
                // /api/profiles/:shop/profiles). Verified this by reading
                // the pre-existing derived-variable block directly above
                // (displayName/lastSeen/interestRaw/interestDisplay/
                // avatarInitial, already computed a few lines up in this
                // same .map callback) plus the real field paths used
                // throughout the rest of this file: p.identifiers.emails/
                // phones, p.lastSeenAt (via getRelativeTime), p.interests
                // (via topInterest/interestRaw), p.messages (via lastMsg),
                // p.orders.ltv. Used those real values/paths below instead
                // of the given (nonexistent) field names, per this task's
                // own explicit instruction not to guess. Kept the loop's
                // existing variable name `p` (not `customer`, matching
                // every other row/section in this file).
                const lastMessagedDisplay = lastMsg
                  ? getRelativeTime(new Date(lastMsg.sentAt))
                  : 'Never';

                return (
                  <div
                    key={p._id}
                    onClick={() => navigate(`/admin/customers/${encodeURIComponent(p._id)}`)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID_COLS,
                      alignItems: 'center',
                      padding: '10px 16px',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      background: '#fff',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fff';
                    }}
                  >
                    {/* CUSTOMER column */}
                    <div style={{ display: 'flex', alignItems: 'center',
                                  gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: '#eef2ff', color: '#4f46e5',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 13,
                        fontWeight: 700, flexShrink: 0,
                      }}>
                        {avatarInitial}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827',
                                      overflow: 'hidden', textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap' }}>
                          {displayName}
                        </div>
                        {lastSeen && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                            seen {lastSeen}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* STAGE column */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <StageBadge customer={p} />
                    </div>

                    {/* MOST INTERESTED IN column */}
                    <div style={{ fontSize: 12, color: '#374151',
                                  overflow: 'hidden', textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap', paddingRight: 8 }}>
                      {interestDisplay}
                    </div>

                    {/* REACH column */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <ReachIcons customer={p} />
                    </div>

                    {/* LAST MESSAGED column */}
                    <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {lastMessagedDisplay}
                    </div>

                    {/* SPENT column */}
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827',
                                  display: 'flex', justifyContent: 'flex-end' }}>
                      {p.orders?.ltv > 0 ? `₹${p.orders.ltv.toLocaleString('en-IN')}` : '—'}
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
    </div>
  );
}
