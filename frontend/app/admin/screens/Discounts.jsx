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

// Inline SVG icons (Lucide-style paths, ISC licence; no dependency).
function Svg({ size = 20, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}
const Icons = {
  Bell: ({ size }) => (
    <Svg size={size}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Svg>
  ),
  Mail: ({ size }) => (
    <Svg size={size}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Svg>
  ),
  Type: ({ size }) => (
    <Svg size={size}>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" x2="15" y1="20" y2="20" />
      <line x1="12" x2="12" y1="4" y2="20" />
    </Svg>
  ),
  Check: ({ size }) => (
    <Svg size={size}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  ),
};

// Phone / "Email + Phone" discounts are retired: the popup only collects an
// email (see ccfShowPhoneField() in push-notifications.liquid) and the server
// always saves those two rules as disabled, so they are not shown or sent.
const DISCOUNT_ITEMS = [
  {
    key: 'pushDiscount',
    label: 'Push notification',
    Icon: Icons.Bell,
    desc: 'Customer allows push notifications',
    defaults: { percentage: 10, maxUses: 100, expiryDays: 7 },
    autoText: (pct) => `You get ${pct}% off as a subscriber`,
  },
  {
    key: 'emailDiscount',
    label: 'Email address',
    Icon: Icons.Mail,
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

// Compact, content-sized inputs. Focus ring uses the accent color via CSS
// (inline styles can't express :focus).
const FOCUS_CSS =
  '.disc-input:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,0.18);}';

const fieldStyle = {
  height: 32,
  fontSize: 13,
  padding: '0 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  boxSizing: 'border-box',
  background: '#fff',
  color: '#111827',
};

const fieldLabelStyle = {
  fontSize: 11,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: 600,
  marginBottom: 4,
};

const unitStyle = { fontSize: 13, color: '#6b7280' };

const labelRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 6,
};

const counterStyle = { fontSize: 11, color: '#9ca3af' };

const helperStyle = { fontSize: 11, color: '#9ca3af', marginTop: 4 };

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
    <div style={{ ...DS.page, maxWidth: 720 }}>
      <style>{FOCUS_CSS}</style>
      <PageHeader
        title="Discounts"
        subtitle="Configure discount rules for popup capture"
      />

      {loading ? (
        <div style={{ fontSize: '13px', color: '#9ca3af' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Popup headline */}
          <div style={{ ...DS.card, marginBottom: 0 }}>
            <div style={{ maxWidth: 560 }}>
              <div style={labelRowStyle}>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#111827',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Icons.Type size={20} />
                  Popup headline
                </span>
                <span style={counterStyle}>{headline.length} / {HEADLINE_MAX}</span>
              </div>
              <input
                className="disc-input"
                value={headline}
                maxLength={HEADLINE_MAX}
                onChange={(e) => setConfig((c) => ({ ...c, offerHeadline: e.target.value }))}
                placeholder="Get a discount on your first order!"
                style={{ ...fieldStyle, height: 36, width: '100%' }}
              />
              <div style={helperStyle}>
                The main heading shown at the top of the popup.
              </div>
            </div>
          </div>

          {DISCOUNT_ITEMS.map((item) => {
            const d = config[item.key] || {};
            const pctValue = d.percentage ?? item.defaults.percentage;
            const effectivePct = clampPct(pctValue, item.defaults.percentage);
            const expiryShown = d.expiryDays || item.defaults.expiryDays;
            const offerText = d.offerText || '';

            return (
              <div key={item.key} style={{ ...DS.card, marginBottom: 0 }}>
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: d.enabled ? 16 : 0,
                  }}
                >
                  {/* Toggle */}
                  <div
                    onClick={() => updateRule(item.key, { enabled: !d.enabled })}
                    style={{
                      width: '36px',
                      height: '20px',
                      borderRadius: '10px',
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
                        top: '2px',
                        left: d.enabled ? '18px' : '2px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                    />
                  </div>
                  <span style={{ display: 'inline-flex', color: '#4f46e5' }}>
                    <item.Icon size={20} />
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                    {item.label}
                  </div>
                  <div style={{ flex: 1 }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 999,
                      whiteSpace: 'nowrap',
                      background: d.enabled ? DS.successLight : DS.gray100,
                      color: d.enabled ? DS.success : DS.gray400,
                    }}
                  >
                    {d.enabled ? `${effectivePct}% · ${expiryShown} days` : 'Off'}
                  </span>
                </div>

                {/* Body (shown when enabled) */}
                {d.enabled && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                      {/* Percentage */}
                      <div>
                        <div style={fieldLabelStyle}>Discount</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            className="disc-input"
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
                            style={{ ...fieldStyle, width: 64 }}
                          />
                          <span style={unitStyle}>%</span>
                        </div>
                      </div>

                      {/* Max uses */}
                      <div>
                        <div style={fieldLabelStyle}>Max uses</div>
                        <input
                          className="disc-input"
                          type="number"
                          min="1"
                          max="10000"
                          value={d.maxUses || item.defaults.maxUses}
                          onChange={(e) => updateRule(item.key, { maxUses: Number(e.target.value) })}
                          style={{ ...fieldStyle, width: 88 }}
                        />
                      </div>

                      {/* Expiry days */}
                      <div>
                        <div style={fieldLabelStyle}>Expires</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            className="disc-input"
                            type="number"
                            min="1"
                            max="365"
                            value={d.expiryDays || item.defaults.expiryDays}
                            onChange={(e) => updateRule(item.key, { expiryDays: Number(e.target.value) })}
                            style={{ ...fieldStyle, width: 64 }}
                          />
                          <span style={unitStyle}>days</span>
                        </div>
                      </div>

                      {/* Code prefix */}
                      <div>
                        <div style={fieldLabelStyle}>Code prefix</div>
                        <input
                          className="disc-input"
                          type="text"
                          maxLength="10"
                          value={d.prefix || ''}
                          onChange={(e) => updateRule(item.key, { prefix: e.target.value.toUpperCase() })}
                          style={{ ...fieldStyle, width: 120, fontFamily: 'monospace' }}
                        />
                      </div>
                    </div>

                    {/* Offer text — full width, 16px below the fields */}
                    <div style={{ marginTop: 16 }}>
                      <div style={labelRowStyle}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                          Offer text
                        </span>
                        <span style={counterStyle}>{offerText.length} / {OFFER_TEXT_MAX}</span>
                      </div>
                      <input
                        className="disc-input"
                        type="text"
                        value={offerText}
                        maxLength={OFFER_TEXT_MAX}
                        onChange={(e) => updateRule(item.key, { offerText: e.target.value })}
                        placeholder={item.autoText(effectivePct)}
                        style={{ ...fieldStyle, width: '100%' }}
                      />
                      <div style={helperStyle}>Leave blank to use the automatic text.</div>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Save button — right aligned, status text to its left */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            {success && (
              <span
                style={{
                  fontSize: '13px',
                  color: DS.success,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Icons.Check size={16} />
                Saved
              </span>
            )}
            {error && <span style={{ fontSize: '13px', color: DS.danger }}>{error}</span>}
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
          </div>
        </div>
      )}
    </div>
  );
}
