'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

function maskPhone(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return phone;
  return `+91 ${digits.slice(-10, -6)}•••• ••${digits.slice(-3)}`;
}

function formatOrderTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const STATUS_CONFIG = {
  pending: { label: 'pending', bg: '#fef9c3', color: '#ca8a04' },
  confirmed: { label: 'confirmed', bg: '#dcfce7', color: '#16a34a' },
  cancelled: { label: 'cancelled', bg: '#f3f4f6', color: '#9ca3af' },
  delivered: { label: 'delivered', bg: '#dbeafe', color: '#1d4ed8' },
};

const GRID_COLS = '70px 1fr 1.2fr 120px 100px 160px';

export default function CodOrders({ shop }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/api/stores/${encodeURIComponent(shop)}/orders`);
      // The endpoint returns a bare array; tolerate { orders: [...] } too.
      setOrders(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.orders)
          ? data.orders
          : []
      );
    } catch (err) {
      setError(err.message || 'Failed to load COD orders');
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function updateStatus(orderId, status) {
    try {
      await apiSend(`/api/cod/order/${orderId}`, 'PATCH', { status });
      loadOrders();
    } catch (err) {
      setError(err.message || 'Failed to update order');
    }
  }

  const { total, pending, confirmed, confirmRate, confirmedRevenue } = useMemo(() => {
    const t = orders.length;
    const p = orders.filter((o) => o.status === 'pending').length;
    const c = orders.filter((o) => o.status === 'confirmed').length;
    return {
      total: t,
      pending: p,
      confirmed: c,
      confirmRate: t > 0 ? ((c / t) * 100).toFixed(0) + '%' : '—',
      confirmedRevenue: orders
        .filter((o) => o.status === 'confirmed')
        .reduce(
          (s, o) => s + (Number(o.productPrice) || 0) * (Number(o.quantity) || 1),
          0
        ),
    };
  }, [orders]);

  return (
    <div style={DS.page}>
      <PageHeader
        title="COD Orders"
        subtitle="Cash on delivery order management"
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
          gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* COD orders */}
        <div
          style={{ ...DS.card, padding: '16px 18px', marginBottom: 0 }}
        >
          <div
            style={{
              fontSize: '11px',
              color: '#6366f1',
              fontWeight: '500',
              marginBottom: '8px',
            }}
          >
            COD orders (30d)
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
            {total}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            {confirmed} confirmed
          </div>
        </div>

        {/* Confirmed % */}
        <div
          style={{ ...DS.card, padding: '16px 18px', marginBottom: 0 }}
        >
          <div
            style={{
              fontSize: '11px',
              color: '#6b7280',
              fontWeight: '500',
              marginBottom: '8px',
            }}
          >
            Confirmed
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
            {confirmRate}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            {confirmed} of {total}
          </div>
        </div>

        {/* Revenue */}
        <div
          style={{ ...DS.card, padding: '16px 18px', marginBottom: 0 }}
        >
          <div
            style={{
              fontSize: '11px',
              color: '#6b7280',
              fontWeight: '500',
              marginBottom: '8px',
            }}
          >
            Confirmed revenue
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#16a34a',
              lineHeight: 1,
              marginBottom: '6px',
            }}
          >
            ₹{confirmedRevenue.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            from confirmed orders
          </div>
        </div>

        {/* Pending */}
        <div
          style={{ ...DS.card, padding: '16px 18px', marginBottom: 0 }}
        >
          <div
            style={{
              fontSize: '11px',
              color: '#6b7280',
              fontWeight: '500',
              marginBottom: '8px',
            }}
          >
            Pending confirmation
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: '700',
              color: pending > 0 ? '#ca8a04' : '#111827',
              lineHeight: 1,
              marginBottom: '6px',
            }}
          >
            {pending}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            {pending > 0 ? 'needs your call' : 'all confirmed'}
          </div>
        </div>
      </div>

      {/* Orders table */}
      <div
        style={{ ...DS.card, padding: 0, overflow: 'hidden' }}
      >
        {/* Column headers — desktop table only */}
        {!isMobileView && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID_COLS,
              padding: '10px 20px',
              background: '#f9fafb',
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            {['Order', 'Customer', 'Product', 'Placed', 'Status', ''].map((h, idx) => (
              <div
                key={h || `col-${idx}`}
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
        )}

        {/* Rows */}
        {loading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: '60px',
                borderBottom: '1px solid #f9fafb',
                display: 'flex',
                alignItems: 'center',
                padding: '0 20px',
              }}
            >
              <div
                style={{
                  width: '50%',
                  height: '12px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                }}
              />
            </div>
          ))
        ) : orders.length === 0 ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '14px',
            }}
          >
            No COD orders yet.
          </div>
        ) : isMobileView ? (
          orders.map((o, i) => (
            <div
              key={o._id}
              style={{
                padding: '16px',
                borderBottom:
                  i < orders.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              {/* Row 1: Order # + Status */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}
                >
                  #{String(i + 1091).padStart(4, '0')}
                </span>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '500',
                    background: STATUS_CONFIG[o.status]?.bg || '#f3f4f6',
                    color: STATUS_CONFIG[o.status]?.color || '#9ca3af',
                  }}
                >
                  {STATUS_CONFIG[o.status]?.label || o.status}
                </span>
              </div>

              {/* Row 2: Customer */}
              <div style={{ marginBottom: '6px' }}>
                <div
                  style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}
                >
                  {o.name}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {maskPhone(o.phone)}
                  {o.city ? ` · ${o.city}` : ''}
                </div>
              </div>

              {/* Row 3: Product + value */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <div style={{ fontSize: '13px', color: '#374151' }}>
                  {o.productName} × {o.quantity}
                </div>
                <div
                  style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}
                >
                  ₹
                  {(
                    (Number(o.productPrice) || 0) * (Number(o.quantity) || 1)
                  ).toLocaleString('en-IN')}
                </div>
              </div>

              {/* Row 4: Date + Actions */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {formatOrderTime(o.createdAt)}
                </div>
                {o.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => updateStatus(o._id, 'cancelled')}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: '500',
                        color: '#374151',
                        background: '#fff',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => updateStatus(o._id, 'confirmed')}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#fff',
                        background: '#111827',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          orders.map((o, i) => {
            const statusCfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.pending;
            const isPrepaidEligible = o.email && o.status === 'pending';

            return (
              <div
                key={o._id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_COLS,
                  padding: '14px 20px',
                  alignItems: 'center',
                  borderBottom:
                    i < orders.length - 1 ? '1px solid #f9fafb' : 'none',
                }}
              >
                {/* Order # */}
                <div
                  style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}
                >
                  #{String(i + 1091).padStart(4, '0')}
                </div>

                {/* Customer */}
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#111827',
                      marginBottom: '2px',
                    }}
                  >
                    {o.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {maskPhone(o.phone)}
                    {o.city ? ` · ${o.city}` : ''}
                  </div>
                  {isPrepaidEligible && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#6366f1',
                        marginTop: '2px',
                      }}
                    >
                      Has paid online before — prepaid offer sent
                    </div>
                  )}
                </div>

                {/* Product */}
                <div>
                  <div style={{ fontSize: '13px', color: '#374151' }}>
                    {o.productName} × {o.quantity}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    ₹
                    {(
                      (Number(o.productPrice) || 0) * (Number(o.quantity) || 1)
                    ).toLocaleString('en-IN')}
                  </div>
                </div>

                {/* Placed */}
                <div style={{ fontSize: '13px', color: '#374151' }}>
                  {formatOrderTime(o.createdAt)}
                </div>

                {/* Status */}
                <div>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '500',
                      background: statusCfg.bg,
                      color: statusCfg.color,
                    }}
                  >
                    {statusCfg.label}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {o.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateStatus(o._id, 'cancelled')}
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#374151',
                          background: '#fff',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => updateStatus(o._id, 'confirmed')}
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#fff',
                          background: '#111827',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        Confirm
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
