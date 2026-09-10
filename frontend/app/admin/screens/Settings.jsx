'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

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

export default function Settings({ shop }) {
  const [voice, setVoice] = useState({});
  const [caps, setCaps] = useState({});
  const [quietHours, setQuietHours] = useState({});
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  // configs + popup are still loaded so nothing downstream breaks, but the
  // Signals grid moved to "What to act on" and the popup customizer lives
  // elsewhere now — neither is rendered here.
  const [configs, setConfigs] = useState([]);
  const [popup, setPopup] = useState({});
  // popup-responsive: separate mobile (<=600px) override config + device tab.
  const [mobilePopup, setMobilePopup] = useState({});
  const [popupDevice, setPopupDevice] = useState('desktop');
  const [pushCount, setPushCount] = useState(0);
  const [emailCount, setEmailCount] = useState(0);
  const [showPopupCustomizer, setShowPopupCustomizer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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
    ]).then(([s, c, pop, ps, prof]) => {
      if (cancelled) return;
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
    try {
      await apiSend(`/api/profiles/${encodeURIComponent(shop)}/settings`, 'PATCH', {
        voice,
        caps,
        quietHours,
        timezone,
      });
      console.log(
        '[settings] saving popup device:', popupDevice,
        'mobilePopup.layout:', mobilePopup.layout,
        'mobilePopup.imageUrl:', mobilePopup.imageUrl ? 'SET' : 'EMPTY'
      );
      await apiSend(`/api/profiles/${encodeURIComponent(shop)}/popup`, 'PATCH', {
        ...popup,
        mobilePopup,
      });
      setSuccess(true);
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
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: isMobileView ? '16px' : '20px 24px',
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
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <button
        onClick={saveSettings}
        disabled={saving}
        style={{
          padding: '10px 24px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#fff',
          background: saving ? '#9ca3af' : '#111827',
          border: 'none',
          borderRadius: '8px',
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
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: isMobileView ? '16px' : '20px 24px',
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
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#fff',
                  background: '#111827',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
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
            {/* Layout */}
            <div style={popRow}>
              <div style={popLabel}>Layout</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(popupDevice === 'mobile'
                  ? [
                      { value: 'card', label: '▭ Card' },
                      { value: 'banner', label: '▬ Banner' },
                    ]
                  : [
                      { value: 'split', label: '⬜ Split' },
                      { value: 'card', label: '▭ Card' },
                      { value: 'banner', label: '▬ Banner' },
                    ]
                ).map((opt) => (
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
                          setActivePopup((p) => ({ ...p, imageUrl: ev.target.result }));
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {activePopup.imageUrl && (
                    <button
                      onClick={() => setActivePopup((p) => ({ ...p, imageUrl: '' }))}
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
                    onChange={(e) =>
                      setActivePopup((p) => ({ ...p, imageUrl: e.target.value }))
                    }
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
                  flex: 1,
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#fff',
                  background: saving ? '#9ca3af' : '#111827',
                  border: 'none',
                  borderRadius: '8px',
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
    <div style={{ padding: '0 24px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 6px',
          }}
        >
          Settings
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          Two minutes here shapes every message.
        </p>
      </div>

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
