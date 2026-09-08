'use client';

import { useState, useCallback } from 'react';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Checkbox,
} from '@shopify/polaris';

// Manual per-step "done" state — one localStorage flag per step.
// (See PHASE_G3_AUDIT open questions re: CLAUDE.md "no localStorage in admin".)
function readDone(id) {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage.getItem(`ccf_step_${id}_done`) === 'true'
    );
  } catch {
    return false;
  }
}
function writeDone(id, done) {
  try {
    window.localStorage.setItem(`ccf_step_${id}_done`, done ? 'true' : 'false');
  } catch (e) {
    /* storage unavailable — the checkbox still updates in-memory */
  }
}

export default function Onboarding({ shop, onNavigate }) {
  const codLink = `https://${shop}/apps/cartncodform/cod-form`;

  const STEPS = [
    {
      id: 'embed',
      title: 'Enable App Embed block',
      description: 'Turn on the CartnCodForm embed in your theme.',
      action: 'Open Theme Editor',
      url: `https://${shop}/admin/themes/current/editor?context=apps`,
    },
    {
      id: 'automation',
      title: 'Configure your first signal',
      description: 'Go to Settings → Signals and enable cart abandonment.',
      action: 'Go to Settings',
      url: null,
      onAction: () => onNavigate && onNavigate('settings'),
    },
    {
      id: 'push',
      title: 'Verify push notifications',
      description: 'Add a product to cart on your store and wait for a push.',
      action: 'Open store',
      url: `https://${shop}`,
    },
    {
      id: 'cod',
      title: 'Share the COD form',
      description: `Your COD form: ${codLink}`,
      action: 'Copy link',
      url: null,
      onAction: () => {
        try {
          navigator.clipboard.writeText(codLink);
        } catch (e) {
          /* clipboard blocked */
        }
      },
    },
  ];

  const [done, setDone] = useState(() => {
    const map = {};
    for (const s of STEPS) map[s.id] = readDone(s.id);
    return map;
  });

  const toggle = useCallback((id, checked) => {
    writeDone(id, checked);
    setDone((prev) => ({ ...prev, [id]: checked }));
  }, []);

  const completed = STEPS.filter((s) => done[s.id]).length;

  return (
    <Page title="Setup">
      <Layout>
        <Layout.Section>
          <Text variant="headingMd">
            {completed} of {STEPS.length} steps done
          </Text>
        </Layout.Section>

        {STEPS.map((step) => (
          <Layout.Section key={step.id}>
            <Card>
              <InlineStack gap="300" blockAlign="start" wrap={false}>
                <Checkbox
                  label={step.title}
                  labelHidden
                  checked={!!done[step.id]}
                  onChange={(checked) => toggle(step.id, checked)}
                />
                <BlockStack gap="200">
                  <BlockStack gap="100">
                    <Text variant="bodyMd" fontWeight="bold">
                      {step.title}
                    </Text>
                    <Text tone="subdued">{step.description}</Text>
                  </BlockStack>
                  <InlineStack>
                    <Button
                      size="slim"
                      url={step.url || undefined}
                      external={Boolean(step.url)}
                      onClick={step.url ? undefined : step.onAction}
                    >
                      {step.action}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </InlineStack>
            </Card>
          </Layout.Section>
        ))}
      </Layout>
    </Page>
  );
}
