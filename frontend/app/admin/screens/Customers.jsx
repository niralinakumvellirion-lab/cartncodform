'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../../../lib/api';
import ProfileScreen from './Profile';

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

// Stage badge — shared by the desktop table and the mobile cards.
function getStageLabel(p) {
  if (p.orders?.count >= 2) return 'Repeat buyer';
  if (p.orders?.count === 1) return 'Bought once';
  if (p.identifiers?.cartTokens?.length > 0 && p.orders?.count === 0)
    return 'Has a cart';
  const labels = {
    customer: 'Bought once',
    identified: 'Has a cart',
    anonymous: 'Visitor',
    lapsed: 'Going quiet',
  };
  return labels[p.stage] || p.stage;
}

function getStageBg(p) {
  if (p.orders?.count >= 2) return '#dbeafe';
  if (p.orders?.count === 1) return '#dcfce7';
  if (p.identifiers?.cartTokens?.length > 0 && p.orders?.count === 0)
    return '#fef9c3';
  const bgs = {
    customer: '#dcfce7',
    identified: '#fef9c3',
    anonymous: '#f3f4f6',
    lapsed: '#fee2e2',
  };
  return bgs[p.stage] || '#f3f4f6';
}

function getStageColor(p) {
  if (p.orders?.count >= 2) return '#1d4ed8';
  if (p.orders?.count === 1) return '#16a34a';
  if (p.identifiers?.cartTokens?.length > 0 && p.orders?.count === 0)
    return '#ca8a04';
  const colors = {
    customer: '#16a34a',
    identified: '#ca8a04',
    anonymous: '#6b7280',
    lapsed: '#dc2626',
  };
  return colors[p.stage] || '#6b7280';
}

const GRID_COLS = '2fr 1fr 2fr 1fr 1.5fr 1fr';

const FILTER_TABS = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'has_cart', label: 'Has a cart' },
  { key: 'bought_once', label: 'Bought once' },
  { key: 'repeat_buyer', label: 'Repeat buyer' },
  { key: 'going_quiet', label: 'Going quiet' },
];

export default function Customers({ shop }) {
  const [profiles, setProfiles] = useState([]);
  const [signalMap, setSignalMap] = useState({});
  const [signalCountMap, setSignalCountMap] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('everyone');
  const [search, setSearch] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState(null);

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

  if (selectedProfileId) {
    return (
      <ProfileScreen
        shop={shop}
        profileId={selectedProfileId}
        onBack={() => setSelectedProfileId(null)}
      />
    );
  }

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

      {/* Table */}
      <div
        style={{ ...DS.card, padding: 0, overflow: 'hidden' }}
      >
        {/* Table header — desktop only */}
        {!isMobileView && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID_COLS,
              padding: '10px 16px',
              borderBottom: '1px solid #f3f4f6',
              background: '#f9fafb',
            }}
          >
            {['Customer', 'Stage', 'Most interested in', 'Reach', 'Last messaged', 'Spent'].map(
              (h) => (
                <div
                  key={h}
                  style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#9ca3af',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
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

            // Determine stage label + colors
            let stageLabel = STAGE_CONFIG[p.stage]?.label || p.stage;
            let stageBg = STAGE_CONFIG[p.stage]?.bg || '#f3f4f6';
            let stageColor = STAGE_CONFIG[p.stage]?.color || '#6b7280';
            if (p.orders?.count >= 2) {
              stageLabel = 'Repeat buyer';
              stageBg = '#dbeafe';
              stageColor = '#1d4ed8';
            } else if (p.orders?.count === 1) {
              stageLabel = 'Bought once';
              stageBg = '#dcfce7';
              stageColor = '#16a34a';
            } else if (
              p.identifiers?.cartTokens?.length > 0 &&
              p.orders?.count === 0
            ) {
              stageLabel = 'Has a cart';
              stageBg = '#fef9c3';
              stageColor = '#ca8a04';
            }

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
                  onClick={() => setSelectedProfileId(p._id)}
                  style={{
                    padding: '14px 16px',
                    borderBottom:
                      i < profiles.length - 1 ? '1px solid #f9fafb' : 'none',
                    cursor: 'pointer',
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
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: '500',
                        background: getStageBg(p),
                        color: getStageColor(p),
                        flexShrink: 0,
                        marginLeft: '8px',
                      }}
                    >
                      {getStageLabel(p)}
                    </span>
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
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '14px',
                          opacity: p.channels?.push?.subscribed ? 1 : 0.2,
                        }}
                      >
                        🔔
                      </span>
                      <span
                        style={{
                          fontSize: '14px',
                          opacity: p.channels?.email?.address ? 1 : 0.2,
                        }}
                      >
                        ✉️
                      </span>
                      <span
                        style={{
                          fontSize: '14px',
                          opacity: p.identifiers?.phones?.length > 0 ? 1 : 0.2,
                        }}
                      >
                        📱
                      </span>
                    </div>
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

            return (
              <div
                key={p._id}
                onClick={() => setSelectedProfileId(p._id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_COLS,
                  padding: '12px 16px',
                  borderBottom:
                    i < profiles.length - 1 ? '1px solid #f9fafb' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#fff';
                }}
              >
                {/* Customer */}
                <div>
                  <div
                    style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}
                  >
                    {displayName}
                  </div>
                  {lastSeen && (
                    <div
                      style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}
                    >
                      seen {lastSeen}
                    </div>
                  )}
                </div>

                {/* Stage */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '500',
                      background: stageBg,
                      color: stageColor,
                    }}
                  >
                    {stageLabel}
                  </span>
                </div>

                {/* Most interested in */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  {sig ? (
                    <>
                      <div style={{ fontSize: '13px', color: '#374151' }}>
                        {topInterest?.[0] || '—'}
                      </div>
                      <div
                        style={{ fontSize: '12px', color: '#6366f1', marginTop: '2px' }}
                      >
                        {SIGNAL_LABELS[sig.type] || sig.type}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: '#d1d5db' }}>—</span>
                  )}
                </div>

                {/* Reach — channel icons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      opacity: p.channels?.push?.subscribed ? 1 : 0.2,
                      fontSize: '16px',
                    }}
                  >
                    🔔
                  </span>
                  <span
                    style={{
                      opacity: p.channels?.email?.address ? 1 : 0.2,
                      fontSize: '16px',
                    }}
                  >
                    ✉️
                  </span>
                  <span
                    style={{
                      opacity: p.identifiers?.phones?.length > 0 ? 1 : 0.2,
                      fontSize: '16px',
                    }}
                  >
                    📱
                  </span>
                </div>

                {/* Last messaged */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '13px',
                    color: '#374151',
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
                    fontSize: '13px',
                    fontWeight: '500',
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
  );
}
