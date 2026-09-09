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

function PopupPreview({ popup }) {
  const bg = popup.bgColor || '#ffffff';
  const fg = popup.textColor || '#111827';
  const accent = popup.accentColor || '#4f46e5';
  const font = popup.fontFamily || 'inherit';
  const allowText = popup.allowText || 'Allow';
  const denyText = popup.denyText || 'No thanks';
  const customTitle = popup.customTitle || '';
  const imageUrl = popup.imageUrl || '';
  const showBranding = popup.showBranding ?? true;
  const layout = popup.layout || 'split';
  const brandName = popup.brandName || '';
  const headline = popup.headline || 'Get notified about deals';
  const subtext = popup.subtext || '';
  const ctaStyle = popup.ctaStyle || 'rounded';
  const ctaRadius = ctaStyle === 'pill' ? '50px' : ctaStyle === 'square' ? '0' : '6px';

  const POSITION_LABELS = {
    'bottom-right': 'Bottom right',
    'bottom-left': 'Bottom left',
    'center': 'Center',
    'top-right': 'Top right',
    'top-left': 'Top left',
  };

  return (
    <Box background="bg-surface-secondary" borderRadius="200" padding="400">
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text variant="headingSm" fontWeight="bold">Preview</Text>
          <Text tone="subdued" variant="bodySm">
            Layout: {layout} · Position: {POSITION_LABELS[popup.position || 'bottom-right']}
          </Text>
        </BlockStack>

        {/* SPLIT LAYOUT PREVIEW */}
        {layout === 'split' && (
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            width: '100%',
            minHeight: '220px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            background: bg,
          }}>
            {/* Left image panel */}
            <div style={{
              width: '42%',
              minHeight: '220px',
              flexShrink: 0,
              background: imageUrl
                ? 'none'
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    position: 'absolute',
                    top: 0, left: 0,
                  }}
                />
              ) : (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%,-50%)',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '11px',
                  textAlign: 'center',
                  padding: '8px',
                }}>
                  Add image URL →
                </div>
              )}
            </div>

            {/* Right content panel */}
            <div style={{
              flex: 1,
              padding: '18px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              background: bg,
              color: fg,
              fontFamily: font,
            }}>
              {brandName && (
                <div style={{
                  fontSize: '9px',
                  fontWeight: '700',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: '#9ca3af',
                  marginBottom: '6px',
                }}>
                  {brandName}
                </div>
              )}
              <div style={{
                fontSize: '14px',
                fontWeight: '700',
                lineHeight: '1.3',
                marginBottom: subtext ? '6px' : '12px',
                color: fg,
              }}>
                {headline}
              </div>
              {subtext && (
                <div style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  marginBottom: '12px',
                  lineHeight: '1.4',
                }}>
                  {subtext}
                </div>
              )}
              <button style={{
                background: accent,
                color: '#fff',
                border: 'none',
                borderRadius: ctaRadius,
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                marginBottom: '8px',
                width: '100%',
              }}>
                {allowText}
              </button>
              <div style={{
                fontSize: '10px',
                color: '#9ca3af',
                textDecoration: 'underline',
                cursor: 'pointer',
                textAlign: 'center',
              }}>
                {denyText}
              </div>
              {showBranding && (
                <div style={{
                  marginTop: '10px',
                  fontSize: '9px',
                  color: '#d1d5db',
                  textAlign: 'center',
                }}>
                  Powered by CartnCodForm
                </div>
              )}
            </div>
          </div>
        )}

        {/* CARD LAYOUT PREVIEW */}
        {layout === 'card' && (
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: (popup.borderRadius ?? 12) + 'px',
            overflow: 'hidden',
            width: '100%',
            maxWidth: '260px',
            margin: '0 auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            background: bg,
            color: fg,
            fontFamily: font,
            padding: '16px',
          }}>
            {imageUrl && (
              <img src={imageUrl} alt="" style={{
                width: '100%',
                borderRadius: '8px',
                marginBottom: '10px',
                objectFit: 'cover',
                maxHeight: '100px',
                display: 'block',
              }} />
            )}
            {customTitle && (
              <div style={{
                fontWeight: '700',
                fontSize: '14px',
                marginBottom: '6px',
              }}>
                {customTitle}
              </div>
            )}
            <div style={{
              fontSize: '13px',
              marginBottom: '12px',
              color: fg,
              lineHeight: '1.4',
            }}>
              {headline || 'Get notified about deals from this store.'}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button style={{
                background: accent,
                color: '#fff',
                border: 'none',
                borderRadius: ctaRadius,
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
              }}>
                {allowText}
              </button>
              <span style={{
                fontSize: '11px',
                color: '#9ca3af',
                cursor: 'pointer',
              }}>
                {denyText}
              </span>
            </div>
            {showBranding && (
              <div style={{
                marginTop: '10px',
                fontSize: '9px',
                color: '#d1d5db',
              }}>
                Powered by CartnCodForm
              </div>
            )}
          </div>
        )}

        {/* BANNER LAYOUT PREVIEW */}
        {layout === 'banner' && (
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden',
            width: '100%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            background: accent,
            color: '#fff',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontFamily: font,
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', flex: 1 }}>
              {headline || 'Get notified about deals'}
            </div>
            <button style={{
              background: '#fff',
              color: accent,
              border: 'none',
              borderRadius: ctaRadius,
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              flexShrink: 0,
            }}>
              {allowText}
            </button>
            <span style={{
              fontSize: '16px',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              flexShrink: 0,
            }}>×</span>
          </div>
        )}

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
