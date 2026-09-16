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
