'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

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
    <div
      style={{
        padding: isMobileView ? '0 12px 24px' : '0 24px 24px',
        maxWidth: '1100px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 6px',
          }}
        >
          Cash on delivery
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          {pending > 0
            ? `${pending} waiting for your confirmation call.`
            : 'All orders confirmed.'}
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
          gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* COD orders */}
        <div
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
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
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
