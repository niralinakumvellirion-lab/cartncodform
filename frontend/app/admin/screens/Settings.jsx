'use client';

import { useState, useEffect, useRef } from 'react';
import { Banner, Button } from '@shopify/polaris';
import { apiGet, apiSend, BACKEND_URL } from '../../../lib/api';
import { POPUP_STYLES, STYLE_ORDER, getStyle, getStyleFieldValue, resolveStyleId, MOBILE_ONLY_STYLE_IDS } from '../lib/popupStyles';

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

const TONES = ['friendly', 'direct', 'playful'];
const LANGS = [
  { value: 'en', label: 'English' },
  { value: 'hinglish', label: 'Hinglish' },
  { value: 'hi', label: 'Hindi' },
  { value: 'gu', label: 'Gujarati' },
];

// Mirrors ccf-push.js's ccfAllowButtonStyle(accentColor, ctaStyle, compact)
// exactly (same radius/fill/shadow rules, same fallback-to-'rounded' for an
// unrecognized/missing ctaStyle) — this now drives the Allow button for
// EVERY layout and style in the preview (Split/Card/Banner/Flash Sale/Gift
// Reveal), not just a subset, matching the storefront's own unification.
// `compact` selects Banner's smaller inline-bar sizing.
function getAllowButtonStyle(accent, ctaStyle, compact) {
  const radius = { rounded: 14, square: 0, pill: 999, outlined: 14, soft: 14 }[ctaStyle] ?? 14;
  const sizing = {
    ...(compact ? {} : { width: '100%' }),
    padding: compact ? '8px 16px' : 14,
    fontSize: compact ? 13 : 15,
    fontWeight: 700,
    borderRadius: radius,
    letterSpacing: '0.3px',
    ...(compact ? {} : { marginBottom: 10 }),
  };
  if (ctaStyle === 'outlined') {
    const c = compact ? '#fff' : accent;
    return { ...sizing, color: c, background: 'transparent', border: `1.5px solid ${c}` };
  }
  if (ctaStyle === 'soft') {
    const c = compact ? '#fff' : accent;
    const bg = compact ? 'rgba(255,255,255,0.18)' : accent + '1f';
    return { ...sizing, color: c, background: bg, border: 'none' };
  }
  // rounded / square / pill / unrecognized (-> rounded)
  if (compact) {
    return { ...sizing, color: accent, background: '#fff', border: 'none' };
  }
  return {
    ...sizing, color: '#fff',
    background: `linear-gradient(135deg, ${accent}, ${accent}dd)`,
    border: 'none', boxShadow: `0 4px 15px ${accent}44`,
  };
}

// popup-style: real-deadline countdown formatting — ms must already be a
// positive real duration (this app never shows a fake per-visitor timer;
// see the countdown source rules in flash_sale's extraFields).
function formatCountdown(ms) {
  if (!(ms > 0)) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Icon set matching extensions/cartncodform-embed/assets/ccf-push.js's
// CCF_ICONS exactly (same Lucide-style paths) — the preview's step icons
// (loader/check/gift) must be the same glyphs a real customer sees, not
// just similar ones. 'loader' spins via the .ccf-preview-spin class (see
// the <style> block in the main render, mirroring ccf-push.js's own
// .ccf-spin/@keyframes ccfSpin).
function Icon({ name, size = 16, color, style }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color || 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
    strokeLinejoin: 'round', 'aria-hidden': true,
    style: { verticalAlign: 'middle', flexShrink: 0, ...style },
  };
  if (name === 'gift') {
    return (
      <svg {...common}>
        <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" />
        <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
        <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
      </svg>
    );
  }
  if (name === 'check') {
    return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
  }
  if (name === 'loader') {
    return (
      <svg {...common} className="ccf-preview-spin">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    );
  }
  if (name === 'bag') {
    return (
      <svg {...common}>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    );
  }
  // image-section-redesign: pencil ("change image") and trash ("remove
  // image") — replacing the old text-only "Change"/"Remove" links on the
  // Image row.
  if (name === 'pencil') {
    return <svg {...common}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>;
  }
  if (name === 'trash') {
    return (
      <svg {...common}>
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    );
  }
  return null;
}

// --- Popup preview step machine ------------------------------------------
// Mirrors ccf-push.js's showSoftPrompt() Allow-button flow (the "new
// subscriber" path — Notification.permission !== 'granted' — since that's
// what every first-time visitor actually sees) exactly: label text/icon per
// stage, and whether a discount stage even exists at all.
const STEP_DELAY_MS = 800;

function sanitizeCodePrefix(prefix, fallback) {
  const clean = String(prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return clean || fallback;
}

// The Allow button's own label/icon per step — matches buildAllowBtn()'s
// plain textContent at 'prompt' and ccfSetLabel()'s icon+text at every
// later stage, verbatim (including the exact "Subscribed! Getting your
// discount..." vs "Subscribed!" branch on wantsDiscount).
function AllowButtonLabel({ step, allowText, wantsDiscount }) {
  if (step === 'setting_up') {
    return <><Icon name="loader" size={14} style={{ marginRight: 6 }} />Setting up...</>;
  }
  if (step === 'subscribed') {
    return (
      <>
        <Icon name="check" size={14} style={{ marginRight: 6 }} />
        {wantsDiscount ? 'Subscribed! Getting your discount...' : 'Subscribed!'}
      </>
    );
  }
  return allowText;
}

// Shared "unlocked code" view — matches renderDiscountCode()'s HTML exactly
// (same colors-per-style, same chipBig/codeChipEmphasis sizing, same
// "Expires in N days" + pulsing "Applying your discount automatically..."
// footer). Used for BOTH the 'unlocked' and 'redirecting' steps — in
// ccf-push.js these are the SAME rendered DOM (renderDiscountCode() builds
// one content block, then a 2s setTimeout navigates away; there is no
// second, visually distinct DOM state in between). The preview shows a
// small "Redirecting…" badge on top only for the 'redirecting' step, as a
// preview-only annotation of that imminent (but never actually performed)
// navigation — see audits/popup-preview-flow-audit.txt.
function UnlockedView({ styleId, percentage, expiryDays, code, codeChipEmphasis, showRedirectingBadge }) {
  // mobile-styles: Story Card also renders on a dark/photo background, same
  // as Flash Sale — the unlocked-code view needs the light-on-dark palette
  // there too, or its text is unreadable.
  const isDark = styleId === 'flash_sale' || styleId === 'story_card';
  const chipBig = styleId === 'gift_reveal' && codeChipEmphasis !== false;
  const titleColor = isDark ? '#ffffff' : '#111827';
  const subColor = isDark ? '#d4d4d8' : '#6b7280';
  const chipBg = isDark ? 'linear-gradient(135deg,#27272a,#3f3f46)' : 'linear-gradient(135deg,#f0f4ff,#e8edff)';
  const chipBorder = isDark ? '1.5px dashed #52525b' : '1.5px dashed #818cf8';
  const chipCodeColor = isDark ? '#ffffff' : '#4338ca';
  const chipLabelColor = isDark ? '#a1a1aa' : '#6366f1';
  const footerColor = isDark ? '#86efac' : '#16a34a';

  return (
    <div style={{ textAlign: 'center', padding: '8px 0 4px', position: 'relative' }}>
      {showRedirectingBadge && (
        <div style={{ fontSize: 10, fontWeight: 700, color: footerColor, marginBottom: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Icon name="loader" size={11} /> REDIRECTING (SIMULATED — NO REAL NAVIGATION)
        </div>
      )}
      <div style={{ color: footerColor, lineHeight: 1, marginBottom: 10,
                    display: 'flex', justifyContent: 'center' }}>
        <Icon name="gift" size={40} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: titleColor, marginBottom: 4 }}>
        {percentage}% OFF Unlocked!
      </div>
      <div style={{ fontSize: 12, color: subColor, marginBottom: 14 }}>
        Expires in {expiryDays} days
      </div>
      <div style={{ background: chipBg, border: chipBorder, borderRadius: 14,
                    padding: chipBig ? 18 : 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: chipLabelColor, fontWeight: 600, letterSpacing: 2, marginBottom: 6 }}>
          YOUR DISCOUNT CODE
        </div>
        <div style={{ fontSize: chipBig ? 26 : 22, fontWeight: 800, letterSpacing: 4,
                      fontFamily: 'monospace', color: chipCodeColor }}>
          {code}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    fontSize: 13, color: footerColor, fontWeight: 500 }}>
        <Icon name="check" size={14} /> Applying your discount automatically...
      </div>
    </div>
  );
}

// Preview-only: shown after Deny/"No thanks"/X (reason='dismissed'), or
// after a no-discount subscribe completes (reason='closed', matching
// ccf-push.js's `if (!wantsDiscount) { setTimeout(cleanup, 900); }`).
// ccf-push.js's cleanup() just removes the popup from the DOM entirely in
// both cases (no visible state of its own); an actually-empty preview
// panel would look broken in the admin, so this stands in for "nothing is
// here right now."
// step-bar-replay-removed: no more "Click Replay to see it again" — there
// is no Replay control any more. Changing the style, device, or any
// setting is what resets the preview back to Prompt (see previewResetKey).
function DismissedNote({ device, reason = 'dismissed' }) {
  return (
    <div style={{ padding: device === 'mobile' ? '32px 16px' : '40px 16px', textAlign: 'center',
                  color: '#9ca3af', fontSize: 13, border: '1px dashed #e5e7eb', borderRadius: 12 }}>
      {reason === 'closed'
        ? 'Subscribed — popup closed (no discount configured).'
        : 'Popup dismissed.'}
    </div>
  );
}

// --- Compact popup-customizer rows ---------------------------------------
// One shared visual shell (label | control | ...) for every setting row in
// the redesigned popup editor. ~36px tall so many fit without scrolling.
const rowShell = {
  display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, padding: '2px 0',
};
const rowLabelStyle = { width: 108, flexShrink: 0, fontSize: 12, color: '#6b7280' };
const rowFocusInputStyle = {
  flex: 1, padding: '5px 8px', fontSize: 13, border: '1px solid #c7d2fe',
  borderRadius: 6, outline: 'none', color: '#111827', minWidth: 0,
};

function SectionHeading({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                  letterSpacing: '0.06em', margin: '16px 0 4px' }}>
      {children}
    </div>
  );
}

// Pencil-reveals-input pattern — only free-text fields use this (Headline,
// Subtext, Brand name, Allow/Deny button text). Enter/blur commits, Escape
// restores the value the row had when editing started.
function TextEditRow({ fieldKey, label, value, placeholder, onCommit, maxLength, editingField, onStartEdit, onStopEdit, editable = true, staticText }) {
  const editing = editable && editingField === fieldKey;
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { if (editing) setDraft(value || ''); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => { onCommit(draft); onStopEdit(); };
  const cancel = () => onStopEdit();

  // image-url-display-fix: a base64 data: URI is meaningless as editable
  // text — show a plain, non-interactive label instead and skip the
  // pencil. The stored value itself is untouched; this only changes what
  // renders when not in edit mode.
  if (!editable) {
    return (
      <div style={rowShell}>
        <div style={rowLabelStyle}>{label}</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#9ca3af', padding: '5px 2px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {staticText ?? (value || placeholder || '—')}
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div style={rowShell}>
        <div style={rowLabelStyle}>{label}</div>
        <input
          autoFocus
          value={draft}
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          className="ccf-style-focus"
          style={rowFocusInputStyle}
        />
      </div>
    );
  }
  // pencil-removed: the value button is now the only click target — the
  // pencil was redundant with it. Hover feedback (row tint + blue value
  // text) replaces the icon as the "this is editable" signal; done via a
  // CSS class (ccf-text-row) since inline styles can't express :hover.
  return (
    <div style={rowShell} className="ccf-text-row">
      <div style={rowLabelStyle}>{label}</div>
      <button
        type="button"
        onClick={() => onStartEdit(fieldKey)}
        aria-label={`Edit ${label}`}
        className="ccf-style-focus ccf-text-row-value"
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
          padding: '5px 2px', fontSize: 13, color: value ? '#111827' : '#9ca3af', cursor: 'pointer',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {value || placeholder || '—'}
      </button>
    </div>
  );
}

function ColorRow({ label, value, defaultValue, onChange }) {
  const v = value || defaultValue;
  return (
    <div style={rowShell}>
      <div style={rowLabelStyle}>{label}</div>
      <input
        type="color"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} colour`}
        style={{ width: 26, height: 26, padding: 0, border: '1px solid #e5e7eb', borderRadius: '50%',
          cursor: 'pointer', overflow: 'hidden' }}
      />
      <span style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{v}</span>
    </div>
  );
}

function SelectRow({ label, value, options, onChange }) {
  return (
    <div style={rowShell}>
      <div style={rowLabelStyle}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="ccf-style-focus"
        style={{ flex: 1, padding: '5px 8px', fontSize: 12, border: '1px solid #e5e7eb',
          borderRadius: 6, background: '#fff', color: '#374151', cursor: 'pointer', minWidth: 0 }}>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}

function PillsRow({ label, value, options, onChange }) {
  return (
    <div style={{ ...rowShell, alignItems: 'flex-start' }}>
      <div style={{ ...rowLabelStyle, marginTop: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
              aria-pressed={active} className="ccf-style-focus"
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: active ? 700 : 500,
                color: active ? '#fff' : '#374151', background: active ? '#4f46e5' : '#f9fafb',
                border: '1px solid', borderColor: active ? '#4f46e5' : '#e5e7eb',
                borderRadius: 999, cursor: 'pointer' }}>
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// real-switch: same shape as the Discounts screen's own toggle (track
// 36x20, knob 16, radius 10), blue when on / grey when off instead of
// that screen's green — a real <button role="switch"> (Discounts' own
// is a plain <div onClick>), so this one gets keyboard support for free
// from native <button> Enter/Space activation, no extra handler needed.
function ToggleRow({ label, checked, onChange }) {
  return (
    <div style={rowShell}>
      <div style={rowLabelStyle}>{label}</div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" role="switch" aria-checked={checked} aria-label={label}
          onClick={() => onChange(!checked)} className="ccf-style-focus"
          style={{ width: 36, height: 20, borderRadius: 10, border: 'none', padding: 0,
            background: checked ? '#4f46e5' : '#d1d5db', position: 'relative',
            cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s' }}>
          <span aria-hidden="true" style={{ position: 'absolute', top: 2, left: checked ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
        </button>
      </div>
    </div>
  );
}

function RadiusRow({ label, value, min = 0, max = 24, onChange }) {
  return (
    <div style={rowShell}>
      <div style={rowLabelStyle}>{label}</div>
      <input type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="ccf-style-focus"
        style={{ width: 56, padding: '5px 8px', fontSize: 12, border: '1px solid #e5e7eb',
          borderRadius: 6, color: '#374151' }} />
      <span style={{ fontSize: 12, color: '#9ca3af' }}>px</span>
    </div>
  );
}

// 3x3 segmented grid — the task's spec for "Image position" ("small
// segmented pills"), replacing the old free-drag crosshair widget. A
// previously-set custom (drag-produced) value still applies and still
// loads/saves correctly — it just won't highlight any one cell as
// selected unless it exactly matches a preset; clicking a cell always
// writes a clean preset value going forward.
const IMAGE_POSITION_PRESETS = [
  ['0% 0%', '↖'], ['50% 0%', '↑'], ['100% 0%', '↗'],
  ['0% 50%', '←'], ['50% 50%', '•'], ['100% 50%', '→'],
  ['0% 100%', '↙'], ['50% 100%', '↓'], ['100% 100%', '↘'],
];
function ImagePositionGrid({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 24px)', gap: 3 }}>
      {IMAGE_POSITION_PRESETS.map(([pos, glyph]) => {
        const active = value === pos;
        return (
          <button key={pos} type="button" onClick={() => onChange(pos)} aria-label={`Focus ${pos}`}
            aria-pressed={active} className="ccf-style-focus"
            style={{ width: 24, height: 24, fontSize: 11, lineHeight: '24px', textAlign: 'center',
              padding: 0, border: '1px solid', borderColor: active ? '#4f46e5' : '#e5e7eb',
              borderRadius: 4, background: active ? '#eef2ff' : '#fff',
              color: active ? '#4f46e5' : '#9ca3af', cursor: 'pointer' }}>
            {glyph}
          </button>
        );
      })}
    </div>
  );
}

// image-section-redesign: a bigger, clearly-visible preview (was a 28px
// swatch) with a checkerboard backdrop so transparent PNGs read
// correctly, and icon-only pencil/trash buttons overlaid on the corner
// instead of "Change"/"Remove" text links.
const CCF_CHECKERBOARD_BG = {
  backgroundColor: '#fff',
  backgroundImage: 'linear-gradient(45deg,#e5e7eb 25%,transparent 25%),' +
    'linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),' +
    'linear-gradient(45deg,transparent 75%,#e5e7eb 75%),' +
    'linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};
function ImageRow({ label, imageUrl, imagePosition, onUpload, onRemove }) {
  const iconBtnStyle = {
    width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.95)',
    border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', padding: 0,
  };
  return (
    <div style={{ padding: '2px 0' }}>
      <div style={rowLabelStyle}>{label}</div>
      <div style={{ position: 'relative', marginTop: 6 }}>
        <div style={{ width: '100%', height: 96, borderRadius: 10, overflow: 'hidden',
          border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...(imageUrl ? CCF_CHECKERBOARD_BG : { background: '#f9fafb' }) }}>
          {imageUrl ? (
            // image-focus-thumbnail-fix: was missing objectPosition, so the
            // thumbnail never moved when a focus preset (or the exact x%/y%
            // override) changed, even though the stored value and the live
            // preview below were both already correct.
            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover',
              objectPosition: imagePosition || '50% 50%' }} />
          ) : (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>No image</span>
          )}
        </div>
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
          <label className="ccf-style-focus" style={iconBtnStyle}
            aria-label={imageUrl ? 'Change image' : 'Upload image'}
            title={imageUrl ? 'Change image' : 'Upload image'}>
            <Icon name="pencil" size={14} color="#4f46e5" />
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onUpload} />
          </label>
          {imageUrl && (
            <button type="button" onClick={onRemove} className="ccf-style-focus"
              aria-label="Remove image" title="Remove image" style={iconBtnStyle}>
              <Icon name="trash" size={14} color="#dc2626" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// A style-gallery card: a small, LIVE (not static) preview of the actual
// style/layout, scaled down via CSS transform so it's the merchant's real
// current settings, not a screenshot.
function GalleryCard({ card, selected, disabled, disabledReason, mobileOnly, previewNode, onClick }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={selected}
      aria-disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className="ccf-style-card"
      style={{
        textAlign: 'left', padding: 10, borderRadius: 12,
        border: selected ? '2px solid #4f46e5' : '1px solid #e5e7eb',
        background: selected ? '#eef2ff' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ height: 96, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6',
        position: 'relative' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%) scale(0.34)', transformOrigin: 'center',
          width: 340, pointerEvents: 'none' }}>
          {previewNode}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', display: 'flex',
          alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {card.name}
          {mobileOnly && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', background: '#eef2ff',
              border: '1px solid #c7d2fe', borderRadius: 999, padding: '1px 6px', letterSpacing: '0.02em' }}>
              Mobile only
            </span>
          )}
          {selected && <span style={{ fontSize: 10, fontWeight: 700, color: '#4f46e5' }}>✓ Selected</span>}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, lineHeight: 1.4 }}>
          {card.desc}
        </div>
        {disabled && disabledReason && (
          <div style={{ fontSize: 10, fontWeight: 600, color: '#b91c1c', marginTop: 4 }}>
            {disabledReason}
          </div>
        )}
      </div>
    </button>
  );
}

// Shared Flash Sale / Gift Reveal preview, used for BOTH the desktop and
// mobile preview slots (both styles wrap the `card` layout — see
// popupStyles.js). Mirrors, but does not share code with, the storefront's
// own buildFlashSaleCard()/buildGiftRevealCard() in push-notifications.liquid
// — see audits/popup-style-audit-before.txt item 8 for why there's no
// shared runtime between the two, and the per-style parity checklist that
// keeps them visually in sync instead.
// Small circular X, top-right — matches ccf-push.js's closeBtn exactly: a
// sibling of the content section, so (per ccf-push.js) it stays mounted and
// clickable through EVERY step, including 'unlocked'/'redirecting'.
// Defaults (size 26/14px, top/right 12) match Card/Flash Sale/Gift Reveal's
// real closeBtn exactly. Split passes its own real values (28/16px, and
// 10/10 on mobile vs 12/12 on desktop) — see the two ClassicPreview split
// branches below.
// gallery-nested-button-fix: the gallery's mini-previews render this inside
// GalleryCard's own <button>, so it can't be a real <button> there too
// (invalid HTML, hydration warning) — interactive=false renders a plain,
// unclickable <span> instead. The full-size editor preview keeps the real
// <button> (interactive defaults to true).
function ClosePreviewButton({ dark, onClick, size = 26, top = 12, right = 12, fontSize = 14, background, color, interactive = true }) {
  const bg = background || (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.35)');
  const sharedStyle = { position: 'absolute', top, right, background: bg,
    color: color || '#fff', border: 'none', borderRadius: '50%', width: size, height: size, fontSize,
    lineHeight: size + 'px', fontFamily: 'inherit', textAlign: 'center', zIndex: 10 };
  if (!interactive) {
    return <span aria-hidden="true" style={{ ...sharedStyle, cursor: 'default' }}>×</span>;
  }
  return (
    <button type="button" onClick={onClick} aria-label="Dismiss popup" className="ccf-style-focus"
      style={{ ...sharedStyle, cursor: 'pointer' }}>
      ×
    </button>
  );
}

// gallery-nested-button-fix: same rationale as ClosePreviewButton above —
// Allow/Deny/email-field controls are real interactive elements too, so
// they can't nest inside GalleryCard's <button> in the gallery's mini
// previews either. interactive=false swaps <button> for a plain <div> and
// <input> for a plain, read-only-looking <div> with the same text/style;
// the full-size editor preview is untouched (interactive defaults true).
function PreviewButton({ interactive = true, style, children, ...rest }) {
  if (!interactive) {
    return <div aria-hidden="true" style={{ ...style, cursor: 'default' }}>{children}</div>;
  }
  return <button {...rest} style={style}>{children}</button>;
}

function PreviewInput({ interactive = true, value, placeholder, style, onChange, ...rest }) {
  if (!interactive) {
    return (
      <div aria-hidden="true" style={{ ...style, boxSizing: 'border-box', display: 'flex',
        alignItems: 'center', color: value ? style.color : '#9ca3af' }}>
        {value || placeholder}
      </div>
    );
  }
  return <input value={value} placeholder={placeholder} onChange={onChange} style={style} {...rest} />;
}

function StyleCardPreview({
  styleId, cfg, styleFields, emailFieldEnabled, compact,
  step = 'prompt', email = '', onEmailChange, onAllow, onDismiss, wantsDiscount, unlockedInfo,
  interactive = true,
}) {
  const style = getStyle(styleId);
  const accent = cfg.accentColor || '#4f46e5';
  const headline = cfg.headline || {
    flash_sale: 'Flash Sale — limited time!',
    gift_reveal: "You've got a gift waiting",
  }[styleId] || 'Get notified about deals';
  const subtext = cfg.subtext || '';
  const allowText = cfg.allowText || 'Allow';
  const denyText = cfg.denyText || 'No thanks';
  const imageUrl = cfg.imageUrl || '';
  const radius = (cfg.borderRadius ?? 12) + 'px';
  const font = cfg.fontFamily || 'inherit';
  const padding = compact ? '14px' : '20px';
  const headlineSize = compact ? 14 : 18;
  const swapped = step === 'unlocked' || step === 'redirecting';
  const busy = step === 'setting_up' || step === 'subscribed';

  const field = (key) => getStyleFieldValue(style, styleFields, key);

  // Mirrors ccf-push.js's ccfAllowButtonStyle(accent, cfg.ctaStyle) exactly
  // — Flash Sale/Gift Reveal now respect ctaStyle's full 5-variant look too
  // (previously always a flat-color 999px pill, ignoring ctaStyle).
  const allowBtnCommon = {
    type: 'button',
    disabled: busy,
    onClick: step === 'prompt' ? onAllow : undefined,
    className: 'ccf-style-focus',
    style: {
      ...getAllowButtonStyle(accent, cfg.ctaStyle),
      fontFamily: font, lineHeight: 1.2,
      cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.8 : 1,
    },
  };
  // Matches ccfDenyButtonStyle() exactly, as a real <button> — real color
  // overrides differ per style: '#a1a1aa' for flash_sale, plain '#9ca3af'
  // (ccfDenyButtonStyle()'s own default) for gift_reveal.
  const denyLinkStyle = (color) => ({
    display: 'block', width: '100%', textAlign: 'center', fontSize: 12, color,
    cursor: 'pointer', padding: '6px 0', background: 'none', border: 'none',
    fontFamily: font, lineHeight: 1.2, letterSpacing: '0.3px',
  });
  // Real values for Gift Reveal's pill-deny variant (secondaryButtonStyle
  // === 'pill'): 13px, padding 11px, margin-top 8px.
  const pillDenyStyle = {
    width: '100%', padding: 11, fontSize: 13, fontWeight: 600, borderRadius: 999,
    border: '1px solid #e5e7eb', background: 'transparent', cursor: 'pointer',
    fontFamily: font, lineHeight: 1.2, marginTop: 8,
  };

  // --- mobile-only styles (audits/mobile-popup-styles-proposal.txt) -----

  if (styleId === 'bottom_sheet') {
    const iconArtEnabled = field('iconArtEnabled');
    const dragHandleEnabled = field('dragHandleEnabled');
    const bg = cfg.bgColor || '#ffffff';
    const fg = cfg.textColor || '#111827';
    return (
      <div style={{ border: '1px solid #e5e7eb', borderTopLeftRadius: radius, borderTopRightRadius: radius,
                    overflow: 'hidden', background: bg, color: fg, fontFamily: font, position: 'relative',
                    width: compact ? 300 : 'min(340px, 100%)',
                    boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>
        {dragHandleEnabled && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
            <div aria-hidden="true" style={{ width: 36, height: 4, borderRadius: 999, background: '#d1d5db' }} />
          </div>
        )}
        {/* mobile-popup-polish: 44x44 tap target (compact fallback 36,
            matching the compact/full split used by the other mobile styles) — was the
            26px ClosePreviewButton default. */}
        <ClosePreviewButton onClick={onDismiss} interactive={interactive}
          size={compact ? 36 : 44} fontSize={compact ? 14 : 16}
          top={dragHandleEnabled ? (compact ? 10 : 18) : (compact ? 4 : 12)}
          right={compact ? 4 : 12} />
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: '100%', height: compact ? 70 : 100, marginTop: 8,
            objectFit: 'cover', objectPosition: cfg.imagePosition || 'center center', display: 'block' }} />
        ) : iconArtEnabled ? (
          <div style={{ height: compact ? 50 : 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="gift" size={compact ? 30 : 40} color={accent} />
          </div>
        ) : null}
        <div style={{ padding, textAlign: 'center' }}>
          {swapped ? (
            <UnlockedView styleId={styleId} percentage={unlockedInfo.percentage}
              expiryDays={unlockedInfo.expiryDays} code={unlockedInfo.code}
              showRedirectingBadge={step === 'redirecting'} />
          ) : (
            <>
              <div style={{ fontSize: headlineSize, fontWeight: 700, marginBottom: 12 }}>{headline}</div>
              {subtext && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{subtext}</div>}
              {emailFieldEnabled && (
                <PreviewInput value={email} onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="Email address" interactive={interactive}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 12, borderRadius: 8,
                    border: '1px solid #e5e7eb', marginBottom: 8, boxSizing: 'border-box',
                    fontFamily: font, lineHeight: 1.2 }} />
              )}
              <PreviewButton {...allowBtnCommon} interactive={interactive}>
                <AllowButtonLabel step={step} allowText={allowText} wantsDiscount={wantsDiscount} />
              </PreviewButton>
              {/* mobile-popup-polish: padded to a ~44px tap target, mirroring
                  ccf-push.js's per-style Deny override (not a change to
                  denyLinkStyle() itself, which Classic/Flash Sale/Gift Reveal
                  also share and must stay byte-identical on desktop). */}
              <PreviewButton type="button" onClick={onDismiss} className="ccf-style-focus"
                style={{ ...denyLinkStyle('#9ca3af'), padding: '15px 0' }} interactive={interactive}>
                {denyText}
              </PreviewButton>
            </>
          )}
        </div>
      </div>
    );
  }

  if (styleId === 'top_bar') {
    const arrowCta = field('arrowCta');
    const bg = cfg.accentColor || accent;
    const fg = cfg.textColor && cfg.textColor !== '#111827' ? cfg.textColor : '#ffffff';
    return (
      <div style={{ borderRadius: compact ? 0 : 10, overflow: 'hidden', background: bg, color: fg,
                    fontFamily: font, display: 'flex', alignItems: 'center', gap: 10,
                    padding: compact ? '8px 10px' : '10px 14px',
                    width: compact ? 300 : 'min(340px, 100%)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
        <div style={{ flex: 1, fontSize: compact ? 12 : 13, fontWeight: 700, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {swapped ? `${unlockedInfo.percentage}% off — code ${unlockedInfo.code}` : headline}
        </div>
        {!swapped && (
          <PreviewButton {...allowBtnCommon} interactive={interactive}
            style={{ ...allowBtnCommon.style, width: 'auto', flexShrink: 0, marginBottom: 0,
              padding: compact ? '6px 12px' : '8px 16px', fontSize: compact ? 12 : 13 }}>
            {allowText}{arrowCta ? ' →' : ''}
          </PreviewButton>
        )}
        {/* mobile-popup-polish: documented exception, same as ccf-push.js's
            top_bar close X — 36px minimum tap target, short of the full
            44x44 token, since 44px would double this slim bar's height. */}
        <PreviewButton type="button" onClick={onDismiss} className="ccf-style-focus" interactive={interactive}
          style={{ background: 'none', border: 'none', color: fg, opacity: 0.75, fontSize: 16,
            cursor: 'pointer', flexShrink: 0, padding: 2, lineHeight: 1,
            minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ×
        </PreviewButton>
      </div>
    );
  }

  if (styleId === 'story_card') {
    const scrimEnabled = field('scrimEnabled');
    const fg = '#ffffff';
    return (
      <div style={{ borderRadius: radius, overflow: 'hidden', position: 'relative',
                    background: imageUrl ? '#111827' : `linear-gradient(160deg, ${accent}, ${accent}cc)`,
                    color: fg, fontFamily: font,
                    width: compact ? 240 : 'min(280px, 100%)',
                    aspectRatio: compact ? '9 / 14' : '9 / 16',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    boxShadow: '0 8px 26px rgba(0,0,0,0.25)' }}>
        {imageUrl && (
          <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: cfg.imagePosition || 'center center' }} />
        )}
        {scrimEnabled && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.78) 100%)' }} />
        )}
        {/* mobile-popup-polish: 44x44 tap target (compact fallback 36),
            same treatment as Bottom Sheet above. */}
        <ClosePreviewButton onClick={onDismiss} interactive={interactive}
          size={compact ? 36 : 44} fontSize={compact ? 14 : 16} top={compact ? 4 : 12} right={compact ? 4 : 12} />
        <div style={{ position: 'relative', padding, textAlign: 'center' }}>
          {swapped ? (
            <UnlockedView styleId={styleId} percentage={unlockedInfo.percentage}
              expiryDays={unlockedInfo.expiryDays} code={unlockedInfo.code}
              showRedirectingBadge={step === 'redirecting'} />
          ) : (
            <>
              <div style={{ fontSize: headlineSize, fontWeight: 700, marginBottom: 12 }}>{headline}</div>
              {subtext && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 12 }}>{subtext}</div>
              )}
              {emailFieldEnabled && (
                <PreviewInput value={email} onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="Email address" interactive={interactive}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 12, borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.3)', marginBottom: 8,
                    background: 'rgba(255,255,255,0.15)', color: fg, boxSizing: 'border-box',
                    fontFamily: font, lineHeight: 1.2 }} />
              )}
              <PreviewButton {...allowBtnCommon} interactive={interactive}>
                <AllowButtonLabel step={step} allowText={allowText} wantsDiscount={wantsDiscount} />
              </PreviewButton>
              <PreviewButton type="button" onClick={onDismiss} className="ccf-style-focus"
                style={{ ...denyLinkStyle('rgba(255,255,255,0.7)'), padding: '15px 0' }} interactive={interactive}>
                {denyText}
              </PreviewButton>
            </>
          )}
        </div>
      </div>
    );
  }

  if (styleId === 'flash_sale') {
    const bg = '#18181b';
    const fg = '#ffffff';
    const badgeText = field('badgeText');
    const countdownSource = field('countdownSource');
    const countdownEndsAt = field('countdownEndsAt');
    let countdownDisplay = null;
    let countdownNote = null;
    if (countdownSource === 'fixed_date') {
      if (countdownEndsAt) {
        const remaining = new Date(countdownEndsAt).getTime() - Date.now();
        countdownDisplay = formatCountdown(remaining);
        if (!countdownDisplay) countdownNote = 'That end date has already passed.';
      } else {
        countdownNote = 'Set an end date to preview the countdown.';
      }
    } else {
      countdownNote = 'Shown after a customer unlocks their code (real expiry) — not shown before then.';
    }

    return (
      <div style={{ border: '1px solid #27272a', borderRadius: radius, overflow: 'hidden',
                    background: bg, color: fg, fontFamily: font, position: 'relative',
                    // Matches ccf-push.js's real wrap width for this style
                    // (min(340px,90vw) desktop, 300px mobile) — translated
                    // to the preview's own container as min(340px,100%).
                    width: compact ? 300 : 'min(340px, 100%)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
        <ClosePreviewButton dark onClick={onDismiss} interactive={interactive} />
        {imageUrl && (
          <img src={imageUrl} alt="" style={{ width: '100%', height: compact ? 70 : 110,
            objectFit: 'cover', objectPosition: cfg.imagePosition || 'center center', display: 'block' }} />
        )}
        <div style={{ padding, textAlign: 'center' }}>
          {swapped ? (
            <UnlockedView styleId={styleId} percentage={unlockedInfo.percentage}
              expiryDays={unlockedInfo.expiryDays} code={unlockedInfo.code}
              showRedirectingBadge={step === 'redirecting'} />
          ) : (
            <>
              {badgeText && (
                <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.05em', textTransform: 'uppercase', color: accent,
                  border: `1px solid ${accent}`, borderRadius: 999, padding: '3px 10px', marginBottom: 8 }}>
                  {badgeText}
                </span>
              )}
              <div style={{ fontSize: headlineSize, fontWeight: 800, marginBottom: 6 }}>{headline}</div>
              {subtext && <div style={{ fontSize: 12, color: '#d4d4d8', marginBottom: 10 }}>{subtext}</div>}
              {emailFieldEnabled && (
                <PreviewInput value={email} onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="Email address" interactive={interactive}
                  style={{ width: '100%', padding: '8px 12px',
                  fontSize: 12, borderRadius: 8, border: '1px solid #3f3f46', marginBottom: 8,
                  background: '#27272a', color: fg, boxSizing: 'border-box',
                  fontFamily: font, lineHeight: 1.2 }} />
              )}
              {countdownDisplay ? (
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 10,
                  fontVariantNumeric: 'tabular-nums' }}>
                  {countdownDisplay}
                </div>
              ) : countdownNote && (
                <div style={{ fontSize: 10, color: '#a1a1aa', marginBottom: 10, fontStyle: 'italic' }}>
                  {countdownNote}
                </div>
              )}
              <PreviewButton {...allowBtnCommon} interactive={interactive}>
                <AllowButtonLabel step={step} allowText={allowText} wantsDiscount={wantsDiscount} />
              </PreviewButton>
              <PreviewButton type="button" onClick={onDismiss} className="ccf-style-focus"
                style={denyLinkStyle('#a1a1aa')} interactive={interactive}>
                {denyText}
              </PreviewButton>
            </>
          )}
        </div>
      </div>
    );
  }

  // gift_reveal
  const bg = cfg.bgColor || '#fff7ed';
  const fg = cfg.textColor || '#111827';
  const giftIconEnabled = field('giftIconEnabled');
  const secondaryButtonStyle = field('secondaryButtonStyle');

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: radius, overflow: 'hidden',
                  background: bg, color: fg, fontFamily: font, position: 'relative',
                  width: compact ? 300 : 'min(340px, 100%)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <ClosePreviewButton onClick={onDismiss} interactive={interactive} />
      {imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: '100%', height: compact ? 70 : 110,
          objectFit: 'cover', objectPosition: cfg.imagePosition || 'center center', display: 'block' }} />
      ) : giftIconEnabled ? (
        // ccf-push.js appends this placeholder as a SIBLING of the content
        // section, so — like the image above — it is never removed by the
        // unlocked-state swap; it stays visible above the (bigger) gift
        // icon that's part of UnlockedView's own markup too.
        <div style={{ height: compact ? 60 : 84, display: 'flex', alignItems: 'center',
                      justifyContent: 'center' }}>
          <Icon name="gift" size={compact ? 32 : 44} color={accent} />
        </div>
      ) : null}
      <div style={{ padding, textAlign: 'center' }}>
        {swapped ? (
          <UnlockedView styleId={styleId} percentage={unlockedInfo.percentage}
            expiryDays={unlockedInfo.expiryDays} code={unlockedInfo.code}
            codeChipEmphasis={field('codeChipEmphasis')} showRedirectingBadge={step === 'redirecting'} />
        ) : (
          <>
            <div style={{ fontSize: headlineSize, fontWeight: 800, marginBottom: 6 }}>{headline}</div>
            {subtext && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>{subtext}</div>}
            {emailFieldEnabled && (
              <PreviewInput value={email} onChange={(e) => onEmailChange(e.target.value)}
                placeholder="Email address" interactive={interactive}
                style={{ width: '100%', padding: '8px 12px',
                fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 8,
                boxSizing: 'border-box', fontFamily: font, lineHeight: 1.2 }} />
            )}
            <PreviewButton {...allowBtnCommon} interactive={interactive}>
              <AllowButtonLabel step={step} allowText={allowText} wantsDiscount={wantsDiscount} />
            </PreviewButton>
            {secondaryButtonStyle === 'pill' ? (
              <PreviewButton type="button" onClick={onDismiss} className="ccf-style-focus"
                style={{ ...pillDenyStyle, color: fg }} interactive={interactive}>
                {denyText}
              </PreviewButton>
            ) : (
              <PreviewButton type="button" onClick={onDismiss} className="ccf-style-focus"
                style={denyLinkStyle('#9ca3af')} interactive={interactive}>
                {denyText}
              </PreviewButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Classic split/card/banner preview, step-aware — mirrors ccf-push.js's
// showSoftPrompt() layout branches (split/card/banner DOM construction) and
// renderDiscountCode() (the shared unlocked swap) as closely as inline
// React styles reasonably can. Not attempted: ccf-push.js's decorative-only
// CSS (the .ccf-img-wrap corner-dot ::after pattern, the hover
// zoom/translateY effects, the slide-up entrance keyframe) — none of that
// is part of any STEP's content, only ambient chrome; see
// audits/popup-preview-flow-audit.txt.
function ClassicPreview({
  layout, device, popup: cfg, step, email, onEmailChange, onAllow, onDismiss,
  showEmailField, wantsDiscount, unlockedInfo, discountOfferText, discountOfferHeadline,
  interactive = true,
}) {
  const bg = cfg.bgColor || '#ffffff';
  const fg = cfg.textColor || '#111827';
  const accent = cfg.accentColor || '#4f46e5';
  const radius = (cfg.borderRadius ?? 12) + 'px';
  const font = cfg.fontFamily || 'inherit';
  const allowText = cfg.allowText || 'Allow';
  const denyText = cfg.denyText || 'No thanks';
  const headline = cfg.headline || 'Get notified about deals';
  const subtext = cfg.subtext || '';
  const brandName = cfg.brandName || '';
  const imageUrl = cfg.imageUrl || '';
  const imagePosition = cfg.imagePosition || 'center center';
  const textAlign = cfg.textAlign || 'left';
  const swapped = step === 'unlocked' || step === 'redirecting';
  const busy = step === 'setting_up' || step === 'subscribed';
  // ccf-push.js: `layout !== 'banner' && ccfDiscountEnabled()` — banner
  // never shows a discount, no matter what's configured.
  const effectiveWantsDiscount = layout === 'banner' ? false : wantsDiscount;
  const effectiveShowEmailField = layout === 'banner' ? false : showEmailField;

  const allowBtnProps = {
    disabled: busy,
    onClick: step === 'prompt' ? onAllow : undefined,
    className: 'ccf-style-focus',
  };

  // ccf-push.js: only the CARD layout's no-image gradient fallback gets a
  // centered bag icon (bounceable via ccfBounce there); split's gradient
  // fallback is plain, no icon.
  const imageBox = (heightStyle, showBagIcon) => (
    <div style={{ width: '100%', height: heightStyle, position: 'relative', overflow: 'hidden',
                  flexShrink: 0, background: imageUrl ? '#f9fafb' : 'linear-gradient(135deg,#667eea,#764ba2)' }}>
      {imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover',
          objectPosition: imagePosition, display: 'block' }} />
      ) : showBagIcon ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#fff' }}>
          <Icon name="bag" size={36} />
        </div>
      ) : null}
    </div>
  );

  const brandEl = brandName && (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase',
                  color: '#9ca3af', marginBottom: 8 }}>{brandName}</div>
  );
  const subtextEl = subtext && (
    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, textAlign }}>{subtext}</div>
  );
  // Mirrors ccf-push.js's ccfAllowButtonStyle(accent, cfg.ctaStyle) exactly
  // — Split and Card now respect ctaStyle's full 5-variant look, same as
  // the storefront (previously this preview hardcoded a 10px/13px look
  // that ignored most of getCtaStyle's own output).
  const allowBtnEl = (
    <PreviewButton {...allowBtnProps} interactive={interactive}
      style={{ ...getAllowButtonStyle(accent, cfg.ctaStyle), fontFamily: font, lineHeight: 1.2,
        cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.8 : 1 }}>
      <AllowButtonLabel step={step} allowText={allowText} wantsDiscount={effectiveWantsDiscount} />
    </PreviewButton>
  );
  // Mirrors ccfDenyButtonStyle() exactly — a real <button>, not a styled
  // <div>, matching the storefront's own element choice and every value.
  const denyEl = (
    <PreviewButton type="button" onClick={onDismiss} className="ccf-style-focus" interactive={interactive}
      style={{ display: 'block', width: '100%', textAlign: 'center', fontSize: 12, color: '#9ca3af',
        cursor: 'pointer', padding: '6px 0', background: 'none', border: 'none', fontFamily: font,
        lineHeight: 1.2, letterSpacing: '0.3px' }}>
      {denyText}
    </PreviewButton>
  );
  const brandingEl = cfg.showBranding && (
    <div style={{ marginTop: 12, fontSize: 10, color: '#d1d5db', textAlign: 'center', letterSpacing: '0.5px' }}>
      Powered by ShopiReachBoost AI
    </div>
  );

  // --- BANNER --------------------------------------------------------
  if (layout === 'banner') {
    return (
      <div style={{ borderRadius: 8, overflow: 'hidden', background: accent, color: '#fff',
                    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    fontFamily: font }}>
        {imageUrl && (
          <img src={imageUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover',
            objectPosition: imagePosition, flexShrink: 0 }} />
        )}
        <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{headline}</div>
        <PreviewButton {...allowBtnProps} interactive={interactive}
          style={{ ...getAllowButtonStyle(accent, cfg.ctaStyle, true), fontFamily: font, lineHeight: 1.2,
            flexShrink: 0, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.8 : 1 }}>
          <AllowButtonLabel step={step} allowText={allowText} wantsDiscount={false} />
        </PreviewButton>
        <span onClick={onDismiss} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18, flexShrink: 0,
          cursor: 'pointer' }}>×</span>
      </div>
    );
  }

  // --- CARD ------------------------------------------------------------
  if (layout === 'card') {
    return (
      <div style={{ borderRadius: radius, overflow: 'hidden', position: 'relative',
                    background: 'linear-gradient(145deg,#ffffff,#f8f9ff)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontFamily: font,
                    maxWidth: device === 'mobile' ? 300 : 340 }}>
        <ClosePreviewButton onClick={onDismiss} interactive={interactive} />
        {imageBox(device === 'mobile' ? 160 : 170, true)}
        <div style={{ height: 3, background: `linear-gradient(90deg,${accent},${accent}88,transparent)` }} />
        <div style={{ padding: '20px 18px 18px', background: bg, color: fg }}>
          {swapped ? (
            <UnlockedView styleId="classic" percentage={unlockedInfo.percentage}
              expiryDays={unlockedInfo.expiryDays} code={unlockedInfo.code}
              showRedirectingBadge={step === 'redirecting'} />
          ) : (
            <>
              {brandEl}
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, marginBottom: 6,
                            color: fg, textAlign }}>{headline}</div>
              {subtextEl}
              {effectiveWantsDiscount && (
                <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac',
                              borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex',
                              alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span style={{ color: '#16a34a' }}><Icon name="gift" size={16} /></span>
                  <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>{discountOfferText}</span>
                </div>
              )}
              {effectiveShowEmailField && (
                <PreviewInput value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="Your email"
                  interactive={interactive}
                  style={{ width: '100%', padding: '11px 14px', fontSize: 13, borderRadius: 12,
                    border: '1.5px solid #e5e7eb', marginBottom: 8, boxSizing: 'border-box',
                    background: '#f9fafb', color: '#111827', fontFamily: font, lineHeight: 1.2 }} />
              )}
              {allowBtnEl}
              {denyEl}
              {brandingEl}
            </>
          )}
        </div>
      </div>
    );
  }

  // --- SPLIT (desktop: side-by-side; mobile: stacked) -----------------
  const discountFieldsEl = effectiveWantsDiscount && (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8, textAlign: 'center' }}>
        {discountOfferHeadline || 'Get a discount on your first order!'}
      </div>
      {effectiveShowEmailField && (
        <PreviewInput value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="Your email"
          interactive={interactive}
          style={{ width: '100%', padding: '11px 14px', fontSize: 13, borderRadius: 12,
            border: '1.5px solid #e5e7eb', boxSizing: 'border-box', background: '#f9fafb',
            color: '#111827', fontFamily: font, lineHeight: 1.2 }} />
      )}
    </div>
  );

  const contentInner = swapped ? (
    <UnlockedView styleId="classic" percentage={unlockedInfo.percentage}
      expiryDays={unlockedInfo.expiryDays} code={unlockedInfo.code}
      showRedirectingBadge={step === 'redirecting'} />
  ) : (
    <>
      {brandEl}
      <div style={{ fontSize: device === 'mobile' ? 20 : 26, fontWeight: 700, lineHeight: 1.25,
                    marginBottom: 10, color: fg }}>{headline}</div>
      {subtext && <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>{subtext}</div>}
      {allowBtnEl}
      {denyEl}
      {discountFieldsEl}
      {brandingEl}
    </>
  );

  if (device === 'mobile') {
    return (
      <div style={{ borderRadius: radius, overflow: 'hidden', position: 'relative',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)', fontFamily: font }}>
        {/* Split's real closeBtn is 28x28/16px/rgba(0,0,0,0.4), at 10/10 on
            mobile vs 12/12 on desktop — different from Card/Flash Sale/
            Gift Reveal's 26x26/14px defaults. */}
        <ClosePreviewButton onClick={onDismiss} size={28} top={10} right={10} fontSize={16}
          background="rgba(0,0,0,0.4)" interactive={interactive} />
        {imageBox(200)}
        <div style={{ padding: '20px 18px', background: bg, color: fg }}>{contentInner}</div>
      </div>
    );
  }
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', display: 'flex',
                  minHeight: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', fontFamily: font }}>
      <ClosePreviewButton onClick={onDismiss} size={28} top={12} right={12} fontSize={16}
        background="rgba(0,0,0,0.4)" interactive={interactive} />
      <div style={{ width: '45%', flexShrink: 0 }}>{imageBox('100%')}</div>
      <div style={{ width: '55%', padding: '32px 28px', display: 'flex', flexDirection: 'column',
                    justifyContent: 'center', background: bg, color: fg }}>
        {contentInner}
      </div>
    </div>
  );
}

export default function Settings({ shop }) {
  const [voice, setVoice] = useState({});
  const [caps, setCaps] = useState({});
  const [quietHours, setQuietHours] = useState({});
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  // The Signals grid moved to "What to act on" and is not rendered here —
  // `configs` is still loaded so nothing downstream that reads it breaks.
  // The popup customizer, unlike an earlier version of this comment used to
  // claim, IS fully implemented and rendered in this same file — see
  // `popupCard`/`popupPreviewCard` below, toggled by `showPopupCustomizer`.
  const [configs, setConfigs] = useState([]);
  const [popup, setPopup] = useState({});
  // popup-responsive: separate mobile (<=600px) override config + device tab.
  const [mobilePopup, setMobilePopup] = useState({});
  const [popupDevice, setPopupDevice] = useState('desktop');
  // settings-image-skip: tracks whether the merchant uploaded/removed/pasted
  // a new image this session, so saveSettings() only re-sends the (large)
  // base64 imageUrl when it actually changed instead of on every save.
  const [popupImageChanged, setPopupImageChanged] = useState(false);
  const [mobileImageChanged, setMobileImageChanged] = useState(false);
  const [pushCount, setPushCount] = useState(0);
  const [emailCount, setEmailCount] = useState(0);
  const [showPopupCustomizer, setShowPopupCustomizer] = useState(false);
  // popup-customizer-redesign: which of the two steps is showing (gallery
  // of style cards, or the editor for whichever one was clicked), and
  // which single compact row (if any) is in inline-edit mode. Re-opening
  // the customizer always starts at the gallery — see the close handler
  // below.
  const [popupEditorOpen, setPopupEditorOpen] = useState(false);
  // gallery-close-button: tracks whether the editor has been opened at
  // least once THIS time the customizer is open — distinguishes "picked
  // a card, then came back to the gallery via Popup theme" (there's an
  // editor to return to, show the gallery's ✕) from "just opened the
  // customizer fresh" (no editor to go back to yet). Reset whenever the
  // whole customizer closes, so the next open starts clean.
  const [hasVisitedEditor, setHasVisitedEditor] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // discount-feature: true when a Shopify Admin API call was rejected with
  // ACCESS_DENIED (installed token predates write_discounts). Prompt reconnect.
  const [needsReauth, setNeedsReauth] = useState(false);
  // popup-style: the push/email discount rules from the Discounts screen's
  // own config, kept here so the interactive preview can compute the same
  // things ccf-push.js does — ccfShowEmailField() (email rule enabled),
  // ccfDiscountEnabled() (either rule enabled; phone/both are always saved
  // disabled, per the discount-redesign task, so they never contribute),
  // and a realistic sample code + real % + real expiry for the Unlocked
  // step. Never phone/both — this app's popup can only ever collect email.
  const [discountRules, setDiscountRules] = useState({
    push: { enabled: false, percentage: 10, prefix: 'PUSH', expiryDays: 7, offerText: '' },
    email: { enabled: false, percentage: 15, prefix: 'EMAIL', expiryDays: 7, offerText: '' },
    // Split layout's discount box shows THIS (DiscountConfig.offerHeadline,
    // via ccfBuildDiscountFields()) — a different field from either rule's
    // own offerText, and different again from popup.headline.
    offerHeadline: '',
  });

  // popup-responsive: mobile-first layout switch (admin viewport <= 768px).
  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    Promise.allSettled([
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/settings`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/signal-configs`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/popup`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/push-stats`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/profiles?limit=1`),
      apiGet(`/api/discounts/${encodeURIComponent(shop)}/config`),
    ]).then(([s, c, pop, ps, prof, disc]) => {
      if (cancelled) return;
      if (disc.status === 'fulfilled') {
        setNeedsReauth(!!disc.value?.needsReauth);
        const dc = disc.value?.config || {};
        setDiscountRules({
          push: {
            enabled: !!dc.pushDiscount?.enabled,
            percentage: dc.pushDiscount?.percentage ?? 10,
            prefix: dc.pushDiscount?.prefix || 'PUSH',
            expiryDays: dc.pushDiscount?.expiryDays ?? 7,
            offerText: dc.pushDiscount?.offerText || '',
          },
          email: {
            enabled: !!dc.emailDiscount?.enabled,
            percentage: dc.emailDiscount?.percentage ?? 15,
            prefix: dc.emailDiscount?.prefix || 'EMAIL',
            expiryDays: dc.emailDiscount?.expiryDays ?? 7,
            offerText: dc.emailDiscount?.offerText || '',
          },
          offerHeadline: dc.offerHeadline || '',
        });
      }
      if (s.status === 'fulfilled') {
        setVoice(s.value?.voice || {});
        setCaps(s.value?.caps || {});
        setQuietHours(s.value?.quietHours || {});
        setTimezone(s.value?.timezone || 'Asia/Kolkata');
      } else {
        setError(s.reason?.message || 'Failed to load settings');
      }
      if (c.status === 'fulfilled') {
        setConfigs(Array.isArray(c.value?.configs) ? c.value.configs : []);
      }
      if (pop.status === 'fulfilled') {
        setPopup(pop.value?.popup || {});
        setMobilePopup(pop.value?.mobilePopup || {});
      }
      if (ps.status === 'fulfilled') {
        setPushCount(ps.value?.attemptedLast7d || 0);
      }
      if (prof.status === 'fulfilled') {
        setEmailCount(prof.value?.total || 0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [shop]);

  async function saveSettings() {
    setSaving(true);
    setError('');
    setSuccess(false);
    console.log(
      '[settings] saving popup device:', popupDevice,
      'mobilePopup.layout:', mobilePopup.layout,
      'mobilePopup.imageUrl:', mobilePopup.imageUrl ? 'SET' : 'EMPTY'
    );
    try {
      // Both PATCHes are independent (different Store sub-paths) — run them
      // in parallel instead of sequentially so one being slow doesn't hold
      // up the other, and so a failure in one no longer silently skips the
      // other entirely (the old sequential version never attempted the
      // popup save at all if the settings save threw first).

      // settings-image-skip: only re-send imageUrl (a base64 string that
      // can run to tens/hundreds of KB) when it actually changed this
      // session — otherwise every save, even a color/text-only edit, was
      // re-uploading the full image for no reason.
      // Both popup and mobilePopup now use per-field dot-notation merge
      // on the backend, so imageUrl is safely omitted when unchanged.
      const popupBody = { ...popup };
      if (!popupImageChanged) delete popupBody.imageUrl;

      const mobileBody = { ...mobilePopup };
      if (!mobileImageChanged) delete mobileBody.imageUrl;

      await Promise.all([
        apiSend(`/api/profiles/${encodeURIComponent(shop)}/settings`, 'PATCH', {
          voice,
          caps,
          quietHours,
          timezone,
        }),
        apiSend(`/api/profiles/${encodeURIComponent(shop)}/popup`, 'PATCH', {
          ...popupBody,
          mobilePopup: mobileBody,
        }),
      ]);
      setSuccess(true);
      setPopupImageChanged(false);
      setMobileImageChanged(false);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // popup-responsive: the customizer UI edits whichever config the device tab
  // selects — same fields, different state.
  const activePopup = popupDevice === 'desktop' ? popup : mobilePopup;
  const setActivePopup = popupDevice === 'desktop' ? setPopup : setMobilePopup;
  // settings-image-skip: mark whichever config's image was just touched
  // (upload, remove, or paste-URL — all three mutate activePopup.imageUrl).
  const markImageChanged = () =>
    popupDevice === 'desktop' ? setPopupImageChanged(true) : setMobileImageChanged(true);

  // popup-style: which style is actually in force on the tab being edited.
  // Mobile only gets its own style when popup.mobileStyleOverride is on;
  // otherwise it inherits the desktop style (mobilePopup.styleId/
  // styleFields are simply not consulted for rendering while override is
  // off, even if they hold stale values from a previous "override on"
  // session — this matches the storefront's own resolution in
  // push-notifications.liquid).
  const mobileUsesOwnStyle = popupDevice === 'mobile' && !!popup.mobileStyleOverride;
  // mobile-only-fallback: resolveStyleId falls back to Classic for BOTH an
  // unrecognized id and a recognized-but-mobile-only id being resolved
  // while popupDevice === 'desktop' — the admin-side half of the "never
  // render a mobile-only style on desktop, anywhere" requirement. Every
  // downstream read below (POPUP_STYLES[activeStyleId], getStyle(...),
  // the live preview dispatch) is safe as a direct consequence, since none
  // of them re-check the id themselves.
  const activeStyleId = resolveStyleId(
    (mobileUsesOwnStyle ? mobilePopup.styleId : popup.styleId) || 'classic',
    popupDevice
  );
  const activeStyleFields = (mobileUsesOwnStyle ? mobilePopup.styleFields : popup.styleFields) || {};
  // Writes always go to whichever config actually owns the active style —
  // NOT necessarily `setActivePopup` (that would silently write mobile
  // style edits into mobilePopup even while the override toggle is off and
  // those fields aren't being used for anything).
  const setActiveStyle = mobileUsesOwnStyle ? setMobilePopup : setPopup;

  // --- Interactive preview: step machine -----------------------------
  // Config actually driving whatever's on screen right now (mobilePopup
  // when the Mobile tab is active, popup otherwise) — used both to render
  // the shell and as the reset trigger below.
  const previewCfg = popupDevice === 'mobile' ? mobilePopup : popup;
  const [previewStep, setPreviewStep] = useState('prompt');
  const [previewEmail, setPreviewEmail] = useState('');

  // ccfDiscountEnabled()/ccfShowEmailField() equivalents.
  const previewShowEmailField = discountRules.email.enabled;
  // ccf-push.js: `layout !== 'banner' && ccfDiscountEnabled()`. Computed
  // here (not just inside ClassicPreview's own button-label logic) because
  // the STEP MACHINE itself (auto-advance + the step bar's Unlocked/
  // Redirecting tabs, both owned by this component) must also skip the
  // discount stages entirely for a banner-layout Classic popup, exactly
  // like a real one would.
  const previewEffectiveLayout = activeStyleId !== 'classic'
    ? getStyle(activeStyleId).layoutType
    : (popupDevice === 'mobile' ? (mobilePopup.layout === 'banner' ? 'banner' : 'card') : (popup.layout || 'split'));
  const previewWantsDiscount = previewEffectiveLayout === 'banner'
    ? false
    : (discountRules.push.enabled || discountRules.email.enabled);

  // Which rule the CURRENTLY TYPED preview email would select — matches
  // ccf-push.js's `var action = email ? 'email' : 'push';` exactly.
  const previewAction = previewEmail.trim() ? 'email' : 'push';
  const previewRule = previewAction === 'email' ? discountRules.email : discountRules.push;
  const previewUnlockedInfo = {
    code: sanitizeCodePrefix(previewRule.prefix, previewAction === 'email' ? 'EMAIL' : 'PUSH') + '-A1B2C3',
    percentage: previewRule.percentage,
    expiryDays: previewRule.expiryDays,
  };
  // ccfDiscountOfferText() equivalent — email path wins when the email
  // field is actually shown, same as the storefront.
  const previewDiscountOfferText = previewShowEmailField
    ? (discountRules.email.offerText || `Add your email to get ${discountRules.email.percentage}% off`)
    : (discountRules.push.offerText || `You get ${discountRules.push.percentage}% off as a subscriber`);

  // "Changing style, device, or any field resets to Prompt and re-renders."
  const previewResetKey = JSON.stringify({
    device: popupDevice, styleId: activeStyleId, styleFields: activeStyleFields, cfg: previewCfg,
  });
  const previewResetKeyRef = useRef(previewResetKey);
  useEffect(() => {
    if (previewResetKeyRef.current === previewResetKey) return;
    previewResetKeyRef.current = previewResetKey;
    setPreviewStep('prompt');
    setPreviewEmail('');
  }, [previewResetKey]);

  // Auto-advance, ~800ms per step, mirroring the real async chain's pacing
  // (registerSW -> getToken -> saveToken -> ... -> generate-discount).
  useEffect(() => {
    if (previewStep !== 'setting_up' && previewStep !== 'subscribed' && previewStep !== 'unlocked') return;
    const t = setTimeout(() => {
      setPreviewStep((s) => {
        if (s === 'setting_up') return 'subscribed';
        if (s === 'subscribed') return previewWantsDiscount ? 'unlocked' : 'closed';
        if (s === 'unlocked') return 'redirecting';
        return s;
      });
    }, STEP_DELAY_MS);
    return () => clearTimeout(t);
  }, [previewStep, previewWantsDiscount]);

  const previews = [
    {
      signal: 'Keeps coming back',
      msg: `Still thinking about the Banarasi Silk Saree? Only 6 left${
        voice.emoji ? ' ✨' : ''
      }.`,
    },
    {
      signal: 'Cart left behind',
      msg: `Your Banarasi Silk Saree is waiting${
        voice.emoji ? ' 🧡' : ''
      }. We saved it for you.`,
    },
    {
      signal: 'Stopped at the price',
      msg: "The Banarasi Silk Saree is handwoven over weeks — here's what goes into the price.",
    },
    {
      signal: 'Going quiet',
      msg: `We've missed you. New silks just arrived.`,
    },
  ];

  const channels = [
    {
      name: 'Push',
      status: 'working',
      detail: `Working — ${pushCount || 0} reachable browsers`,
    },
    {
      name: 'Email',
      status: 'working',
      detail: `Working — ${emailCount || 0} addresses`,
    },
    {
      name: 'WhatsApp',
      status: 'coming',
      detail: 'Coming later. Connect your existing Business number.',
    },
    {
      name: 'SMS',
      status: 'coming',
      detail: 'Coming later.',
    },
  ];

  const rowLabel = {
    width: '120px',
    fontSize: '13px',
    color: '#374151',
    fontWeight: '500',
  };
  const pill = (active) => ({
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: active ? '600' : '400',
    color: active ? '#fff' : '#374151',
    background: active ? '#111827' : '#f9fafb',
    border: '1px solid',
    borderColor: active ? '#111827' : '#e5e7eb',
    borderRadius: '20px',
    cursor: 'pointer',
  });
  const numBtn = (active) => ({
    width: '36px',
    height: '36px',
    fontSize: '13px',
    fontWeight: active ? '700' : '400',
    color: active ? '#fff' : '#374151',
    background: active ? '#111827' : '#f9fafb',
    border: '1px solid',
    borderColor: active ? '#111827' : '#e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
  });
  const card = {
    ...DS.card,
    padding: isMobileView ? '16px' : DS.card.padding,
  };

  // popup-responsive: each card is a variable so the mobile (single-column)
  // and desktop (2-column) layouts can arrange them without duplicating JSX.
  const voiceCard = (
    <div style={card}>
            <div
              style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '4px',
              }}
            >
              Your voice
            </div>
            <div
              style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px' }}
            >
              I write every message in this voice. Change it and everything
              changes.
            </div>

            {/* Tone */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={rowLabel}>Tone</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: isMobileView ? 'wrap' : 'nowrap' }}>
                {TONES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setVoice((v) => ({ ...v, tone: t }))}
                    style={{
                      ...pill(voice.tone === t),
                      textTransform: 'capitalize',
                    }}
                  >
                    {t === 'friendly'
                      ? 'Warm'
                      : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={rowLabel}>Language</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {LANGS.map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() =>
                      setVoice((v) => ({ ...v, lang: lang.value }))
                    }
                    style={pill(voice.lang === lang.value)}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Emoji */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={rowLabel}>Emoji</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  onClick={() => setVoice((v) => ({ ...v, emoji: !v.emoji }))}
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
                    background: voice.emoji ? '#111827' : '#d1d5db',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: voice.emoji ? '23px' : '3px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                </div>
                <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                  {voice.emoji ? 'A little' : 'Off'}
                </span>
              </div>
            </div>

            {/* Sign off */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={rowLabel}>Sign off as</div>
              <input
                value={voice.signOff || ''}
                onChange={(e) =>
                  setVoice((v) => ({ ...v, signOff: e.target.value }))
                }
                placeholder="e.g. Team Silk House"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '13px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  outline: 'none',
                  color: '#374151',
                }}
              />
            </div>
          </div>
  );

  const howOftenCard = (
    <div style={card}>
            <div
              style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '4px',
              }}
            >
              How often
            </div>
            <div
              style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px' }}
            >
              Most customers hear from you far less than this. These are ceilings,
              not targets.
            </div>

            {/* Per day */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ width: '180px', fontSize: '13px', color: '#374151' }}>
                Per customer, per day
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCaps((c) => ({ ...c, perDay: n }))}
                    style={numBtn(caps.perDay === n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Per week */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ width: '180px', fontSize: '13px', color: '#374151' }}>
                Per customer, per week
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[2, 3, 5, 7].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCaps((c) => ({ ...c, perWeek: n }))}
                    style={numBtn(caps.perWeek === n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Quiet hours */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ width: '180px', fontSize: '13px', color: '#374151' }}>
                Quiet hours
              </div>
              <div style={{ fontSize: '13px', color: '#374151' }}>
                {quietHours.start ?? 22}:00 pm – {quietHours.end ?? 8}:00 am,{' '}
                {timezone || 'Asia/Kolkata'}
              </div>
            </div>

            {/* Stop pushing after */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '180px', fontSize: '13px', color: '#374151' }}>
                Stop pushing after
              </div>
              <div style={{ fontSize: '13px', color: '#374151' }}>
                <span style={{ fontWeight: '500' }}>
                  {caps.maxUnopenedPush || 5} unopened in a row
                </span>
                <span style={{ color: '#9ca3af' }}>
                  {' '}
                  — protects the channel from being blocked
                </span>
              </div>
            </div>
          </div>
  );

  // save-status-banner: shared by both Save buttons (the standalone
  // saveCard below, and the one embedded in popupPreviewCard while the
  // customizer is open) — a full-width block ABOVE the button row, not an
  // inline sibling of the button, so a long error can never squash the
  // button's width. error/success are never both true (saveSettings
  // resets both before every attempt), so this only ever renders one.
  const isNetworkError = error.startsWith('Cannot reach the backend');
  const saveStatusBanner = success ? (
    <div style={{ marginBottom: 12, background: '#f0fdf4', border: '1px solid #86efac',
      borderRadius: 8, padding: 12, fontSize: 13, color: '#166534' }}>
      ✓ Saved
    </div>
  ) : error ? (
    <div style={{ marginBottom: 12, background: '#fef2f2', border: '1px solid #fca5a5',
      borderRadius: 8, padding: 12, fontSize: 13, color: '#991b1b', overflowWrap: 'anywhere' }}>
      {isNetworkError ? (
        <>
          <div style={{ fontWeight: 600 }}>Couldn't save — can't reach the server.</div>
          <div style={{ marginTop: 2 }}>The app's backend may be starting up. Wait a moment and try again.</div>
          <div style={{ marginTop: 6, fontSize: 11, color: '#b91c1c', opacity: 0.85 }}>{error}</div>
        </>
      ) : error}
    </div>
  ) : null;

  // Standalone Save card — always the last thing in the right column (or
  // straight after the popup preview while the customizer is open).
  const saveCard = (
    <div
      style={{
        ...DS.card,
        padding: '16px 20px',
        marginBottom: 0,
      }}
    >
      {saveStatusBanner}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={saveSettings}
          disabled={saving}
          style={{
            ...DS.btnPrimary,
            padding: '10px 24px',
            fontSize: '14px',
            background: saving ? DS.gray400 : DS.primary,
            cursor: saving ? 'not-allowed' : 'pointer',
            flex: 1,
          }}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );

  // The popup card is either the compact "Customize popup" trigger or the
  // full customizer panel, depending on showPopupCustomizer.
  const GALLERY_CARDS = [
    { key: 'classic-split', styleId: 'classic', layout: 'split', name: 'Classic — Split',
      desc: 'Image beside your message. Full control over every field.' },
    { key: 'classic-card', styleId: 'classic', layout: 'card', name: 'Classic — Card',
      desc: 'A compact bottom-corner toast.' },
    { key: 'classic-banner', styleId: 'classic', layout: 'banner', name: 'Classic — Banner',
      desc: 'A slim full-width bar.' },
    { key: 'flash_sale', styleId: 'flash_sale', layout: null, name: POPUP_STYLES.flash_sale.name,
      desc: POPUP_STYLES.flash_sale.shortDescription },
    { key: 'gift_reveal', styleId: 'gift_reveal', layout: null, name: POPUP_STYLES.gift_reveal.name,
      desc: POPUP_STYLES.gift_reveal.shortDescription },
    { key: 'bottom_sheet', styleId: 'bottom_sheet', layout: null, name: POPUP_STYLES.bottom_sheet.name,
      desc: POPUP_STYLES.bottom_sheet.shortDescription },
    { key: 'top_bar', styleId: 'top_bar', layout: null, name: POPUP_STYLES.top_bar.name,
      desc: POPUP_STYLES.top_bar.shortDescription },
    { key: 'story_card', styleId: 'story_card', layout: null, name: POPUP_STYLES.story_card.name,
      desc: POPUP_STYLES.story_card.shortDescription },
  ];

  // Same image-upload handler as before (canvas resize/compress to keep the
  // PATCH body small) — unchanged, just relocated into the compact ImageRow.
  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        setActivePopup((p) => ({ ...p, imageUrl: compressed }));
        markImageChanged();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  const deviceToggle = (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: '#f3f4f6',
                  borderRadius: '10px', padding: '4px' }}>
      {[{ key: 'desktop', label: '🖥 Desktop' }, { key: 'mobile', label: '📱 Mobile' }].map((tab) => (
        <button
          key={tab.key}
          onClick={() => setPopupDevice(tab.key)}
          style={{
            flex: 1, padding: '8px', fontSize: '13px',
            fontWeight: popupDevice === tab.key ? '600' : '400',
            color: popupDevice === tab.key ? '#4f46e5' : '#6b7280',
            background: popupDevice === tab.key ? '#fff' : 'transparent',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            boxShadow: popupDevice === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  // --- STEP 1: style gallery -------------------------------------------
  // gallery-close-button: the plain "← Back" link is gone (see the prior
  // task's note on that trade-off); this small ✕ replaces it for the one
  // case where there IS somewhere to go back to — the merchant already
  // had a style open in the editor and came here via "Popup theme". On a
  // fresh "Customize popup" open (hasVisitedEditor still false) there's no
  // editor to return to yet, so it's hidden — picking a card or the outer
  // "←" (closes the whole customizer) remain the only options there.
  const popupGalleryView = (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '2px' }}>
            Choose a popup style
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
            Each preview uses your current settings — pick one to edit it.
          </div>
        </div>
        {hasVisitedEditor && (
          <button type="button" onClick={() => setPopupEditorOpen(true)} aria-label="Close style picker"
            className="ccf-style-focus"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
              color: '#9ca3af', padding: 4, lineHeight: 1, flexShrink: 0 }}>
            ✕
          </button>
        )}
      </div>
      {/* gallery-device-toggle: same popupDevice/setPopupDevice state the
          editor's own toggle uses (see deviceToggle above) — switching
          here carries into the editor and vice versa, for free. Without
          this the gallery was stuck showing whichever device it opened
          on (always 'desktop' on a fresh "Customize popup" open, since
          the ONLY other place this toggle rendered was inside the
          editor — unreachable until a style was already picked), so the
          4 mobile-only styles had no discovery path at all. */}
      {deviceToggle}
      <div style={{ display: 'grid',
        gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '12px' }}>
        {GALLERY_CARDS
          // mobile-only-visibility: hide these 4 cards entirely on the
          // Desktop tab (approved Q2) — the defensive resolveStyleId
          // fallback above covers every OTHER path to a mobile-only id
          // ending up in a desktop context; this is the "don't even offer
          // it" UX layer for the one path a merchant actually takes.
          .filter((c) => popupDevice === 'mobile' || !MOBILE_ONLY_STYLE_IDS.includes(c.styleId))
          .map((c) => {
          const isMobileTab = popupDevice === 'mobile';
          const disabled = isMobileTab && c.layout === 'split';
          const selected = c.styleId === activeStyleId &&
            (c.layout == null || (activePopup.layout || 'split') === c.layout);
          const commonPreviewProps = {
            step: 'prompt', email: '', onEmailChange: () => {}, onAllow: () => {}, onDismiss: () => {},
            wantsDiscount: previewWantsDiscount, unlockedInfo: previewUnlockedInfo,
            // gallery-nested-button-fix: this card's own live preview sits
            // inside GalleryCard's <button>, so its close X can't be a real
            // <button> too — see ClosePreviewButton's interactive prop.
            interactive: false,
          };
          const previewNode = c.styleId !== 'classic' ? (
            <StyleCardPreview styleId={c.styleId} cfg={activePopup} styleFields={activeStyleFields}
              emailFieldEnabled={previewShowEmailField} {...commonPreviewProps} />
          ) : (
            <ClassicPreview layout={c.layout} device="desktop" popup={activePopup}
              showEmailField={previewShowEmailField} discountOfferText={previewDiscountOfferText}
              discountOfferHeadline={discountRules.offerHeadline} {...commonPreviewProps} />
          );
          return (
            <GalleryCard key={c.key} card={c} selected={selected} disabled={disabled}
              disabledReason={disabled ? 'Not available on mobile' : undefined}
              mobileOnly={MOBILE_ONLY_STYLE_IDS.includes(c.styleId)}
              previewNode={previewNode}
              onClick={() => {
                if (MOBILE_ONLY_STYLE_IDS.includes(c.styleId)) {
                  // mobile-only-force-override: always targets
                  // mobilePopup.styleId and turns the override on in the
                  // same action — never falls through to popup.styleId
                  // (desktop's gallery never offers these, and its
                  // renderer has no branch for them). See Q3 in
                  // audits/mobile-popup-styles-proposal.txt.
                  setMobilePopup((p) => ({ ...p, styleId: c.styleId,
                    ...(c.layout ? { layout: c.layout } : {}) }));
                  setPopup((p) => ({ ...p, mobileStyleOverride: true }));
                } else {
                  setActiveStyle((p) => ({ ...p, styleId: c.styleId,
                    ...(c.layout ? { layout: c.layout } : {}) }));
                }
                setPopupEditorOpen(true);
                setHasVisitedEditor(true);
              }} />
          );
        })}
      </div>
    </>
  );

  // --- STEP 2: editor (preview on top, compact settings below) ---------
  const styleExtraFieldRows = POPUP_STYLES[activeStyleId].extraFields.map((f) => {
    if (f.showWhen) {
      const [depKey, depVal] = Object.entries(f.showWhen)[0];
      if (getStyleFieldValue(POPUP_STYLES[activeStyleId], activeStyleFields, depKey) !== depVal) return null;
    }
    const value = getStyleFieldValue(POPUP_STYLES[activeStyleId], activeStyleFields, f.key);
    const setField = (v) => setActiveStyle((p) => ({ ...p, styleFields: { ...(p.styleFields || {}), [f.key]: v } }));
    if (f.type === 'boolean') {
      return <ToggleRow key={f.key} label={f.label} checked={!!value} onChange={setField} />;
    }
    if (f.type === 'select') {
      return <SelectRow key={f.key} label={f.label} value={value || f.default} options={f.options} onChange={setField} />;
    }
    if (f.type === 'datetime') {
      // popup-customizer-2col: datetime/text style-option rows go full
      // width — a date picker and free-text values both read awkwardly
      // squeezed into a half column next to an unrelated toggle/select.
      return (
        <div key={f.key} className="ccf-settings-full" style={rowShell}>
          <div style={rowLabelStyle}>{f.label}</div>
          <input type="datetime-local" value={value || ''} onChange={(e) => setField(e.target.value)}
            className="ccf-style-focus" style={rowFocusInputStyle} />
        </div>
      );
    }
    // text
    return (
      <div key={f.key} className="ccf-settings-full">
        <TextEditRow fieldKey={`style-${f.key}`} label={f.label} value={value || ''}
          placeholder="" maxLength={f.maxLength} onCommit={setField}
          editingField={editingField} onStartEdit={setEditingField} onStopEdit={() => setEditingField(null)} />
      </div>
    );
  });

  // Sticky on desktop so it stays visible while scrolling the options.
  // popup-customizer-redesign: embedded directly inside the editor view
  // below (between the device toggle and the compact settings form) —
  // no longer a separate sticky right-column card. Its own former
  // "Desktop preview"/"Mobile preview" heading was dropped since the
  // editor's device toggle right above it already says which one this is.
  const popupPreviewCard = (
    <div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>
              Click Allow to walk through the real flow — nothing here ever
              contacts the backend or asks for a real permission.
            </div>

            {/* step-bar-replay-removed: the step bar and Replay button are
                gone — clicking Allow below still drives previewStep through
                the same setting_up -> subscribed -> unlocked -> redirecting
                chain (see commonProps.onAllow below), and Deny/X still sets
                'dismissed'. Returning to Prompt is now entirely the job of
                the previewResetKey effect above (fires on style/device/
                setting changes) — there is no other way back to Prompt. */}

            {popupDevice === 'desktop' && (() => {
              if (previewStep === 'dismissed' || previewStep === 'closed') {
                return <DismissedNote device="desktop" reason={previewStep === 'closed' ? 'closed' : 'dismissed'} />;
              }
              const commonProps = {
                step: previewStep,
                email: previewEmail,
                onEmailChange: setPreviewEmail,
                onAllow: () => setPreviewStep('setting_up'),
                onDismiss: () => setPreviewStep('dismissed'),
                wantsDiscount: previewWantsDiscount,
                unlockedInfo: previewUnlockedInfo,
              };
              if (activeStyleId !== 'classic') {
                return (
                  <StyleCardPreview
                    styleId={activeStyleId}
                    cfg={popup}
                    styleFields={activeStyleFields}
                    emailFieldEnabled={previewShowEmailField}
                    {...commonProps}
                  />
                );
              }
              return (
                <ClassicPreview
                  layout={popup.layout || 'split'}
                  device="desktop"
                  popup={popup}
                  showEmailField={previewShowEmailField}
                  discountOfferText={previewDiscountOfferText}
                  discountOfferHeadline={discountRules.offerHeadline}
                  {...commonProps}
                />
              );
            })()}

            {popupDevice === 'mobile' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    // mobile-preview-clipping-fix: was 200x360 — much
                    // narrower than any style's own compact width (300,
                    // or 240 for Story Card), so every "card"-shaped
                    // style already overflowed it horizontally, and a
                    // style with real content height (anchored bottom
                    // before this fix) had nowhere near
                    // enough room and got clipped by this div's own
                    // overflow:hidden. 340x600 comfortably fits every
                    // compact width used anywhere in this file with
                    // margin to spare, while still reading as a phone
                    // (real devices run ~360x640-430x932).
                    width: '340px',
                    height: '600px',
                    border: '8px solid #111827',
                    borderRadius: '28px',
                    overflow: 'hidden',
                    background: '#f3f4f6',
                    position: 'relative',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  }}
                >
                  {/* Notch */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '60px',
                      height: '16px',
                      background: '#111827',
                      borderRadius: '0 0 12px 12px',
                      zIndex: 10,
                    }}
                  />

                  {/* Screen content — simulated store page */}
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      paddingBottom: '16px',
                      position: 'relative',
                    }}
                  >
                    {/* Simulated store background */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: '#f9fafb',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        paddingTop: '24px',
                        gap: '8px',
                      }}
                    >
                      <div style={{ width: '80%', height: '80px', background: '#e5e7eb', borderRadius: '8px' }} />
                      <div style={{ width: '60%', height: '12px', background: '#e5e7eb', borderRadius: '4px' }} />
                      <div style={{ width: '40%', height: '12px', background: '#e5e7eb', borderRadius: '4px' }} />
                    </div>

                    {/* Mobile popup preview */}
                    {(() => {
                      if (previewStep === 'dismissed' || previewStep === 'closed') {
                        return (
                          <div style={{ position: 'absolute', bottom: 12, left: 8, right: 8, zIndex: 5 }}>
                            <DismissedNote device="mobile" reason={previewStep === 'closed' ? 'closed' : 'dismissed'} />
                          </div>
                        );
                      }
                      const styleCfg = mobileUsesOwnStyle ? mobilePopup : popup;
                      const commonProps = {
                        step: previewStep,
                        email: previewEmail,
                        onEmailChange: setPreviewEmail,
                        onAllow: () => setPreviewStep('setting_up'),
                        onDismiss: () => setPreviewStep('dismissed'),
                        wantsDiscount: previewWantsDiscount,
                        unlockedInfo: previewUnlockedInfo,
                      };
                      // mobile-popup-polish: per-style anchor, matching
                      // ccf-push.js exactly (see the anchor table in
                      // audits/mobile-popup-polish-audit.txt):
                      //   top_bar       -> pinned to the frame's top edge
                      //   bottom_sheet  -> pinned to the frame's bottom
                      //                    edge, full width (its own
                      //                    edge-anchored design, same as
                      //                    real device — no side margin)
                      //   story_card / flash_sale / gift_reveal / classic
                      //   card -> CENTERED (both axes) — this replaced
                      //   the old universal bottom:12/left:8/right:8
                      //   wrapper, which was wrong for every style except
                      //   Bottom Sheet.
                      //   classic banner -> top or bottom per
                      //   mobilePopup.position, mirroring ccf-push.js's
                      //   own `atTop = /^top/.test(cfg.position)` check —
                      //   previously always forced to the bottom
                      //   regardless of what the merchant picked.
                      const CENTERED_STYLE_IDS = ['story_card', 'flash_sale', 'gift_reveal'];
                      if (activeStyleId !== 'classic') {
                        const wrapStyle = activeStyleId === 'top_bar'
                          ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 }
                          : CENTERED_STYLE_IDS.includes(activeStyleId)
                          ? { position: 'absolute', top: '50%', left: '50%',
                              transform: 'translate(-50%, -50%)', zIndex: 5 }
                          : { position: 'absolute', bottom: '12px', left: '8px', right: '8px', zIndex: 5 };
                        return (
                          <div style={wrapStyle}>
                            <StyleCardPreview
                              styleId={activeStyleId}
                              cfg={styleCfg}
                              styleFields={activeStyleFields}
                              emailFieldEnabled={previewShowEmailField}
                              compact
                              {...commonProps}
                            />
                          </div>
                        );
                      }
                      const classicIsBanner = mobilePopup.layout === 'banner';
                      const classicBannerAtTop = classicIsBanner && /^top/.test(mobilePopup.position || '');
                      const classicWrapStyle = !classicIsBanner
                        ? { position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)', zIndex: 5 }
                        : classicBannerAtTop
                        ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 }
                        : { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5 };
                      return (
                        <div style={classicWrapStyle}>
                          <ClassicPreview
                            layout={mobilePopup.layout === 'banner' ? 'banner' : 'card'}
                            device="mobile"
                            popup={mobilePopup}
                            showEmailField={previewShowEmailField}
                            discountOfferText={previewDiscountOfferText}
                            discountOfferHeadline={discountRules.offerHeadline}
                            {...commonProps}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* The one Save button while the customizer is open — pinned to
                the bottom of the sticky right column. Same save-status-
                banner-above-the-row treatment as saveCard, so a long error
                here can't squash this button either. */}
            <div
              style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid #f3f4f6',
              }}
            >
              {saveStatusBanner}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  style={{
                    ...DS.btnPrimary,
                    flex: 1,
                    padding: '12px 24px',
                    fontSize: '14px',
                    background: saving ? DS.gray400 : DS.primary,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </div>
    </div>
  );

  const popupEditorView = (
    <>
      {/* header-style-button: the style name + change-style control now
          lives in the outer card header (next to "Popup customization"),
          not here — see popupCard below. */}
      {deviceToggle}

      {popupDevice === 'mobile' && (
        <div style={{ fontSize: '12px', color: '#6366f1', background: '#eef2ff', borderRadius: '8px',
          padding: '10px 12px', marginBottom: '16px' }}>
          Mobile layout: image stacks above content automatically.
        </div>
      )}

      {/* TOP: large interactive live preview */}
      <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '12px',
        padding: '16px', marginBottom: '20px' }}>
        {popupPreviewCard}
      </div>

      {/* BELOW: compact settings. popup-customizer-2col: rows inside each
          group flow into two columns above ~900px (.ccf-settings-grid);
          Headline/Subtext/Image URL/Focus (exact) are marked full-width
          (.ccf-settings-full) since they read poorly squeezed to half —
          see the audit for the complete list. */}
      <SectionHeading>Content</SectionHeading>
      <div className="ccf-settings-grid">
        <div className="ccf-settings-full">
          <TextEditRow fieldKey="headline" label="Headline" value={activePopup.headline}
            placeholder="e.g. Don't miss out on this offer"
            onCommit={(v) => setActivePopup((p) => ({ ...p, headline: v }))}
            editingField={editingField} onStartEdit={setEditingField} onStopEdit={() => setEditingField(null)} />
        </div>
        <div className="ccf-settings-full">
          <TextEditRow fieldKey="subtext" label="Subtext" value={activePopup.subtext}
            placeholder="e.g. Get notified when prices drop"
            onCommit={(v) => setActivePopup((p) => ({ ...p, subtext: v }))}
            editingField={editingField} onStartEdit={setEditingField} onStopEdit={() => setEditingField(null)} />
        </div>
        {activeStyleId === 'classic' && (
          <TextEditRow fieldKey="brandName" label="Brand name" value={activePopup.brandName}
            placeholder="e.g. SILK HOUSE"
            onCommit={(v) => setActivePopup((p) => ({ ...p, brandName: v }))}
            editingField={editingField} onStartEdit={setEditingField} onStopEdit={() => setEditingField(null)} />
        )}
      </div>

      <SectionHeading>Appearance</SectionHeading>
      <div className="ccf-settings-grid">
        {activeStyleId === 'classic' && popupDevice === 'desktop' && (
          <PillsRow label="Layout" value={activePopup.layout || 'split'}
            options={[{ value: 'split', label: 'Split' }, { value: 'card', label: 'Card' }, { value: 'banner', label: 'Banner' }]}
            onChange={(v) => setActivePopup((p) => ({ ...p, layout: v }))} />
        )}
        <ColorRow label="Accent" value={activePopup.accentColor} defaultValue="#4f46e5"
          onChange={(v) => setActivePopup((p) => ({ ...p, accentColor: v }))} />
        <ColorRow label="Background" value={activePopup.bgColor} defaultValue="#ffffff"
          onChange={(v) => setActivePopup((p) => ({ ...p, bgColor: v }))} />
        <ColorRow label="Text color" value={activePopup.textColor} defaultValue="#111827"
          onChange={(v) => setActivePopup((p) => ({ ...p, textColor: v }))} />
        <SelectRow label="Font" value={activePopup.fontFamily || 'inherit'}
          options={[
            { value: 'inherit', label: 'Store default' },
            { value: "'Arial', sans-serif", label: 'Arial' },
            { value: "'Georgia', serif", label: 'Georgia' },
            { value: "'Helvetica Neue', sans-serif", label: 'Helvetica' },
            { value: "'Times New Roman', serif", label: 'Times New Roman' },
            { value: "'Courier New', monospace", label: 'Courier New' },
            { value: "'Playfair Display', serif", label: 'Playfair Display' },
            { value: "'Montserrat', sans-serif", label: 'Montserrat' },
          ]}
          onChange={(v) => setActivePopup((p) => ({ ...p, fontFamily: v }))} />
        <RadiusRow label="Border radius" value={activePopup.borderRadius ?? 12}
          onChange={(v) => setActivePopup((p) => ({ ...p, borderRadius: v }))} />
        {activeStyleId === 'classic' && (
          <PillsRow label="Text align" value={activePopup.textAlign || 'left'}
            options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
            onChange={(v) => setActivePopup((p) => ({ ...p, textAlign: v }))} />
        )}
        <SelectRow label="Position" value={activePopup.position || 'bottom-right'}
          options={[
            { value: 'bottom-right', label: 'Bottom right' },
            { value: 'bottom-left', label: 'Bottom left' },
            { value: 'center', label: 'Center' },
            { value: 'top-right', label: 'Top right' },
            { value: 'top-left', label: 'Top left' },
          ]}
          onChange={(v) => setActivePopup((p) => ({ ...p, position: v }))} />
        {activeStyleId === 'classic' && (
          <ToggleRow label="Dark overlay" checked={activePopup.showOverlay !== false}
            onChange={(v) => setActivePopup((p) => ({ ...p, showOverlay: v }))} />
        )}
      </div>

      <SectionHeading>Buttons</SectionHeading>
      <div className="ccf-settings-grid">
        <TextEditRow fieldKey="allowText" label="Allow button" value={activePopup.allowText || 'Allow'}
          placeholder="Allow"
          onCommit={(v) => setActivePopup((p) => ({ ...p, allowText: v }))}
          editingField={editingField} onStartEdit={setEditingField} onStopEdit={() => setEditingField(null)} />
        <TextEditRow fieldKey="denyText" label="Deny button" value={activePopup.denyText || 'No thanks'}
          placeholder="No thanks"
          onCommit={(v) => setActivePopup((p) => ({ ...p, denyText: v }))}
          editingField={editingField} onStartEdit={setEditingField} onStopEdit={() => setEditingField(null)} />
        {/* 5 pills (Rounded/Square/Pill/Outlined/Soft) need the room. */}
        <div className="ccf-settings-full">
          <PillsRow label="Button style" value={activePopup.ctaStyle || 'rounded'}
            options={[
              { value: 'rounded', label: 'Rounded' }, { value: 'square', label: 'Square' },
              { value: 'pill', label: 'Pill' }, { value: 'outlined', label: 'Outlined' },
              { value: 'soft', label: 'Soft' },
            ]}
            onChange={(v) => setActivePopup((p) => ({ ...p, ctaStyle: v }))} />
        </div>
      </div>

      <SectionHeading>Image</SectionHeading>
      <div className="ccf-settings-grid">
        <ImageRow label="Image" imageUrl={activePopup.imageUrl} imagePosition={activePopup.imagePosition}
          onUpload={handleImageUpload}
          onRemove={() => { setActivePopup((p) => ({ ...p, imageUrl: '' })); markImageChanged(); }} />
        {activePopup.imageUrl && (
          <div style={rowShell}>
            <div style={rowLabelStyle}>Focus</div>
            <ImagePositionGrid value={activePopup.imagePosition || '50% 50%'}
              onChange={(v) => setActivePopup((p) => ({ ...p, imagePosition: v }))} />
          </div>
        )}
        <div className="ccf-settings-full">
          {/* image-url-display-fix: an uploaded image's imageUrl is a
              base64 data: URI — unreadable and meaningless to edit as
              text, so show a plain "Uploaded image" label and no pencil.
              A real http(s) URL (pasted, not uploaded) stays as-is:
              pencil-editable, CSS-truncated with ellipsis. */}
          <TextEditRow fieldKey="imageUrl" label="Image URL" value={activePopup.imageUrl}
            placeholder="Paste an image URL"
            editable={!(activePopup.imageUrl || '').startsWith('data:')}
            staticText="Uploaded image"
            onCommit={(v) => { setActivePopup((p) => ({ ...p, imageUrl: v })); markImageChanged(); }}
            editingField={editingField} onStartEdit={setEditingField} onStopEdit={() => setEditingField(null)} />
        </div>
        {activePopup.imageUrl && (
          // image-focus-restore: the 3x3 grid only covers 9 presets — a
          // merchant who previously drag-set a custom value (e.g.
          // "38% 72%") needs a way to see/edit that exact value too, since
          // the storefront still honours whatever string is stored here.
          <div className="ccf-settings-full">
            <TextEditRow fieldKey="imagePosition" label="Focus (exact)"
              value={activePopup.imagePosition || '50% 50%'} placeholder="x% y%"
              onCommit={(v) => setActivePopup((p) => ({ ...p, imagePosition: v }))}
              editingField={editingField} onStartEdit={setEditingField} onStopEdit={() => setEditingField(null)} />
          </div>
        )}
      </div>

      {styleExtraFieldRows.some(Boolean) && (
        <>
          <SectionHeading>Style options</SectionHeading>
          <div className="ccf-settings-grid">
            {styleExtraFieldRows}
          </div>
        </>
      )}

      {popupDevice === 'mobile' && (
        <>
          <SectionHeading>Mobile</SectionHeading>
          <div className="ccf-settings-grid">
            <ToggleRow label="Different style on mobile" checked={!!popup.mobileStyleOverride}
              onChange={(v) => setPopup((p) => ({ ...p, mobileStyleOverride: v }))} />
          </div>
        </>
      )}
    </>
  );

  const popupCard = !showPopupCustomizer ? (
    <div
      style={{
        ...card,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
          Popup customization
        </div>
        <div style={{ fontSize: '13px', color: '#9ca3af' }}>
          Control how the notification prompt looks on your store.
        </div>
      </div>
      <button
        onClick={() => { setShowPopupCustomizer(true); setPopupEditorOpen(false); }}
        style={{ ...DS.btnPrimary, padding: '8px 18px', flexShrink: 0, marginLeft: '16px' }}
      >
        Customize popup
      </button>
    </div>
  ) : (
    <div style={{ ...card }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <button
            onClick={() => { setShowPopupCustomizer(false); setPopupEditorOpen(false); setHasVisitedEditor(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px',
              color: '#9ca3af', padding: '0', lineHeight: 1, flexShrink: 0 }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
              Popup customization
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>
              Changes save with the main Save settings button
            </div>
          </div>
        </div>
        {/* style-button-header: replaces the old "← Back to styles" link
            that used to live inside popupEditorView — same destination
            (opens the gallery), styled as a secondary button showing the
            currently selected style. Only shown in the editor; the
            gallery has its own "← Back" affordance above instead. */}
        {/* style-button-label: fixed "Popup theme" label — not the
            current style/layout name — same click target (opens the
            gallery), same styling. */}
        {popupEditorOpen && (
          <button
            type="button"
            onClick={() => setPopupEditorOpen(false)}
            aria-label="Change popup style"
            className="ccf-style-focus"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
              fontSize: 12, fontWeight: 600, color: '#fff', background: '#4f46e5',
              border: 'none', borderRadius: 9, cursor: 'pointer', flexShrink: 0 }}
          >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%',
              background: 'rgba(255,255,255,0.85)', flexShrink: 0 }} />
            Popup theme
            <span aria-hidden="true" style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>▾</span>
          </button>
        )}
      </div>

      {popupEditorOpen ? popupEditorView : popupGalleryView}
    </div>
  );

  const pushPreviewCard = (
    <div style={card}>
            <div
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '16px',
              }}
            >
              Preview
            </div>

            {previews.map((preview, i) => (
              <div key={i} style={{ marginBottom: '12px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#9ca3af',
                    marginBottom: '4px',
                  }}
                >
                  {preview.signal}
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    padding: '10px 12px',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: '#7c3aed',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#111827',
                        lineHeight: '1.4',
                      }}
                    >
                      {preview.msg}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginTop: '2px',
                      }}
                    >
                      {voice.signOff || 'shreesarees.in'} · now
                    </div>
                  </div>
                </div>
              </div>
            ))}
    </div>
  );

  const channelsCard = (
    <div style={card}>
            <div
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '16px',
              }}
            >
              Channels
            </div>

            {channels.map((ch) => (
              <div
                key={ch.name}
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: '14px',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background:
                      ch.status === 'working' ? '#16a34a' : '#d1d5db',
                    flexShrink: 0,
                    marginTop: '4px',
                  }}
                />
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      color: ch.status === 'working' ? '#111827' : '#9ca3af',
                    }}
                  >
                    {ch.name}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: ch.status === 'working' ? '#6b7280' : '#9ca3af',
                    }}
                  >
                    {ch.detail}
                  </div>
                </div>
              </div>
            ))}
    </div>
  );

  return (
    <div style={DS.page}>
      <style>{
        '.ccf-style-card:focus-visible,.ccf-style-focus:focus-visible{' +
        'outline:2px solid #4f46e5;outline-offset:2px;}' +
        // Matches ccf-push.js's own @keyframes ccfSpin/.ccf-spin exactly —
        // the preview's loader icon should spin the same way a real
        // customer's does.
        '@keyframes ccfPreviewSpin{to{transform:rotate(360deg);}}' +
        '.ccf-preview-spin{animation:ccfPreviewSpin 0.9s linear infinite;}' +
        // popup-customizer-2col: single column below ~900px (today's
        // layout), two columns above it. Rows opt into full-width via
        // .ccf-settings-full; group headings sit outside the grid so they
        // always span the full panel width.
        '.ccf-settings-grid{display:grid;grid-template-columns:1fr;' +
        'column-gap:24px;row-gap:0;}' +
        '.ccf-settings-full{grid-column:1/-1;}' +
        '@media (min-width:900px){.ccf-settings-grid{grid-template-columns:1fr 1fr;}}' +
        // pencil-removed: hover is now the only "this is editable" signal
        // on a TextEditRow, since the pencil icon is gone — a subtle tint
        // on the row plus the value text switching to accent blue. The
        // !important is needed because the value's own inline `color`
        // (dark vs muted-placeholder) would otherwise always win over a
        // plain stylesheet rule.
        '.ccf-text-row{border-radius:6px;transition:background 0.12s;}' +
        '.ccf-text-row:hover{background:#f9fafb;}' +
        '.ccf-text-row:hover .ccf-text-row-value{color:#4f46e5 !important;}'
      }</style>
      <PageHeader
        title="Settings"
        subtitle="Configure your automation preferences"
      />

      {needsReauth && (
        <div style={{ marginBottom: '16px' }}>
          <Banner tone="warning" title="Reconnect to enable discounts">
            <p>
              Automatic discount codes need an updated permission. Reconnect the
              app to grant it.
            </p>
            <div style={{ marginTop: '10px' }}>
              <Button
                onClick={() => {
                  const url = `${BACKEND_URL}/api/auth/install?shop=${encodeURIComponent(
                    shop
                  )}`;
                  if (window.top) window.top.location.href = url;
                  else window.location.href = url;
                }}
              >
                Reconnect
              </Button>
            </div>
          </Banner>
        </div>
      )}

      {showPopupCustomizer ? (
        // popup-customizer-redesign: the gallery/editor is now a single,
        // self-contained flow (its own embedded preview, top-to-bottom) —
        // it no longer shares the page's normal left-form/right-sticky-
        // preview split, so it gets the full page width instead of being
        // squeezed into the narrow left column while the right column
        // sits unused.
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>{popupCard}</div>
      ) : isMobileView ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {popupCard}
          {voiceCard}
          {howOftenCard}
          {saveCard}
          {channelsCard}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 380px',
            gap: '16px',
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {popupCard}
            {voiceCard}
            {howOftenCard}
          </div>
          <div
            style={{
              position: 'sticky',
              top: '16px',
              alignSelf: 'flex-start',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
            }}
          >
            {pushPreviewCard}
            {channelsCard}
            {saveCard}
          </div>
        </div>
      )}
    </div>
  );
}
