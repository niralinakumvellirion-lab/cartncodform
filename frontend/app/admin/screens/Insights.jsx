'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../../../lib/api';

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

const SORT_TABS = [
  { key: 'views', label: 'Views' },
  { key: 'avgDwell', label: 'Time on page' },
  { key: 'cartRate', label: 'Cart rate' },
];

export default function Insights({ shop }) {
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('views');

  const load = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setError('');
    try {
      const [pa, wn] = await Promise.allSettled([
        apiGet(`/api/events/${encodeURIComponent(shop)}/product-analytics`),
        apiGet(`/api/profiles/${encodeURIComponent(shop)}/weekly-narrative`),
      ]);
      if (pa.status === 'fulfilled') {
        setStats(pa.value?.stats || null);
        setProducts(Array.isArray(pa.value?.products) ? pa.value.products : []);
      } else {
        setError(pa.reason?.message || 'Failed to load analytics');
      }
      if (wn.status === 'fulfilled') {
        setInsights(Array.isArray(wn.value?.insights) ? wn.value.insights : []);
      }
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedProducts = [...(products || [])].sort((a, b) => {
    if (sortBy === 'avgDwell') return b.avgDwell - a.avgDwell;
    if (sortBy === 'cartRate') return b.cartRate - a.cartRate;
    return b.views - a.views;
  });

  const TILES = [
    {
      label: 'Product views this week',
      value: stats?.productViewsThisWeek?.toLocaleString('en-IN') ?? '—',
      sub: '↗ tracking active',
    },
    {
      label: 'Allowed notifications',
      value: stats?.allowedNotifications ? `${stats.allowedNotifications}%` : '—',
      sub: 'of visitors with the popup',
    },
    {
      label: 'Add-to-cart rate',
      value: stats?.addToCartRate ? `${stats.addToCartRate}%` : '—',
      sub: 'sessions that added something',
    },
    {
      label: 'Sessions tracked',
      value: stats?.sessionCount?.toLocaleString('en-IN') ?? '—',
      sub: 'unique visitors this week',
    },
  ];

  return (
    <div style={DS.page}>
      <PageHeader
        title="Insights"
        subtitle="Performance analytics for your notifications"
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

      {/* 4 stat tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {TILES.map((tile) => (
          <div
            key={tile.label}
            style={{ ...DS.card, padding: '16px 18px', marginBottom: 0 }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#9ca3af',
                fontWeight: '500',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {tile.label}
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#111827',
                lineHeight: 1,
                marginBottom: '6px',
              }}
            >
              {loading ? '—' : tile.value}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* Products table */}
      <div
        style={{ ...DS.card, padding: 0, overflow: 'hidden' }}
      >
        {/* Table header with sort tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid #f3f4f6',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
            Products
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {SORT_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSortBy(tab.key)}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: sortBy === tab.key ? '600' : '400',
                  color: sortBy === tab.key ? '#111827' : '#9ca3af',
                  background: sortBy === tab.key ? '#f3f4f6' : 'transparent',
                  border: '1px solid',
                  borderColor: sortBy === tab.key ? '#e5e7eb' : 'transparent',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 80px 80px 100px 80px',
            padding: '8px 20px',
            background: '#f9fafb',
            borderBottom: '1px solid #f3f4f6',
          }}
        >
          {['Product', 'Views', 'Avg time', 'Avg scroll', 'Cart rate'].map((h) => (
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
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: '52px',
                borderBottom: '1px solid #f9fafb',
                display: 'flex',
                alignItems: 'center',
                padding: '0 20px',
              }}
            >
              <div
                style={{
                  width: '40%',
                  height: '12px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                }}
              />
            </div>
          ))
        ) : sortedProducts.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '14px',
            }}
          >
            No product view data yet. Make sure the storefront block is enabled.
          </div>
        ) : (
          sortedProducts.map((p, i) => (
            <div
              key={p.productId}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 80px 80px 100px 80px',
                padding: '12px 20px',
                alignItems: 'center',
                borderBottom:
                  i < sortedProducts.length - 1 ? '1px solid #f9fafb' : 'none',
              }}
            >
              {/* Product */}
              <div>
                <div
                  style={{ fontSize: '13px', fontWeight: '500', color: '#111827' }}
                >
                  {p.productTitle || p.productId || 'Unknown'}
                </div>
                {p.productPrice && (
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    ₹{Number(p.productPrice).toLocaleString('en-IN')}
                  </div>
                )}
              </div>
              {/* Views */}
              <div style={{ fontSize: '13px', color: '#374151' }}>
                {p.views}
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                  {p.uniqueViewers} people
                </div>
              </div>
              {/* Avg time */}
              <div style={{ fontSize: '13px', color: '#374151' }}>
                {p.avgDwell > 0 ? `${p.avgDwell}s` : '—'}
              </div>
              {/* Avg scroll bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    flex: 1,
                    height: '4px',
                    background: '#e5e7eb',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(p.cartRate || 0, 100)}%`,
                      background: p.cartRate > 15 ? '#16a34a' : '#374151',
                      borderRadius: '2px',
                    }}
                  />
                </div>
                <span
                  style={{ fontSize: '11px', color: '#9ca3af', minWidth: '30px' }}
                >
                  {p.cartRate}%
                </span>
              </div>
              {/* Cart rate */}
              <div style={{ fontSize: '13px', color: '#374151' }}>
                {p.cartRate}%
              </div>
            </div>
          ))
        )}
      </div>

      {/* AI insight at bottom */}
      {insights?.length > 0 && (
        <div
          style={{
            ...DS.card,
            background: DS.warningLight,
            border: '1px solid #fde68a',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: '18px', flexShrink: 0 }}>✨</span>
          <p
            style={{
              fontSize: '13px',
              color: '#374151',
              lineHeight: '1.6',
              margin: 0,
            }}
          >
            {insights[0]}
          </p>
        </div>
      )}
    </div>
  );
}
