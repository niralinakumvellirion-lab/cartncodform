'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiSend } from '../../../lib/api';
import QuantityTiers from './QuantityTiers';
import { resolvePostOrderColors } from '../lib/postOrderColors';
import { resolveProductBoxColors } from '../lib/productBoxColors';

// ── Module-scope helpers shared by Method 3 and Method 4 panels ──────────────

const _HEX_RE = /^#[0-9a-fA-F]{6}$/;

function PoSwatchRow({ label, field, swatches, value, allowEmpty, emptyLabel, onPatch }) {
  const activeVal = value || '';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#171A22', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {allowEmpty && (
          <button type="button" onClick={() => onPatch({ [field]: '' })}
            style={{ height: 28, padding: '0 10px', fontSize: 11, fontWeight: activeVal === '' ? 700 : 500, borderRadius: 6, border: '1.5px solid ' + (activeVal === '' ? '#4f46e5' : '#D9D8FF'), background: activeVal === '' ? '#4f46e5' : '#fff', color: activeVal === '' ? '#fff' : '#6b7280', cursor: 'pointer' }}>
            {emptyLabel || 'None'}
          </button>
        )}
        {swatches.map(({ name, hex }) => {
          const active = activeVal === hex;
          return (
            <button key={hex} type="button" title={name} onClick={() => onPatch({ [field]: hex })}
              style={{ width: 24, height: 24, borderRadius: '50%', background: hex, border: active ? '3px solid #4f46e5' : '2px solid rgba(0,0,0,0.12)', cursor: 'pointer', flexShrink: 0 }} />
          );
        })}
        <input type="text" maxLength={7} placeholder="#4f46e5" value={activeVal}
          onChange={(e) => { const v = e.target.value; if (v === '' || _HEX_RE.test(v)) onPatch({ [field]: v }); }}
          style={{ width: 80, height: 28, padding: '0 8px', fontSize: 12, border: '1.5px solid #D9D8FF', borderRadius: 6, fontFamily: 'monospace' }} />
      </div>
    </div>
  );
}

function PoModeRow({ label, field, options, value, onPatch }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#171A22', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {options.map(({ val, lbl }) => {
          const active = (value || 'auto') === val;
          return (
            <button key={val} type="button" onClick={() => onPatch({ [field]: val })}
              style={{ height: 28, padding: '0 12px', fontSize: 12, fontWeight: active ? 700 : 500, borderRadius: 6, border: '1.5px solid ' + (active ? '#4f46e5' : '#D9D8FF'), background: active ? '#4f46e5' : '#fff', color: active ? '#fff' : '#6b7280', cursor: 'pointer' }}>
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PoCopyField({ fieldKey, label, placeholder, helper, value, maxLen, onPatch }) {
  const lblSt  = { fontSize: 13, fontWeight: 700, color: '#171A22' };
  const ctrSt  = { fontSize: '11.5px', color: '#9ca3af' };
  const helpSt = { fontSize: 12, color: '#5A6070', marginTop: 3 };
  const fieldInner = { height: 42, borderColor: '#AEB4C2', color: '#171A22', width: '100%', padding: '0 12px', border: '1.5px solid #AEB4C2', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={lblSt}>{label}</span>
        <span style={ctrSt}>{(value || '').length} / {maxLen}</span>
      </div>
      <input className="disc-input" type="text" value={value || ''} maxLength={maxLen} placeholder={placeholder}
        onChange={(e) => onPatch({ [fieldKey]: e.target.value })}
        style={fieldInner} />
      {helper && <div style={helpSt}>{helper}</div>}
    </div>
  );
}

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
  const pp = bcap.productPage || {};
  out.birthdayCapture = {
    popup: { enabled: !!(bcap.popup?.enabled) },
    postOrder: {
      enabled:        !!(bcap.postOrder?.enabled),
      copy: {
        pitch:  (bcap.postOrder?.copy?.pitch  || '').slice(0, 120),
        button: (bcap.postOrder?.copy?.button || '').slice(0, 30),
        skip:   (bcap.postOrder?.copy?.skip   || '').slice(0, 30),
        saved:  (bcap.postOrder?.copy?.saved  || '').slice(0, 80),
        error:  (bcap.postOrder?.copy?.error  || '').slice(0, 60),
      },
      accentColor:    /^#[0-9a-fA-F]{6}$/.test(bcap.postOrder?.accentColor || '') ? bcap.postOrder.accentColor : '',
      buttonTextMode: ['auto','white','dark'].includes(bcap.postOrder?.buttonTextMode) ? bcap.postOrder.buttonTextMode : 'auto',
      bgColor:        /^#[0-9a-fA-F]{6}$/.test(bcap.postOrder?.bgColor || '') ? bcap.postOrder.bgColor : '',
      textMode:       ['auto','white','dark'].includes(bcap.postOrder?.textMode) ? bcap.postOrder.textMode : 'auto',
    },
    banner: {
      enabled: !!(bn.enabled),
      text: (bn.text || '').trim().slice(0, 120),
      buttonText: (bn.buttonText || 'Get my gift').trim().slice(0, 40) || 'Get my gift',
      dismissDays: bnDismiss,
      bgColor: /^#[0-9a-fA-F]{6}$/.test(bn.bgColor || '') ? bn.bgColor : '#3730A3',
      textColor: ['auto', 'white', 'dark'].includes(bn.textColor) ? bn.textColor : 'auto',
      highlight: bn.highlight !== false,
    },
    productPage: {
      enabled:        !!(pp.enabled),
      copy: {
        heading:          (pp.copy?.heading          || '').slice(0, 60),
        sub:              (pp.copy?.sub              || '').slice(0, 120),
        emailPlaceholder: (pp.copy?.emailPlaceholder || '').slice(0, 40),
        consent:          (pp.copy?.consent          || '').slice(0, 80),
        button:           (pp.copy?.button           || '').slice(0, 30),
        skip:             (pp.copy?.skip             || '').slice(0, 30),
        saved:            (pp.copy?.saved            || '').slice(0, 80),
        error:            (pp.copy?.error            || '').slice(0, 60),
        emailError:       (pp.copy?.emailError       || '').slice(0, 60),
        unlockTitle:      (pp.copy?.unlockTitle      || '').slice(0, 60),
        openButton:       (pp.copy?.openButton       || '').slice(0, 30),
      },
      accentColor:    /^#[0-9a-fA-F]{6}$/.test(pp.accentColor    || '') ? pp.accentColor    : '',
      buttonTextMode: ['auto','white','dark'].includes(pp.buttonTextMode) ? pp.buttonTextMode : 'auto',
      bgColor:        /^#[0-9a-fA-F]{6}$/.test(pp.bgColor        || '') ? pp.bgColor        : '',
      textMode:       ['auto','white','dark'].includes(pp.textMode)       ? pp.textMode       : 'auto',
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
  '.disc-input:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,0.18);}' +
  '.disc-input::placeholder{color:#6B7280;}';

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



export default function Discounts({ shop }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [previewColors, setPreviewColors] = useState({ accentColor: '#4f46e5', bgColor: '#ffffff', textColor: '', buttonTextColor: 'auto', textMode: 'custom', styleId: 'classic' });
  const [wordingTab, setWordingTab] = useState(0);
  const [popupPanelView, setPopupPanelView] = useState(0); // 0=Wording, 1=Colours
  const [poView, setPoView] = useState(0); // 0=Wording, 1=Colours  (post-order panel)
  const [poPreviewState, setPoPreviewState] = useState(0); // 0=ask, 1=missing date, 2=saved
  const [coloursPatch, setColoursPatch] = useState({});
  const [ppView, setPpView] = useState(0);                // 0=Wording, 1=Colours
  const [ppPreviewState, setPpPreviewState] = useState(0); // 0=ask, 1=email-err, 2=date-err, 3=saved
  const [ppColoursPatch, setPpColoursPatch] = useState({});

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
        const mp = data?.mobilePopup || {};
        const hexFields = ['accentColor', 'bgColor', 'textColor'];
        const mDiffers = hexFields.some((k) => {
          const pv = /^#[0-9a-fA-F]{6}$/.test(p[k] || '') ? p[k] : null;
          const mv = /^#[0-9a-fA-F]{6}$/.test(mp[k] || '') ? mp[k] : null;
          return pv !== mv;
        }) || (['buttonTextColor', 'textMode'].some((k) => (p[k] || '') !== (mp[k] || '')));
        setPreviewColors({
          accentColor: /^#[0-9a-fA-F]{6}$/.test(p.accentColor || '') ? p.accentColor : '#4f46e5',
          bgColor: /^#[0-9a-fA-F]{6}$/.test(p.bgColor || '') ? p.bgColor : '#ffffff',
          textColor: /^#[0-9a-fA-F]{6}$/.test(p.textColor || '') ? p.textColor : '',
          buttonTextColor: ['auto', 'white', 'dark'].includes(p.buttonTextColor) ? p.buttonTextColor : 'auto',
          textMode: ['custom', 'auto', 'white', 'dark'].includes(p.textMode) ? p.textMode : 'custom',
          styleId: p.styleId || 'classic',
          _mobileDiverges: mDiffers,
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
      if (Object.keys(coloursPatch).length > 0) {
        try {
          await apiSend(`/api/profiles/${encodeURIComponent(shop)}/popup`, 'PATCH', {
            ...coloursPatch, mobilePopup: coloursPatch,
          });
          setColoursPatch({});
        } catch {
          setError('Discount settings saved. Colours failed to save — try again.');
          return;
        }
      }
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
              <div style={{ ...helperStyle, marginTop: 4 }}>
                Shown on the desktop popup (Classic, split layout). Phones and other styles use the fields below.
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
            <div style={{ borderBottom: `1px solid ${DS.gray200}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
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
              {/* Wording/colours panel — always rendered so merchant sees the preview */}
              {(() => {
                const popupOn = !!(config.birthdayCapture?.popup?.enabled);
                const pc = config.popupCopy || {};
                const setPc = (patch) => setConfig((c) => ({ ...c, popupCopy: { ...(c.popupCopy || {}), ...patch } }));
                const PC_MAX = {
                  emailPlaceholder:40, captureButton:50, subscribedTitle:40, subscribedSub:60,
                  unlockedTitle:40, unlockedSub:60, bdSub:120, bdButton:30, bdSkip:30, bdOkTitle:40, bdOkSub:120,
                };
                const STEP_TABS = ['Discount box', 'Subscribed', 'Offer unlocked', 'Birthday step'];
                const STEP_FIELDS = [
                  ['emailPlaceholder', 'captureButton'],
                  ['subscribedTitle', 'subscribedSub'],
                  ['unlockedTitle', 'unlockedSub'],
                  ['bdSub', 'bdButton', 'bdSkip', 'bdOkTitle', 'bdOkSub'],
                ];
                function hasDot(si) {
                  return STEP_FIELDS[si].some((k) => (pc[k] || '').trim().length > 0);
                }
                const accent   = previewColors.accentColor;
                const bg       = previewColors.bgColor;
                const isBgDef  = /^#fff(fff)?$/i.test(bg);
                const cardBg   = isBgDef ? 'linear-gradient(145deg,#ffffff,#f8f9ff)' : bg;
                const cardDark = !isBgDef && fgOn(bg) === '#FFFFFF';
                const fgText   = cardDark ? '#ffffff' : '#111827';
                const fgSub    = cardDark ? 'rgba(255,255,255,0.70)' : '#6b7280';
                const btnFg    = fgOn(accent);
                const samplePct  = config.emailDiscount?.percentage || config.pushDiscount?.percentage || 15;
                const sampleDays = config.emailDiscount?.expiryDays || 7;
                const bdLeadDays = config.birthdayDiscount?.leadDays ?? 3;
                function copyVal(key, fallback, vars) {
                  const raw = (pc[key] || '').trim();
                  let text = raw || fallback;
                  if (vars && vars.pct !== undefined) text = text.split('{pct}').join(String(vars.pct));
                  if (vars && vars.days !== undefined) text = text.split('{days}').join(String(vars.days));
                  return text;
                }
                const fieldInner = { ...fieldStyle, height: 42, borderColor: '#AEB4C2', color: '#171A22', width: '100%' };
                const lblSt  = { fontSize: 13, fontWeight: 700, color: '#171A22' };
                const ctrSt  = { fontSize: '11.5px', color: '#9ca3af' };
                const helpSt = { fontSize: 12, color: '#5A6070', marginTop: 3 };
                function CopyField({ fieldKey, label, placeholder, helper }) {
                  const val = pc[fieldKey] || '';
                  const max = PC_MAX[fieldKey];
                  return (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <span style={lblSt}>{label}</span>
                        <span style={ctrSt}>{val.length} / {max}</span>
                      </div>
                      <input className="disc-input" type="text" value={val} maxLength={max} placeholder={placeholder}
                        onChange={(e) => setPc({ [fieldKey]: e.target.value })}
                        style={fieldInner} />
                      {helper && <div style={helpSt}>{helper}</div>}
                    </div>
                  );
                }
                const curStepFields = STEP_FIELDS[wordingTab];
                const canReset = curStepFields.some((k) => (pc[k] || '').trim().length > 0);
                /* preview content per tab */
                const previewSteps = [
                  /* 0 -- Discount box */
                  () => (
                    <div>
                      <div style={{ fontSize: '11.5px', color: fgSub, marginBottom: 8, textAlign: 'center', lineHeight: 1.4 }}>
                        {config.offerHeadline || 'Get a discount on your first order!'}
                      </div>
                      <div style={{ background: cardDark ? 'rgba(255,255,255,0.10)' : '#f9fafb', border: `1px solid ${cardDark ? 'rgba(255,255,255,0.22)' : '#e5e7eb'}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, color: cardDark ? '#ffffff' : '#111827', marginBottom: 8 }}>
                        {copyVal('emailPlaceholder', 'Your email', {})}
                        {samplePct ? <span style={{ color: fgSub }}>{' (get ' + samplePct + '% off)'}</span> : null}
                      </div>
                      <div style={{ background: accent, borderRadius: 8, padding: '8px 12px', textAlign: 'center', fontSize: '12.5px', fontWeight: 700, color: btnFg, marginBottom: 6 }}>
                        Allow push notifications
                      </div>
                      <div style={{ background: 'transparent', border: '2px solid ' + accent, borderRadius: 8, padding: '7px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: cardDark ? '#F4F4F5' : '#171A22' }}>
                        {copyVal('captureButton', 'Get my offer without notifications', {})}
                      </div>
                    </div>
                  ),
                  /* 1 -- Subscribed */
                  () => (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: fgText, marginBottom: 6 }}>
                        {copyVal('subscribedTitle', 'Subscribed!', {})}
                      </div>
                      <div style={{ fontSize: 12, color: fgSub }}>
                        {copyVal('subscribedSub', 'Getting your discount...', {})}
                      </div>
                    </div>
                  ),
                  /* 2 -- Offer unlocked */
                  () => (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: fgText, marginBottom: 4 }}>
                        {copyVal('unlockedTitle', samplePct + '% OFF Unlocked!', { pct: samplePct })}
                      </div>
                      <div style={{ fontSize: 12, color: fgSub }}>
                        {copyVal('unlockedSub', 'Expires in ' + sampleDays + ' days', { days: sampleDays })}
                      </div>
                    </div>
                  ),
                  /* 3 -- Birthday step */
                  () => {
                    const bdSubFb = bdLeadDays
                      ? 'Tell us your birthday. We will send your personal code ' + bdLeadDays + ' days before.'
                      : 'Tell us your birthday. We will send your personal code a few days before.';
                    return (
                      <div>
                        <div style={{ fontSize: 12, color: fgSub, marginBottom: 12, lineHeight: 1.5 }}>
                          {copyVal('bdSub', bdSubFb, bdLeadDays ? { days: bdLeadDays } : {})}
                        </div>
                        <div style={{ background: accent, borderRadius: 8, padding: '8px 12px', textAlign: 'center', fontSize: '12.5px', fontWeight: 700, color: btnFg, marginBottom: 6 }}>
                          {copyVal('bdButton', 'Send me my gift', {})}
                        </div>
                        <div style={{ textAlign: 'center', fontSize: '11.5px', color: fgSub }}>
                          {copyVal('bdSkip', 'No thanks', {})}
                        </div>
                      </div>
                    );
                  },
                ];
                // Colours panel helpers (admin-side resolver, mirrors ccfResolvePopupColors)
                function resolveText() {
                  const dark = fgOn(previewColors.bgColor || '#ffffff') === '#FFFFFF';
                  const m = previewColors.textMode || 'custom';
                  if (m === 'white') return '#ffffff';
                  if (m === 'dark') return '#171A22';
                  if (m === 'auto') return fgOn(previewColors.bgColor || '#ffffff') === '#FFFFFF' ? '#F4F4F5' : '#171A22';
                  return /^#[0-9a-fA-F]{6}$/.test(previewColors.textColor || '') ? previewColors.textColor : (dark ? '#ffffff' : '#111827');
                }
                function resolveBtnFg() {
                  const m = previewColors.buttonTextColor || 'auto';
                  if (m === 'white') return '#ffffff';
                  if (m === 'dark') return '#171A22';
                  return fgOn(previewColors.accentColor || '#4f46e5');
                }
                const NO_COLOUR_STYLES = new Set(['flash_sale', 'story_card']);
                const NO_BG_STYLES = new Set(['top_bar']);
                const styleId = previewColors.styleId || 'classic';
                const coloursDisabled = NO_COLOUR_STYLES.has(styleId);
                const bgDisabled = coloursDisabled || NO_BG_STYLES.has(styleId);
                const ACCENT_SWATCHES = ['#4F46E5', '#7A3B74', '#171A22', '#0F5132', '#F5C542'];
                const BG_SWATCHES = ['#FFFFFF', '#FFF7ED', '#F3F4F6', '#18181B', '#0F172A'];
                const coloursDirty = Object.keys(coloursPatch).length > 0;
                function setColour(key, val) {
                  setPreviewColors((p) => ({ ...p, [key]: val }));
                  setColoursPatch((p) => ({ ...p, [key]: val }));
                }
                const SwatchRow = ({ label, fieldKey, swatches, value, disabled: dis }) => (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: dis ? '#9ca3af' : '#171A22', marginBottom: 6 }}>{label}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {swatches.map((sw) => (
                        <button key={sw} type="button" disabled={dis}
                          onClick={() => setColour(fieldKey, sw)}
                          style={{ width: 24, height: 24, borderRadius: '50%', background: sw, border: value === sw ? '2.5px solid #171A22' : '1.5px solid rgba(0,0,0,0.12)', cursor: dis ? 'default' : 'pointer', outline: 'none', flexShrink: 0, boxShadow: value === sw ? '0 0 0 2px #ffffff, 0 0 0 4px #171A22' : 'none' }}
                          aria-label={sw}
                        />
                      ))}
                      <input type="text" disabled={dis} maxLength={7} value={value || ''} placeholder="#hex"
                        onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setColour(fieldKey, e.target.value); }}
                        style={{ width: 72, height: 28, padding: '0 8px', fontSize: 12, border: '1.5px solid #D9D8FF', borderRadius: 6, background: dis ? '#f0f0f0' : '#fff', color: dis ? '#9ca3af' : '#171A22', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                );
                const ModeRow = ({ label, fieldKey, options, value, disabled: dis }) => (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: dis ? '#9ca3af' : '#171A22', marginBottom: 6 }}>{label}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {options.map(({ val, lbl }) => {
                        const active = value === val;
                        return (
                          <button key={val} type="button" disabled={dis}
                            onClick={() => setColour(fieldKey, val)}
                            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1.5px solid ' + (active ? '#4f46e5' : '#D9D8FF'), background: active ? '#4f46e5' : '#ffffff', color: active ? '#ffffff' : (dis ? '#9ca3af' : '#4f46e5'), cursor: dis ? 'default' : 'pointer', fontWeight: active ? 700 : 500 }}
                          >{lbl}</button>
                        );
                      })}
                    </div>
                  </div>
                );
                const resolvedText = resolveText();
                const resolvedBtnFg = resolveBtnFg();
                const previewBg = previewColors.bgColor || '#ffffff';
                const previewIsBgDefault = /^#fff(fff)?$/i.test(previewBg);
                const previewCardBg = previewIsBgDefault ? 'linear-gradient(145deg,#ffffff,#f8f9ff)' : previewBg;
                return (
                  <div style={{ background: '#F7F7FF', border: '1px solid #D9D8FF', borderRadius: 12, margin: '0 0 16px', padding: '16px 20px' }}>
                    {/* Panel header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#171A22' }}>
                          {popupOn ? 'Entry popup' : 'Entry popup preview'}
                        </div>
                        {!popupOn && (
                          <div style={{ fontSize: 12, color: '#5A6070', marginTop: 2 }}>
                            Always visible, so you can see how it looks. Switch Entry popup on to show it to visitors and edit it.
                          </div>
                        )}
                      </div>
                      {popupOn && (
                        <div style={{ display: 'flex', gap: 2, background: '#E8E8F7', borderRadius: 8, padding: 2 }}>
                          {['Wording', 'Colours'].map((lbl, vi) => (
                            <button key={lbl} type="button" onClick={() => setPopupPanelView(vi)}
                              style={{ fontSize: 12, fontWeight: popupPanelView === vi ? 700 : 500, padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: popupPanelView === vi ? '#ffffff' : 'transparent', color: popupPanelView === vi ? '#171A22' : '#5A6070', boxShadow: popupPanelView === vi ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}
                            >{lbl}</button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* OFF state: left note + step mini-tabs + dimmed preview with pill */}
                    {!popupOn && (
                      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ background: '#ffffff', border: '1px solid #D9D8FF', borderRadius: 8, padding: '14px 16px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#171A22', marginBottom: 8 }}>The Entry popup is off</div>
                            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 8 }}>
                              Visitors do not see this popup step right now. Switch Entry popup on to edit the wording and colours. The preview shows how it will look with your current saved settings.
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>Your saved wording and colours are kept while it is off.</div>
                          </div>
                        </div>
                        <div style={{ width: 290, flexShrink: 0, minWidth: 200 }}>
                          <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                            {STEP_TABS.map((label, i) => {
                              const active = wordingTab === i;
                              return (
                                <button key={label} role="tab" type="button" aria-selected={active}
                                  onClick={() => setWordingTab(i)}
                                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, border: '1.5px solid ' + (active ? '#374151' : '#D9D8FF'), background: active ? '#374151' : '#ffffff', color: active ? '#ffffff' : '#6b7280', cursor: 'pointer', fontWeight: active ? 700 : 500 }}
                                >{label}</button>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Preview</div>
                          <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 2, background: '#111827', color: '#ffffff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
                              Entry popup is off
                            </div>
                            <div style={{ opacity: 0.55 }}>
                              <div style={{ background: cardBg, borderRadius: 14, padding: '14px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                                <div style={{ height: 3, background: 'linear-gradient(90deg,' + accent + ',' + accent + '88,transparent)', borderRadius: 2, marginBottom: 12, marginLeft: -16, marginRight: -16, marginTop: -14 }} />
                                {previewSteps[wordingTab]?.()}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ON state: existing Wording / Colours panel views */}
                    {popupOn && popupPanelView === 0 && (<>
                      {/* Wording: description */}
                      <div style={{ fontSize: 12, color: '#5A6070', marginBottom: 12 }}>
                        Change the text on each step after the first popup screen. Leave a field empty to use the default.
                      </div>
                      {/* Step tabs */}
                      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                        {STEP_TABS.map((label, i) => {
                          const active = wordingTab === i;
                          return (
                            <button key={label} role="tab" type="button" aria-selected={active}
                              onClick={() => setWordingTab(i)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px', borderRadius: 20, border: '1.5px solid ' + (active ? '#4f46e5' : '#D9D8FF'), background: active ? '#4f46e5' : '#ffffff', color: active ? '#ffffff' : '#4f46e5', cursor: 'pointer', fontWeight: active ? 700 : 500 }}
                            >
                              {label}
                              {hasDot(i) && !active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4f46e5', flexShrink: 0 }} />}
                            </button>
                          );
                        })}
                      </div>
                      {/* Two-column layout -- fields + preview; stacks below 700px via flexWrap */}
                      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {/* Fields column */}
                        <div style={{ flex: 1, minWidth: 220 }}>
                          {wordingTab === 0 && (<>
                            <CopyField fieldKey="emailPlaceholder" label="Email placeholder" placeholder="Your email" helper='The email input hint. The "(get N% off)" suffix is added automatically.' />
                            <CopyField fieldKey="captureButton" label='"Get my offer" button' placeholder="Get my offer without notifications" helper="Shown when the visitor skips push but leaves an email." />
                          </>)}
                          {wordingTab === 1 && (<>
                            <CopyField fieldKey="subscribedTitle" label="Title" placeholder="Subscribed!" />
                            <CopyField fieldKey="subscribedSub" label="Sub-text" placeholder="Getting your discount..." />
                          </>)}
                          {wordingTab === 2 && (<>
                            <CopyField fieldKey="unlockedTitle" label="Title" placeholder="15% OFF Unlocked!" helper="Use {pct} for the discount percentage." />
                            <CopyField fieldKey="unlockedSub" label="Sub-text" placeholder="Expires in 7 days" helper="Use {days} for the expiry days." />
                          </>)}
                          {wordingTab === 3 && (<>
                            <div style={{ fontSize: '11.5px', color: '#5A6070', background: '#ede9fe', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                              The birthday heading and consent text live in the &quot;The birthday gift&quot; card below.
                            </div>
                            <CopyField fieldKey="bdSub" label="Birthday ask sub-text" placeholder="Tell us your birthday. We will send your personal code {days} days before." helper="Use {days} for the number of lead days." />
                            <CopyField fieldKey="bdButton" label="Submit button" placeholder="Send me my gift" />
                            <CopyField fieldKey="bdSkip" label="Skip link" placeholder="No thanks" />
                            <CopyField fieldKey="bdOkTitle" label="Saved title" placeholder="You're all set" />
                            <CopyField fieldKey="bdOkSub" label="Saved sub-text" placeholder="We'll send your gift code {days} days before your birthday." helper="Use {days} for the number of lead days." />
                          </>)}
                          {(wordingTab === 2 || wordingTab === 3) && (
                            <div style={{ fontSize: '11.5px', color: '#5A6070', marginTop: 4 }}>
                              Tokens: <code style={{ background: '#ede9fe', borderRadius: 3, padding: '1px 4px', fontSize: 11 }}>{'{pct}'}</code>{' '}= discount %, <code style={{ background: '#ede9fe', borderRadius: 3, padding: '1px 4px', fontSize: 11 }}>{'{days}'}</code>{' '}= days.
                            </div>
                          )}
                          <button type="button" disabled={!canReset}
                            onClick={() => { const p = {}; STEP_FIELDS[wordingTab].forEach((k) => { p[k] = ''; }); setPc(p); }}
                            style={{ marginTop: 12, fontSize: '11.5px', color: canReset ? '#4f46e5' : '#9ca3af', background: 'none', border: 'none', cursor: canReset ? 'pointer' : 'default', padding: 0, textDecoration: canReset ? 'underline' : 'none' }}
                          >
                            Reset this step
                          </button>
                        </div>
                        {/* Preview column -- 290px, fills without overflow */}
                        <div style={{ width: 290, flexShrink: 0, minWidth: 200 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Preview</div>
                          <div style={{ background: cardBg, borderRadius: 14, padding: '14px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                            <div style={{ height: 3, background: 'linear-gradient(90deg,' + accent + ',' + accent + '88,transparent)', borderRadius: 2, marginBottom: 12, marginLeft: -16, marginRight: -16, marginTop: -14 }} />
                            {previewSteps[wordingTab]?.()}
                          </div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                            Uses your popup accent and background colours.
                          </div>
                        </div>
                      </div>
                      {/* Footer */}
                      <div style={{ fontSize: '11.5px', color: '#5A6070', marginTop: 14, borderTop: '1px solid #D9D8FF', paddingTop: 10 }}>
                        Saved with &quot;Save discount settings&quot;.
                      </div>
                    </>)}

                    {popupOn && popupPanelView === 1 && (<>
                      {coloursDisabled && (
                        <div style={{ fontSize: 12, color: '#9ca3af', background: '#f0f0f0', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                          Colour controls are not available for this popup style.
                        </div>
                      )}
                      {/* Two-column layout: controls + preview */}
                      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {/* Controls column */}
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <SwatchRow label={styleId === 'top_bar' ? 'Bar colour' : 'Accent colour'} fieldKey="accentColor" swatches={ACCENT_SWATCHES} value={previewColors.accentColor} disabled={coloursDisabled} />
                          <ModeRow label="Button text" fieldKey="buttonTextColor" options={[{ val: 'auto', lbl: 'Auto' }, { val: 'white', lbl: 'White' }, { val: 'dark', lbl: 'Dark' }]} value={previewColors.buttonTextColor || 'auto'} disabled={coloursDisabled} />
                          <SwatchRow label="Popup background" fieldKey="bgColor" swatches={BG_SWATCHES} value={previewColors.bgColor} disabled={bgDisabled} />
                          <ModeRow label="Popup text" fieldKey="textMode" options={[{ val: 'auto', lbl: 'Auto' }, { val: 'white', lbl: 'White' }, { val: 'dark', lbl: 'Dark' }, { val: 'custom', lbl: 'Custom' }]} value={previewColors.textMode || 'custom'} disabled={coloursDisabled} />
                          {(previewColors.textMode === 'custom' || !previewColors.textMode) && !coloursDisabled && (
                            <div style={{ marginTop: -6, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: '#5A6070' }}>Custom colour:</span>
                              <input type="text" maxLength={7} value={previewColors.textColor || ''} placeholder="#111827"
                                onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setColour('textColor', e.target.value); }}
                                style={{ width: 80, height: 28, padding: '0 8px', fontSize: 12, border: '1.5px solid #D9D8FF', borderRadius: 6, fontFamily: 'monospace' }}
                              />
                              {/^#[0-9a-fA-F]{6}$/.test(previewColors.textColor || '') && (
                                <div style={{ width: 20, height: 20, borderRadius: 4, background: previewColors.textColor, border: '1px solid rgba(0,0,0,0.15)' }} />
                              )}
                            </div>
                          )}
                          {previewColors._mobileDiverges && !coloursDisabled && (
                            <div style={{ fontSize: '11.5px', color: '#5A6070', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
                              Phone uses different colours (Settings &rarr; Popup &rarr; Mobile). Changing them here will update both.
                            </div>
                          )}
                          <div style={{ fontSize: '11.5px', color: '#5A6070', marginTop: 4 }}>
                            Saved with &ldquo;Save discount settings&rdquo;.
                          </div>
                        </div>
                        {/* Preview column */}
                        <div style={{ width: 220, flexShrink: 0, minWidth: 160 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Preview</div>
                          <div style={{ background: previewCardBg, borderRadius: 14, padding: '14px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                            <div style={{ height: 3, background: 'linear-gradient(90deg,' + (previewColors.accentColor || '#4f46e5') + ',' + (previewColors.accentColor || '#4f46e5') + '88,transparent)', borderRadius: 2, marginBottom: 12, marginLeft: -16, marginRight: -16, marginTop: -14 }} />
                            <div style={{ fontSize: 14, fontWeight: 700, color: resolvedText, marginBottom: 6 }}>Subscribe for offers</div>
                            <div style={{ fontSize: 11, color: resolvedText, opacity: 0.65, marginBottom: 10 }}>Get 15% off your first order.</div>
                            <div style={{ background: 'linear-gradient(135deg,' + (previewColors.accentColor || '#4f46e5') + ',' + (previewColors.accentColor || '#4f46e5') + 'dd)', borderRadius: 8, padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: resolvedBtnFg, marginBottom: 6 }}>Allow push notifications</div>
                            <div style={{ border: '1.5px solid ' + (previewColors.accentColor || '#4f46e5'), borderRadius: 8, padding: '7px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: resolvedText, marginBottom: 4 }}>Get my offer</div>
                          </div>
                        </div>
                      </div>
                    </>)}
                  </div>
                );
              })()}
            </div>

            {/* Method 3: After the first COD order */}
            <div style={{ borderBottom: `1px solid ${DS.gray200}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: DS.gray900 }}>After the first COD order</div>
                  <div style={{ fontSize: 12, color: DS.gray400, marginTop: 2 }}>Shows a compact birthday ask inline on the COD order success screen.</div>
                </div>
                <div
                  role="switch"
                  aria-checked={!!(config.birthdayCapture?.postOrder?.enabled)}
                  tabIndex={0}
                  onClick={() => setConfig((c) => ({
                    ...c,
                    birthdayCapture: { ...(c.birthdayCapture || {}), postOrder: { ...(c.birthdayCapture?.postOrder || {}), enabled: !(c.birthdayCapture?.postOrder?.enabled) } },
                  }))}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setConfig((c) => ({ ...c, birthdayCapture: { ...(c.birthdayCapture || {}), postOrder: { ...(c.birthdayCapture?.postOrder || {}), enabled: !(c.birthdayCapture?.postOrder?.enabled) } } })); } }}
                  style={{ width: 36, height: 20, borderRadius: 10, cursor: 'pointer', background: config.birthdayCapture?.postOrder?.enabled ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                >
                  <div style={{ position: 'absolute', top: 2, left: config.birthdayCapture?.postOrder?.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>

              {/* Always-visible panel (mirrors Entry popup panel pattern) */}
              {(() => {
                const poOn   = !!(config.birthdayCapture?.postOrder?.enabled);
                const po     = config.birthdayCapture?.postOrder || {};
                const poCopy = po.copy || {};
                const setPo  = (patch) => setConfig((c) => ({
                  ...c,
                  birthdayCapture: {
                    ...(c.birthdayCapture || {}),
                    postOrder: { ...(c.birthdayCapture?.postOrder || {}), ...patch },
                  },
                }));
                const setPoCopy = (patch) => setConfig((c) => ({
                  ...c,
                  birthdayCapture: {
                    ...(c.birthdayCapture || {}),
                    postOrder: {
                      ...(c.birthdayCapture?.postOrder || {}),
                      copy: { ...(c.birthdayCapture?.postOrder?.copy || {}), ...patch },
                    },
                  },
                }));

                const PO_COPY_MAX = { pitch: 120, button: 30, skip: 30, saved: 80, error: 60 };
                const bdPct = config.birthdayDiscount?.percentage ?? 15;
                const bdLead = config.birthdayDiscount?.leadDays ?? 3;
                const consentText = (config.birthdayDiscount?.consentText || '').trim() ||
                  "We'll use your birthday only to send you a birthday offer.";

                // Resolve live colours for preview
                const poColors = resolvePostOrderColors({
                  accentColor:    po.accentColor    || '',
                  bgColor:        po.bgColor        || '',
                  buttonTextMode: po.buttonTextMode || 'auto',
                  textMode:       po.textMode       || 'auto',
                });
                const previewAccent  = (poColors?.accent)  || '#4f46e5';
                const previewBtnFg   = (poColors?.btnFg)   || '#FFFFFF';
                const previewBg      = (poColors?.bg)      || null;
                const previewText    = (poColors?.text)    || '#18181B';
                const previewMuted   = (poColors?.muted)   || '#71717A';
                const previewSkip    = (poColors?.skip)    || '#a1a1aa';
                const previewSep     = (poColors?.sep)     || '#e4e4e7';

                const pitchText = (() => {
                  const raw = (poCopy.pitch || '').trim();
                  if (raw) return raw.split('{pct}').join(String(bdPct));
                  return 'One more thing — Share your birthday for ' + bdPct + '% off on the day.';
                })();
                const btnText  = (poCopy.button || '').trim() || 'Save my birthday';
                const skipText = (poCopy.skip   || '').trim() || 'No thanks';
                const savedText = (poCopy.saved || '').trim() ||
                  ("Birthday saved! We'll send your " + bdPct + '% off code ' + bdLead + ' days before.');
                const errorText = (poCopy.error || '').trim() || 'Please pick a month and day.';

                // View-switch tab strip
                const viewTabStyle = (active) => ({
                  fontSize: 12, padding: '4px 12px', borderRadius: 20, border: '1.5px solid ' + (active ? '#4f46e5' : '#D9D8FF'),
                  background: active ? '#4f46e5' : '#ffffff', color: active ? '#ffffff' : '#4f46e5',
                  cursor: 'pointer', fontWeight: active ? 700 : 500,
                });

                // PO_ACCENT swatches (5 brand-neutral presets)
                const PO_ACCENT_SWATCHES = [
                  { name: 'Indigo',    hex: '#4f46e5' },
                  { name: 'Violet',    hex: '#7C3AED' },
                  { name: 'Teal',      hex: '#0D9488' },
                  { name: 'Rose',      hex: '#E11D48' },
                  { name: 'Charcoal',  hex: '#171A22' },
                ];
                const PO_BG_PRESETS = [
                  { name: 'Cream',   hex: '#FFF7ED' },
                  { name: 'Pale blue', hex: '#EEF2FF' },
                  { name: 'Smoke',   hex: '#F3F4F6' },
                  { name: 'Navy',    hex: '#0F172A' },
                ];

                const accentHexValid = _HEX_RE.test(po.accentColor || '');
                const bgHexValid     = _HEX_RE.test(po.bgColor || '');

                const anyCopySet = ['pitch','button','skip','saved','error'].some((k) => (poCopy[k] || '').trim().length > 0);

                // Preview states
                const PO_PREVIEW_TABS = ['The ask', 'Missing date', 'After saving'];
                const previewBlockStyle = {
                  background: previewBg || '#ffffff',
                  borderTop: previewBg ? 'none' : `1px solid ${previewSep}`,
                  borderRadius: previewBg ? 10 : 0,
                  padding: '16px',
                  marginTop: previewBg ? 8 : 0,
                };

                function PreviewBlock() {
                  return (
                    <div style={previewBlockStyle}>
                      {poPreviewState === 0 && (<>
                        <div style={{ fontSize: 13, fontWeight: 600, color: previewText, margin: '0 0 10px' }}>{pitchText}</div>
                        <div style={{ fontSize: 11, color: previewMuted, marginBottom: 10, lineHeight: 1.4 }}>{consentText}</div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                          <div style={{ flex: 1, height: 34, fontSize: 13, border: '1px solid #d4d4d8', borderRadius: 8, background: '#fff', color: previewText, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>Month</div>
                          <div style={{ flex: 1, height: 34, fontSize: 13, border: '1px solid #d4d4d8', borderRadius: 8, background: '#fff', color: previewText, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>Day</div>
                        </div>
                        <div style={{ background: previewAccent, color: previewBtnFg, borderRadius: 9, padding: '10px', textAlign: 'center', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{btnText}</div>
                        <div style={{ textAlign: 'center', fontSize: 12, color: previewSkip, padding: 8 }}>{skipText}</div>
                      </>)}
                      {poPreviewState === 1 && (<>
                        <div style={{ fontSize: 13, fontWeight: 600, color: previewText, margin: '0 0 10px' }}>{pitchText}</div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                          <div style={{ flex: 1, height: 34, fontSize: 13, border: '1.5px solid #dc2626', borderRadius: 8, background: '#fff', color: '#18181b', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>Month</div>
                          <div style={{ flex: 1, height: 34, fontSize: 13, border: '1.5px solid #dc2626', borderRadius: 8, background: '#fff', color: '#18181b', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>Day</div>
                        </div>
                        <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>{errorText}</div>
                        <div style={{ background: previewAccent, color: previewBtnFg, borderRadius: 9, padding: '10px', textAlign: 'center', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{btnText}</div>
                      </>)}
                      {poPreviewState === 2 && (
                        <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, textAlign: 'center', padding: '12px 0' }}>{savedText}</div>
                      )}
                    </div>
                  );
                }

                return (
                  <div style={{ borderTop: `1px solid ${DS.gray200}`, paddingTop: 14, paddingBottom: 14 }}>
                    {/* OFF state: dimmed preview + info box */}
                    {!poOn && (
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ background: '#ffffff', border: '1px solid #D9D8FF', borderRadius: 8, padding: '14px 16px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#171A22', marginBottom: 8 }}>After the first COD order is off</div>
                            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 8 }}>
                              The birthday ask will not appear after orders. Switch it on to activate it. Your saved wording and colours are kept while it is off.
                            </div>
                          </div>
                        </div>
                        <div style={{ width: 260, flexShrink: 0, minWidth: 200 }}>
                          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                            {PO_PREVIEW_TABS.map((lbl, i) => (
                              <button key={lbl} type="button" onClick={() => setPoPreviewState(i)}
                                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, border: '1.5px solid ' + (poPreviewState === i ? '#374151' : '#D9D8FF'), background: poPreviewState === i ? '#374151' : '#fff', color: poPreviewState === i ? '#fff' : '#6b7280', cursor: 'pointer', fontWeight: poPreviewState === i ? 700 : 500 }}
                              >{lbl}</button>
                            ))}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Preview</div>
                          <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 2, background: '#111827', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
                              After the first COD order is off
                            </div>
                            <div style={{ opacity: 0.55 }}>
                              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', overflow: 'hidden' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>✓ Order placed!</div>
                                <PreviewBlock />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ON state: view switcher + two-column layout */}
                    {poOn && (
                      <div>
                        {/* Wording / Colours switcher */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                          <button type="button" onClick={() => setPoView(0)} style={viewTabStyle(poView === 0)}>Wording</button>
                          <button type="button" onClick={() => setPoView(1)} style={viewTabStyle(poView === 1)}>Colours</button>
                        </div>

                        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          {/* Left column: Wording or Colours controls */}
                          <div style={{ flex: 1, minWidth: 220 }}>
                            {poView === 0 && (<>
                              <div style={{ fontSize: 12, color: '#5A6070', marginBottom: 12 }}>
                                Leave a field empty to use the default. Use <code style={{ background: '#ede9fe', borderRadius: 3, padding: '1px 4px', fontSize: 11 }}>{'{pct}'}</code> for the discount %.
                              </div>
                              <PoCopyField fieldKey="pitch" label="Pitch" placeholder={'One more thing — Share your birthday for ' + bdPct + '% off on the day.'} helper="Use {pct} for the discount percentage." value={poCopy.pitch || ''} maxLen={PO_COPY_MAX.pitch} onPatch={setPoCopy} />
                              <PoCopyField fieldKey="button" label="Save button" placeholder="Save my birthday" value={poCopy.button || ''} maxLen={PO_COPY_MAX.button} onPatch={setPoCopy} />
                              <PoCopyField fieldKey="skip" label="Skip link" placeholder="No thanks" value={poCopy.skip || ''} maxLen={PO_COPY_MAX.skip} onPatch={setPoCopy} />
                              <PoCopyField fieldKey="saved" label="Success message" placeholder={'Birthday saved! We\'ll send your ' + bdPct + '% off code ' + bdLead + ' days before.'} helper="Shown after the birthday is saved successfully. Green text — always." value={poCopy.saved || ''} maxLen={PO_COPY_MAX.saved} onPatch={setPoCopy} />
                              <PoCopyField fieldKey="error" label="Error message" placeholder="Please pick a month and day." helper="Shown when date is incomplete. Red text — always." value={poCopy.error || ''} maxLen={PO_COPY_MAX.error} onPatch={setPoCopy} />
                              <div style={{ fontSize: 11, color: '#5A6070', background: '#fef9ec', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                                The consent line (e.g. &ldquo;We'll use your birthday only…&rdquo;) is shared with all birthday capture methods and editable in &ldquo;The birthday gift&rdquo; card below.
                              </div>
                              <button type="button" disabled={!anyCopySet}
                                onClick={() => setPoCopy({ pitch: '', button: '', skip: '', saved: '', error: '' })}
                                style={{ fontSize: '11.5px', color: anyCopySet ? '#4f46e5' : '#9ca3af', background: 'none', border: 'none', cursor: anyCopySet ? 'pointer' : 'default', padding: 0, textDecoration: anyCopySet ? 'underline' : 'none' }}
                              >
                                Reset all to defaults
                              </button>
                            </>)}

                            {poView === 1 && (<>
                              <PoSwatchRow label="Accent colour" field="accentColor" swatches={PO_ACCENT_SWATCHES} value={po.accentColor || ''} onPatch={setPo} />
                              {!accentHexValid && (po.accentColor || '') !== '' && (
                                <div style={{ fontSize: 11, color: '#dc2626', marginTop: -8, marginBottom: 10 }}>Not a valid 6-digit hex — enter #RRGGBB</div>
                              )}
                              <PoModeRow label="Button text" field="buttonTextMode" options={[{ val: 'auto', lbl: 'Auto' }, { val: 'white', lbl: 'White' }, { val: 'dark', lbl: 'Dark' }]} value={po.buttonTextMode || 'auto'} onPatch={setPo} />
                              {poColors?.lowBtnContrast && (
                                <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', marginTop: 4, marginBottom: 4 }}>
                                  ⚠ Low contrast — the button text may be hard to read on this accent colour. Try Auto or a darker accent.
                                </div>
                              )}
                              <PoSwatchRow label="Block background" field="bgColor" swatches={PO_BG_PRESETS} value={po.bgColor || ''} allowEmpty emptyLabel="None (default)" onPatch={setPo} />
                              {!bgHexValid && (po.bgColor || '') !== '' && (
                                <div style={{ fontSize: 11, color: '#dc2626', marginTop: -8, marginBottom: 10 }}>Not a valid 6-digit hex — enter #RRGGBB</div>
                              )}
                              <PoModeRow label="Text colour" field="textMode" options={[{ val: 'auto', lbl: 'Auto' }, { val: 'white', lbl: 'White' }, { val: 'dark', lbl: 'Dark' }]} value={po.textMode || 'auto'} onPatch={setPo} />
                              <div style={{ fontSize: 11, color: '#5A6070', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}>
                                Success and error messages keep their own green / red colour regardless of text colour.
                              </div>
                            </>)}
                          </div>

                          {/* Right column: preview */}
                          <div style={{ width: 260, flexShrink: 0, minWidth: 200 }}>
                            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                              {PO_PREVIEW_TABS.map((lbl, i) => (
                                <button key={lbl} type="button" onClick={() => setPoPreviewState(i)}
                                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, border: '1.5px solid ' + (poPreviewState === i ? '#4f46e5' : '#D9D8FF'), background: poPreviewState === i ? '#4f46e5' : '#fff', color: poPreviewState === i ? '#fff' : '#6b7280', cursor: 'pointer', fontWeight: poPreviewState === i ? 700 : 500 }}
                                >{lbl}</button>
                              ))}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Preview</div>
                            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', overflow: 'hidden' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>✓ Order placed!</div>
                              <PreviewBlock />
                            </div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                              Saved with &ldquo;Save discount settings&rdquo;.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Method 4: Product page box */}
            <div style={{ borderBottom: `1px solid ${DS.gray200}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: DS.gray900 }}>Product page box</div>
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#4f46e5', color: '#fff', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em' }}>NEW</span>
                  </div>
                  <div style={{ fontSize: 12, color: DS.gray400, marginTop: 2 }}>A birthday card with email capture under the Buy it now button.</div>
                </div>
                <div
                  role="switch"
                  aria-checked={!!(config.birthdayCapture?.productPage?.enabled)}
                  tabIndex={0}
                  onClick={() => setConfig((c) => ({
                    ...c,
                    birthdayCapture: { ...(c.birthdayCapture || {}), productPage: { ...(c.birthdayCapture?.productPage || {}), enabled: !(c.birthdayCapture?.productPage?.enabled) } },
                  }))}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setConfig((c) => ({ ...c, birthdayCapture: { ...(c.birthdayCapture || {}), productPage: { ...(c.birthdayCapture?.productPage || {}), enabled: !(c.birthdayCapture?.productPage?.enabled) } } })); } }}
                  style={{ width: 36, height: 20, borderRadius: 10, cursor: 'pointer', background: config.birthdayCapture?.productPage?.enabled ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                >
                  <div style={{ position: 'absolute', top: 2, left: config.birthdayCapture?.productPage?.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>

              {/* Always-visible panel */}
              {(() => {
                const ppOn   = !!(config.birthdayCapture?.productPage?.enabled);
                const pp     = config.birthdayCapture?.productPage || {};
                const ppCopy = pp.copy || {};
                const setPp  = (patch) => setConfig((c) => ({
                  ...c,
                  birthdayCapture: {
                    ...(c.birthdayCapture || {}),
                    productPage: { ...(c.birthdayCapture?.productPage || {}), ...patch },
                  },
                }));
                const setPpCopy = (patch) => setConfig((c) => ({
                  ...c,
                  birthdayCapture: {
                    ...(c.birthdayCapture || {}),
                    productPage: {
                      ...(c.birthdayCapture?.productPage || {}),
                      copy: { ...(c.birthdayCapture?.productPage?.copy || {}), ...patch },
                    },
                  },
                }));

                const PP_COPY_MAX = { heading: 60, sub: 120, emailPlaceholder: 40, consent: 80, button: 30, skip: 30, saved: 80, error: 60, emailError: 60, unlockTitle: 60, openButton: 30 };
                const bdPct  = config.birthdayDiscount?.percentage ?? 15;
                const bdLead = config.birthdayDiscount?.leadDays ?? 3;

                // Resolve colours for preview
                const ppColors = resolveProductBoxColors({
                  accentColor:    pp.accentColor    || '',
                  bgColor:        pp.bgColor        || '',
                  buttonTextMode: pp.buttonTextMode || 'auto',
                  textMode:       pp.textMode       || 'auto',
                });
                const pvAccent   = ppColors.accent      || '#4F46E5';
                const pvBtnFg    = ppColors.btnFg       || '#FFFFFF';
                const pvStubFg   = ppColors.stubFg      || '#FFFFFF';
                const pvSealText = ppColors.sealText     || pvAccent;
                const pvBodyBg   = ppColors.bodyBg      || '#FFFFFF';
                const pvText     = ppColors.text        || '#18181B';
                const pvMuted    = ppColors.muted       || '#71717A';
                const pvField    = ppColors.fieldBg     || '#FFFFFF';
                const pvFBorder  = ppColors.fieldBorder || '#D4D4D8';
                const pvErr      = ppColors.err         || '#DC2626';
                const pvErrBg    = ppColors.errBg       || '#FEE2E2';
                const pvOk       = ppColors.ok          || '#16A34A';

                // Preview copy
                const pvHeading = (ppCopy.heading || '').trim() || ('Get ' + bdPct + '% off on your birthday');
                const pvSub     = (ppCopy.sub     || '').trim() || ('Tell us your birthday and we\'ll email you a gift ' + bdLead + ' days before.');
                const pvPlaceholder = (ppCopy.emailPlaceholder || '').trim() || 'Your email';
                const pvConsent = (ppCopy.consent  || '').trim() || 'Email me my birthday offer';
                const pvBtn     = (ppCopy.button   || '').trim() || 'Save my birthday';
                const pvSkip    = (ppCopy.skip     || '').trim() || 'No thanks';
                const pvSaved   = (ppCopy.saved    || '').trim() || 'Thanks! Your gift will arrive before your birthday.';
                const pvError   = (ppCopy.error    || '').trim() || 'Please select a month and day.';
                const pvEmailErr     = (ppCopy.emailError  || '').trim() || 'Enter a valid email and tick the box.';
                const pvUnlockTitle = (ppCopy.unlockTitle || '').trim() || ('Unlock ' + bdPct + '% off your birthday gift');
                const pvOpenButton  = (ppCopy.openButton  || '').trim() || 'Open my gift';

                const ppTabStyle = (active) => ({
                  fontSize: 12, padding: '4px 12px', borderRadius: 20, border: '1.5px solid ' + (active ? '#4f46e5' : '#D9D8FF'),
                  background: active ? '#4f46e5' : '#ffffff', color: active ? '#ffffff' : '#4f46e5',
                  cursor: 'pointer', fontWeight: active ? 700 : 500,
                });

                const PP_ACCENT_SWATCHES = [
                  { name: 'Indigo',   hex: '#4F46E5' },
                  { name: 'Violet',   hex: '#7C3AED' },
                  { name: 'Teal',     hex: '#0D9488' },
                  { name: 'Rose',     hex: '#E11D48' },
                  { name: 'Charcoal', hex: '#171A22' },
                ];
                const PP_BG_PRESETS = [
                  { name: 'Cream',     hex: '#FFF7ED' },
                  { name: 'Pale blue', hex: '#EEF2FF' },
                  { name: 'Smoke',     hex: '#F3F4F6' },
                  { name: 'Navy',      hex: '#0F172A' },
                ];

                const ppAccentHexValid = _HEX_RE.test(pp.accentColor || '');
                const ppBgHexValid     = _HEX_RE.test(pp.bgColor || '');
                const anyCopySetPp     = ['heading','sub','emailPlaceholder','consent','button','skip','saved','error','emailError','unlockTitle','openButton'].some((k) => (ppCopy[k] || '').trim().length > 0);

                // "Add to product page" deep-link
                const apiKey = typeof document !== 'undefined'
                  ? (document.querySelector('meta[name="shopify-api-key"]')?.getAttribute('content') || '')
                  : '';
                const shopDomain = config._shop || '';
                const themeEditorUrl = shopDomain && apiKey
                  ? ('https://' + shopDomain + '/admin/themes/current/editor?template=product&addAppBlockId=' + encodeURIComponent(apiKey + '/birthday-product') + '&target=mainSection')
                  : (shopDomain ? 'https://' + shopDomain + '/admin/themes/current/editor?template=product' : '');

                const PP_PREVIEW_TABS = ['Closed', 'Ask', 'Email error', 'Date error', 'After saving'];
                const PP_PREVIEW_TAB_STATES = [-1, 0, 1, 2, 3];

                function PpPreviewBlock() {
                  const notchStub   = 'radial-gradient(circle 11px at 0 100%,#0000 97%,#000),radial-gradient(circle 11px at 100% 100%,#0000 97%,#000)';
                  const notchBody   = 'radial-gradient(circle 11px at 0 0,#0000 97%,#000),radial-gradient(circle 11px at 100% 0,#0000 97%,#000)';
                  const dashedColor = pvStubFg === '#FFFFFF' ? 'rgba(255,255,255,0.45)' : 'rgba(23,26,34,0.45)';
                  const cardStyle   = { fontSize: 12, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.08))' };
                  const stubStyle   = { background: pvAccent, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: '16px 16px 0 0', position: 'relative', mask: notchStub, maskComposite: 'intersect', WebkitMask: notchStub, WebkitMaskComposite: 'source-in' };
                  const sealStyle   = { width: 50, height: 50, borderRadius: '50%', background: '#FFFFFF', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-8deg)', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' };
                  const bodyStyle   = { background: pvBodyBg, padding: '10px 12px 8px', color: pvText, borderRadius: '0 0 16px 16px', mask: notchBody, maskComposite: 'intersect', WebkitMask: notchBody, WebkitMaskComposite: 'source-in' };
                  const fldStyle    = { width: '100%', height: 30, fontSize: 11, border: '1px solid ' + pvFBorder, borderRadius: 6, background: pvField, color: pvText, marginBottom: 6, display: 'flex', alignItems: 'center', paddingLeft: 6, boxSizing: 'border-box' };
                  const errBoxStyle = { background: pvErrBg, borderRadius: 4, padding: '3px 7px', marginBottom: 5 };
                  const errTxtStyle = { fontSize: 10, color: pvErr, margin: 0 };
                  const pct         = ((config.birthdayDiscount && config.birthdayDiscount.percentage) || 15);

                  const stubJsx = (
                    <div style={stubStyle}>
                      <div style={{ flex: 1 }}>
                        {pvHeading && <div style={{ fontSize: 11, fontWeight: 700, color: pvStubFg, marginBottom: 2, lineHeight: 1.3 }}>{pvHeading}</div>}
                        {pvSub && <div style={{ fontSize: 10, color: pvStubFg, opacity: 0.85, lineHeight: 1.35 }}>{pvSub}</div>}
                      </div>
                      <div style={sealStyle}>
                        <div style={{ fontSize: 13 }}>🎁</div>
                        <div style={{ fontSize: 9, fontWeight: 800, color: pvSealText, marginTop: 1 }}>&minus;{pct}%</div>
                      </div>
                      <div aria-hidden="true" style={{ position: 'absolute', left: 22, right: 22, bottom: 0, borderBottom: '2px dashed ' + dashedColor, pointerEvents: 'none' }} />
                    </div>
                  );

                  // Closed teaser preview (horizontal ticket)
                  if (ppPreviewState === -1) {
                    const teaserStubStyle = { background: pvAccent, minWidth: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 8px', borderRadius: '12px 0 0 12px', position: 'relative', fontSize: 10 };
                    const teaserBodyStyle = { flex: 1, background: pvBodyBg, padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, borderRadius: '0 12px 12px 0' };
                    const teaserWrapStyle = { display: 'flex', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.10))', fontSize: 12 };
                    const ctaPillStyle = { display: 'inline-flex', alignItems: 'center', gap: 3, background: pvAccent, color: pvBtnFg, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 14, width: 'fit-content' };
                    return (
                      <div style={teaserWrapStyle}>
                        <div style={teaserStubStyle}>
                          <div style={{ fontSize: 14 }}>🎁</div>
                          <div style={{ fontSize: 8, color: pvStubFg, opacity: 0.75 }}>✦ ✦</div>
                        </div>
                        <div style={teaserBodyStyle}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: pvText, lineHeight: 1.3 }}>{pvUnlockTitle}</div>
                          <div style={ctaPillStyle}>{pvOpenButton} →</div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div style={cardStyle}>
                      {stubJsx}
                      <div style={bodyStyle}>
                        {ppPreviewState === 3 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', padding: '8px 0', fontSize: 13, fontWeight: 600, color: pvOk }}>
                            ✓ {pvSaved}
                          </div>
                        ) : (<>
                          {ppPreviewState === 1
                            ? (<>
                                <div style={{ ...fldStyle, borderColor: pvErr }}>{pvPlaceholder}</div>
                                <div style={errBoxStyle}><div style={errTxtStyle}>{pvEmailErr}</div></div>
                              </>)
                            : <div style={fldStyle}>{pvPlaceholder}</div>
                          }
                          <div style={{ display: 'flex', gap: 5, marginBottom: ppPreviewState === 2 ? 2 : 5 }}>
                            <div style={{ ...fldStyle, marginBottom: 0, flex: 1, ...(ppPreviewState === 2 ? { borderColor: pvErr } : {}) }}>Month</div>
                            <div style={{ ...fldStyle, marginBottom: 0, flex: 1, ...(ppPreviewState === 2 ? { borderColor: pvErr } : {}) }}>Day</div>
                          </div>
                          {ppPreviewState === 2 && <div style={{ ...errBoxStyle, marginTop: 2 }}><div style={errTxtStyle}>{pvError}</div></div>}
                          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start', marginBottom: 5, marginTop: 3 }}>
                            <div style={{ width: 11, height: 11, border: '1px solid ' + pvMuted, borderRadius: 2, marginTop: 1, flexShrink: 0 }} />
                            <div style={{ fontSize: 10, color: pvMuted, lineHeight: 1.35 }}>{pvConsent}</div>
                          </div>
                          <div style={{ background: pvAccent, color: pvBtnFg, borderRadius: 8, padding: '7px', textAlign: 'center', fontSize: 11, fontWeight: 700, marginBottom: 3 }}>{pvBtn}</div>
                          <div style={{ textAlign: 'center', fontSize: 10, color: pvMuted }}>{pvSkip}</div>
                        </>)}
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{ borderTop: `1px solid ${DS.gray200}`, paddingTop: 14, paddingBottom: 14 }}>
                    {/* OFF state */}
                    {!ppOn && (
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ background: '#ffffff', border: '1px solid #D9D8FF', borderRadius: 8, padding: '14px 16px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#171A22', marginBottom: 8 }}>Product page box is off</div>
                            {/* Setup card */}
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>To add the birthday box to your product page:</div>
                            <ol style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.8 }}>
                              <li>Switch on the toggle above.</li>
                              <li>Click &ldquo;Add to product page&rdquo; — the theme editor opens.</li>
                              <li>Place the <strong>Birthday box</strong> block under Buy it now, then save.</li>
                            </ol>
                            {themeEditorUrl && (
                              <a href={themeEditorUrl} target="_blank" rel="noreferrer"
                                style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#fff', background: '#4f46e5', borderRadius: 6, padding: '6px 14px', textDecoration: 'none' }}>
                                Add to product page ↗
                              </a>
                            )}
                            <div style={{ marginTop: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#92400e' }}>
                              ⚠ Horizon themes: place the block inside the <strong>Main product</strong> section so it renders near the buy button.
                            </div>
                          </div>
                        </div>
                        <div style={{ width: 260, flexShrink: 0, minWidth: 200 }}>
                          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                            {PP_PREVIEW_TABS.map((lbl, i) => {
                              const st = PP_PREVIEW_TAB_STATES[i];
                              return (
                                <button key={lbl} type="button" onClick={() => setPpPreviewState(st)}
                                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, border: '1.5px solid ' + (ppPreviewState === st ? '#374151' : '#D9D8FF'), background: ppPreviewState === st ? '#374151' : '#fff', color: ppPreviewState === st ? '#fff' : '#6b7280', cursor: 'pointer', fontWeight: ppPreviewState === st ? 700 : 500 }}
                                >{lbl}</button>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Preview</div>
                          <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 2, background: '#111827', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                              Product page box is off
                            </div>
                            <div style={{ opacity: 0.55 }}><PpPreviewBlock /></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ON state */}
                    {ppOn && (
                      <div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                          <button type="button" onClick={() => setPpView(0)} style={ppTabStyle(ppView === 0)}>Wording</button>
                          <button type="button" onClick={() => setPpView(1)} style={ppTabStyle(ppView === 1)}>Colours</button>
                        </div>
                        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          {/* Left: Wording or Colours */}
                          <div style={{ flex: 1, minWidth: 220 }}>
                            {ppView === 0 && (<>
                              <div style={{ fontSize: 12, color: '#5A6070', marginBottom: 12 }}>
                                Leave a field empty to use the default. Use{' '}
                                <code style={{ background: '#ede9fe', borderRadius: 3, padding: '1px 4px', fontSize: 11 }}>{'{pct}'}</code>{' '}for the discount %{' '}and{' '}
                                <code style={{ background: '#ede9fe', borderRadius: 3, padding: '1px 4px', fontSize: 11 }}>{'{days}'}</code>{' '}for lead days.
                              </div>
                              <PoCopyField fieldKey="heading" label="Heading" placeholder="Get {pct}% off on your birthday" value={ppCopy.heading || ''} maxLen={PP_COPY_MAX.heading} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="sub" label="Sub-text" placeholder={'Tell us your birthday and we\'ll email you a gift {days} days before.'} helper="Use {pct} for the discount %." value={ppCopy.sub || ''} maxLen={PP_COPY_MAX.sub} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="emailPlaceholder" label="Email placeholder" placeholder="Your email" value={ppCopy.emailPlaceholder || ''} maxLen={PP_COPY_MAX.emailPlaceholder} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="consent" label="Consent line" placeholder="Email me my birthday offer" helper="Shown next to the consent checkbox." value={ppCopy.consent || ''} maxLen={PP_COPY_MAX.consent} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="button" label="Save button" placeholder="Save my birthday" value={ppCopy.button || ''} maxLen={PP_COPY_MAX.button} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="skip" label="Skip link" placeholder="No thanks" value={ppCopy.skip || ''} maxLen={PP_COPY_MAX.skip} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="saved" label="Success message" placeholder="Thanks! Your gift will arrive before your birthday." helper="Shown after saving. Green text — always." value={ppCopy.saved || ''} maxLen={PP_COPY_MAX.saved} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="error" label="Date error" placeholder="Please select a month and day." helper="Red text — always." value={ppCopy.error || ''} maxLen={PP_COPY_MAX.error} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="emailError" label="Email error" placeholder="Enter a valid email and tick the box." helper="Red text — always." value={ppCopy.emailError || ''} maxLen={PP_COPY_MAX.emailError} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="unlockTitle" label="Unlock title" placeholder="Unlock {pct}% off your birthday gift" helper="Teaser heading before the gift is opened. Use {pct} for the discount %." value={ppCopy.unlockTitle || ''} maxLen={PP_COPY_MAX.unlockTitle} onPatch={setPpCopy} />
                              <PoCopyField fieldKey="openButton" label="Open button" placeholder="Open my gift" helper="Teaser CTA pill." value={ppCopy.openButton || ''} maxLen={PP_COPY_MAX.openButton} onPatch={setPpCopy} />
                              <div style={{ marginBottom: 10 }}>
                                <button type="button" disabled={!anyCopySetPp}
                                  onClick={() => setPpCopy({ heading: '', sub: '', emailPlaceholder: '', consent: '', button: '', skip: '', saved: '', error: '', emailError: '', unlockTitle: '', openButton: '' })}
                                  style={{ fontSize: '11.5px', color: anyCopySetPp ? '#4f46e5' : '#9ca3af', background: 'none', border: 'none', cursor: anyCopySetPp ? 'pointer' : 'default', padding: 0, textDecoration: anyCopySetPp ? 'underline' : 'none' }}
                                >
                                  Reset wording
                                </button>
                              </div>
                              {themeEditorUrl && (
                                <a href={themeEditorUrl} target="_blank" rel="noreferrer"
                                  style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#fff', background: '#4f46e5', borderRadius: 6, padding: '6px 14px', textDecoration: 'none', marginBottom: 8 }}>
                                  Add to product page ↗
                                </a>
                              )}
                              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#92400e' }}>
                                ⚠ Horizon themes: place the block inside the <strong>Main product</strong> section.
                              </div>
                            </>)}

                            {ppView === 1 && (<>
                              <PoSwatchRow label="Accent colour" field="accentColor" swatches={PP_ACCENT_SWATCHES} value={pp.accentColor || ''} onPatch={setPp} />
                              {!ppAccentHexValid && (pp.accentColor || '') !== '' && (
                                <div style={{ fontSize: 11, color: '#dc2626', marginTop: -8, marginBottom: 10 }}>Not a valid 6-digit hex — enter #RRGGBB</div>
                              )}
                              <PoModeRow label="Button text" field="buttonTextMode" options={[{ val: 'auto', lbl: 'Auto' }, { val: 'white', lbl: 'White' }, { val: 'dark', lbl: 'Dark' }]} value={pp.buttonTextMode || 'auto'} onPatch={setPp} />
                              {ppColors.lowBtnContrast && (
                                <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', marginTop: 4, marginBottom: 4 }}>
                                  ⚠ Low contrast — the button text may be hard to read on this accent colour. Try Auto or a darker accent.
                                </div>
                              )}
                              <PoSwatchRow label="Box background" field="bgColor" swatches={PP_BG_PRESETS} value={pp.bgColor || ''} allowEmpty emptyLabel="White" onPatch={setPp} />
                              {!ppBgHexValid && (pp.bgColor || '') !== '' && (
                                <div style={{ fontSize: 11, color: '#dc2626', marginTop: -8, marginBottom: 10 }}>Not a valid 6-digit hex — enter #RRGGBB</div>
                              )}
                              <PoModeRow label="Text colour" field="textMode" options={[{ val: 'auto', lbl: 'Auto' }, { val: 'white', lbl: 'White' }, { val: 'dark', lbl: 'Dark' }]} value={pp.textMode || 'auto'} onPatch={setPp} />
                              {ppColors.lowTextContrast && (
                                <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', marginTop: 4, marginBottom: 4 }}>
                                  ⚠ Low text contrast — the chosen text colour may be hard to read on this background. Try Auto.
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: '#5A6070', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}>
                                White gives a clean white card. Pick a colour for a tinted card.
                              </div>
                            </>)}
                          </div>

                          {/* Right: preview */}
                          <div style={{ width: 260, flexShrink: 0, minWidth: 200 }}>
                            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                              {PP_PREVIEW_TABS.map((lbl, i) => {
                                const st = PP_PREVIEW_TAB_STATES[i];
                                return (
                                  <button key={lbl} type="button" onClick={() => setPpPreviewState(st)}
                                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, border: '1.5px solid ' + (ppPreviewState === st ? '#4f46e5' : '#D9D8FF'), background: ppPreviewState === st ? '#4f46e5' : '#fff', color: ppPreviewState === st ? '#fff' : '#6b7280', cursor: 'pointer', fontWeight: ppPreviewState === st ? 700 : 500 }}
                                  >{lbl}</button>
                                );
                              })}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Preview</div>
                            <PpPreviewBlock />
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                              Saved with &ldquo;Save discount settings&rdquo;.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Method 5: Top announcement banner */}
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

export { buildPayload };
