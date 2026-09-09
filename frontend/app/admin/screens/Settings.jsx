'use client';

import { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
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
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Push notification popup</Text>

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
