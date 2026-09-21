'use client';

import { useState, useEffect } from 'react';
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

// Phone / "Email + Phone" discounts are retired: the popup only collects an
// email (see ccfShowPhoneField() in push-notifications.liquid) and the server
// always saves those two rules as disabled, so they are not shown or sent.
const DISCOUNT_ITEMS = [
  {
    key: 'pushDiscount',
    label: '🔔 Push notification',
    desc: 'Customer allows push notifications',
    defaults: { percentage: 10, maxUses: 100, expiryDays: 7 },
    autoText: (pct) => `You get ${pct}% off as a subscriber`,
  },
  {
    key: 'emailDiscount',
    label: '✉️ Email address',
    desc: 'Customer provides their email',
    defaults: { percentage: 15, maxUses: 100, expiryDays: 7 },
    autoText: (pct) => `Add your email to get ${pct}% off`,
  },
];

const OFFER_TEXT_MAX = 120;
const HEADLINE_MAX = 200;

function clampPct(v, fallback) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(1, Math.round(n)));
}

// Only what PATCH /api/discounts/:shop/config accepts.
function buildPayload(config) {
  const out = { offerHeadline: config.offerHeadline || '' };
  for (const item of DISCOUNT_ITEMS) {
    const d = config[item.key] || {};
    out[item.key] = {
      enabled: !!d.enabled,
      percentage: clampPct(d.percentage ?? item.defaults.percentage, item.defaults.percentage),
      maxUses: d.maxUses || item.defaults.maxUses,
      expiryDays: d.expiryDays || item.defaults.expiryDays,
      prefix: d.prefix || '',
      offerText: (d.offerText || '').slice(0, OFFER_TEXT_MAX),
    };
  }
  return out;
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '13px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = { fontSize: '12px', color: '#6b7280', marginBottom: '6px' };

export default function Discounts({ shop }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 600);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  function updateRule(key, patch) {
    setConfig((c) => ({ ...c, [key]: { ...(c[key] || {}), ...patch } }));
  }

  async function saveConfig() {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const res = await apiSend(
        `/api/discounts/${encodeURIComponent(shop)}/config`,
        'PATCH',
        buildPayload(config)
      );
      if (res?.config) setConfig(res.config);
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const headline = config.offerHeadline || '';

  return (
    <div style={DS.page}>
      <PageHeader
        title="Discounts"
        subtitle="Configure discount rules for popup capture"
      />

      {loading ? (
        <div style={{ fontSize: '13px', color: '#9ca3af' }}>Loading…</div>
      ) : (
        <>
          {/* Popup headline */}
          <div style={DS.card}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
              Popup headline
            </div>
            <input
              value={headline}
              maxLength={HEADLINE_MAX}
              onChange={(e) => setConfig((c) => ({ ...c, offerHeadline: e.target.value }))}
              placeholder="Get a discount on your first order!"
              style={{ ...inputStyle, padding: '10px 12px' }}
            />
            <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'right', marginTop: '4px' }}>
              {headline.length} / {HEADLINE_MAX}
            </div>
          </div>

          {DISCOUNT_ITEMS.map((item) => {
            const d = config[item.key] || {};
            const pctValue = d.percentage ?? item.defaults.percentage;
            const effectivePct = clampPct(pctValue, item.defaults.percentage);
            const offerText = d.offerText || '';

            return (
              <div key={item.key} style={DS.card}>
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
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
                    onClick={() => updateRule(item.key, { enabled: !d.enabled })}
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
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isNarrow ? '1fr' : 'repeat(2, 1fr)',
                        gap: '16px 12px',
                      }}
                    >
                      {/* Percentage */}
                      <div>
                        <div style={labelStyle}>Discount %</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            value={pctValue}
                            onChange={(e) =>
                              updateRule(item.key, {
                                percentage: e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                            onBlur={() =>
                              updateRule(item.key, {
                                percentage: clampPct(pctValue, item.defaults.percentage),
                              })
                            }
                            style={inputStyle}
                          />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>%</span>
                        </div>
                      </div>

                      {/* Max uses */}
                      <div>
                        <div style={labelStyle}>Max uses</div>
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          value={d.maxUses || item.defaults.maxUses}
                          onChange={(e) => updateRule(item.key, { maxUses: Number(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>

                      {/* Expiry days */}
                      <div>
                        <div style={labelStyle}>Expires after (days)</div>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={d.expiryDays || item.defaults.expiryDays}
                          onChange={(e) => updateRule(item.key, { expiryDays: Number(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>

                      {/* Code prefix */}
                      <div>
                        <div style={labelStyle}>Code prefix</div>
                        <input
                          type="text"
                          maxLength="10"
                          value={d.prefix || ''}
                          onChange={(e) => updateRule(item.key, { prefix: e.target.value.toUpperCase() })}
                          style={{ ...inputStyle, fontFamily: 'monospace' }}
                        />
                      </div>
                    </div>

                    {/* Offer text — full width below the grid */}
                    <div style={{ marginTop: '16px' }}>
                      <div style={labelStyle}>Offer text shown in the popup</div>
                      <textarea
                        value={offerText}
                        maxLength={OFFER_TEXT_MAX}
                        rows={2}
                        onChange={(e) => updateRule(item.key, { offerText: e.target.value })}
                        placeholder={item.autoText(effectivePct)}
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '8px',
                          fontSize: '11px',
                          color: '#9ca3af',
                          marginTop: '4px',
                        }}
                      >
                        <span>Leave blank to use the automatic text.</span>
                        <span style={{ flexShrink: 0 }}>{offerText.length} / {OFFER_TEXT_MAX}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Save button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={saveConfig}
              disabled={saving}
              style={{
                ...DS.btnPrimary,
                padding: '12px 32px',
                fontSize: '14px',
                background: saving ? DS.gray400 : DS.primary,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save discount settings'}
            </button>
            {success && <span style={{ fontSize: '13px', color: DS.success }}>✓ Saved</span>}
            {error && <span style={{ fontSize: '13px', color: DS.danger }}>{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
