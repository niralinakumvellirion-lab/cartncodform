'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  BlockStack,
  Banner,
} from '@shopify/polaris';
import { apiGet } from '../../../lib/api';

export default function Messages({ shop }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(
        `/api/profiles/${encodeURIComponent(shop)}/messages?limit=50`
      );
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch (err) {
      setError(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Page
      title="Messages"
      secondaryActions={[{ content: 'Refresh', onAction: load }]}
    >
      {error && (
        <Banner tone="critical" title="Couldn't load messages">
          <Text as="p">{error}</Text>
        </Banner>
      )}
      <Card>
        <IndexTable
          resourceName={{ singular: 'message', plural: 'messages' }}
          itemCount={messages.length}
          loading={loading}
          selectable={false}
          headings={[
            { title: 'Profile' },
            { title: 'Signal' },
            { title: 'Channel' },
            { title: 'Copy sent' },
            { title: 'Status' },
            { title: 'When' },
          ]}
          emptyState={
            <Text as="p" alignment="center" tone="subdued">
              No messages sent yet.
            </Text>
          }
        >
          {messages.map((m, i) => {
            const profile = m.profileId;
            const identifier =
              profile?.identifiers?.emails?.[0] ||
              profile?.identifiers?.phones?.[0] ||
              `Anon ${m.cartToken?.slice(-6) ?? '?'}`;
            const when = m.sentAt || m.createdAt || m.updatedAt;
            return (
              <IndexTable.Row id={m._id} key={m._id} position={i}>
                <IndexTable.Cell>
                  <Text fontWeight="bold">{identifier}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text>
                    {m.signalType?.replace(/_/g, ' ') ?? m.reason ?? '—'}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge>{m.channel ?? '—'}</Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <BlockStack gap="050">
                    <Text fontWeight="bold" variant="bodySm">
                      {m.payload?.title || '—'}
                    </Text>
                    <Text tone="subdued" variant="bodySm">
                      {m.payload?.body?.slice(0, 60) || ''}
                    </Text>
                  </BlockStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge
                    tone={
                      m.status === 'sent'
                        ? 'success'
                        : m.status === 'failed'
                        ? 'critical'
                        : m.status === 'skipped'
                        ? 'warning'
                        : undefined
                    }
                  >
                    {m.status}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text tone="subdued" variant="bodySm">
                    {when ? new Date(when).toLocaleString('en-IN') : '—'}
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
