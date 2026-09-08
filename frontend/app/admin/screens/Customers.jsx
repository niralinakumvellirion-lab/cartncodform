'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  InlineStack,
  Banner,
} from '@shopify/polaris';
import { apiGet } from '../../../lib/api';
import ProfileScreen from './Profile';

export default function Customers({ shop }) {
  const [profiles, setProfiles] = useState([]);
  const [signalCountMap, setSignalCountMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState(null);

  const loadData = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setError('');
    try {
      const [profRes, sigRes] = await Promise.all([
        apiGet(`/api/profiles/${encodeURIComponent(shop)}/profiles?limit=50`),
        apiGet(`/api/profiles/${encodeURIComponent(shop)}/signals?limit=200`),
      ]);

      setProfiles(Array.isArray(profRes?.profiles) ? profRes.profiles : []);

      const map = {};
      for (const sig of Array.isArray(sigRes?.signals) ? sigRes.signals : []) {
        const pid =
          typeof sig.profileId === 'object' && sig.profileId
            ? sig.profileId._id
            : sig.profileId;
        if (!pid) continue;
        map[pid] = (map[pid] || 0) + 1;
      }
      setSignalCountMap(map);
    } catch (err) {
      setError(err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (selectedProfileId) {
    return (
      <ProfileScreen
        shop={shop}
        profileId={selectedProfileId}
        onBack={() => setSelectedProfileId(null)}
      />
    );
  }

  return (
    <Page
      title="Customers"
      secondaryActions={[{ content: 'Refresh', onAction: loadData }]}
    >
      {error && (
        <Banner tone="critical" title="Couldn't load customers">
          <Text as="p">{error}</Text>
        </Banner>
      )}
      <Card>
        <IndexTable
          resourceName={{ singular: 'customer', plural: 'customers' }}
          itemCount={profiles.length}
          loading={loading}
          selectable={false}
          headings={[
            { title: 'Identifier' },
            { title: 'Stage' },
            { title: 'Signals' },
            { title: 'Channels' },
            { title: 'LTV' },
            { title: 'Last seen' },
          ]}
          emptyState={
            <Text as="p" alignment="center" tone="subdued">
              No customer profiles yet.
            </Text>
          }
        >
          {profiles.map((p, i) => {
            const emails = p.identifiers?.emails || [];
            const phones = p.identifiers?.phones || [];
            const identifier =
              emails[0] || phones[0] || `Anonymous ${String(p._id).slice(-6)}`;
            const sigCount = signalCountMap[p._id] || 0;
            return (
              <IndexTable.Row
                id={p._id}
                key={p._id}
                position={i}
                onClick={() => setSelectedProfileId(p._id)}
              >
                <IndexTable.Cell>
                  <Text fontWeight="bold">{identifier}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge
                    tone={
                      p.stage === 'customer'
                        ? 'success'
                        : p.stage === 'identified'
                        ? 'info'
                        : p.stage === 'lapsed'
                        ? 'warning'
                        : undefined
                    }
                  >
                    {p.stage || 'anonymous'}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {sigCount > 0 ? (
                    <Badge tone="attention">{String(sigCount)}</Badge>
                  ) : (
                    <Text tone="subdued">—</Text>
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <InlineStack gap="100">
                    {p.channels?.push?.subscribed && <Badge>Push</Badge>}
                    {p.channels?.email?.address && <Badge>Email</Badge>}
                  </InlineStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {p.orders?.ltv > 0
                    ? `₹${p.orders.ltv.toLocaleString('en-IN')}`
                    : '—'}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text tone="subdued">
                    {p.lastSeenAt
                      ? new Date(p.lastSeenAt).toLocaleDateString('en-IN')
                      : '—'}
                  </Text>
                </IndexTable.Cell>
              </IndexTable.Row>
            );
          })}
        </IndexTable>
      </Card>
    </Page>
  );
}
