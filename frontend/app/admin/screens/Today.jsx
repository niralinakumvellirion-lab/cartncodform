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
  Grid,
  SkeletonBodyText,
} from '@shopify/polaris';
import { apiGet } from '../../../lib/api';

export default function Today({ shop }) {
  const [narrative, setNarrative] = useState('');
  const [insights, setInsights] = useState([]);
  const [stats, setStats] = useState(null);
  const [pushStats, setPushStats] = useState(null);
  const [topSignals, setTopSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.allSettled([
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/weekly-narrative`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/push-stats`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/signals?limit=3`),
    ]).then(([wn, ps, sg]) => {
      if (cancelled) return;
      if (wn.status === 'fulfilled') {
        setNarrative(wn.value?.narrative || '');
        setInsights(Array.isArray(wn.value?.insights) ? wn.value.insights : []);
        setStats(wn.value?.stats || null);
      }
      if (ps.status === 'fulfilled') setPushStats(ps.value || null);
      if (sg.status === 'fulfilled') {
        setTopSignals(Array.isArray(sg.value?.signals) ? sg.value.signals : []);
      }
      if (wn.status === 'rejected' && ps.status === 'rejected' && sg.status === 'rejected') {
        setError(wn.reason?.message || 'Failed to load Today');
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [shop]);

  return (
    <Page title="Today">
      <Layout>
        {/* Weekly narrative */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd">This week</Text>
              {loading ? (
                <SkeletonBodyText lines={3} />
              ) : error ? (
                <Text tone="critical">{error}</Text>
              ) : (
                <Text>{narrative || 'Not enough data yet.'}</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Stats row — 4 tiles */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" tone="subdued">Profiles seen</Text>
                  <Text variant="headingLg">{stats?.profilesLookedAt ?? '—'}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" tone="subdued">Messages sent</Text>
                  <Text variant="headingLg">{stats?.messagesSent ?? '—'}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" tone="subdued">Recovered</Text>
                  <Text variant="headingLg">{stats?.conversions ?? '—'}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" tone="subdued">Revenue</Text>
                  <Text variant="headingLg">
                    ₹{stats?.revenueRecovered?.toLocaleString('en-IN') ?? '—'}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Push delivered rate */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd">Push delivery</Text>
              <Text variant="headingLg">
                {pushStats?.rateLast7d != null
                  ? `${(pushStats.rateLast7d * 100).toFixed(1)}%`
                  : '—'}
              </Text>
              <Text tone="subdued">
                {pushStats?.deliveredLast7d ?? 0} delivered of{' '}
                {pushStats?.attemptedLast7d ?? 0} attempted (7d)
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* What to act on — top signals */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">What to act on</Text>
              {loading ? (
                <SkeletonBodyText lines={3} />
              ) : topSignals?.length ? (
                topSignals.map((sig) => (
                  <Box
                    key={sig._id}
                    padding="200"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text fontWeight="bold">{sig.type.replace(/_/g, ' ')}</Text>
                        <Text tone="subdued">{sig.evidence?.[0] ?? ''}</Text>
                      </BlockStack>
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
                  </Box>
                ))
              ) : (
                <Text tone="subdued">No active signals right now.</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* AI insights */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd">Insights</Text>
              {loading ? (
                <SkeletonBodyText lines={3} />
              ) : insights?.length ? (
                insights.map((ins, i) => <Text key={i}>{`• ${ins}`}</Text>)
              ) : (
                <Text tone="subdued">Not enough data yet.</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
