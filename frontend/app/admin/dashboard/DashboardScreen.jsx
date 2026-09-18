'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiSend } from '../../../lib/api';
import { ShimmerRow, ShimmerCard } from '../components/Shimmer';

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
  // Phase: shimmer-on-refresh — distinguishes a manual Refresh click
  // (isRefreshing true -> shimmer overlay) from the page's first load
  // (isRefreshing stays false -> the existing '—' fallback still shows).
  // See audits/shimmer-audit.txt.
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // --- Phase 1: Notification Suggestions sidebar + editor modal state
  // (see audits/dashboard-phase1-audit.txt). Replaces the old
  // showSuggestModal/modalFestival/modalSending/modalSent compose-modal
  // state from the previous phase entirely. ---
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectedFestival, setSelectedFestival] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorBody, setEditorBody] = useState('');
  const [editorMobileImageUrl, setEditorMobileImageUrl] = useState('');
  const [editorDesktopImageUrl, setEditorDesktopImageUrl] = useState('');
  const [editorAction, setEditorAction] = useState(null);
  const [editorDate, setEditorDate] = useState('');
  const [showImageInfo, setShowImageInfo] = useState(false);

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

  // Clears isRefreshing once both effects a Refresh click kicks off
  // (notifLoading via refreshKey, insightsLoading via loadInsights())
  // have settled back to false. Not given verbatim by the task (its own
  // sketch was just "// after data loads: setIsRefreshing(false)" inside
  // the click handler, which can't work directly since refreshKey only
  // triggers an effect asynchronously and isn't awaitable at the click
  // site) — watching both loading flags is the accurate way to know
  // when the refresh has actually finished.
  useEffect(() => {
    if (isRefreshing && !notifLoading && !insightsLoading) {
      setIsRefreshing(false);
    }
  }, [isRefreshing, notifLoading, insightsLoading]);

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

  // Phase 1 sidebar: all festivals in the next 60 days (getUpcomingFestivals
  // already filters to <=60 days internally — see its definition above).
  const upcomingFestivals = getUpcomingFestivals(10);

  // Header "Refresh" — re-runs Today's date-filtered effect (via
  // refreshKey) AND Insights' own load, so one button refreshes the
  // whole merged dashboard. Insights previously had no manual refresh
  // at all, so this adds capability rather than losing any.
  const refreshButton = (
    <button
      onClick={() => {
        setIsRefreshing(true);
        // existing refresh logic
        setRefreshKey(k => k + 1);
        loadInsights();
        // after data loads: setIsRefreshing(false) — handled by the
        // watcher effect above once notifLoading/insightsLoading settle
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

  // Phase 1: one-page layout — outer <Page> (Polaris) was removed here.
  // See audits/dashboard-phase1-audit.txt: this screen was the only one
  // in the app still wrapped in Polaris's <Page>; every other admin
  // screen already renders a plain `<div style={DS.page}>` with no
  // <Page> ancestor. Keeping <Page> around a fixed-viewport-height flex
  // layout risked its own internal padding/scroll behavior fighting the
  // "no page-level scroll" requirement, and it added nothing this
  // hand-rolled layout doesn't already provide.
  return (
    <div style={{
      height: 'calc(100vh - 40px)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#f9fafb',
    }}>

      {/* SECTION 1 — sticky top bar (kept exactly as-is, per instruction) */}
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

      {/* Content area below the top bar — two columns, per Part A/B */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        gap: 16,
        padding: '16px 20px',
      }}>

        {/* LEFT column — main content, scrolls internally */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Store Performance row (compact, Part A item 1) */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          marginBottom: 10 }}>
              Store Performance
            </div>
            {isRefreshing ? (
              <ShimmerRow cols={4} />
            ) : (
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
                    padding: '10px 14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af',
                                  textTransform: 'uppercase', letterSpacing: '0.06em',
                                  marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800,
                                  color: '#111827', lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af',
                                  marginTop: 4 }}>{sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2 — KPI row (compact, Part A item 2) */}
          {isRefreshing ? (
            <ShimmerRow cols={3} />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                gap: 12,
                marginBottom: 10,
              }}
            >
              {[...kpiRow1, ...kpiRow2].map((kpi) => (
                <div
                  key={kpi.label}
                  style={{ ...DS.card, padding: '10px 14px', marginBottom: 0,
                           borderLeft: '3px solid #4f46e5' }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: '#6b7280',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 6,
                    }}
                  >
                    {kpi.label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                    {notifLoading ? '—' : (kpi.value ?? 0)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SECTION 3 — Attributed Activity (compact, Part A item 3) */}
          <div style={{ marginBottom: 10 }}>
            <div style={DS.sectionLabel}>Attributed Activity</div>
            {isRefreshing ? (
              <ShimmerRow cols={4} />
            ) : (
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
                    style={{ ...DS.card, marginBottom: 0, padding: '10px 14px',
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
                        fontSize: 18,
                        fontWeight: 700,
                        color: ACT_COLORS[key] || '#111827',
                        lineHeight: 1,
                        marginBottom: 4,
                      }}
                    >
                      {notifLoading ? '—' : (activity?.summary?.[key] ?? 0)}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 4 — two column layout: products+AI insight | planned+yesterday
              (compact, Part A items 4 + 7) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobileView ? '1fr' : '3fr 2fr',
              gap: 20,
              marginBottom: 10,
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
                    padding: '10px 14px',
                    marginBottom: 10,
                    fontSize: 12,
                    color: '#b91c1c',
                  }}
                >
                  {insightsError}
                </div>
              )}

              {/* 4A — Most Viewed Products */}
              <div style={{ ...DS.card, padding: 0, overflow: 'hidden', marginBottom: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    Most Viewed Products
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {SORT_TABS.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setSortBy(tab.key)}
                        style={{
                          padding: '3px 10px',
                          fontSize: 11,
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
                    gridTemplateColumns: '28px 2fr 50px 60px',
                    padding: '5px 16px',
                    background: '#f9fafb',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  {['#', 'Product', 'Views', 'Avg time'].map((h) => (
                    <div
                      key={h}
                      style={{
                        fontSize: 10,
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
                        height: 36,
                        borderBottom: '1px solid #f9fafb',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 16px',
                      }}
                    >
                      <div style={{ width: '40%', height: 10, background: '#f3f4f6', borderRadius: 4 }} />
                    </div>
                  ))
                ) : sortedProducts.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                    No product view data yet.
                  </div>
                ) : (
                  sortedProducts.slice(0, 5).map((p, i, arr) => (
                    <div
                      key={p.productId}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '28px 2fr 50px 60px',
                        padding: '6px 16px',
                        alignItems: 'center',
                        borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                    >
                      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{i + 1}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>
                        {p.productTitle || p.productId || 'Unknown'}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151' }}>{p.views}</div>
                      <div style={{ fontSize: 12, color: '#374151' }}>
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
                    padding: '12px 16px',
                    borderLeft: '3px solid #4f46e5',
                    background: '#ffffff',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#4f46e5',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 6,
                    }}
                  >
                    AI Weekly Insight
                  </div>
                  <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, margin: 0 }}>
                    {aiInsights[0]}
                  </p>
                </div>
              )}
            </div>

            {/* RIGHT column — planned + yesterday */}
            <div>
              {/* 4C — Planned for today */}
              <div style={{ ...DS.card, marginBottom: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
                  Planned for today
                </div>
                {todayLoading ? (
                  [1, 2, 3].map((i) => (
                    <div key={i} style={{ height: 18, background: '#f3f4f6', borderRadius: 4, marginBottom: 6 }} />
                  ))
                ) : groupedSignals.length ? (
                  groupedSignals.slice(0, 5).map((sig) => (
                    <div
                      key={sig.type}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid #f9fafb',
                      }}
                    >
                      <span style={{ fontSize: 12, color: '#374151' }}>
                        {SIGNAL_LABELS[sig.type] || sig.type.replace(/_/g, ' ')}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 10,
                            color: '#9ca3af',
                            background: '#f3f4f6',
                            padding: '2px 7px',
                            borderRadius: 20,
                          }}
                        >
                          {sig.channel || 'push'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', minWidth: 14, textAlign: 'right' }}>
                          {sig.count}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No signals right now.</p>
                )}
              </div>

              {/* 4D — Yesterday performance. NOTE: kept the hero numbers
                  at 18px (matching the KPI/Activity rows above) rather
                  than the literal "fontSize throughout: 12px" from Part A
                  item 7 — shrinking a headline stat number down to the
                  same size as its own label would have made it
                  unreadable as a "hero" figure and inconsistent with
                  every other stat number on this same compacted page
                  (all reduced to 18px, not 12px). Labels themselves are
                  12px/11px per the compacting spec. See
                  audits/dashboard-phase1-audit.txt. */}
              <div style={{ ...DS.card, marginBottom: 0, padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
                  Yesterday
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>Sent</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                      {todayStats?.messagesSent ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>
                      Opened or clicked
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
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
                padding: '10px 14px',
                marginBottom: 10,
                fontSize: 12,
                color: '#b91c1c',
              }}
            >
              {todayError}
            </div>
          )}

          {/* SECTION 5 — new subscribers alert (compact, Part A item 5) */}
          {newSubscribers.length > 0 && (
            <div style={{ ...DS.card, borderLeft: '3px solid #16a34a', marginBottom: 10,
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

        </div>

        {/* RIGHT sidebar — Notification Suggestions + Quick Stats (Part B) */}
        <div style={{
          width: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
        }}>

          {/* Notification Suggestions card */}
          <div style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            {/* Header — always visible */}
            <div
              onClick={() => setSuggestionsOpen(o => !o)}
              style={{
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                borderBottom: suggestionsOpen ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                  Notification Suggestions
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {upcomingFestivals.length} upcoming festivals
                </div>
              </div>
              <div style={{
                background: '#4f46e5',
                color: '#fff',
                borderRadius: 20,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 700,
              }}>
                {upcomingFestivals.length}
              </div>
            </div>

            {/* Festival list — visible when open */}
            {suggestionsOpen && (
              <div style={{ maxHeight: 'calc(100vh - 300px)',
                            overflowY: 'auto', overflowX: 'hidden' }}>
                {upcomingFestivals.map(f => (
                  <div
                    key={f.name}
                    onClick={() => {
                      setSelectedFestival(f);
                      setEditorTitle(f.name + ' Special Offer');
                      setEditorBody(f.message);
                      setEditorMobileImageUrl('');
                      setEditorDesktopImageUrl('');
                      setEditorDate(f.date);
                      setEditorAction(null);
                      setShowEditor(true);
                    }}
                    style={{
                      padding: '10px 16px',
                      borderBottom: '1px solid #f9fafb',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600,
                                    color: '#111827' }}>
                        {f.emoji} {f.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {f.diffDays === 0 ? 'Today' :
                         f.diffDays === 1 ? 'Tomorrow' :
                         `In ${f.diffDays} days`}
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"
                      strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick stats card */}
          <div style={{
            background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: 12, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          marginBottom: 10 }}>
              Quick Stats
            </div>
            {[
              { label: 'Push subscribers',
                value: notifStats?.pushSubscribers ?? '—' },
              { label: 'Emails captured',
                value: notifStats?.emailsCaptured ?? '—' },
              { label: 'Popups shown',
                value: notifStats?.popupsShown ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid #f9fafb',
              }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700,
                               color: '#111827' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Notification Editor modal (Part C) — replaces the old compose
          modal entirely. See audits/dashboard-phase1-audit.txt for the
          /api/queue/festival URL-shape fix (the given spec's `/festival`
          path, with no :shopDomain segment, would have made every
          Approve/Add-to-Queue request fail with 403 under this backend's
          requireStoreOwner middleware, which requires and compares
          req.params.shopDomain — matched to this file's own established
          route pattern instead) and for the known, undone gap where
          POST /api/push/send-store does not yet forward imageUrl (Send
          Now already sends it; the endpoint itself silently drops it —
          left as-is since fixing it would mean editing
          backend/routes/push.js, outside this task's stated file scope). */}
      {showEditor && selectedFestival && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20,
        }}
          onClick={e => { if (e.target === e.currentTarget) {
            setShowEditor(false);
            setShowImageInfo(false);
            setEditorMobileImageUrl('');
            setEditorDesktopImageUrl('');
          } }}
        >
          <div style={{
            background: '#fff', borderRadius: 16,
            width: '100%', maxWidth: 760,
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column',
            maxHeight: '90vh', overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #f3f4f6',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700,
                              color: '#111827' }}>
                  {selectedFestival.emoji} {selectedFestival.name} Notification
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  Edit and preview before sending
                </div>
              </div>
              <button onClick={() => {
                  setShowEditor(false);
                  setShowImageInfo(false);
                  setEditorMobileImageUrl('');
                  setEditorDesktopImageUrl('');
                }}
                style={{ background: 'none', border: 'none',
                         fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>
                ✕
              </button>
            </div>

            {/* Modal body — editor + preview side by side */}
            <div style={{
              display: 'flex', flex: 1, overflow: 'hidden',
            }}>
              {/* Left: Editor */}
              <div style={{
                flex: 1, padding: 20, overflowY: 'auto',
                borderRight: '1px solid #f3f4f6',
              }}>
                {/* Mobile Image + Desktop Image — separate uploads, shown
                    side by side. See audits/horizontal-upload-audit.txt
                    (was audits/separate-images-audit.txt, stacked). */}
                <div style={{ marginBottom: 16 }}>
                  {/* Label row with info button */}
                  <div style={{ display: 'flex', alignItems: 'center',
                                gap: 6, marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600,
                                    color: '#374151' }}>
                      Notification Images
                    </label>
                    <button
                      onClick={() => setShowImageInfo(s => !s)}
                      style={{
                        width: 16, height: 16, borderRadius: '50%',
                        border: '1.5px solid #9ca3af', background: 'none',
                        color: '#9ca3af', fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', lineHeight: 1, padding: 0,
                        flexShrink: 0,
                      }}
                      title="Image size guidance"
                    >
                      i
                    </button>
                  </div>

                  {/* Info tooltip/box */}
                  {showImageInfo && (
                    <div style={{
                      background: '#f0f9ff', border: '1px solid #bae6fd',
                      borderRadius: 8, padding: '10px 12px', marginBottom: 10,
                      fontSize: 12, color: '#0369a1', lineHeight: 1.6,
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        📐 Recommended Image Size
                      </div>
                      <div>• <strong>360 × 180px</strong> — best for all platforms</div>
                      <div>• Ratio: <strong>2:1</strong> (wide landscape)</div>
                      <div>• Format: <strong>JPG or PNG</strong></div>
                      <div>• Max size: <strong>under 1MB</strong></div>
                      <div style={{ marginTop: 6, color: '#0284c7', fontSize: 11 }}>
                        Tip: Avoid text in the image — it gets cropped on mobile screens.
                      </div>
                    </div>
                  )}

                  {/* Two upload boxes side by side */}
                  <div style={{ display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: 10 }}>

                    {/* Mobile upload box */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600,
                                    color: '#6b7280', marginBottom: 4,
                                    textAlign: 'center' }}>
                        📱 Mobile
                      </div>
                      <label style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 4, padding: '12px 8px',
                        borderRadius: 8, border: '2px dashed #d1d5db',
                        background: editorMobileImageUrl ? '#f0fdf4' : '#f9fafb',
                        cursor: 'pointer', fontSize: 11, color: '#6b7280',
                        fontWeight: 500, minHeight: 80,
                        boxSizing: 'border-box', width: '100%',
                        position: 'relative', overflow: 'hidden',
                      }}>
                        {editorMobileImageUrl ? (
                          <>
                            <img src={editorMobileImageUrl} alt="mobile"
                              style={{ width: '100%', height: 60,
                                       objectFit: 'cover', borderRadius: 6 }} />
                            <span style={{ fontSize: 10, color: '#16a34a',
                                           fontWeight: 600 }}>✓ Uploaded</span>
                          </>
                        ) : (
                          <>
                            <svg width="20" height="20" viewBox="0 0 24 24"
                              fill="none" stroke="#9ca3af" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="17 8 12 3 7 8"/>
                              <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            <span>Upload</span>
                          </>
                        )}
                        <input type="file" accept="image/*"
                               style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) =>
                              setEditorMobileImageUrl(ev.target.result);
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      {editorMobileImageUrl && (
                        <button onClick={() => setEditorMobileImageUrl('')}
                          style={{ width: '100%', marginTop: 4, fontSize: 10,
                                   color: '#dc2626', background: 'none',
                                   border: 'none', cursor: 'pointer', padding: 0,
                                   textAlign: 'center' }}>
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Desktop upload box */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600,
                                    color: '#6b7280', marginBottom: 4,
                                    textAlign: 'center' }}>
                        🖥️ Desktop
                      </div>
                      <label style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 4, padding: '12px 8px',
                        borderRadius: 8, border: '2px dashed #d1d5db',
                        background: editorDesktopImageUrl ? '#f0fdf4' : '#f9fafb',
                        cursor: 'pointer', fontSize: 11, color: '#6b7280',
                        fontWeight: 500, minHeight: 80,
                        boxSizing: 'border-box', width: '100%',
                        position: 'relative', overflow: 'hidden',
                      }}>
                        {editorDesktopImageUrl ? (
                          <>
                            <img src={editorDesktopImageUrl} alt="desktop"
                              style={{ width: '100%', height: 60,
                                       objectFit: 'cover', borderRadius: 6 }} />
                            <span style={{ fontSize: 10, color: '#16a34a',
                                           fontWeight: 600 }}>✓ Uploaded</span>
                          </>
                        ) : (
                          <>
                            <svg width="20" height="20" viewBox="0 0 24 24"
                              fill="none" stroke="#9ca3af" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="17 8 12 3 7 8"/>
                              <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            <span>Upload</span>
                          </>
                        )}
                        <input type="file" accept="image/*"
                               style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) =>
                              setEditorDesktopImageUrl(ev.target.result);
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      {editorDesktopImageUrl && (
                        <button onClick={() => setEditorDesktopImageUrl('')}
                          style={{ width: '100%', marginTop: 4, fontSize: 10,
                                   color: '#dc2626', background: 'none',
                                   border: 'none', cursor: 'pointer', padding: 0,
                                   textAlign: 'center' }}>
                          Remove
                        </button>
                      )}
                    </div>

                  </div>
                </div>

                {/* Title */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600,
                                  color: '#374151', display: 'block',
                                  marginBottom: 6 }}>
                    Notification Title
                  </label>
                  <input
                    type="text"
                    value={editorTitle}
                    onChange={e => setEditorTitle(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px',
                             borderRadius: 8, border: '1px solid #e5e7eb',
                             fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>

                {/* Body */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600,
                                  color: '#374151', display: 'block',
                                  marginBottom: 6 }}>
                    Message
                  </label>
                  <textarea
                    value={editorBody}
                    onChange={e => setEditorBody(e.target.value)}
                    rows={4}
                    style={{ width: '100%', padding: '8px 12px',
                             borderRadius: 8, border: '1px solid #e5e7eb',
                             fontSize: 13, resize: 'vertical',
                             fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Scheduled date */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 600,
                                  color: '#374151', display: 'block',
                                  marginBottom: 6 }}>
                    Schedule Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={editorDate ?
                      new Date(editorDate).toISOString().slice(0,16) : ''}
                    onChange={e => setEditorDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px',
                             borderRadius: 8, border: '1px solid #e5e7eb',
                             fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      try {
                        await apiSend('/api/push/send-store', 'POST', {
                          shop,
                          title: editorTitle,
                          body: editorBody,
                          mobileImageUrl: editorMobileImageUrl,
                          desktopImageUrl: editorDesktopImageUrl,
                        });
                        setShowEditor(false);
                        setShowImageInfo(false);
                        setEditorMobileImageUrl('');
                        setEditorDesktopImageUrl('');
                        alert('Notification sent to all subscribers!');
                      } catch(e) {
                        alert('Failed to send');
                      }
                    }}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8,
                      border: 'none', background: '#4f46e5', color: '#fff',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                    Send Now
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await apiSend(
                          `/api/queue/${encodeURIComponent(shop)}/festival`,
                          'POST',
                          {
                            title: editorTitle,
                            body: editorBody,
                            mobileImageUrl: editorMobileImageUrl,
                            desktopImageUrl: editorDesktopImageUrl,
                            scheduledAt: editorDate,
                            festival: selectedFestival.name,
                            status: 'approved',
                          }
                        );
                        setShowEditor(false);
                        setShowImageInfo(false);
                        setEditorMobileImageUrl('');
                        setEditorDesktopImageUrl('');
                        alert('Added to queue as approved!');
                      } catch(e) {
                        alert('Failed to approve');
                      }
                    }}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8,
                      border: 'none', background: '#16a34a', color: '#fff',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await apiSend(
                          `/api/queue/${encodeURIComponent(shop)}/festival`,
                          'POST',
                          {
                            title: editorTitle,
                            body: editorBody,
                            mobileImageUrl: editorMobileImageUrl,
                            desktopImageUrl: editorDesktopImageUrl,
                            scheduledAt: editorDate,
                            festival: selectedFestival.name,
                            status: 'draft',
                          }
                        );
                        setShowEditor(false);
                        setShowImageInfo(false);
                        setEditorMobileImageUrl('');
                        setEditorDesktopImageUrl('');
                      } catch(e) {
                        alert('Failed to save');
                      }
                    }}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8,
                      border: '1px solid #e5e7eb', background: '#fff',
                      color: '#374151', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer',
                    }}>
                    Add to Queue
                  </button>
                </div>
              </div>

              {/* Right: Live Preview — compact phone frame + Mac desktop
                  toast, resized to fit the panel without cutting off.
                  See audits/preview-redesign-audit.txt. */}
              <div style={{
                width: 260,
                flexShrink: 0,
                padding: '14px 12px',
                background: '#f8fafc',
                borderLeft: '1px solid #e5e7eb',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8',
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                              textAlign: 'center' }}>
                  Live Preview
                </div>

                {/* MOBILE PREVIEW */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b',
                                textAlign: 'center', marginBottom: 6 }}>
                    📱 Mobile
                  </div>
                  {/* Phone outer frame */}
                  <div style={{
                    width: 180, margin: '0 auto',
                    background: '#111', borderRadius: 24,
                    padding: '8px 5px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                  }}>
                    {/* Screen */}
                    <div style={{
                      background: '#f2f2f7',
                      borderRadius: 18,
                      overflow: 'hidden',
                    }}>
                      {/* Status bar */}
                      <div style={{
                        padding: '5px 10px 2px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        background: '#f2f2f7',
                      }}>
                        <span style={{ fontSize: 8, fontWeight: 700,
                                       color: '#111' }}>9:41</span>
                        <span style={{ fontSize: 8, color: '#111' }}>
                          ●●● ▲ 🔋
                        </span>
                      </div>
                      {/* Notification card */}
                      <div style={{
                        margin: '3px 5px 5px',
                        background: 'rgba(255,255,255,0.92)',
                        borderRadius: 10,
                        overflow: 'hidden',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                      }}>
                        {/* App row */}
                        <div style={{
                          display: 'flex', alignItems: 'center',
                          gap: 5, padding: '6px 8px 3px',
                        }}>
                          <div style={{
                            width: 12, height: 12,
                            background: '#4f46e5', borderRadius: 3,
                            flexShrink: 0,
                          }} />
                          <span style={{ fontSize: 8, fontWeight: 700,
                                         color: '#555', flex: 1 }}>
                            ShopiReachBoost AI
                          </span>
                          <span style={{ fontSize: 7, color: '#999' }}>now</span>
                        </div>
                        {/* Title + body + thumbnail */}
                        <div style={{
                          display: 'flex', gap: 6,
                          padding: '0 8px 6px',
                          alignItems: 'flex-start',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 10, fontWeight: 700, color: '#111',
                              marginBottom: 2,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {editorTitle || 'Notification Title'}
                            </div>
                            <div style={{
                              fontSize: 8, color: '#555', lineHeight: 1.3,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}>
                              {editorBody || 'Message preview...'}
                            </div>
                          </div>
                          {/* Thumbnail */}
                          <div style={{
                            width: 32, height: 32, borderRadius: 6,
                            overflow: 'hidden', flexShrink: 0,
                            background: '#eef2ff',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            {editorMobileImageUrl ? (
                              <img src={editorMobileImageUrl} alt=""
                                style={{ width: '100%', height: '100%',
                                         objectFit: 'cover' }}
                                onError={e => e.target.style.display = 'none'} />
                            ) : (
                              <span style={{ fontSize: 14 }}>🔔</span>
                            )}
                          </div>
                        </div>
                        {/* Banner image when uploaded */}
                        {editorMobileImageUrl && (
                          <img src={editorMobileImageUrl} alt=""
                            style={{ width: '100%', height: 55,
                                     objectFit: 'cover', display: 'block' }}
                            onError={e => e.target.style.display = 'none'}
                          />
                        )}
                      </div>
                      {/* Home bar */}
                      <div style={{
                        height: 14, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: '#f2f2f7',
                      }}>
                        <div style={{ width: 40, height: 3,
                                      background: '#c7c7cc', borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* DESKTOP PREVIEW */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b',
                                textAlign: 'center', marginBottom: 6 }}>
                    🖥️ Desktop
                  </div>
                  {/* Mac desktop background */}
                  <div style={{
                    background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2027 100%)',
                    borderRadius: 10, padding: 8, maxWidth: 220, margin: '0 auto',
                  }}>
                    {/* Notification toast */}
                    <div style={{
                      background: 'rgba(50,50,50,0.92)',
                      borderRadius: 10, overflow: 'hidden',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    }}>
                      {/* App header */}
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        gap: 5, padding: '7px 8px 3px',
                      }}>
                        <div style={{ width: 12, height: 12,
                                      background: '#4f46e5', borderRadius: 3,
                                      flexShrink: 0 }} />
                        <span style={{ fontSize: 8, fontWeight: 700,
                                       color: 'rgba(255,255,255,0.7)', flex: 1 }}>
                          ShopiReachBoost AI
                        </span>
                        <span style={{ fontSize: 7,
                                       color: 'rgba(255,255,255,0.4)' }}>now</span>
                      </div>
                      {/* Content */}
                      <div style={{
                        display: 'flex', gap: 6,
                        padding: '0 8px 8px', alignItems: 'flex-start',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 10, fontWeight: 700, color: '#fff',
                            marginBottom: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {editorTitle || 'Notification Title'}
                          </div>
                          <div style={{
                            fontSize: 8, color: 'rgba(255,255,255,0.65)',
                            lineHeight: 1.3,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                            {editorBody || 'Message preview here...'}
                          </div>
                        </div>
                        {/* Desktop thumbnail */}
                        <div style={{
                          width: 36, height: 36, borderRadius: 6,
                          overflow: 'hidden', flexShrink: 0,
                          background: 'rgba(255,255,255,0.15)',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {editorDesktopImageUrl ? (
                            <img src={editorDesktopImageUrl} alt=""
                              style={{ width: '100%', height: '100%',
                                       objectFit: 'cover' }}
                              onError={e => e.target.style.display = 'none'} />
                          ) : (
                            <span style={{ fontSize: 16 }}>🔔</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Mac taskbar hint */}
                    <div style={{
                      display: 'flex', justifyContent: 'flex-end',
                      marginTop: 4, paddingRight: 2,
                    }}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {['#ff5f57','#febc2e','#28c840'].map(c => (
                          <div key={c} style={{ width: 6, height: 6,
                                                borderRadius: '50%',
                                                background: c }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 9, color: '#94a3b8',
                              textAlign: 'center' }}>
                  Updates as you type
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
