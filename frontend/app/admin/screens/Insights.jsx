'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../../../lib/api';

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
    <div style={{ padding: '0 24px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 6px',
          }}
        >
          What&apos;s happening on your store
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          From how long people stay and how far they scroll. Nothing here needs
          an email or a login to measure.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
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
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '16px 18px',
            }}
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
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          overflow: 'hidden',
          marginBottom: '16px',
        }}
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
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '10px',
            padding: '16px 20px',
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
