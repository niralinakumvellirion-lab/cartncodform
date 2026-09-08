'use client';

import { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Box,
  Banner,
} from '@shopify/polaris';
import { apiGet } from '../../../lib/api';

export default function Profile({ shop, profileId, onBack }) {
  const [profile, setProfile] = useState(null);
  const [signals, setSignals] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shop || !profileId) return;
    let cancelled = false;
    setError('');
    apiGet(
      `/api/profiles/${encodeURIComponent(shop)}/profiles/${encodeURIComponent(profileId)}`
    )
      .then((data) => {
        if (cancelled) return;
        setProfile(data?.profile || null);
        setSignals(Array.isArray(data?.signals) ? data.signals : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load profile');
      });
    return () => {
      cancelled = true;
    };
  }, [shop, profileId]);

  const title =
    profile?.identifiers?.emails?.[0] ||
    profile?.identifiers?.phones?.[0] ||
    `Anonymous ${String(profileId || '').slice(-6)}`;

  return (
    <Page title={title} backAction={{ content: 'Customers', onAction: onBack }}>
      {error && (
        <Banner tone="critical" title="Couldn't load profile">
          <Text as="p">{error}</Text>
        </Banner>
      )}
      <Layout>
        {/* Identifiers + stage + orders */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">Identity</Text>
              <BlockStack gap="100">
                <InlineStack align="space-between">
                  <Text tone="subdued">Stage</Text>
                  <Badge
                    tone={
                      profile?.stage === 'customer'
                        ? 'success'
                        : profile?.stage === 'identified'
                        ? 'info'
                        : profile?.stage === 'lapsed'
                        ? 'warning'
                        : undefined
                    }
                  >
                    {profile?.stage ?? '—'}
                  </Badge>
                </InlineStack>
                {profile?.identifiers?.emails?.map((e) => (
                  <InlineStack key={e} align="space-between">
                    <Text tone="subdued">Email</Text>
                    <Text>{e}</Text>
                  </InlineStack>
                ))}
                {profile?.identifiers?.phones?.map((p) => (
                  <InlineStack key={p} align="space-between">
                    <Text tone="subdued">Phone</Text>
                    <Text>{p}</Text>
                  </InlineStack>
                ))}
                <InlineStack align="space-between">
                  <Text tone="subdued">Push tokens</Text>
                  <Text>{profile?.identifiers?.pushTokens?.length ?? 0}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text tone="subdued">Last seen</Text>
                  <Text>
                    {profile?.lastSeenAt
                      ? new Date(profile.lastSeenAt).toLocaleDateString('en-IN')
                      : '—'}
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>

          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">Orders</Text>
                <BlockStack gap="100">
                  <InlineStack align="space-between">
                    <Text tone="subdued">Total orders</Text>
                    <Text>{profile?.orders?.count ?? 0}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text tone="subdued">LTV</Text>
                    <Text>
                      {profile?.orders?.ltv > 0
                        ? `₹${profile.orders.ltv.toLocaleString('en-IN')}`
                        : '—'}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text tone="subdued">COD orders</Text>
                    <Text>{profile?.orders?.codCount ?? 0}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text tone="subdued">Prepaid orders</Text>
                    <Text>{profile?.orders?.prepaidCount ?? 0}</Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Box>
        </Layout.Section>

        {/* Active signals + message history */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">Active signals</Text>
              {signals?.length ? (
                signals.map((sig) => (
                  <Box
                    key={sig._id}
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <Text fontWeight="bold">
                          {sig.type?.replace(/_/g, ' ') ?? 'signal'}
                        </Text>
                        <Badge
                          tone={
                            sig.strength > 0.7
                              ? 'critical'
                              : sig.strength > 0.4
                              ? 'warning'
                              : 'info'
                          }
                        >
                          {`${(sig.strength * 100).toFixed(0)}%`}
                        </Badge>
                      </InlineStack>
                      {sig.evidence?.map((e, i) => (
                        <Text key={i} tone="subdued">
                          {e}
                        </Text>
                      ))}
                      <Text tone="subdued" variant="bodySm">
                        Expires{' '}
                        {sig.expiresAt
                          ? new Date(sig.expiresAt).toLocaleDateString('en-IN')
                          : '—'}
                      </Text>
                    </BlockStack>
                  </Box>
                ))
              ) : (
                <Text tone="subdued">No active signals.</Text>
              )}
            </BlockStack>
          </Card>

          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">Message history</Text>
                {profile?.messages?.length ? (
                  [...profile.messages]
                    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
                    .map((m, i) => (
                      <Box
                        key={i}
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between">
                          <BlockStack gap="050">
                            <Text fontWeight="bold">
                              {m.type?.replace(/_/g, ' ') ?? 'message'}
                            </Text>
                            <Text tone="subdued" variant="bodySm">
                              {m.channel} ·{' '}
                              {m.sentAt
                                ? new Date(m.sentAt).toLocaleString('en-IN')
                                : '—'}
                            </Text>
                          </BlockStack>
                          <Badge
                            tone={
                              m.outcome === 'converted'
                                ? 'success'
                                : m.outcome === 'clicked'
                                ? 'info'
                                : m.outcome === 'sent'
                                ? undefined
                                : 'warning'
                            }
                          >
                            {m.outcome}
                          </Badge>
                        </InlineStack>
                      </Box>
                    ))
                ) : (
                  <Text tone="subdued">No messages sent yet.</Text>
                )}
              </BlockStack>
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
