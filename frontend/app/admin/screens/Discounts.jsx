'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

const DISCOUNT_ITEMS = [
  { key: 'pushDiscount', label: '🔔 Push notification', desc: 'Customer allows push notifications' },
  { key: 'emailDiscount', label: '✉️ Email address', desc: 'Customer provides their email' },
  { key: 'phoneDiscount', label: '📱 Phone number', desc: 'Customer provides their phone number' },
  { key: 'bothDiscount', label: '⭐ Email + Phone', desc: 'Customer provides both email and phone' },
];

export default function Discounts({ shop }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;

    // Silently trade the current App Bridge session token for a fresh offline
    // Admin API token (OAuth Token Exchange). Picks up newly-added scopes
    // (write_discounts) without a re-install. Best-effort — failure is fine,
    // the reconnect banner on Settings is the fallback.
    apiSend('/api/auth/refresh-token', 'POST', {}).catch(() => {});

    apiGet(`/api/discounts/${encodeURIComponent(shop)}/config`)
      .then((data) => {
        if (cancelled) return;
        setConfig(data?.config || data || {});
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load discounts');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shop]);

  async function saveConfig() {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const res = await apiSend(
        `/api/discounts/${encodeURIComponent(shop)}/config`,
        'PATCH',
        config
      );
      if (res?.config) setConfig(res.config);
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '0 24px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '0 0 6px' }}>
          Discounts
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          Reward customers who subscribe with automatic discount codes.
        </p>
      </div>

      {loading ? (
        <div style={{ fontSize: '13px', color: '#9ca3af' }}>Loading…</div>
      ) : (
        <>
          {/* Offer headline */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '20px 24px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '12px',
              }}
            >
              Popup offer text
            </div>
            <input
              value={config.offerHeadline || ''}
              onChange={(e) => setConfig((c) => ({ ...c, offerHeadline: e.target.value }))}
              placeholder="Get a discount on your first order!"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '13px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 4 discount cards */}
          {DISCOUNT_ITEMS.map((item) => {
            const d = config[item.key] || {};
            return (
              <div
                key={item.key}
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '20px 24px',
                  marginBottom: '12px',
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: d.enabled ? '16px' : 0,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{item.desc}</div>
                  </div>
                  {/* Toggle */}
                  <div
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        [item.key]: { ...(c[item.key] || {}), enabled: !d.enabled },
                      }))
                    }
                    style={{
                      width: '44px',
                      height: '24px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      background: d.enabled ? '#16a34a' : '#d1d5db',
                      position: 'relative',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '3px',
                        left: d.enabled ? '23px' : '3px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                    />
                  </div>
                </div>

                {/* Settings (shown when enabled) */}
                {d.enabled && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '12px',
                    }}
                  >
                    {/* Percentage */}
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                        Discount %
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="range"
                          min="5"
                          max="50"
                          value={d.percentage || 10}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              [item.key]: {
                                ...(c[item.key] || {}),
                                percentage: Number(e.target.value),
                              },
                            }))
                          }
                          style={{ flex: 1 }}
                        />
                        <span
                          style={{
                            fontSize: '16px',
                            fontWeight: '700',
                            color: '#111827',
                            minWidth: '40px',
                          }}
                        >
                          {d.percentage || 10}%
                        </span>
                      </div>
                    </div>

                    {/* Max uses */}
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                        Max uses
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={d.maxUses || 100}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            [item.key]: { ...(c[item.key] || {}), maxUses: Number(e.target.value) },
                          }))
                        }
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          fontSize: '13px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Expiry days */}
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                        Expires after (days)
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={d.expiryDays || 7}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            [item.key]: {
                              ...(c[item.key] || {}),
                              expiryDays: Number(e.target.value),
                            },
                          }))
                        }
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          fontSize: '13px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Code prefix */}
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                        Code prefix
                      </div>
                      <input
                        type="text"
                        maxLength="10"
                        value={d.prefix || ''}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            [item.key]: {
                              ...(c[item.key] || {}),
                              prefix: e.target.value.toUpperCase(),
                            },
                          }))
                        }
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          fontSize: '13px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          outline: 'none',
                          boxSizing: 'border-box',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Save button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={saveConfig}
              disabled={saving}
              style={{
                padding: '12px 32px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#fff',
                background: saving ? '#9ca3af' : '#111827',
                border: 'none',
                borderRadius: '8px',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save discount settings'}
            </button>
            {success && <span style={{ fontSize: '13px', color: '#16a34a' }}>✓ Saved</span>}
            {error && <span style={{ fontSize: '13px', color: '#dc2626' }}>{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
