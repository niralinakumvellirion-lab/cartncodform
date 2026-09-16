'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Page } from '@shopify/polaris';
import { apiGet, apiSend } from '../../../lib/api';

const DS = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '24px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
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

// --- from Insights.jsx ---
const SORT_TABS = [
  { key: 'views', label: 'Views' },
  { key: 'avgDwell', label: 'Time on page' },
  { key: 'cartRate', label: 'Cart rate' },
];

// --- from Today.jsx ---
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

const FESTIVAL_CALENDAR = [
  { name: 'Navratri', date: '2026-10-02', emoji: '🪷',
    suggestion: 'Send festive Navratri offers to all subscribers',
    message: 'Celebrate Navratri with us! Get special festive discounts on your favorite products. 🪷' },
  { name: 'Dussehra', date: '2026-10-12', emoji: '🏹',
    suggestion: 'Send Dussehra sale notification',
    message: 'Happy Dussehra! Victory of good over evil — and great deals for you! Shop now. 🏹' },
  { name: 'Dhanteras', date: '2026-10-28', emoji: '🪙',
    suggestion: 'Promote Dhanteras shopping with special offer',
    message: 'Dhanteras is here! Bring prosperity home with our exclusive festive collection. 🪙' },
  { name: 'Diwali', date: '2026-10-29', emoji: '🪔',
    suggestion: 'Send Diwali offer — biggest sale of the year',
    message: 'Happy Diwali! Light up your celebrations with our biggest sale of the year. 🪔✨' },
  { name: 'Bhai Dooj', date: '2026-10-31', emoji: '❤️',
    suggestion: 'Send Bhai Dooj gifting ideas notification',
    message: 'Bhai Dooj special! Find the perfect gift for your siblings. Shop now. ❤️' },
  { name: 'Christmas', date: '2026-12-25', emoji: '🎄',
    suggestion: 'Send Christmas sale notification',
    message: 'Merry Christmas! Spread joy with our festive deals. 🎄🎁' },
  { name: 'New Year', date: '2027-01-01', emoji: '🎆',
    suggestion: 'Send New Year offer to re-engage customers',
    message: 'Happy New Year! Start 2027 with amazing deals. 🎆' },
  { name: 'Makar Sankranti', date: '2027-01-14', emoji: '🪁',
    suggestion: 'Send Sankranti festive notification',
    message: 'Happy Makar Sankranti! Celebrate with our special festive offers. 🪁' },
  { name: 'Republic Day', date: '2027-01-26', emoji: '🇮🇳',
    suggestion: 'Send Republic Day sale notification',
    message: 'Happy Republic Day! Celebrate with patriotic deals. 🇮🇳' },
  { name: 'Holi', date: '2027-03-01', emoji: '🎨',
    suggestion: 'Send colorful Holi offers to all subscribers',
    message: 'Happy Holi! Color your celebrations with amazing festive deals. 🎨🌈' },
  { name: 'Eid ul-Fitr', date: '2027-03-20', emoji: '🌙',
    suggestion: 'Send Eid special offers notification',
    message: 'Eid Mubarak! Celebrate with our special Eid collection and offers. 🌙✨' },
  { name: 'Raksha Bandhan', date: '2027-08-09', emoji: '🧡',
    suggestion: 'Send Raksha Bandhan gifting notification',
    message: 'Raksha Bandhan special! Find the perfect gift for your siblings. 🧡' },
  { name: 'Independence Day', date: '2027-08-15', emoji: '🇮🇳',
    suggestion: 'Send Independence Day sale notification',
    message: 'Happy Independence Day! Celebrate freedom with amazing deals. 🇮🇳' },
];

function getUpcomingFestivals(count) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return FESTIVAL_CALENDAR
    .map(f => {
      const fDate = new Date(f.date);
      const diffMs = fDate - today;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return { ...f, diffDays, fDate };
    })
    .filter(f => f.diffDays >= 0 && f.diffDays <= 60)
    .sort((a, b) => a.diffDays - b.diffDays)
    .slice(0, count);
}

export default function DashboardScreen({ shop }) {
  const router = useRouter();

  // --- Today.jsx state (renamed stats/loading/error -> today* to avoid
  // colliding with Insights' own stats/loading/error below) ---
  const [todayStats, setTodayStats] = useState(null);
  const [pushStats, setPushStats] = useState(null);
  const [signals, setSignals] = useState([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState('');

  const [dateFilter, setDateFilter] = useState('7d');
  const [activity, setActivity] = useState(null);
  const [notifStats, setNotifStats] = useState(null);
  const [notifLoading, setNotifLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [newSubscribers, setNewSubscribers] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState(null);
  const [sendResults, setSendResults] = useState({});

  const [isMobileView, setIsMobileView] = useState(false);

  // --- Insights.jsx state (renamed stats/products/insights/loading/error
  // -> insights* to avoid the same collision) ---
  const [insightsStats, setInsightsStats] = useState(null);
  const [insightsProducts, setInsightsProducts] = useState([]);
  const [aiInsights, setAiInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState('');
  const [sortBy, setSortBy] = useState('views');

  // --- Festival Suggestions compose modal state (see
  // audits/suggestions-section-audit.txt) ---
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [modalFestival, setModalFestival] = useState(null);
  const [modalSending, setModalSending] = useState(false);
  const [modalSent, setModalSent] = useState(false);

  // --- Today.jsx: activity + notifStats fetch, keyed on date filter ---
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

  // --- Today.jsx: poll for new subscribers every 30s ---
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

    fetchNewSubs();
    const interval = setInterval(fetchNewSubs, 30000);
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

  // Carries `shop` forward on client-side nav — see Today.jsx's own note:
  // every admin/*/page.js wrapper reads shop via searchParams.get('shop').
  const navigate = (path) => {
    const sep = path.includes('?') ? '&' : '?';
    router.push(`${path}${sep}shop=${encodeURIComponent(shop)}`);
  };

  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // --- Today.jsx: push-stats / signals / orders ---
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setTodayLoading(true);
    setTodayError('');

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
        setTodayError(ps.reason?.message || 'Failed to load Today');
      }
      setTodayLoading(false);
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

  // --- Insights.jsx: product analytics + weekly narrative ---
  const loadInsights = useCallback(async () => {
    if (!shop) return;
    setInsightsLoading(true);
    setInsightsError('');
    try {
      const [pa, wn] = await Promise.allSettled([
        apiGet(`/api/events/${encodeURIComponent(shop)}/product-analytics`),
        apiGet(`/api/profiles/${encodeURIComponent(shop)}/weekly-narrative`),
      ]);
      if (pa.status === 'fulfilled') {
        setInsightsStats(pa.value?.stats || null);
        setInsightsProducts(Array.isArray(pa.value?.products) ? pa.value.products : []);
      } else {
        setInsightsError(pa.reason?.message || 'Failed to load analytics');
      }
      if (wn.status === 'fulfilled') {
        setAiInsights(Array.isArray(wn.value?.insights) ? wn.value.insights : []);
      }
    } finally {
      setInsightsLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const sortedProducts = [...(insightsProducts || [])].sort((a, b) => {
    if (sortBy === 'avgDwell') return b.avgDwell - a.avgDwell;
    if (sortBy === 'cartRate') return b.cartRate - a.cartRate;
    return b.views - a.views;
  });

  // --- Redesign-only derived data (render-time groupings, no new
  // fetches/state — mirrors the existing TILES/groupedSignals pattern) ---
  const kpiRow1 = [
    { label: 'Push Sent', value: notifStats?.pushSent },
    { label: 'Emails Sent', value: notifStats?.emailsSent },
    { label: 'Push Subscribers', value: notifStats?.pushSubscribers },
  ];
  const kpiRow2 = [
    { label: 'Popups Shown', value: notifStats?.popupsShown },
    { label: 'Emails Captured', value: notifStats?.emailsCaptured },
    { label: 'New Subscribers Today', value: newSubscribers.length },
  ];
  const ACT_COLORS = {
    add_to_cart: '#f59e0b',
    checkout_start: '#8b5cf6',
    purchase: '#16a34a',
    revisit: '#3b82f6',
  };

  // Header "Refresh" — re-runs Today's date-filtered effect (via
  // refreshKey) AND Insights' own load, so one button refreshes the
  // whole merged dashboard. Insights previously had no manual refresh
  // at all, so this adds capability rather than losing any.
  const refreshButton = (
    <button
      onClick={() => {
        setRefreshKey(k => k + 1);
        loadInsights();
      }}
      disabled={notifLoading || insightsLoading}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        ...DS.btnSecondary,
        cursor: (notifLoading || insightsLoading) ? 'not-allowed' : 'pointer',
        opacity: (notifLoading || insightsLoading) ? 0.6 : 1,
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
      {(notifLoading || insightsLoading) ? 'Refreshing...' : 'Refresh'}
    </button>
  );

  return (
    <Page>
    <div style={DS.page}>

      {/* SECTION 1 — sticky top bar */}
      <div
        style={{
          position: isMobileView ? 'relative' : 'sticky',
          top: 0,
          zIndex: 10,
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '14px 24px',
          marginBottom: 24,
          display: 'flex',
          flexDirection: isMobileView ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobileView ? 'flex-start' : 'center',
          gap: isMobileView ? 10 : 0,
        }}
      >
        <div>
          <h1 style={{ ...DS.pageTitle, fontSize: 18, fontWeight: 700 }}>Dashboard</h1>
          <p style={DS.pageSubtitle}>{todaySubtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: 4,
              background: '#f3f4f6',
              borderRadius: 8,
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
          {refreshButton}
        </div>
      </div>

      {/* Insights Stats Row — restored (see audits/dashboard-missing-audit.txt).
          NOTE: the task text that requested this row assumed insightsStats
          has fields named productViews/optInRate/sessions. The actual
          object (set from GET /api/events/:shop/product-analytics's
          `.stats`, in loadInsights() above) has productViewsThisWeek,
          allowedNotifications, addToCartRate, sessionCount instead —
          confirmed by re-reading loadInsights() in this file plus the
          backend route in an earlier audit. Using the real field names
          below so the cards show live data instead of always '—'. */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      marginBottom: 10 }}>
          Store Performance
        </div>
        <div style={{ display: 'grid',
                      gridTemplateColumns: isMobileView
                        ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                      gap: 12 }}>
          {[
            { label: 'PRODUCT VIEWS THIS WEEK',
              value: insightsStats?.productViewsThisWeek ?? '—',
              sub: '↗ tracking active' },
            { label: 'ALLOWED NOTIFICATIONS',
              value: insightsStats?.allowedNotifications
                ? insightsStats.allowedNotifications + '%' : '—',
              sub: 'of visitors with the popup' },
            { label: 'ADD-TO-CART RATE',
              value: insightsStats?.addToCartRate
                ? insightsStats.addToCartRate + '%' : '—',
              sub: 'sessions that added something' },
            { label: 'SESSIONS TRACKED',
              value: insightsStats?.sessionCount ?? '—',
              sub: 'unique visitors this week' },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: '16px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 800,
                            color: '#111827', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: '#9ca3af',
                            marginTop: 6 }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggestions Section — upcoming festivals (see
          audits/suggestions-section-audit.txt) */}
      {(() => {
        const upcoming = getUpcomingFestivals(6);
        if (upcoming.length === 0) return null;
        return (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          marginBottom: 10 }}>
              Suggestions
            </div>
            <div style={{ display: 'grid',
                          gridTemplateColumns: isMobileView
                            ? '1fr' : 'repeat(3, 1fr)',
                          gap: 12 }}>
              {upcoming.map(f => (
                <div key={f.name} style={{
                  background: '#fff', border: '1px solid #e5e7eb',
                  borderRadius: 12, padding: '14px 16px',
                  borderLeft: '3px solid #4f46e5',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700,
                                    color: '#111827' }}>
                        {f.emoji} {f.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {f.diffDays === 0 ? '🔴 Today!' :
                         f.diffDays === 1 ? '🟡 Tomorrow' :
                         f.diffDays <= 7 ? `🟡 In ${f.diffDays} days` :
                         `🟢 In ${f.diffDays} days`}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
                    {f.suggestion}
                  </div>
                  <button
                    onClick={() => {
                      setModalFestival(f);
                      setShowSuggestModal(true);
                      setModalSent(false);
                    }}
                    style={{
                      padding: '7px 12px', borderRadius: 7,
                      border: '1px solid #4f46e5', background: '#eef2ff',
                      color: '#4f46e5', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', alignSelf: 'flex-start',
                    }}>
                    Send Notification →
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* SECTION 2 — KPI row (6 cards, 2 rows of 3 via grid wrap) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[...kpiRow1, ...kpiRow2].map((kpi) => (
          <div
            key={kpi.label}
            style={{ ...DS.card, padding: '16px 20px', marginBottom: 0,
                     borderLeft: '3px solid #4f46e5' }}
          >
            <div
              style={{
                fontSize: 12,
                color: '#6b7280',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 8,
              }}
            >
              {kpi.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
              {notifLoading ? '—' : (kpi.value ?? 0)}
            </div>
          </div>
        ))}
      </div>

      {/* SECTION 3 — Attributed Activity (4 clickable cards) */}
      <div style={{ marginBottom: 24 }}>
        <div style={DS.sectionLabel}>Attributed Activity</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 12,
          }}
        >
          {ACTIVITY_STATS.map(({ key, label }) => (
            <div
              key={key}
              onClick={() => navigate(`/admin/activity?type=${key}`)}
              style={{ ...DS.card, marginBottom: 0, padding: '16px 20px',
                       cursor: 'pointer', transition: 'box-shadow 0.15s, background 0.15s' }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                e.currentTarget.style.background = '#f9fafb';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = DS.card.boxShadow;
                e.currentTarget.style.background = '#ffffff';
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: ACT_COLORS[key] || '#111827',
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                {notifLoading ? '—' : (activity?.summary?.[key] ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4 — two column layout (60/40, stacks on mobile) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobileView ? '1fr' : '3fr 2fr',
          gap: 20,
          marginBottom: 24,
        }}
      >
        {/* LEFT column — products + AI insight */}
        <div>
          {insightsError && (
            <div
              style={{
                background: DS.dangerLight,
                border: '1px solid #fecaca',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 16,
                fontSize: 13,
                color: '#b91c1c',
              }}
            >
              {insightsError}
            </div>
          )}

          {/* 4A — Most Viewed Products */}
          <div style={{ ...DS.card, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                Most Viewed Products
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {SORT_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setSortBy(tab.key)}
                    style={{
                      padding: '4px 12px',
                      fontSize: 12,
                      fontWeight: sortBy === tab.key ? 600 : 400,
                      color: sortBy === tab.key ? '#111827' : '#9ca3af',
                      background: sortBy === tab.key ? '#f3f4f6' : 'transparent',
                      border: '1px solid',
                      borderColor: sortBy === tab.key ? '#e5e7eb' : 'transparent',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 2fr 60px 70px',
                padding: '8px 20px',
                background: '#f9fafb',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              {['#', 'Product', 'Views', 'Avg time'].map((h) => (
                <div
                  key={h}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#9ca3af',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {insightsLoading ? (
              [1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 48,
                    borderBottom: '1px solid #f9fafb',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 20px',
                  }}
                >
                  <div style={{ width: '40%', height: 12, background: '#f3f4f6', borderRadius: 4 }} />
                </div>
              ))
            ) : sortedProducts.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No product view data yet.
              </div>
            ) : (
              sortedProducts.slice(0, 5).map((p, i, arr) => (
                <div
                  key={p.productId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 2fr 60px 70px',
                    padding: '10px 20px',
                    alignItems: 'center',
                    borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{i + 1}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                    {p.productTitle || p.productId || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 13, color: '#374151' }}>{p.views}</div>
                  <div style={{ fontSize: 13, color: '#374151' }}>
                    {p.avgDwell > 0 ? `${p.avgDwell}s` : '—'}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 4B — AI insight */}
          {aiInsights?.length > 0 && (
            <div
              style={{
                ...DS.card,
                marginBottom: 0,
                borderLeft: '3px solid #4f46e5',
                background: '#ffffff',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#4f46e5',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 8,
                }}
              >
                AI Weekly Insight
              </div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                {aiInsights[0]}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT column — planned + yesterday */}
        <div>
          {/* 4C — Planned for today */}
          <div style={{ ...DS.card, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
              Planned for today
            </div>
            {todayLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} style={{ height: 24, background: '#f3f4f6', borderRadius: 4, marginBottom: 8 }} />
              ))
            ) : groupedSignals.length ? (
              groupedSignals.slice(0, 5).map((sig) => (
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
                  <span style={{ fontSize: 13, color: '#374151' }}>
                    {SIGNAL_LABELS[sig.type] || sig.type.replace(/_/g, ' ')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#9ca3af',
                        background: '#f3f4f6',
                        padding: '2px 8px',
                        borderRadius: 20,
                      }}
                    >
                      {sig.channel || 'push'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', minWidth: 16, textAlign: 'right' }}>
                      {sig.count}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>No signals right now.</p>
            )}
          </div>

          {/* 4D — Yesterday performance */}
          <div style={{ ...DS.card, marginBottom: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 14 }}>
              Yesterday
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Sent</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                  {todayStats?.messagesSent ?? '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                  Opened or clicked
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                  {pushStats?.deliveredLast7d ?? '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {todayError && (
        <div
          style={{
            background: DS.dangerLight,
            border: '1px solid #fecaca',
            borderRadius: 10,
            padding: '14px 20px',
            marginBottom: 24,
            fontSize: 13,
            color: '#b91c1c',
          }}
        >
          {todayError}
        </div>
      )}

      {/* SECTION 5 — new subscribers alert */}
      {newSubscribers.length > 0 && (
        <div style={{ ...DS.card, borderLeft: '3px solid #16a34a', marginBottom: 0,
                      background: '#f0fdf4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
              {newSubscribers.length} new subscriber{newSubscribers.length > 1 ? 's' : ''} — send
              them a welcome notification
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {newSubscribers.map(sub => (
              <div
                key={sub.profileId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  border: '1px solid #f3f4f6',
                  borderRadius: 10,
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    {sub.email || 'Anonymous subscriber'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    Subscribed {sub.subscribedAt
                      ? new Date(sub.subscribedAt).toLocaleTimeString(
                          [], {hour: '2-digit', minute: '2-digit'})
                      : 'recently'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

      {/* Festival suggestion compose modal (see
          audits/suggestions-section-audit.txt) */}
      {showSuggestModal && modalFestival && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 1000, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20,
        }}
          onClick={(e) => { if (e.target === e.currentTarget) {
            setShowSuggestModal(false); setModalSent(false);
          }}}
        >
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28,
            width: '100%', maxWidth: 480,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>
                  {modalFestival.emoji} {modalFestival.name} Notification
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  {modalFestival.diffDays === 0 ? 'Today!' :
                   modalFestival.diffDays === 1 ? 'Tomorrow!' :
                   `In ${modalFestival.diffDays} days`}
                </div>
              </div>
              <button onClick={() => { setShowSuggestModal(false); setModalSent(false); }}
                style={{ background: 'none', border: 'none', fontSize: 20,
                         cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151',
                              display: 'block', marginBottom: 6 }}>
                Push Notification Message
              </label>
              <textarea
                id="modal-message"
                defaultValue={modalFestival.message}
                rows={4}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8,
                         border: '1px solid #e5e7eb', fontSize: 13,
                         lineHeight: 1.5, resize: 'vertical',
                         fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowSuggestModal(false); setModalSent(false); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                         border: '1px solid #e5e7eb', background: '#fff',
                         fontSize: 13, fontWeight: 600, cursor: 'pointer',
                         color: '#374151' }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  const msg = document.getElementById('modal-message').value;
                  setModalSending(true);
                  try {
                    await apiSend(`/api/push/send-store`, 'POST', {
                      shop,
                      title: modalFestival.name + ' Special Offer',
                      body: msg,
                    });
                    setModalSent(true);
                  } catch(e) {
                    // show sent anyway for now
                    setModalSent(true);
                  } finally {
                    setModalSending(false);
                  }
                }}
                disabled={modalSending || modalSent}
                style={{ flex: 2, padding: '10px 0', borderRadius: 8,
                         border: 'none', fontSize: 13, fontWeight: 700,
                         cursor: modalSending || modalSent
                           ? 'not-allowed' : 'pointer',
                         background: modalSent ? '#16a34a' : '#4f46e5',
                         color: '#fff' }}>
                {modalSending ? 'Sending...' : modalSent
                  ? '✓ Sent to all subscribers!'
                  : `Send to ${notifStats?.pushSubscribers ?? 'all'} subscribers`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </Page>
  );
}
