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

// ─── Banner colour helpers (mirrors backend/utils/bannerColors.js) ────────────
const BN_PRESETS = [
  { name: 'Indigo',     hex: '#3730A3' },
  { name: 'Charcoal',   hex: '#171A22' },
  { name: 'Forest',     hex: '#0F5132' },
  { name: 'Terracotta', hex: '#B4472B' },
  { name: 'Gold',       hex: '#F5C542' },
];
function bnLuminance(hex) {
  const raw = String(hex || '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return 0;
  const [r, g, b] = [0,2,4].map(i => parseInt(raw.slice(i,i+2),16)/255);
  const lin = c => c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
}
function bnContrast(a, b) {
  const [la, lb] = [bnLuminance(a), bnLuminance(b)];
  return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05);
}
function resolveBannerColors(cfg) {
  const rawBg = String((cfg && cfg.bgColor) || '').trim();
  const bg = /^#[0-9a-fA-F]{6}$/.test(rawBg) ? rawBg : '#3730A3';
  const mode = (cfg && cfg.textColor) || 'auto';
  const fg = mode === 'white' ? '#FFFFFF'
           : mode === 'dark'  ? '#171A22'
           : (bnContrast(bg,'#FFFFFF') >= 4.5 ? '#FFFFFF' : '#171A22');
  const ctaBg = fg === '#FFFFFF' ? '#FFFFFF' : '#171A22';
  const ctaFg = fg === '#FFFFFF' ? bg : '#FFFFFF';
  let hl;
  if (fg === '#FFFFFF') {
    hl = '#FFE08A';
  } else {
    const fgR = 0x17, fgG = 0x1A, fgB = 0x22;
    const bgR = parseInt(bg.slice(1,3),16), bgG = parseInt(bg.slice(3,5),16), bgB = parseInt(bg.slice(5,7),16);
    const hlR = Math.round(fgR*0.65+bgR*0.35), hlG = Math.round(fgG*0.65+bgG*0.35), hlB = Math.round(fgB*0.65+bgB*0.35);
    hl = '#'+('00'+hlR.toString(16)).slice(-2)+('00'+hlG.toString(16)).slice(-2)+('00'+hlB.toString(16)).slice(-2);
  }
  return { bg, fg, ctaBg, ctaFg, hl, lowContrast: bnContrast(bg,fg) < 4.5 };
}

// ─── Banner preview component ─────────────────────────────────────────────────
function BannerPreview({ banner, pct }) {
  const colors = resolveBannerColors(banner);
  const text = banner.text || ('Tell us your birthday and get ' + (pct || 15) + '% off everything');
  const btnText = banner.buttonText || 'Get my gift';
  const highlight = banner.highlight !== false;

  const shineStrong = bnContrast(colors.bg, '#FFFFFF') < 2;
  const previewCss = `
    .ccf-bn-shine{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;}
    .ccf-bn-shine::before{content:"";position:absolute;top:0;bottom:0;width:45%;background:linear-gradient(100deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.34) 50%,rgba(255,255,255,0) 100%);transform:translateX(-120%) skewX(-18deg);animation:ccf-bn-sweep 3.8s ease-in-out infinite;}
    .ccf-bn-bar-ss .ccf-bn-shine::before{background:linear-gradient(100deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.55) 50%,rgba(255,255,255,0) 100%);}
    @keyframes ccf-bn-sweep{0%{transform:translateX(-120%) skewX(-18deg);}55%{transform:translateX(320%) skewX(-18deg);}100%{transform:translateX(320%) skewX(-18deg);}}
    @media (prefers-reduced-motion: reduce) { .ccf-bn-shine { display: none; } }
    @supports ((-webkit-background-clip: text) or (background-clip: text)) {
      .ccf-bn-txt-on {
        background-image: linear-gradient(100deg, var(--ccf-bn-fg) 0%, var(--ccf-bn-fg) 36%, var(--ccf-bn-hl, #FFE08A) 50%, var(--ccf-bn-fg) 64%, var(--ccf-bn-fg) 100%);
        background-size: 300% 100%;
        background-position: 100% 0;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
        animation: ccf-bn-txtsweep 3.8s ease-in-out infinite;
      }
      @keyframes ccf-bn-txtsweep {
        0%   { background-position: 100% 0; }
        55%  { background-position: 0% 0; }
        100% { background-position: 0% 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ccf-bn-txt-on { animation: none; background-image: none; -webkit-text-fill-color: currentColor; color: inherit; }
      }
    }
  `;
  const lblStyle = { fontSize: 11, color: DS.gray400, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
  const barCssProps = { '--ccf-bn-fg': colors.fg, '--ccf-bn-hl': colors.hl };
  const txtCls = highlight ? 'ccf-bn-text ccf-bn-txt-on' : 'ccf-bn-text';
  const barExtraCls = shineStrong ? ' ccf-bn-bar-ss' : '';

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <style>{previewCss}</style>
      {/* desktop strip */}
      <div style={{ flex: '1 1 280px' }}>
        <div style={lblStyle}>Desktop</div>
        <div className={'ccf-bn-preview-bar' + barExtraCls} style={{ position: 'relative', overflow: 'hidden', background: colors.bg, color: colors.fg, borderRadius: 8, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 44px 0 12px', ...barCssProps }}>
          {highlight && <div className="ccf-bn-shine" aria-hidden="true" />}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className={txtCls} style={{ fontSize: 14, fontWeight: 600 }}>{text}</span>
            <button type="button" style={{ height: 30, padding: '0 16px', fontSize: 13, fontWeight: 800, borderRadius: 999, border: 'none', background: colors.ctaBg, color: colors.ctaFg, cursor: 'default', whiteSpace: 'nowrap', flexShrink: 0 }}>{btnText}</button>
          </div>
          <span style={{ position: 'absolute', right: 8, top: 0, bottom: 0, zIndex: 2, display: 'flex', alignItems: 'center', color: colors.fg, fontSize: 16, opacity: 0.7 }}>✕</span>
        </div>
      </div>
      {/* phone strip (340px) */}
      <div style={{ width: 340, flexShrink: 0 }}>
        <div style={lblStyle}>Phone (340px)</div>
        <div className={'ccf-bn-preview-bar' + barExtraCls} style={{ position: 'relative', overflow: 'hidden', background: colors.bg, color: colors.fg, borderRadius: 8, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 40px 6px 10px', flexWrap: 'wrap', ...barCssProps }}>
          {highlight && <div className="ccf-bn-shine" aria-hidden="true" />}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className={txtCls} style={{ fontSize: 12.5, fontWeight: 600 }}>{text}</span>
            <button type="button" style={{ height: 32, padding: '0 14px', fontSize: 13, fontWeight: 800, borderRadius: 999, border: 'none', background: colors.ctaBg, color: colors.ctaFg, cursor: 'default', whiteSpace: 'nowrap', flexShrink: 0 }}>{btnText}</button>
          </div>
          <span style={{ position: 'absolute', right: 6, top: 0, bottom: 0, zIndex: 2, display: 'flex', alignItems: 'center', color: colors.fg, fontSize: 14, opacity: 0.7 }}>✕</span>
        </div>
      </div>
    </div>
  );
}

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
  const PC_KEYS = ['emailPlaceholder','captureButton','subscribedTitle','subscribedSub',
    'unlockedTitle','unlockedSub','bdSub','bdButton','bdSkip','bdOkTitle','bdOkSub'];
  const pc = config.popupCopy || {};
  out.popupCopy = {};
  for (const k of PC_KEYS) out.popupCopy[k] = (pc[k] || '').trim();
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
      bgColor: /^#[0-9a-fA-F]{6}$/.test(bn.bgColor || '') ? bn.bgColor : '#3730A3',
      textColor: ['auto', 'white', 'dark'].includes(bn.textColor) ? bn.textColor : 'auto',
      highlight: bn.highlight !== false,
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

// WCAG fgOn: same formula as ccf-push.js fgOn and bannerColors.js.
function fgOn(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return '#FFFFFF';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (1.05 / (L + 0.05)) >= 4.5 ? '#FFFFFF' : '#171A22';
}

const PREVIEW_TABS = ['Discount box', 'Subscribed', 'Offer unlocked', 'Birthday step'];

export default function Discounts({ shop }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [previewColors, setPreviewColors] = useState({ accentColor: '#4f46e5', bgColor: '#ffffff' });
  const [previewTab, setPreviewTab] = useState(0);

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

  // Fetch popup accentColor + bgColor for the live preview. Best-effort — falls back
  // to defaults if the request fails or the admin is not yet connected.
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    apiGet(`/api/profiles/${encodeURIComponent(shop)}/popup`)
      .then((data) => {
        if (cancelled) return;
        const p = data?.popup || {};
        setPreviewColors({
          accentColor: /^#[0-9a-fA-F]{6}$/.test(p.accentColor || '') ? p.accentColor : '#4f46e5',
          bgColor: /^#[0-9a-fA-F]{6}$/.test(p.bgColor || '') ? p.bgColor : '#ffffff',
        });
      })
      .catch(() => {}); // silent — preview uses defaults
    return () => { cancelled = true; };
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
                  Discount box heading (inside the popup)
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
                The main heading shown at the top of the discount box. The popup headline and Allow / No thanks buttons are in Settings &rarr; Popup.
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
              {(() => {
                const bn = config.birthdayCapture?.banner || {};
                const bannerEnabled = !!bn.enabled;
                const setBn = (patch) => setConfig((c) => ({
                  ...c,
                  birthdayCapture: { ...(c.birthdayCapture || {}), banner: { ...(c.birthdayCapture?.banner || {}), ...patch } },
                }));
                const colors = resolveBannerColors(bn);
                const rawHex = bn.bgColor || '#3730A3';
                const hexValid = /^#[0-9a-fA-F]{6}$/.test(rawHex);
                return (
                  <div>
                    {/* Controls — only when banner enabled */}
                    {bannerEnabled && (
                      <div style={{ borderTop: `1px solid ${DS.gray200}`, marginTop: 12, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Banner text */}
                        <div>
                          <div style={fieldLabelStyle}>Banner text</div>
                          <input
                            className="disc-input"
                            type="text"
                            value={bn.text || ''}
                            maxLength={120}
                            placeholder={`Tell us your birthday and get ${config.birthdayDiscount?.percentage ?? 15}% off everything`}
                            onChange={(e) => setBn({ text: e.target.value })}
                            style={{ ...fieldStyle, width: '100%' }}
                          />
                        </div>
                        {/* Button text + dismiss days */}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={fieldLabelStyle}>Button text</div>
                            <input
                              className="disc-input"
                              type="text"
                              value={bn.buttonText || 'Get my gift'}
                              maxLength={40}
                              onChange={(e) => setBn({ buttonText: e.target.value })}
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
                                value={bn.dismissDays ?? 7}
                                onChange={(e) => setBn({ dismissDays: e.target.value })}
                                style={{ ...fieldStyle, width: 60 }}
                              />
                              <span style={unitStyle}>days</span>
                            </div>
                          </div>
                        </div>
                        {/* 3-column: Background colour / Text colour / Highlight effect */}
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          {/* Column 1: Background colour */}
                          <div style={{ flex: '1 1 200px' }}>
                            <div style={fieldLabelStyle}>Background colour</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                              {BN_PRESETS.map((p) => {
                                const selected = bn.bgColor === p.hex;
                                return (
                                  <button
                                    key={p.hex}
                                    type="button"
                                    aria-pressed={selected}
                                    aria-label={p.name}
                                    onClick={() => setBn({ bgColor: p.hex })}
                                    style={{
                                      width: 44, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer',
                                      background: p.hex, flexShrink: 0,
                                      outline: selected ? `2px solid ${DS.primary}` : 'none',
                                      outlineOffset: selected ? 2 : 0,
                                      boxShadow: selected ? `0 0 0 3px #fff, 0 0 0 5px ${DS.primary}` : '0 1px 3px rgba(0,0,0,0.18)',
                                    }}
                                  />
                                );
                              })}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 6, background: hexValid ? rawHex : '#3730A3', border: '1px solid #e5e7eb', flexShrink: 0 }} />
                              <input
                                className="disc-input"
                                type="text"
                                value={rawHex}
                                maxLength={7}
                                placeholder="#3730A3"
                                onChange={(e) => setBn({ bgColor: e.target.value })}
                                style={{ ...fieldStyle, width: 100, fontFamily: 'monospace' }}
                              />
                              <input
                                type="color"
                                value={hexValid ? rawHex : '#3730A3'}
                                onChange={(e) => setBn({ bgColor: e.target.value })}
                                style={{ width: 36, height: 28, borderRadius: 4, border: '1px solid #e5e7eb', cursor: 'pointer', padding: 2 }}
                                aria-label="Pick custom colour"
                              />
                              {!hexValid && (
                                <span style={{ fontSize: 12, color: DS.danger }}>Must be #RRGGBB</span>
                              )}
                            </div>
                          </div>
                          {/* Column 2: Text colour */}
                          <div style={{ flex: '0 0 auto' }}>
                            <div style={fieldLabelStyle}>Text colour</div>
                            <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${DS.gray200}`, width: 'fit-content' }}>
                              {['auto', 'white', 'dark'].map((mode, i) => {
                                const pressed = (bn.textColor || 'auto') === mode;
                                return (
                                  <button
                                    key={mode}
                                    type="button"
                                    aria-pressed={pressed}
                                    onClick={() => setBn({ textColor: mode })}
                                    style={{
                                      padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                                      borderLeft: i > 0 ? `1px solid ${DS.gray200}` : 'none',
                                      background: pressed ? DS.primary : '#fff',
                                      color: pressed ? '#fff' : DS.gray600,
                                      transition: 'background 0.15s, color 0.15s',
                                    }}
                                  >
                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ fontSize: 12, color: DS.gray400, marginTop: 4 }}>Auto picks white or dark for best contrast.</div>
                          </div>
                          {/* Column 3: Highlight effect */}
                          <div style={{ flex: '0 0 auto', maxWidth: 200 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: DS.gray900, marginBottom: 4 }}>Highlight effect</div>
                            <div style={{ fontSize: 12, color: DS.gray400, lineHeight: 1.45, marginBottom: 8 }}>A soft light sweeps across the banner and lights up the letters as it passes. It pauses for visitors who turned on reduced motion.</div>
                            <div
                              role="switch"
                              aria-checked={bn.highlight !== false}
                              tabIndex={0}
                              onClick={() => setBn({ highlight: bn.highlight === false ? true : false })}
                              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setBn({ highlight: bn.highlight === false ? true : false }); } }}
                              style={{ width: 36, height: 20, borderRadius: 10, cursor: 'pointer', background: bn.highlight !== false ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                            >
                              <div style={{ position: 'absolute', top: 2, left: bn.highlight !== false ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                            </div>
                          </div>
                        </div>
                        {/* Low-contrast warning */}
                        {colors.lowContrast && (
                          <div style={{ background: DS.warningLight, border: `1px solid #fbbf24`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                            ⚠ Low contrast — the text may be hard to read on this background. Try a darker or lighter colour, or switch text colour to Auto.
                          </div>
                        )}
                      </div>
                    )}
                    {/* Preview — always visible, reduced opacity when off */}
                    <div style={{ borderTop: `1px solid ${DS.gray200}`, marginTop: 12, paddingTop: 12 }}>
                      <div style={fieldLabelStyle}>Preview</div>
                      <div style={{ position: 'relative', opacity: bannerEnabled ? 1 : 0.45 }}>
                        {!bannerEnabled && (
                          <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <span style={{ fontSize: 12, color: '#4b5563', fontWeight: 600, background: 'rgba(249,250,251,0.85)', padding: '4px 12px', borderRadius: 6 }}>Banner is off</span>
                          </div>
                        )}
                        <BannerPreview banner={bn} pct={config.birthdayDiscount?.percentage} />
                      </div>
                    </div>
                  </div>
                );
              })()}
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

          {/* Entry popup wording */}
          {(() => {
            const pc = config.popupCopy || {};
            function setPc(patch) {
              setConfig((c) => ({ ...c, popupCopy: { ...(c.popupCopy || {}), ...patch } }));
            }
            const PC_MAX = {
              emailPlaceholder:40, captureButton:50, subscribedTitle:40, subscribedSub:60,
              unlockedTitle:40, unlockedSub:60, bdSub:120, bdButton:30, bdSkip:30,
              bdOkTitle:40, bdOkSub:120,
            };
            function CopyField({ label, fieldKey, placeholder, helper }) {
              const val = pc[fieldKey] || '';
              const max = PC_MAX[fieldKey];
              return (
                <div style={{ marginBottom: 12 }}>
                  <div style={labelRowStyle}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>
                    <span style={counterStyle}>{val.length} / {max}</span>
                  </div>
                  <input
                    className="disc-input"
                    type="text"
                    value={val}
                    maxLength={max}
                    placeholder={placeholder}
                    onChange={(e) => setPc({ [fieldKey]: e.target.value })}
                    style={{ ...fieldStyle, height: 34, width: '100%' }}
                  />
                  {helper && <div style={helperStyle}>{helper}</div>}
                </div>
              );
            }
            const groupHeadStyle = { fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: 4 };
            return (
              <div style={{ ...DS.card, marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Entry popup wording</div>
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, popupCopy: {} }))}
                    style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  >
                    Reset to default wording
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
                  Leave a field blank to use the default. Tokens: <code style={{ background: '#f3f4f6', borderRadius: 4, padding: '1px 4px' }}>{'{pct}'}</code> = discount %, <code style={{ background: '#f3f4f6', borderRadius: 4, padding: '1px 4px' }}>{'{days}'}</code> = days.
                </div>

                <div style={groupHeadStyle}>Discount box</div>
                <CopyField fieldKey="emailPlaceholder" label="Email placeholder" placeholder="Your email" helper="The email input hint. The '(get N% off)' suffix is added automatically." />
                <CopyField fieldKey="captureButton" label="'Get my offer' button" placeholder="Get my offer without notifications" helper="Shown when the visitor skips notifications but leaves an email." />

                <div style={{ ...groupHeadStyle, marginTop: 16 }}>After subscribing</div>
                <CopyField fieldKey="subscribedTitle" label="Title" placeholder="Subscribed!" />
                <CopyField fieldKey="subscribedSub" label="Sub-text" placeholder="Getting your discount…" />

                <div style={{ ...groupHeadStyle, marginTop: 16 }}>Offer unlocked</div>
                <CopyField fieldKey="unlockedTitle" label="Title" placeholder="15% OFF Unlocked!" helper="Use {pct} for the discount percentage." />
                <CopyField fieldKey="unlockedSub" label="Sub-text" placeholder="Expires in 7 days" helper="Use {days} for the expiry days." />

                <div style={{ ...groupHeadStyle, marginTop: 16 }}>Birthday step</div>
                <CopyField fieldKey="bdSub" label="Birthday ask sub-text" placeholder="Tell us your birthday. We will send your personal code {days} days before." helper="Use {days} for lead days. Leave blank to use the default." />
                <CopyField fieldKey="bdButton" label="Submit button" placeholder="Send me my gift" />
                <CopyField fieldKey="bdSkip" label="Skip link" placeholder="No thanks" />
                <CopyField fieldKey="bdOkTitle" label="Saved title" placeholder="You're all set" />
                <CopyField fieldKey="bdOkSub" label="Saved sub-text" placeholder="We'll send your gift code {days} days before your birthday." helper="Use {days} for lead days." />

                {/* Live preview with 4 tabs */}
                {(() => {
                  const accent = previewColors.accentColor;
                  const bg     = previewColors.bgColor;
                  const isBgDefault = /^#fff(fff)?$/i.test(bg);
                  const cardBg = isBgDefault ? 'linear-gradient(145deg,#ffffff,#f8f9ff)' : bg;
                  const cardDark = !isBgDefault && (fgOn(bg) === '#FFFFFF');
                  const fgText   = cardDark ? '#ffffff' : '#111827';
                  const fgSub    = cardDark ? 'rgba(255,255,255,0.70)' : '#6b7280';
                  const btnFg    = fgOn(accent);
                  const samplePct  = config.emailDiscount?.percentage || config.pushDiscount?.percentage || 15;
                  const sampleDays = config.emailDiscount?.expiryDays || 7;
                  const bdLeadDays = config.birthdayDiscount?.leadDays ?? 3;

                  function copyVal(key, fallback, vars = {}) {
                    const raw = (pc[key] || '').trim();
                    let text = raw || fallback;
                    if (vars.pct !== undefined) text = text.split('{pct}').join(String(vars.pct));
                    if (vars.days !== undefined) text = text.split('{days}').join(String(vars.days));
                    return text;
                  }

                  const tabs = [
                    () => (
                      <div>
                        <div style={{ fontSize: 12, color: fgSub, marginBottom: 8, textAlign: 'center' }}>
                          {(config.offerHeadline || '') || 'Get a discount on your first order!'}
                        </div>
                        <div style={{ background: cardDark ? 'rgba(255,255,255,0.10)' : '#f9fafb', border: `1px solid ${cardDark ? 'rgba(255,255,255,0.22)' : '#e5e7eb'}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, color: cardDark ? '#ffffff' : '#111827', marginBottom: 8 }}>
                          {copyVal('emailPlaceholder', 'Your email', {})}
                          <span style={{ color: fgSub }}>{samplePct ? ` (get ${samplePct}% off)` : ''}</span>
                        </div>
                        <div style={{ background: accent, borderRadius: 10, padding: '9px 0', textAlign: 'center', fontSize: 13, fontWeight: 700, color: btnFg }}>
                          Allow
                        </div>
                        <div style={{ marginTop: 6, padding: '7px 0', textAlign: 'center', fontSize: 12, color: cardDark ? 'rgba(255,255,255,0.55)' : '#9ca3af', borderTop: `1px solid ${cardDark ? 'rgba(255,255,255,0.12)' : '#f0f0f0'}` }}>
                          {copyVal('captureButton', 'Get my offer without notifications', {})}
                        </div>
                      </div>
                    ),
                    () => (
                      <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: fgText, marginBottom: 4 }}>
                          {copyVal('subscribedTitle', 'Subscribed!', {})}
                        </div>
                        <div style={{ fontSize: 12, color: fgSub }}>
                          {copyVal('subscribedSub', 'Getting your discount…', {})}
                        </div>
                      </div>
                    ),
                    () => (
                      <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: fgText, marginBottom: 2 }}>
                          {copyVal('unlockedTitle', `${samplePct}% OFF Unlocked!`, { pct: samplePct })}
                        </div>
                        <div style={{ fontSize: 11, color: fgSub }}>
                          {copyVal('unlockedSub', `Expires in ${sampleDays} days`, { days: sampleDays })}
                        </div>
                      </div>
                    ),
                    () => {
                      const bdSubFallback = bdLeadDays
                        ? `Tell us your birthday. We will send your personal code ${bdLeadDays} days before.`
                        : 'Tell us your birthday. We will send your personal code a few days before.';
                      const bdOkSubFallback = bdLeadDays
                        ? `We’ll send your gift code ${bdLeadDays} days before your birthday.`
                        : 'We’ll send your gift code a few days before your birthday.';
                      return (
                        <div>
                          <div style={{ fontSize: 12, color: fgSub, marginBottom: 10, lineHeight: 1.4 }}>
                            {copyVal('bdSub', bdSubFallback, bdLeadDays ? { days: bdLeadDays } : {})}
                          </div>
                          <div style={{ background: accent, borderRadius: 10, padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: btnFg, marginBottom: 6 }}>
                            {copyVal('bdButton', 'Send me my gift', {})}
                          </div>
                          <div style={{ textAlign: 'center', fontSize: 11, color: fgSub }}>
                            {copyVal('bdSkip', 'No thanks', {})}
                          </div>
                        </div>
                      );
                    },
                  ];

                  return (
                    <div style={{ borderTop: `1px solid ${DS.gray200}`, marginTop: 20, paddingTop: 16 }}>
                      <div style={fieldLabelStyle}>Live preview</div>
                      {/* Tab row */}
                      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                        {PREVIEW_TABS.map((label, i) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setPreviewTab(i)}
                            style={{
                              fontSize: 11, padding: '4px 10px', borderRadius: 6,
                              border: `1px solid ${previewTab === i ? accent : '#e5e7eb'}`,
                              background: previewTab === i ? accent + '18' : 'transparent',
                              color: previewTab === i ? accent : '#6b7280',
                              cursor: 'pointer', fontWeight: previewTab === i ? 700 : 400,
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {/* Preview card */}
                      <div style={{ background: cardBg, borderRadius: 14, padding: '16px 18px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', maxWidth: 300, margin: '0 auto' }}>
                        <div style={{ height: 3, background: `linear-gradient(90deg,${accent},${accent}88,transparent)`, borderRadius: 2, marginBottom: 12, marginInline: -18, marginTop: -16 }} />
                        {tabs[previewTab]?.()}
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>
                        Uses your current popup accent and background colours.
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

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
