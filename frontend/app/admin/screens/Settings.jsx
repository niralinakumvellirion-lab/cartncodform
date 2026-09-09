'use client';

import { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  Grid,
  BlockStack,
  InlineStack,
  Box,
  Text,
  Select,
  Checkbox,
  TextField,
  Button,
  Banner,
} from '@shopify/polaris';
import { apiGet, apiSend } from '../../../lib/api';

const SIGNAL_TYPES = [
  'cart_abandon', 'checkout_abandon', 'browse_abandon',
  'high_intent', 'price_hesitation', 'price_drop', 'back_in_stock',
  'post_purchase_d3', 'lapsing', 'winback', 'email_capture', 'cod_to_prepaid',
];

const POSITION_LABELS = {
  'bottom-right': 'Bottom right',
  'bottom-left': 'Bottom left',
  'center': 'Center',
  'top-right': 'Top right',
  'top-left': 'Top left',
};

const CTA_RADIUS = { rounded: '8px', square: '0px', pill: '9999px' };

const SAMPLE_TEXT =
  'Get notified if your favourite product goes on sale or comes back in stock.';

function PopupPreview({ popup }) {
  const layout = popup.layout || 'split';
  const bg = popup.bgColor || '#ffffff';
  const fg = popup.textColor || '#111827';
  const accent = popup.accentColor || '#4f46e5';
  const radius = (popup.borderRadius ?? 12) + 'px';
  const font = popup.fontFamily || 'inherit';
  const allowText = popup.allowText || 'Allow';
  const denyText = popup.denyText || 'No thanks';
  const customTitle = popup.customTitle || '';
  const imageUrl = popup.imageUrl || '';
  const showBranding = popup.showBranding ?? true;
  const position = popup.position || 'bottom-right';
  const brandName = popup.brandName || '';
  const headline = popup.headline || SAMPLE_TEXT;
  const subtext = popup.subtext || '';
  const ctaRadius = CTA_RADIUS[popup.ctaStyle] || CTA_RADIUS.rounded;

  // Clip heights are per-layout so the scaled-down preview isn't cut off.
  const clipHeight =
    layout === 'banner' ? 90 : layout === 'card' ? 210 : 280;

  let inner;
  if (layout === 'banner') {
    inner = (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: accent,
          color: '#fff',
          fontFamily: font,
          fontSize: '13px',
          padding: '12px 18px',
          width: '380px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        }}
      >
        <span style={{ flex: 1 }}>{headline}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button
            style={{
              background: '#fff',
              color: accent,
              border: 'none',
              borderRadius: ctaRadius,
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {allowText}
          </button>
          <span style={{ fontSize: '16px', lineHeight: 1 }}>×</span>
        </span>
      </div>
    );
  } else if (layout === 'card') {
    inner = (
      <div
        style={{
          background: bg,
          color: fg,
          borderRadius: radius,
          fontFamily: font,
          fontSize: '14px',
          lineHeight: '1.5',
          padding: '16px',
          width: '280px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        }}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            style={{
              width: '100%',
              borderRadius: '8px',
              marginBottom: '8px',
              objectFit: 'cover',
              maxHeight: '100px',
              display: 'block',
            }}
          />
        )}
        {customTitle && (
          <strong style={{ display: 'block', marginBottom: '6px', fontSize: '15px' }}>
            {customTitle}
          </strong>
        )}
        <p style={{ margin: '0 0 12px', color: fg }}>{headline}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            style={{
              background: accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {allowText}
          </button>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {denyText}
          </button>
        </div>
        {showBranding && (
          <div style={{ marginTop: '10px', fontSize: '10px', color: '#9ca3af' }}>
            Powered by CartnCodForm
          </div>
        )}
      </div>
    );
  } else {
    // split
    inner = (
      <div
        style={{
          display: 'flex',
          width: '400px',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            width: '45%',
            minHeight: '230px',
            background: 'linear-gradient(135deg,#667eea,#764ba2)',
          }}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>
        <div
          style={{
            width: '55%',
            padding: '22px 20px',
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
                letterSpacing: '3px',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                color: '#9ca3af',
                marginBottom: '10px',
              }}
            >
              {brandName}
            </div>
          )}
          <div style={{ fontSize: '19px', fontWeight: 700, lineHeight: 1.2, marginBottom: '10px' }}>
            {headline}
          </div>
          {subtext && (
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '18px' }}>
              {subtext}
            </div>
          )}
          <button
            style={{
              background: accent,
              color: '#fff',
              border: 'none',
              borderRadius: ctaRadius,
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
              marginBottom: '10px',
            }}
          >
            {allowText}
          </button>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {denyText}
          </button>
          {showBranding && (
            <div style={{ marginTop: '14px', fontSize: '10px', color: '#d1d5db' }}>
              Powered by CartnCodForm
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Box background="bg-surface-secondary" borderRadius="200" padding="400">
      <BlockStack gap="200">
        <Text variant="headingSm">Preview</Text>
        <Text tone="subdued" variant="bodySm">
          Layout: {layout} · Position: {POSITION_LABELS[position]}
        </Text>

        {/* Clipping wrapper — the inner preview is scaled to 0.7 */}
        <div style={{ overflow: 'hidden', height: `${clipHeight}px` }}>
          <div
            style={{
              transform: 'scale(0.7)',
              transformOrigin: 'top center',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {inner}
          </div>
        </div>
      </BlockStack>
    </Box>
  );
}

export default function Settings({ shop }) {
  const [voice, setVoice] = useState({});
  const [caps, setCaps] = useState({});
  const [quietHours, setQuietHours] = useState({});
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [configs, setConfigs] = useState([]);
  const [popup, setPopup] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    Promise.allSettled([
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/settings`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/signal-configs`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/popup`),
    ]).then(([s, c, pop]) => {
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
      await apiSend(`/api/profiles/${encodeURIComponent(shop)}/popup`, 'PATCH', popup);
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function updateSignalConfig(signalType, patch) {
    // optimistic local update
    setConfigs((prev) => {
      const existing = prev.find((c) => c.signalType === signalType);
      if (existing) {
        return prev.map((c) =>
          c.signalType === signalType ? { ...c, ...patch } : c
        );
      }
      return [
        ...prev,
        { signalType, enabled: true, channelOverride: null, ...patch },
      ];
    });
    // persist (fire-and-forget)
    apiSend(
      `/api/profiles/${encodeURIComponent(shop)}/signal-configs/${signalType}`,
      'PATCH',
      patch
    ).catch((e) => console.error('[settings] signal config error:', e.message));
  }

  return (
    <Page title="Settings">
      <Layout>
        {/* Section 1 — Brand voice */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Brand voice</Text>

              <Select
                label="Tone"
                options={[
                  { label: 'Friendly', value: 'friendly' },
                  { label: 'Urgent', value: 'urgent' },
                  { label: 'Formal', value: 'formal' },
                ]}
                value={voice.tone || 'friendly'}
                onChange={(v) => setVoice((prev) => ({ ...prev, tone: v }))}
              />

              <Select
                label="Language"
                options={[
                  { label: 'English', value: 'en' },
                  { label: 'Hindi', value: 'hi' },
                  { label: 'Hinglish', value: 'hinglish' },
                ]}
                value={voice.lang || 'en'}
                onChange={(v) => setVoice((prev) => ({ ...prev, lang: v }))}
              />

              <Checkbox
                label="Use emoji in messages"
                checked={voice.emoji ?? true}
                onChange={(v) => setVoice((prev) => ({ ...prev, emoji: v }))}
              />

              <TextField
                label="Sign-off"
                value={voice.signOff || ''}
                onChange={(v) => setVoice((prev) => ({ ...prev, signOff: v }))}
                placeholder="e.g. Team Silk House"
                autoComplete="off"
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Section 2 — Sending limits */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Sending limits</Text>

              <TextField
                label="Max messages per customer per day"
                type="number"
                value={String(caps.perDay ?? 2)}
                onChange={(v) => setCaps((prev) => ({ ...prev, perDay: Number(v) }))}
                autoComplete="off"
              />

              <TextField
                label="Max messages per customer per week"
                type="number"
                value={String(caps.perWeek ?? 5)}
                onChange={(v) => setCaps((prev) => ({ ...prev, perWeek: Number(v) }))}
                autoComplete="off"
              />

              <TextField
                label="Suppress push after N unopened"
                type="number"
                value={String(caps.maxUnopenedPush ?? 5)}
                onChange={(v) =>
                  setCaps((prev) => ({ ...prev, maxUnopenedPush: Number(v) }))
                }
                autoComplete="off"
              />

              <InlineStack gap="400">
                <TextField
                  label="Quiet hours start (hour 0–23)"
                  type="number"
                  value={String(quietHours.start ?? 22)}
                  onChange={(v) =>
                    setQuietHours((prev) => ({ ...prev, start: Number(v) }))
                  }
                  autoComplete="off"
                />
                <TextField
                  label="Quiet hours end (hour 0–23)"
                  type="number"
                  value={String(quietHours.end ?? 8)}
                  onChange={(v) =>
                    setQuietHours((prev) => ({ ...prev, end: Number(v) }))
                  }
                  autoComplete="off"
                />
              </InlineStack>

              <Select
                label="Store timezone"
                options={[
                  { label: 'IST (Asia/Kolkata)', value: 'Asia/Kolkata' },
                  { label: 'UTC', value: 'UTC' },
                ]}
                value={timezone || 'Asia/Kolkata'}
                onChange={(v) => setTimezone(v)}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Section 3 — Signal configuration */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">Signals</Text>
              <Text tone="subdued">
                Control which signals are active and which channel they use.
              </Text>

              {SIGNAL_TYPES.map((type) => {
                const cfg =
                  configs.find((c) => c.signalType === type) || {
                    enabled: true,
                    channelOverride: null,
                  };
                return (
                  <Box
                    key={type}
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <InlineStack align="space-between" blockAlign="center" wrap={false}>
                      <Text fontWeight="bold">{type.replace(/_/g, ' ')}</Text>
                      <InlineStack gap="300" blockAlign="center">
                        <Select
                          label=""
                          labelHidden
                          options={[
                            { label: 'Auto', value: '' },
                            { label: 'Push', value: 'push' },
                            { label: 'Email', value: 'email' },
                          ]}
                          value={cfg.channelOverride || ''}
                          onChange={(v) =>
                            updateSignalConfig(type, { channelOverride: v || null })
                          }
                        />
                        <Checkbox
                          label="Enabled"
                          checked={cfg.enabled ?? true}
                          onChange={(v) => updateSignalConfig(type, { enabled: v })}
                        />
                      </InlineStack>
                    </InlineStack>
                  </Box>
                );
              })}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Section 4 — Push notification popup */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 8, xl: 8 }}>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd">Push notification popup</Text>

                  <Select
                    label="Popup layout"
                    options={[
                      { label: 'Split (image + content)', value: 'split' },
                      { label: 'Card (small popup)', value: 'card' },
                      { label: 'Banner (full width bar)', value: 'banner' },
                    ]}
                    value={popup.layout || 'split'}
                    onChange={(v) => setPopup((p) => ({ ...p, layout: v }))}
                  />

                  <TextField
                    label="Brand name"
                    value={popup.brandName || ''}
                    onChange={(v) => setPopup((p) => ({ ...p, brandName: v }))}
                    placeholder="e.g. MANGALSAKHI"
                    helpText="Shown above the headline in uppercase"
                    autoComplete="off"
                  />

                  <TextField
                    label="Headline"
                    value={popup.headline || ''}
                    onChange={(v) => setPopup((p) => ({ ...p, headline: v }))}
                    placeholder="e.g. Flat 10% OFF on Premium Collection"
                    autoComplete="off"
                  />

                  <TextField
                    label="Subtext"
                    value={popup.subtext || ''}
                    onChange={(v) => setPopup((p) => ({ ...p, subtext: v }))}
                    placeholder="e.g. Your Perfect Look, Now 10% Less"
                    autoComplete="off"
                  />

                  <Select
                    label="Position"
                    options={[
                      { label: 'Bottom right', value: 'bottom-right' },
                      { label: 'Bottom left', value: 'bottom-left' },
                      { label: 'Center', value: 'center' },
                      { label: 'Top right', value: 'top-right' },
                      { label: 'Top left', value: 'top-left' },
                    ]}
                    value={popup.position || 'bottom-right'}
                    onChange={(v) => setPopup((p) => ({ ...p, position: v }))}
                  />

                  <Checkbox
                    label="Show dark overlay behind popup"
                    checked={popup.showOverlay ?? true}
                    onChange={(v) => setPopup((p) => ({ ...p, showOverlay: v }))}
                  />

                  <Select
                    label="Theme"
                    options={[
                      { label: 'Light', value: 'light' },
                      { label: 'Dark', value: 'dark' },
                    ]}
                    value={popup.theme || 'light'}
                    onChange={(v) => {
                      const isDark = v === 'dark';
                      setPopup((p) => ({
                        ...p,
                        theme: v,
                        bgColor: isDark ? '#1f2937' : '#ffffff',
                        textColor: isDark ? '#f9fafb' : '#111827',
                      }));
                    }}
                  />

                  <TextField
                    label="Accent color (hex)"
                    value={popup.accentColor || '#4f46e5'}
                    onChange={(v) => setPopup((p) => ({ ...p, accentColor: v }))}
                    placeholder="#4f46e5"
                    autoComplete="off"
                  />

                  <Select
                    label="Button style"
                    options={[
                      { label: 'Rounded', value: 'rounded' },
                      { label: 'Square', value: 'square' },
                      { label: 'Pill', value: 'pill' },
                    ]}
                    value={popup.ctaStyle || 'rounded'}
                    onChange={(v) => setPopup((p) => ({ ...p, ctaStyle: v }))}
                  />

                  <TextField
                    label="Font family"
                    value={popup.fontFamily || ''}
                    onChange={(v) => setPopup((p) => ({ ...p, fontFamily: v }))}
                    placeholder="inherit"
                    helpText="e.g. 'Arial', 'Georgia', or leave blank for store default"
                    autoComplete="off"
                  />

                  <TextField
                    label="Border radius (px)"
                    type="number"
                    value={String(popup.borderRadius ?? 12)}
                    onChange={(v) => setPopup((p) => ({ ...p, borderRadius: Number(v) }))}
                    autoComplete="off"
                  />

                  <TextField
                    label="Image URL (optional)"
                    value={popup.imageUrl || ''}
                    onChange={(v) => setPopup((p) => ({ ...p, imageUrl: v }))}
                    placeholder="https://..."
                    helpText="Shows above the prompt text. Use a product or brand image."
                    autoComplete="off"
                  />

                  <TextField
                    label="Custom title (optional)"
                    value={popup.customTitle || ''}
                    onChange={(v) => setPopup((p) => ({ ...p, customTitle: v }))}
                    placeholder="e.g. Don't miss out!"
                    autoComplete="off"
                  />

                  <TextField
                    label="Allow button text"
                    value={popup.allowText || 'Allow'}
                    onChange={(v) => setPopup((p) => ({ ...p, allowText: v }))}
                    autoComplete="off"
                  />

                  <TextField
                    label="Deny button text"
                    value={popup.denyText || 'No thanks'}
                    onChange={(v) => setPopup((p) => ({ ...p, denyText: v }))}
                    autoComplete="off"
                  />

                  <Checkbox
                    label="Show 'Powered by CartnCodForm' branding"
                    checked={popup.showBranding ?? true}
                    onChange={(v) => setPopup((p) => ({ ...p, showBranding: v }))}
                  />
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 4, xl: 4 }}>
              <PopupPreview popup={popup} />
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Save + feedback */}
        <Layout.Section>
          <BlockStack gap="300">
            {success && <Banner tone="success">Settings saved.</Banner>}
            {error && <Banner tone="critical">{error}</Banner>}
            <InlineStack align="end">
              <Button variant="primary" loading={saving} onClick={saveSettings}>
                Save settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
