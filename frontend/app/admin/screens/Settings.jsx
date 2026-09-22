'use client';

import { useState, useEffect } from 'react';
import { Banner, Button } from '@shopify/polaris';
import { apiGet, apiSend, BACKEND_URL } from '../../../lib/api';
import { POPUP_STYLES, STYLE_ORDER, getStyle, getStyleFieldValue } from '../lib/popupStyles';

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

// The Allow-button look for each ctaStyle. borderRadius here is the BUTTON's
// radius — the card container radius is a separate control.
function getCtaStyle(ctaStyle, accent) {
  switch (ctaStyle) {
    case 'pill':
      return { borderRadius: '50px', background: accent, color: '#fff', border: 'none' };
    case 'square':
      return { borderRadius: '0', background: accent, color: '#fff', border: 'none' };
    case 'outlined':
      return {
        borderRadius: '8px',
        background: 'transparent',
        color: accent,
        border: `2px solid ${accent}`,
      };
    case 'soft':
      return {
        borderRadius: '12px',
        background: accent + '22', // ~13% opacity
        color: accent,
        border: 'none',
      };
    default: // rounded
      return { borderRadius: '8px', background: accent, color: '#fff', border: 'none' };
  }
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

// Original hand-drawn glyph (not traced from any reference image) used by
// Gift Reveal's card when no merchant image is set.
function GiftGlyph({ size = 40, color = '#4f46e5' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

// Small, abstract, ORIGINAL block mockups for the style picker cards —
// deliberately not screenshots/crops of any reference image (see
// audits/popup-style-audit-before.txt item 9's explicit instruction that
// thumbnails must be drawn/generated previews of this app's own styles).
function StyleThumbnail({ styleId }) {
  const box = { width: '100%', height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0 };
  if (styleId === 'flash_sale') {
    return (
      <div style={{ ...box, background: '#18181b', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <div style={{ width: '30%', height: 4, background: '#fbbf24', borderRadius: 2 }} />
        <div style={{ width: '50%', height: 7, background: '#fff', borderRadius: 2 }} />
        <div style={{ width: '32%', height: 9, background: '#4f46e5', borderRadius: 5, marginTop: 2 }} />
      </div>
    );
  }
  if (styleId === 'gift_reveal') {
    return (
      <div style={{ ...box, background: '#fff7ed', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <div style={{ width: 16, height: 13, background: '#f59e0b', borderRadius: 3 }} />
        <div style={{ width: '50%', height: 7, background: '#111827', borderRadius: 2 }} />
        <div style={{ width: '32%', height: 9, background: '#4f46e5', borderRadius: 5, marginTop: 2 }} />
      </div>
    );
  }
  // classic
  return (
    <div style={{ ...box, background: '#f3f4f6', display: 'flex' }}>
      <div style={{ width: '38%', background: '#d1d5db' }} />
      <div style={{ flex: 1, padding: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ width: '70%', height: 5, background: '#9ca3af', borderRadius: 2 }} />
        <div style={{ width: '50%', height: 4, background: '#d1d5db', borderRadius: 2 }} />
        <div style={{ marginTop: 'auto', width: '55%', height: 8, background: '#4f46e5', borderRadius: 4 }} />
      </div>
    </div>
  );
}

// Shared Flash Sale / Gift Reveal preview, used for BOTH the desktop and
// mobile preview slots (both styles wrap the `card` layout — see
// popupStyles.js). Mirrors, but does not share code with, the storefront's
// own buildFlashSaleCard()/buildGiftRevealCard() in push-notifications.liquid
// — see audits/popup-style-audit-before.txt item 8 for why there's no
// shared runtime between the two, and the per-style parity checklist that
// keeps them visually in sync instead.
function StyleCardPreview({ styleId, cfg, styleFields, emailFieldEnabled, compact }) {
  const style = getStyle(styleId);
  const accent = cfg.accentColor || '#4f46e5';
  const headline = cfg.headline ||
    (styleId === 'flash_sale' ? 'Flash Sale — limited time!' : "You've got a gift waiting");
  const subtext = cfg.subtext || '';
  const allowText = cfg.allowText || 'Allow';
  const denyText = cfg.denyText || 'No thanks';
  const imageUrl = cfg.imageUrl || '';
  const radius = (cfg.borderRadius ?? 12) + 'px';
  const font = cfg.fontFamily || 'inherit';
  const padding = compact ? '14px' : '20px';
  const headlineSize = compact ? 14 : 18;

  const field = (key) => getStyleFieldValue(style, styleFields, key);

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
                    background: bg, color: fg, fontFamily: font,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
        {imageUrl && (
          <img src={imageUrl} alt="" style={{ width: '100%', height: compact ? 70 : 110,
            objectFit: 'cover', objectPosition: cfg.imagePosition || 'center center', display: 'block' }} />
        )}
        <div style={{ padding, textAlign: 'center' }}>
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
            <input readOnly placeholder="Email address" style={{ width: '100%', padding: '8px 12px',
              fontSize: 12, borderRadius: 8, border: '1px solid #3f3f46', marginBottom: 8,
              background: '#27272a', color: fg, boxSizing: 'border-box' }} />
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
          <button type="button" tabIndex={-1} style={{ width: '100%', padding: '10px', fontSize: 13,
            fontWeight: 700, borderRadius: 999, border: 'none', background: accent, color: '#fff',
            cursor: 'default', marginBottom: 6 }}>
            {allowText}
          </button>
          <div style={{ fontSize: 11, color: '#a1a1aa' }}>{denyText}</div>
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
                  background: bg, color: fg, fontFamily: font,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      {imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: '100%', height: compact ? 70 : 110,
          objectFit: 'cover', objectPosition: cfg.imagePosition || 'center center', display: 'block' }} />
      ) : giftIconEnabled ? (
        <div style={{ height: compact ? 60 : 84, display: 'flex', alignItems: 'center',
                      justifyContent: 'center' }}>
          <GiftGlyph size={compact ? 32 : 44} color={accent} />
        </div>
      ) : null}
      <div style={{ padding, textAlign: 'center' }}>
        <div style={{ fontSize: headlineSize, fontWeight: 800, marginBottom: 6 }}>{headline}</div>
        {subtext && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>{subtext}</div>}
        {emailFieldEnabled && (
          <input readOnly placeholder="Email address" style={{ width: '100%', padding: '8px 12px',
            fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 8,
            boxSizing: 'border-box' }} />
        )}
        <button type="button" tabIndex={-1} style={{ width: '100%', padding: '10px', fontSize: 13,
          fontWeight: 700, borderRadius: 999, border: 'none', background: accent, color: '#fff',
          cursor: 'default', marginBottom: 6 }}>
          {allowText}
        </button>
        {secondaryButtonStyle === 'pill' ? (
          <button type="button" tabIndex={-1} style={{ width: '100%', padding: '10px', fontSize: 12,
            fontWeight: 600, borderRadius: 999, border: '1px solid #e5e7eb', background: 'transparent',
            color: fg, cursor: 'default' }}>
            {denyText}
          </button>
        ) : (
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{denyText}</div>
        )}
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // discount-feature: true when a Shopify Admin API call was rejected with
  // ACCESS_DENIED (installed token predates write_discounts). Prompt reconnect.
  const [needsReauth, setNeedsReauth] = useState(false);
  // popup-style: whether the storefront popup would show an email field —
  // mirrors ccfShowEmailField() in push-notifications.liquid (emailDiscount
  // enabled; phoneDiscount/bothDiscount are always saved disabled, per the
  // discount-redesign task, so they never contribute here). Drives whether
  // the style preview mocks up an email input.
  const [emailDiscountEnabled, setEmailDiscountEnabled] = useState(false);

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
        setEmailDiscountEnabled(!!disc.value?.config?.emailDiscount?.enabled);
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
  const activeStyleId = (mobileUsesOwnStyle ? mobilePopup.styleId : popup.styleId) || 'classic';
  const activeStyleFields = (mobileUsesOwnStyle ? mobilePopup.styleFields : popup.styleFields) || {};
  // Writes always go to whichever config actually owns the active style —
  // NOT necessarily `setActivePopup` (that would silently write mobile
  // style edits into mobilePopup even while the override toggle is off and
  // those fields aren't being used for anything).
  const setActiveStyle = mobileUsesOwnStyle ? setMobilePopup : setPopup;

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

  // --- popup customization row styles ---
  const popRow = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '16px',
  };
  const popLabel = {
    width: '140px',
    fontSize: '13px',
    color: '#374151',
    fontWeight: '500',
  };
  const popInput = {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    color: '#374151',
  };
  const popSelect = {
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    color: '#374151',
    background: '#fff',
    cursor: 'pointer',
  };
  const popSwatch = {
    width: '36px',
    height: '36px',
    padding: '2px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'pointer',
  };
  const popPill = (active) => ({
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: active ? '600' : '400',
    color: active ? '#fff' : '#374151',
    background: active ? '#111827' : '#f9fafb',
    border: '1px solid',
    borderColor: active ? '#111827' : '#e5e7eb',
    borderRadius: '20px',
    cursor: 'pointer',
  });

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

  // Standalone Save card — always the last thing in the right column (or
  // straight after the popup preview while the customizer is open).
  const saveCard = (
    <div
      style={{
        ...DS.card,
        padding: '16px 20px',
        marginBottom: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
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
      {success && (
        <span
          style={{ fontSize: '13px', color: '#16a34a', whiteSpace: 'nowrap' }}
        >
          ✓ Saved
        </span>
      )}
      {error && (
        <span style={{ fontSize: '13px', color: '#dc2626' }}>{error}</span>
      )}
    </div>
  );

  // The popup card is either the compact "Customize popup" trigger or the
  // full customizer panel, depending on showPopupCustomizer.
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
                <div
                  style={{
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '4px',
                  }}
                >
                  Popup customization
                </div>
                <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                  Control how the notification prompt looks on your store.
                </div>
              </div>
              <button
                onClick={() => setShowPopupCustomizer(true)}
                style={{
                  ...DS.btnPrimary,
                  padding: '8px 18px',
                  flexShrink: 0,
                  marginLeft: '16px',
                }}
              >
                Customize popup
              </button>
            </div>
  ) : (
    <div style={{ ...card }}>
              {/* Header with back button */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                <button
                  onClick={() => setShowPopupCustomizer(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px',
                    color: '#9ca3af',
                    padding: '0',
                    lineHeight: 1,
                  }}
                >
                  ←
                </button>
                <div>
                  <div
                    style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}
                  >
                    Popup customization
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                    Changes save with the main Save settings button
                  </div>
                </div>
              </div>

              {/* Device tab switcher */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '20px',
                  background: '#f3f4f6',
                  borderRadius: '10px',
                  padding: '4px',
                }}
              >
                {[
                  { key: 'desktop', label: '🖥 Desktop' },
                  { key: 'mobile', label: '📱 Mobile' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setPopupDevice(tab.key)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '13px',
                      fontWeight: popupDevice === tab.key ? '600' : '400',
                      color: popupDevice === tab.key ? '#111827' : '#6b7280',
                      background: popupDevice === tab.key ? '#fff' : 'transparent',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow:
                        popupDevice === tab.key
                          ? '0 1px 3px rgba(0,0,0,0.1)'
                          : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {popupDevice === 'mobile' && (
                <div
                  style={{
                    fontSize: '12px',
                    color: '#6366f1',
                    background: '#eef2ff',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '16px',
                  }}
                >
                  Mobile layout: image stacks above content automatically.
                </div>
              )}

            {/* Fields edit activePopup / setActivePopup — the desktop `popup`
                state on the Desktop tab, `mobilePopup` on the Mobile tab. */}
            <>
            {/* --- Popup Style --------------------------------------------
                Style wraps layout (see audits/popup-style-audit-before.txt
                item 4): Classic keeps the manual Layout picker below and
                touches nothing new; Flash Sale / Gift Reveal each force
                their own `card` layout and hide that picker, so switching
                back to Classic always restores whatever layout was last
                chosen manually, untouched. */}
            <div style={{ ...popRow, alignItems: 'flex-start', flexDirection: 'column', gap: '12px' }}>
              <div style={popLabel}>Popup style</div>
              <div
                role="radiogroup"
                aria-label="Popup style"
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                  gap: '10px',
                  width: '100%',
                }}
              >
                {STYLE_ORDER.map((id) => {
                  const s = POPUP_STYLES[id];
                  const selected = activeStyleId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setActiveStyle((p) => ({ ...p, styleId: id }))}
                      className="ccf-style-card"
                      style={{
                        textAlign: 'left',
                        padding: '8px',
                        borderRadius: '10px',
                        border: selected ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                        background: selected ? '#eef2ff' : '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <StyleThumbnail styleId={id} />
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827' }}>
                        {s.name}
                      </div>
                      <div style={{
                        alignSelf: 'flex-start', fontSize: '10px', fontWeight: '600',
                        color: '#6b7280', background: '#f3f4f6', borderRadius: '999px',
                        padding: '2px 8px', textTransform: 'capitalize',
                      }}>
                        {id === 'classic' ? (activePopup.layout || 'split') : s.layoutType}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Details panel for the selected style */}
              {(() => {
                const s = POPUP_STYLES[activeStyleId];
                return (
                  <div style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                    background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px',
                    fontSize: '12px', color: '#4b5563', lineHeight: 1.5,
                  }}>
                    <div style={{ marginBottom: '2px' }}>{s.shortDescription}</div>
                    <div style={{ color: '#9ca3af' }}>
                      Best for: {s.bestFor} · Layout: {s.layoutType || (activePopup.layout || 'split')}
                    </div>
                  </div>
                );
              })()}

              {/* Extra fields — only the ones this style declares */}
              {POPUP_STYLES[activeStyleId].extraFields.length > 0 && (
                <div style={{
                  width: '100%', boxSizing: 'border-box', display: 'flex',
                  flexDirection: 'column', gap: '12px', padding: '12px',
                  border: '1px solid #f3f4f6', borderRadius: '8px',
                }}>
                  {POPUP_STYLES[activeStyleId].extraFields.map((f) => {
                    if (f.showWhen) {
                      const [depKey, depVal] = Object.entries(f.showWhen)[0];
                      if (getStyleFieldValue(POPUP_STYLES[activeStyleId], activeStyleFields, depKey) !== depVal) {
                        return null;
                      }
                    }
                    const value = getStyleFieldValue(POPUP_STYLES[activeStyleId], activeStyleFields, f.key);
                    const setField = (v) =>
                      setActiveStyle((p) => ({
                        ...p,
                        styleFields: { ...(p.styleFields || {}), [f.key]: v },
                      }));

                    return (
                      <div key={f.key}>
                        <label
                          htmlFor={`ccf-style-field-${f.key}`}
                          style={{ display: 'block', fontSize: '12px', fontWeight: '600',
                                   color: '#374151', marginBottom: '4px' }}
                        >
                          {f.label}
                        </label>
                        {f.type === 'boolean' && (
                          <button
                            id={`ccf-style-field-${f.key}`}
                            type="button"
                            aria-pressed={!!value}
                            onClick={() => setField(!value)}
                            className="ccf-style-focus"
                            style={popPill(!!value)}
                          >
                            {value ? 'On' : 'Off'}
                          </button>
                        )}
                        {f.type === 'select' && (
                          <select
                            id={`ccf-style-field-${f.key}`}
                            className="ccf-style-focus"
                            value={value || f.default}
                            onChange={(e) => setField(e.target.value)}
                            style={popSelect}
                          >
                            {f.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                        {f.type === 'datetime' && (
                          <input
                            id={`ccf-style-field-${f.key}`}
                            className="ccf-style-focus"
                            type="datetime-local"
                            value={value || ''}
                            onChange={(e) => setField(e.target.value)}
                            style={popInput}
                          />
                        )}
                        {f.type === 'text' && (
                          <input
                            id={`ccf-style-field-${f.key}`}
                            className="ccf-style-focus"
                            type="text"
                            maxLength={f.maxLength}
                            value={value || ''}
                            onChange={(e) => setField(e.target.value)}
                            style={popInput}
                          />
                        )}
                        {f.helper && (
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                            {f.helper}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Mobile-only: let the Mobile tab pick a different style than
                  Desktop. Writes popup.mobileStyleOverride regardless of
                  which tab is active in general, but this control only
                  renders on the Mobile tab, so in practice it's always
                  toggled from there. */}
              {popupDevice === 'mobile' && (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between', gap: '12px',
                              paddingTop: '4px' }}>
                  <label htmlFor="ccf-mobile-style-override" style={{ fontSize: '12px',
                    color: '#374151', fontWeight: '500' }}>
                    Use a different style on mobile
                  </label>
                  <button
                    id="ccf-mobile-style-override"
                    type="button"
                    aria-pressed={!!popup.mobileStyleOverride}
                    onClick={() => setPopup((p) => ({ ...p, mobileStyleOverride: !p.mobileStyleOverride }))}
                    className="ccf-style-focus"
                    style={popPill(!!popup.mobileStyleOverride)}
                  >
                    {popup.mobileStyleOverride ? 'On' : 'Off'}
                  </button>
                </div>
              )}
            </div>

            {/* Layout — desktop only, Classic only; Flash Sale/Gift Reveal
                each force their own layout (see the note above). Mobile is
                always the Card layout regardless of style. */}
            {popupDevice === 'desktop' && activeStyleId === 'classic' && (
              <div style={popRow}>
                <div style={popLabel}>Layout</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { value: 'split', label: '⬜ Split' },
                    { value: 'card', label: '▭ Card' },
                    { value: 'banner', label: '▬ Banner' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setActivePopup((p) => ({ ...p, layout: opt.value }))}
                      style={popPill(activePopup.layout === opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Image */}
            <div style={{ ...popRow, alignItems: 'flex-start' }}>
              <div style={{ ...popLabel, marginTop: '8px' }}>Image</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                {/* Upload button */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'inline-block',
                    }}
                  >
                    📁 Upload image
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          // Resize/compress via canvas before storing as base64 —
                          // the raw file (up to 500KB) re-encoded losslessly would
                          // otherwise bloat the popup config's PATCH body and the
                          // Store document it's written into. Drag-to-focus and
                          // the layout previews read activePopup.imageUrl /
                          // imagePosition independently of how the URL was
                          // produced, so neither is affected by this.
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
                      }}
                    />
                  </label>
                  {activePopup.imageUrl && (
                    <button
                      onClick={() => {
                        setActivePopup((p) => ({ ...p, imageUrl: '' }));
                        markImageChanged();
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* OR paste URL */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                    or paste URL:
                  </span>
                  <input
                    value={
                      activePopup.imageUrl?.startsWith('data:')
                        ? ''
                        : activePopup.imageUrl || ''
                    }
                    onChange={(e) => {
                      setActivePopup((p) => ({ ...p, imageUrl: e.target.value }));
                      markImageChanged();
                    }}
                    placeholder="https://cdn.shopify.com/..."
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      outline: 'none',
                      color: '#374151',
                    }}
                  />
                </div>

              </div>
            </div>

            {/* Image focus — drag to set the crop focus point */}
            {activePopup.imageUrl && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ ...popLabel, paddingTop: '4px' }}>Image focus</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Drag-to-focus control */}
                  <div
                    style={{
                      width: '160px',
                      height: '100px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      overflow: 'hidden',
                      position: 'relative',
                      cursor: 'crosshair',
                      backgroundImage: `url(${activePopup.imageUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: activePopup.imagePosition || 'center center',
                      userSelect: 'none',
                    }}
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const updatePos = (clientX, clientY) => {
                        const x = Math.round(
                          ((clientX - rect.left) / rect.width) * 100
                        );
                        const y = Math.round(
                          ((clientY - rect.top) / rect.height) * 100
                        );
                        const xClamped = Math.max(0, Math.min(100, x));
                        const yClamped = Math.max(0, Math.min(100, y));
                        setActivePopup((p) => ({
                          ...p,
                          imagePosition: `${xClamped}% ${yClamped}%`,
                        }));
                      };
                      updatePos(e.clientX, e.clientY);
                      const onMove = (ev) => updatePos(ev.clientX, ev.clientY);
                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                      };
                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const updatePos = (clientX, clientY) => {
                        const x = Math.round(
                          ((clientX - rect.left) / rect.width) * 100
                        );
                        const y = Math.round(
                          ((clientY - rect.top) / rect.height) * 100
                        );
                        const xClamped = Math.max(0, Math.min(100, x));
                        const yClamped = Math.max(0, Math.min(100, y));
                        setActivePopup((p) => ({
                          ...p,
                          imagePosition: `${xClamped}% ${yClamped}%`,
                        }));
                      };
                      const touch = e.touches[0];
                      updatePos(touch.clientX, touch.clientY);
                      const onMove = (ev) => {
                        const t = ev.touches[0];
                        updatePos(t.clientX, t.clientY);
                      };
                      const onEnd = () => {
                        window.removeEventListener('touchmove', onMove);
                        window.removeEventListener('touchend', onEnd);
                      };
                      window.addEventListener('touchmove', onMove, {
                        passive: false,
                      });
                      window.addEventListener('touchend', onEnd);
                    }}
                  >
                    {/* Focus dot indicator */}
                    {(() => {
                      const pos = activePopup.imagePosition || '50% 50%';
                      const parts = pos.split(' ');
                      const x = parseFloat(parts[0]) || 50;
                      const y = parseFloat(parts[1]) || 50;
                      return (
                        <div
                          style={{
                            position: 'absolute',
                            left: `${x}%`,
                            top: `${y}%`,
                            transform: 'translate(-50%, -50%)',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.9)',
                            border: '2px solid rgba(0,0,0,0.4)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            pointerEvents: 'none',
                          }}
                        />
                      );
                    })()}
                  </div>

                  {/* Helper text */}
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    Click or drag on the image to set focus point
                  </div>
                </div>
              </div>
            )}

            {/* Headline */}
            <div style={popRow}>
              <div style={popLabel}>Headline</div>
              <input
                value={activePopup.headline || ''}
                onChange={(e) => setActivePopup((p) => ({ ...p, headline: e.target.value }))}
                placeholder="e.g. Don't miss out on this offer"
                style={popInput}
              />
            </div>

            {/* Subtext */}
            <div style={popRow}>
              <div style={popLabel}>Subtext</div>
              <input
                value={activePopup.subtext || ''}
                onChange={(e) => setActivePopup((p) => ({ ...p, subtext: e.target.value }))}
                placeholder="e.g. Get notified when prices drop"
                style={popInput}
              />
            </div>

            {/* Text position */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div style={{ width: '140px', fontSize: '13px', color: '#374151', fontWeight: '500' }}>
                Text position
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { value: 'left', label: '⬛ Left' },
                  { value: 'center', label: '⬛ Center' },
                  { value: 'right', label: '⬛ Right' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setActivePopup((p) => ({ ...p, textAlign: opt.value }))
                    }
                    style={{
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight:
                        (activePopup.textAlign || 'left') === opt.value ? '600' : '400',
                      color:
                        (activePopup.textAlign || 'left') === opt.value
                          ? '#fff'
                          : '#374151',
                      background:
                        (activePopup.textAlign || 'left') === opt.value
                          ? '#111827'
                          : '#f9fafb',
                      border: '1px solid',
                      borderColor:
                        (activePopup.textAlign || 'left') === opt.value
                          ? '#111827'
                          : '#e5e7eb',
                      borderRadius: '20px',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Brand name */}
            <div style={popRow}>
              <div style={popLabel}>Brand name</div>
              <input
                value={activePopup.brandName || ''}
                onChange={(e) => setActivePopup((p) => ({ ...p, brandName: e.target.value }))}
                placeholder="e.g. SILK HOUSE"
                style={popInput}
              />
            </div>

            {/* Allow button text */}
            <div style={popRow}>
              <div style={popLabel}>Allow button</div>
              <input
                value={activePopup.allowText || 'Allow'}
                onChange={(e) => setActivePopup((p) => ({ ...p, allowText: e.target.value }))}
                style={{ ...popInput, flex: 'none', width: '160px' }}
              />
            </div>

            {/* Deny button text */}
            <div style={popRow}>
              <div style={popLabel}>Deny button</div>
              <input
                value={activePopup.denyText || 'No thanks'}
                onChange={(e) => setActivePopup((p) => ({ ...p, denyText: e.target.value }))}
                style={{ ...popInput, flex: 'none', width: '160px' }}
              />
            </div>

            {/* Accent color */}
            <div style={popRow}>
              <div style={popLabel}>Accent color</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={activePopup.accentColor || '#4f46e5'}
                  onChange={(e) => setActivePopup((p) => ({ ...p, accentColor: e.target.value }))}
                  style={popSwatch}
                />
                <input
                  value={activePopup.accentColor || '#4f46e5'}
                  onChange={(e) => setActivePopup((p) => ({ ...p, accentColor: e.target.value }))}
                  style={{ ...popInput, flex: 'none', width: '100px' }}
                />
              </div>
            </div>

            {/* Background color */}
            <div style={popRow}>
              <div style={popLabel}>Background</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={activePopup.bgColor || '#ffffff'}
                  onChange={(e) => setActivePopup((p) => ({ ...p, bgColor: e.target.value }))}
                  style={popSwatch}
                />
                <input
                  value={activePopup.bgColor || '#ffffff'}
                  onChange={(e) => setActivePopup((p) => ({ ...p, bgColor: e.target.value }))}
                  style={{ ...popInput, flex: 'none', width: '100px' }}
                />
              </div>
            </div>

            {/* Text color */}
            <div style={popRow}>
              <div style={popLabel}>Text color</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={activePopup.textColor || '#111827'}
                  onChange={(e) => setActivePopup((p) => ({ ...p, textColor: e.target.value }))}
                  style={popSwatch}
                />
                <input
                  value={activePopup.textColor || '#111827'}
                  onChange={(e) => setActivePopup((p) => ({ ...p, textColor: e.target.value }))}
                  style={{ ...popInput, flex: 'none', width: '100px' }}
                />
              </div>
            </div>

            {/* Font family */}
            <div style={popRow}>
              <div style={popLabel}>Font</div>
              <select
                value={activePopup.fontFamily || 'inherit'}
                onChange={(e) => setActivePopup((p) => ({ ...p, fontFamily: e.target.value }))}
                style={popSelect}
              >
                <option value="inherit">Store default</option>
                <option value="'Arial', sans-serif">Arial</option>
                <option value="'Georgia', serif">Georgia</option>
                <option value="'Helvetica Neue', sans-serif">Helvetica</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="'Courier New', monospace">Courier New</option>
                <option value="'Playfair Display', serif">Playfair Display</option>
                <option value="'Montserrat', sans-serif">Montserrat</option>
              </select>
            </div>

            {/* Border radius */}
            <div style={popRow}>
              <div style={popLabel}>Border radius</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="range"
                  min="0"
                  max="24"
                  value={activePopup.borderRadius ?? 12}
                  onChange={(e) =>
                    setActivePopup((p) => ({ ...p, borderRadius: Number(e.target.value) }))
                  }
                  style={{ width: '120px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13px', color: '#374151', minWidth: '30px' }}>
                  {activePopup.borderRadius ?? 12}px
                </span>
              </div>
            </div>

            {/* Button style */}
            <div style={{ ...popRow, alignItems: 'flex-start' }}>
              <div style={{ ...popLabel, marginTop: '6px' }}>Button style</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { value: 'rounded', label: 'Rounded' },
                  { value: 'square', label: 'Square' },
                  { value: 'pill', label: 'Pill' },
                  { value: 'outlined', label: 'Outlined' },
                  { value: 'soft', label: 'Soft' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setActivePopup((p) => ({ ...p, ctaStyle: opt.value }))}
                    style={popPill(activePopup.ctaStyle === opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Position */}
            <div style={popRow}>
              <div style={popLabel}>Position</div>
              <select
                value={activePopup.position || 'bottom-right'}
                onChange={(e) => setActivePopup((p) => ({ ...p, position: e.target.value }))}
                style={popSelect}
              >
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="center">Center</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
              </select>
            </div>

            {/* Dark overlay toggle */}
            <div style={{ ...popRow, marginBottom: 0 }}>
              <div style={popLabel}>Dark overlay</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  onClick={() =>
                    setActivePopup((p) => ({ ...p, showOverlay: !p.showOverlay }))
                  }
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
                    background: activePopup.showOverlay !== false ? '#111827' : '#d1d5db',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: activePopup.showOverlay !== false ? '23px' : '3px',
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
                  {activePopup.showOverlay !== false ? 'On' : 'Off'}
                </span>
              </div>
            </div>
            </>
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

  // Sticky on desktop so it stays visible while scrolling the options.
  const popupPreviewCard = (
    <div style={{ ...card }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
              {popupDevice === 'mobile' ? 'Mobile preview' : 'Desktop preview'}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
              Updates live as you edit
            </div>

            {popupDevice === 'desktop' && (() => {
              // popup-style: a non-Classic style owns its own preview
              // entirely — it never falls through to the split/card/banner
              // rendering below, which stays exactly as it was for Classic.
              if (activeStyleId !== 'classic') {
                return (
                  <StyleCardPreview
                    styleId={activeStyleId}
                    cfg={popup}
                    styleFields={activeStyleFields}
                    emailFieldEnabled={emailDiscountEnabled}
                  />
                );
              }
              const bg = popup.bgColor || '#ffffff';
              const fg = popup.textColor || '#111827';
              const accent = popup.accentColor || '#4f46e5';
              const radius = (popup.borderRadius ?? 12) + 'px';
              const font = popup.fontFamily || 'inherit';
              const allowText = popup.allowText || 'Allow';
              const denyText = popup.denyText || 'No thanks';
              const headline = popup.headline || 'Get notified about deals';
              const subtext = popup.subtext || '';
              const brandName = popup.brandName || '';
              const imageUrl = popup.imageUrl || '';
              const imagePosition = popup.imagePosition || 'center center';
              const ctaStyle = popup.ctaStyle || 'rounded';
              const ctaCss = getCtaStyle(ctaStyle, accent);
              const textAlign = popup.textAlign || 'left';
              const layout = popup.layout || 'split';

              if (layout === 'split')
                return (
                  <div
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: radius,
                      overflow: 'hidden',
                      display: 'flex',
                      minHeight: '200px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    }}
                  >
                    <div
                      style={{
                        width: '40%',
                        flexShrink: 0,
                        background: imageUrl
                          ? `#f9fafb url(${JSON.stringify(imageUrl)}) ${imagePosition}/cover no-repeat`
                          : 'linear-gradient(135deg, #667eea, #764ba2)',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {imageUrl && (
                        <img
                          src={imageUrl}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: imagePosition,
                            display: 'block',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                          }}
                        />
                      )}
                      {!imageUrl && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%,-50%)',
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: '11px',
                            textAlign: 'center',
                            padding: '8px',
                          }}
                        >
                          Add image URL
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        padding: '16px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        background: bg,
                        color: fg,
                        fontFamily: font,
                      }}
                    >
                      {brandName && (
                        <div
                          style={{
                            fontSize: '9px',
                            fontWeight: '700',
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#9ca3af',
                            marginBottom: '6px',
                          }}
                        >
                          {brandName}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: '700',
                          lineHeight: '1.3',
                          marginBottom: '8px',
                          color: fg,
                          textAlign,
                        }}
                      >
                        {headline}
                      </div>
                      {subtext && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#6b7280',
                            marginBottom: '10px',
                            textAlign,
                          }}
                        >
                          {subtext}
                        </div>
                      )}
                      <button
                        style={{
                          ...ctaCss,
                          padding: '7px 12px',
                          fontSize: '12px',
                          fontWeight: '700',
                          marginBottom: '6px',
                          width: '100%',
                        }}
                      >
                        {allowText}
                      </button>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#9ca3af',
                          textAlign: 'center',
                          textDecoration: 'underline',
                        }}
                      >
                        {denyText}
                      </div>
                    </div>
                  </div>
                );

              if (layout === 'card')
                return (
                  <div
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: radius,
                      padding: '16px',
                      background: bg,
                      color: fg,
                      fontFamily: font,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    }}
                  >
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt=""
                        style={{
                          width: '100%',
                          borderRadius: '8px',
                          marginBottom: '10px',
                          objectFit: 'cover',
                          objectPosition: imagePosition,
                          maxHeight: '80px',
                          display: 'block',
                        }}
                      />
                    )}
                    {brandName && (
                      <div
                        style={{
                          fontSize: '9px',
                          fontWeight: '700',
                          letterSpacing: '2px',
                          textTransform: 'uppercase',
                          color: '#9ca3af',
                          marginBottom: '4px',
                        }}
                      >
                        {brandName}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        marginBottom: '8px',
                        color: fg,
                        textAlign,
                      }}
                    >
                      {headline}
                    </div>
                    {subtext && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          marginBottom: '10px',
                          textAlign,
                        }}
                      >
                        {subtext}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        style={{
                          ...ctaCss,
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        {allowText}
                      </button>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {denyText}
                      </span>
                    </div>
                  </div>
                );

              if (layout === 'banner')
                return (
                  <div
                    style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: accent,
                      color: '#fff',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      fontFamily: font,
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: '600', flex: 1 }}>
                      {headline}
                    </div>
                    <button
                      style={{
                        background: '#fff',
                        color: accent,
                        border: 'none',
                        borderRadius: ctaCss.borderRadius,
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: '700',
                        flexShrink: 0,
                      }}
                    >
                      {allowText}
                    </button>
                    <span
                      style={{
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </span>
                  </div>
                );

              return null;
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
                    width: '200px',
                    height: '360px',
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

                    {/* Mobile popup preview — card layout */}
                    {(() => {
                      // popup-style: same early-return rule as the desktop
                      // preview above — uses whichever config
                      // (mobilePopup, or popup when the override is off)
                      // activeStyleId/activeStyleFields already resolved to.
                      if (activeStyleId !== 'classic') {
                        const styleCfg = mobileUsesOwnStyle ? mobilePopup : popup;
                        return (
                          <div style={{ position: 'absolute', bottom: '12px', left: '8px',
                                        right: '8px', zIndex: 5 }}>
                            <StyleCardPreview
                              styleId={activeStyleId}
                              cfg={styleCfg}
                              styleFields={activeStyleFields}
                              emailFieldEnabled={emailDiscountEnabled}
                              compact
                            />
                          </div>
                        );
                      }
                      const mp = mobilePopup;
                      const bg = mp.bgColor || '#ffffff';
                      const fg = mp.textColor || '#111827';
                      const accent = mp.accentColor || '#4f46e5';
                      const ctaCss = getCtaStyle(mp.ctaStyle || 'pill', accent);
                      const textAlign = mp.textAlign || 'left';
                      const cardRadius = (mp.borderRadius ?? 16) + 'px';
                      const imageUrl = mp.imageUrl || '';
                      const headline = mp.headline || 'Get notified about deals';

                      return (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            left: '8px',
                            right: '8px',
                            background: bg,
                            borderRadius: cardRadius,
                            overflow: 'hidden',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                            zIndex: 5,
                          }}
                        >
                          {imageUrl && (
                            <img
                              src={imageUrl}
                              alt=""
                              style={{
                                width: '100%',
                                height: '70px',
                                objectFit: 'cover',
                                display: 'block',
                                objectPosition: mp.imagePosition || '50% 50%',
                              }}
                            />
                          )}
                          <div style={{ padding: '10px 12px' }}>
                            <div
                              style={{
                                fontSize: '11px',
                                fontWeight: '600',
                                color: fg,
                                marginBottom: '6px',
                                lineHeight: 1.3,
                                textAlign,
                              }}
                            >
                              {headline}
                            </div>
                            {mp.subtext && (
                              <div
                                style={{
                                  fontSize: '10px',
                                  color: '#6b7280',
                                  marginBottom: '6px',
                                  lineHeight: '1.3',
                                  textAlign,
                                }}
                              >
                                {mp.subtext}
                              </div>
                            )}
                            <button
                              style={{
                                ...ctaCss,
                                width: '100%',
                                padding: '7px',
                                fontSize: '11px',
                                fontWeight: '700',
                                marginBottom: '4px',
                              }}
                            >
                              {mp.allowText || 'Allow'}
                            </button>
                            <div style={{ fontSize: '9px', color: '#9ca3af', textAlign: 'center' }}>
                              {mp.denyText || 'No thanks'}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* The one Save button while the customizer is open — pinned to
                the bottom of the sticky right column. */}
            <div
              style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid #f3f4f6',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
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
              {success && (
                <span
                  style={{
                    fontSize: '13px',
                    color: '#16a34a',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ✓ Saved
                </span>
              )}
              {error && (
                <span style={{ fontSize: '13px', color: '#dc2626' }}>{error}</span>
              )}
            </div>
    </div>
  );

  return (
    <div style={DS.page}>
      <style>{
        '.ccf-style-card:focus-visible,.ccf-style-focus:focus-visible{' +
        'outline:2px solid #4f46e5;outline-offset:2px;}'
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

      {isMobileView ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {popupCard}
          {showPopupCustomizer && popupPreviewCard}
          {!showPopupCustomizer && voiceCard}
          {!showPopupCustomizer && howOftenCard}
          {!showPopupCustomizer && saveCard}
          {!showPopupCustomizer && channelsCard}
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
            {!showPopupCustomizer && voiceCard}
            {!showPopupCustomizer && howOftenCard}
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
            {showPopupCustomizer ? popupPreviewCard : pushPreviewCard}
            {!showPopupCustomizer && channelsCard}
            {!showPopupCustomizer && saveCard}
          </div>
        </div>
      )}
    </div>
  );
}
