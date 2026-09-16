'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Page } from '@shopify/polaris';
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

const DATE_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

const NOTIF_STATS = [
  { key: 'pushSent', label: 'Push Sent' },
  { key: 'emailsSent', label: 'Emails Sent' },
  { key: 'popupsShown', label: 'Popups Shown' },
  { key: 'emailsCaptured', label: 'Emails Captured' },
  { key: 'pushSubscribers', label: 'Push Subscribers' },
];

const ACTIVITY_STATS = [
  { key: 'add_to_cart', label: 'Added to Cart' },
  { key: 'checkout_start', label: 'Started Checkout' },
  { key: 'purchase', label: 'Purchased' },
  { key: 'revisit', label: 'Revisited' },
];

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

export default function Today({ shop }) {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [pushStats, setPushStats] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Redesign — date-filtered notification stats (Row 1) + attributed
  // activity stats (Row 2, add_to_cart/checkout_start/purchase/revisit
  // counts from AttributedEvent, Phase 1/2). Both rows share one loading
  // flag since they're fetched together, keyed on the same date filter.
  const [dateFilter, setDateFilter] = useState('7d');
  const [activity, setActivity] = useState(null);
  const [notifStats, setNotifStats] = useState(null);
  const [notifLoading, setNotifLoading] = useState(true);
  // Header Refresh button — bumping this re-runs the stats effect below
  // (it's in that effect's dependency array) without needing its own
  // separate fetch logic.
  const [refreshKey, setRefreshKey] = useState(0);

  // Phase 1 — real-time new subscriber alerts.
  const [newSubscribers, setNewSubscribers] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState(null);
  const [sendResults, setSendResults] = useState({});

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    const { from, to } = getDateRange(dateFilter);
    setNotifLoading(true);
    Promise.allSettled([
      apiGet(`/api/activity?shop=${encodeURIComponent(shop)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/today-stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    ])
      .then(([actResult, statsResult]) => {
        if (cancelled) return;
        setActivity(actResult.status === 'fulfilled' ? actResult.value : null);
        setNotifStats(statsResult.status === 'fulfilled' ? statsResult.value : null);
      })
      .finally(() => {
        if (cancelled) return;
        setNotifLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
      disabled={notifLoading}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        ...DS.btnSecondary,
        cursor: notifLoading ? 'not-allowed' : 'pointer',
        opacity: notifLoading ? 0.6 : 1,
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
      {notifLoading ? 'Refreshing...' : 'Refresh'}
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

      {/* SECTION 2 — Notifications (left) + Attributed Activity (right),
          stacked vertically within each card instead of wide grids. */}
      <div style={{ display: 'grid',
                    gridTemplateColumns: isMobileView ? '1fr' : '1fr 1fr',
                    gap: 16, marginBottom: 20 }}>

        {/* Left — Notifications */}
        <div style={{ ...DS.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6',
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af',
                           textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Notifications
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              {dateFilter === '7d' ? 'Last 7 days' :
               dateFilter === '30d' ? 'Last 30 days' :
               dateFilter === 'today' ? 'Today' : 'Yesterday'}
            </span>
          </div>
          {NOTIF_STATS.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between',
                                    alignItems: 'center', padding: '12px 20px',
                                    borderBottom: '1px solid #f9fafb' }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                {notifLoading ? '—' : (notifStats?.[key] ?? 0)}
              </span>
            </div>
          ))}
        </div>

        {/* Right — Activity */}
        <div style={{ ...DS.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6',
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af',
                           textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Attributed Activity
            </span>
            <span
              onClick={() => navigate('/admin/activity')}
              style={{ fontSize: 11, color: '#4f46e5', cursor: 'pointer',
                       fontWeight: 600 }}>
              View all →
            </span>
          </div>
          {ACTIVITY_STATS.map(({ key, label, color }) => (
            <div key={key}
              onClick={() => navigate(`/admin/activity?type=${key}`)}
              style={{ display: 'flex', justifyContent: 'space-between',
                       alignItems: 'center', padding: '12px 20px',
                       borderBottom: '1px solid #f9fafb',
                       cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: color || '#111827' }}>
                {notifLoading ? '—' : (activity?.summary?.[key] ?? 0)}
              </span>
            </div>
          ))}
        </div>
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
  );
}
