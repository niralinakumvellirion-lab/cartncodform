'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiSend } from '../../../lib/api';
import QuantityTiers from './QuantityTiers';

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
  out.whatsappCapture = { enabled: !!(config.whatsappCapture && config.whatsappCapture.enabled) };
  const bcap = config.birthdayCapture || {};
  const bn = bcap.banner || {};
  const bnDismiss = Math.min(30, Math.max(1, Math.round(Number(bn.dismissDays ?? 7)) || 7));
  out.birthdayCapture = {
    popup: { enabled: !!(bcap.popup?.enabled) },
    postOrder: { enabled: !!(bcap.postOrder?.enabled) },
    banner: {
      enabled: !!(bn.enabled),
      text: (bn.text || '').trim().slice(0, 120),
      buttonText: (bn.buttonText || 'Get my gift').trim().slice(0, 40) || 'Get my gift',
      dismissDays: bnDismiss,
    },
  };
  const bd = config.birthdayDiscount || {};
  const bdPct = Number(bd.percentage ?? 15);
  const bdDays = Number(bd.expiryDays ?? 7);
  const bdLead = Number(bd.leadDays ?? 3);
  out.birthdayDiscount = {
    enabled: !!(bd.enabled),
    percentage: Number.isFinite(bdPct) ? Math.min(100, Math.max(0, bdPct)) : 15,
    expiryDays: Number.isFinite(bdDays) ? Math.min(30, Math.max(1, Math.round(bdDays))) : 7,
    leadDays: Number.isFinite(bdLead) ? Math.min(7, Math.max(0, Math.round(bdLead))) : 3,
    prefix: (String(bd.prefix || 'BDAY').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)) || 'BDAY',
    offerText: (bd.offerText || '').slice(0, OFFER_TEXT_MAX),
    consentText: (bd.consentText || '').slice(0, 200),
  };
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
                      marginLeft: '2px',
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

          {/* WhatsApp number capture toggle */}
          <div style={{ ...DS.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Svg size={20} style={{ color: '#16a34a', flexShrink: 0 }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </Svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: DS.gray900 }}>
                  Collect WhatsApp number in the popup
                </div>
                <div style={{ fontSize: 12, color: DS.gray400, marginTop: 2, lineHeight: 1.5 }}>
                  Visitors can share their WhatsApp number and consent to messages. You message them yourself from the Profiles dashboard — nothing is sent automatically.
                </div>
              </div>
              <div
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    whatsappCapture: {
                      ...(c.whatsappCapture || {}),
                      enabled: !(c.whatsappCapture && c.whatsappCapture.enabled),
                    },
                  }))
                }
                style={{
                  width: '36px',
                  height: '20px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background:
                    config.whatsappCapture && config.whatsappCapture.enabled
                      ? '#16a34a'
                      : '#d1d5db',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                  marginLeft: '2px',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left:
                      config.whatsappCapture && config.whatsappCapture.enabled ? '18px' : '2px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Birthday collection methods */}
          <div style={{ ...DS.card, marginBottom: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: DS.gray900, marginBottom: 4 }}>
              How do you collect birthdays?
            </div>
            <div style={{ fontSize: 12, color: DS.gray400, marginBottom: 16 }}>
              Enable the methods you want to use. Day and month only — year is never collected.
            </div>

            {/* Method 1: Sign-in / registration — not supported without customer accounts */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${DS.gray200}`, opacity: 0.5 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: DS.gray900 }}>Sign-in and registration form</div>
                <div style={{ fontSize: 12, color: DS.gray400, marginTop: 2 }}>Collects birthday when a customer creates an account.</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: DS.warning, background: DS.warningLight, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                Needs customer accounts
              </span>
              <div
                role="switch"
                aria-checked="false"
                aria-disabled="true"
                style={{ width: 36, height: 20, borderRadius: 10, background: '#d1d5db', position: 'relative', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 2, left: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </div>

            {/* Method 2: Entry popup */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${DS.gray200}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: DS.gray900 }}>Entry popup</div>
                <div style={{ fontSize: 12, color: DS.gray400, marginTop: 2 }}>Shows a birthday step after the subscriber or email capture step.</div>
              </div>
              <div
                role="switch"
                aria-checked={!!(config.birthdayCapture?.popup?.enabled)}
                tabIndex={0}
                onClick={() => setConfig((c) => ({
                  ...c,
                  birthdayCapture: { ...(c.birthdayCapture || {}), popup: { enabled: !(c.birthdayCapture?.popup?.enabled) } },
                }))}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setConfig((c) => ({ ...c, birthdayCapture: { ...(c.birthdayCapture || {}), popup: { enabled: !(c.birthdayCapture?.popup?.enabled) } } })); } }}
                style={{ width: 36, height: 20, borderRadius: 10, cursor: 'pointer', background: config.birthdayCapture?.popup?.enabled ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 2, left: config.birthdayCapture?.popup?.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </div>

            {/* Method 3: After first order */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${DS.gray200}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: DS.gray900 }}>After the first order</div>
                <div style={{ fontSize: 12, color: DS.gray400, marginTop: 2 }}>Shows a compact birthday ask on the COD order success screen.</div>
              </div>
              <div
                role="switch"
                aria-checked={!!(config.birthdayCapture?.postOrder?.enabled)}
                tabIndex={0}
                onClick={() => setConfig((c) => ({
                  ...c,
                  birthdayCapture: { ...(c.birthdayCapture || {}), postOrder: { enabled: !(c.birthdayCapture?.postOrder?.enabled) } },
                }))}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setConfig((c) => ({ ...c, birthdayCapture: { ...(c.birthdayCapture || {}), postOrder: { enabled: !(c.birthdayCapture?.postOrder?.enabled) } } })); } }}
                style={{ width: 36, height: 20, borderRadius: 10, cursor: 'pointer', background: config.birthdayCapture?.postOrder?.enabled ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 2, left: config.birthdayCapture?.postOrder?.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </div>

            {/* Method 4: Top announcement banner */}
            <div style={{ padding: '12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: DS.gray900 }}>Top announcement banner</div>
                  <div style={{ fontSize: 12, color: DS.gray400, marginTop: 2 }}>A slim bar at the top of every storefront page. Dismissible.</div>
                </div>
                <div
                  role="switch"
                  aria-checked={!!(config.birthdayCapture?.banner?.enabled)}
                  tabIndex={0}
                  onClick={() => setConfig((c) => ({
                    ...c,
                    birthdayCapture: { ...(c.birthdayCapture || {}), banner: { ...(c.birthdayCapture?.banner || {}), enabled: !(c.birthdayCapture?.banner?.enabled) } },
                  }))}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setConfig((c) => ({ ...c, birthdayCapture: { ...(c.birthdayCapture || {}), banner: { ...(c.birthdayCapture?.banner || {}), enabled: !(c.birthdayCapture?.banner?.enabled) } } })); } }}
                  style={{ width: 36, height: 20, borderRadius: 10, cursor: 'pointer', background: config.birthdayCapture?.banner?.enabled ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                >
                  <div style={{ position: 'absolute', top: 2, left: config.birthdayCapture?.banner?.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
              {config.birthdayCapture?.banner?.enabled && (
                <div style={{ borderTop: `1px solid ${DS.gray200}`, marginTop: 12, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={fieldLabelStyle}>Banner text</div>
                    <input
                      className="disc-input"
                      type="text"
                      value={config.birthdayCapture?.banner?.text || ''}
                      maxLength={120}
                      placeholder={`Tell us your birthday and get ${config.birthdayDiscount?.percentage ?? 15}% off everything`}
                      onChange={(e) => setConfig((c) => ({ ...c, birthdayCapture: { ...(c.birthdayCapture || {}), banner: { ...(c.birthdayCapture?.banner || {}), text: e.target.value } } }))}
                      style={{ ...fieldStyle, width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={fieldLabelStyle}>Button text</div>
                      <input
                        className="disc-input"
                        type="text"
                        value={config.birthdayCapture?.banner?.buttonText || 'Get my gift'}
                        maxLength={40}
                        onChange={(e) => setConfig((c) => ({ ...c, birthdayCapture: { ...(c.birthdayCapture || {}), banner: { ...(c.birthdayCapture?.banner || {}), buttonText: e.target.value } } }))}
                        style={{ ...fieldStyle, width: '100%' }}
                      />
                    </div>
                    <div>
                      <div style={fieldLabelStyle}>Hide after dismiss</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          className="disc-input"
                          type="number"
                          min={1}
                          max={30}
                          value={config.birthdayCapture?.banner?.dismissDays ?? 7}
                          onChange={(e) => setConfig((c) => ({ ...c, birthdayCapture: { ...(c.birthdayCapture || {}), banner: { ...(c.birthdayCapture?.banner || {}), dismissDays: e.target.value } } }))}
                          style={{ ...fieldStyle, width: 60 }}
                        />
                        <span style={unitStyle}>days</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Birthday gift card */}
          <div style={{ ...DS.card, marginBottom: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: DS.gray900, marginBottom: 16 }}>The birthday gift</div>

            {/* Send birthday discount toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: DS.gray900 }}>Send birthday discount</div>
                <div style={{ fontSize: 12, color: DS.gray400, marginTop: 2, lineHeight: 1.4 }}>
                  {config.birthdayDiscount?.enabled
                    ? `Customers who shared their birthday get a personal code ${config.birthdayDiscount?.leadDays ?? 3} day(s) before. The code is valid for ${config.birthdayDiscount?.expiryDays ?? 7} days.`
                    : 'Enable to automatically send a personal discount code around each birthday.'}
                </div>
              </div>
              <div
                role="switch"
                aria-checked={!!(config.birthdayDiscount?.enabled)}
                tabIndex={0}
                onClick={() => setConfig((c) => ({ ...c, birthdayDiscount: { ...(c.birthdayDiscount || {}), enabled: !(c.birthdayDiscount?.enabled) } }))}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setConfig((c) => ({ ...c, birthdayDiscount: { ...(c.birthdayDiscount || {}), enabled: !(c.birthdayDiscount?.enabled) } })); } }}
                style={{ width: 36, height: 20, borderRadius: 10, cursor: 'pointer', background: config.birthdayDiscount?.enabled ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginLeft: 12 }}
              >
                <div style={{ position: 'absolute', top: 2, left: config.birthdayDiscount?.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </div>

            {config.birthdayDiscount?.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Offer text */}
                <div>
                  <div style={labelRowStyle}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Offer text</span>
                    <span style={counterStyle}>{(config.birthdayDiscount?.offerText || '').length} / {OFFER_TEXT_MAX}</span>
                  </div>
                  <input
                    className="disc-input"
                    type="text"
                    value={config.birthdayDiscount?.offerText || ''}
                    maxLength={OFFER_TEXT_MAX}
                    placeholder="Get a birthday gift"
                    onChange={(e) => setConfig((c) => ({ ...c, birthdayDiscount: { ...(c.birthdayDiscount || {}), offerText: e.target.value } }))}
                    style={{ ...fieldStyle, width: '100%' }}
                  />
                  <div style={helperStyle}>Shown as the heading in the birthday popup step.</div>
                </div>

                {/* Consent text */}
                <div>
                  <div style={labelRowStyle}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Consent line</span>
                    <span style={counterStyle}>{(config.birthdayDiscount?.consentText || '').length} / 200</span>
                  </div>
                  <input
                    className="disc-input"
                    type="text"
                    value={config.birthdayDiscount?.consentText || ''}
                    maxLength={200}
                    placeholder="We'll use your birthday only to send you a birthday offer."
                    onChange={(e) => setConfig((c) => ({ ...c, birthdayDiscount: { ...(c.birthdayDiscount || {}), consentText: e.target.value } }))}
                    style={{ ...fieldStyle, width: '100%' }}
                  />
                  <div style={helperStyle}>Shown under every birthday form (popup, banner, post-order).</div>
                </div>

                {/* Lead days, percentage, expiry, prefix */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={fieldLabelStyle}>Days before</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input className="disc-input" type="number" min={0} max={7}
                        value={config.birthdayDiscount?.leadDays ?? 3}
                        onChange={(e) => setConfig((c) => ({ ...c, birthdayDiscount: { ...(c.birthdayDiscount || {}), leadDays: e.target.value } }))}
                        style={{ ...fieldStyle, width: 60 }} />
                      <span style={unitStyle}>days</span>
                    </div>
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>Discount %</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input className="disc-input" type="number" min={0} max={100}
                        value={config.birthdayDiscount?.percentage ?? 15}
                        onChange={(e) => setConfig((c) => ({ ...c, birthdayDiscount: { ...(c.birthdayDiscount || {}), percentage: e.target.value } }))}
                        style={{ ...fieldStyle, width: 60 }} />
                      <span style={unitStyle}>%</span>
                    </div>
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>Valid for</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input className="disc-input" type="number" min={1} max={30}
                        value={config.birthdayDiscount?.expiryDays ?? 7}
                        onChange={(e) => setConfig((c) => ({ ...c, birthdayDiscount: { ...(c.birthdayDiscount || {}), expiryDays: e.target.value } }))}
                        style={{ ...fieldStyle, width: 60 }} />
                      <span style={unitStyle}>days</span>
                    </div>
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>Code prefix</div>
                    <input className="disc-input" type="text"
                      value={config.birthdayDiscount?.prefix ?? 'BDAY'}
                      maxLength={10}
                      onChange={(e) => setConfig((c) => ({ ...c, birthdayDiscount: { ...(c.birthdayDiscount || {}), prefix: e.target.value } }))}
                      style={{ ...fieldStyle, width: 90 }} />
                  </div>
                </div>
              </div>
            )}

            {/* Live preview */}
            <div style={{ background: DS.gray50, borderRadius: 10, padding: '12px 14px', marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: DS.gray400, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Preview</div>
              <div style={{ fontSize: 13, color: DS.gray900 }}>
                {config.birthdayDiscount?.enabled
                  ? `Customers who shared their birthday receive a ${config.birthdayDiscount?.percentage ?? 15}% off code ${config.birthdayDiscount?.leadDays ?? 3} day(s) before their birthday, valid for ${config.birthdayDiscount?.expiryDays ?? 7} days.`
                  : 'Birthday discount is off. Enable it above to automatically reward customers on their birthday.'}
              </div>
            </div>
          </div>

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

      {/* ── Quantity tiers section (self-contained, own save+sync) ── */}
      {!loading && (
        <QuantityTiers
          config={config}
          shopDomain={shop}
          onSaveComplete={(updatedConfig) => setConfig(updatedConfig)}
        />
      )}
    </div>
  );
}
