'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Page } from '@shopify/polaris';
import { apiGet } from '../../../lib/api';

const ACTIVITY_TILES = [
  { key: 'add_to_cart', label: 'Added to cart', icon: '🛒', color: '#f59e0b' },
  { key: 'checkout_start', label: 'Started checkout', icon: '💳', color: '#8b5cf6' },
  { key: 'purchase', label: 'Purchased', icon: '✅', color: '#10b981' },
  { key: 'revisit', label: 'Revisited', icon: '🔁', color: '#3b82f6' },
];

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

  // Phase 3 — attributed activity tiles (add_to_cart/checkout_start/
  // purchase/revisit counts from AttributedEvent, Phase 1/2).
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    if (!shop) return;
    setActivityLoading(true);
    apiGet(`/api/activity?shop=${encodeURIComponent(shop)}`)
      .then(data => setActivity(data))
      .catch(() => setActivity(null))
      .finally(() => setActivityLoading(false));
  }, [shop]);

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

  return (
    <Page>
    <div
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: isMobileView ? '0 12px 24px' : '0 0 24px',
      }}
    >
      {/* Activity (Phase 3) — attributed notification-click activity,
          rendered first per task spec ("BEFORE any existing content"). */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Activity (last 7 days)
          </h2>
          <button
            onClick={() => navigate('/admin/activity')}
            style={{ fontSize: 13, color: '#6366f1', background: 'none',
                     border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            View all →
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 12 }}>
          {ACTIVITY_TILES.map(({ key, label, icon, color }) => (
            <div
              key={key}
              onClick={() => navigate(`/admin/activity?type=${key}`)}
              style={{ background: '#fff', border: '1px solid #e5e7eb',
                       borderRadius: 12, padding: '16px 20px',
                       cursor: 'pointer', transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow =
                '0 4px 12px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color,
                            lineHeight: 1 }}>
                {activityLoading ? '...' :
                 (activity?.summary?.[key] ?? 0)}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>
          Today
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
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
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '18px 20px',
          }}
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
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '18px 20px',
          }}
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
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '18px 20px',
          }}
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
