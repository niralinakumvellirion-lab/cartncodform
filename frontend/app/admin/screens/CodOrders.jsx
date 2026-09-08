'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Page,
  Layout,
  Card,
  Grid,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  IndexTable,
  Banner,
} from '@shopify/polaris';
import { apiGet, apiSend } from '../../../lib/api';

export default function CodOrders({ shop }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/api/stores/${encodeURIComponent(shop)}/orders`);
      // The endpoint returns a bare array; tolerate { orders: [...] } too.
      setOrders(Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : []);
    } catch (err) {
      setError(err.message || 'Failed to load COD orders');
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function updateStatus(orderId, status) {
    try {
      await apiSend(`/api/cod/order/${orderId}`, 'PATCH', { status });
      loadOrders();
    } catch (err) {
      setError(err.message || 'Failed to update order');
    }
  }

  const { total, pending, confirmedRevenue } = useMemo(() => {
    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      confirmedRevenue: orders
        .filter((o) => o.status === 'confirmed')
        .reduce((sum, o) => sum + (Number(o.productPrice) || 0) * (Number(o.quantity) || 1), 0),
    };
  }, [orders]);

  return (
    <Page
      title="COD Orders"
      secondaryActions={[{ content: 'Refresh', onAction: loadOrders }]}
    >
      {error && (
        <Banner tone="critical" title="Couldn't load COD orders">
          <Text as="p">{error}</Text>
        </Banner>
      )}
      <Layout>
        {/* Stats row */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" tone="subdued">Total orders</Text>
                  <Text variant="headingLg">{total}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" tone="subdued">Pending</Text>
                  <Text variant="headingLg">{pending}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" tone="subdued">Confirmed revenue</Text>
                  <Text variant="headingLg">
                    ₹{confirmedRevenue.toLocaleString('en-IN')}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Orders table */}
        <Layout.Section>
          <Card>
            <IndexTable
              resourceName={{ singular: 'order', plural: 'orders' }}
              itemCount={orders.length}
              loading={loading}
              selectable={false}
              headings={[
                { title: 'Customer' },
                { title: 'Phone' },
                { title: 'Product' },
                { title: 'Value' },
                { title: 'Email' },
                { title: 'Status' },
                { title: 'Date' },
                { title: 'Action' },
              ]}
              emptyState={
                <Text as="p" alignment="center" tone="subdued">
                  No COD orders yet.
                </Text>
              }
            >
              {orders.map((o, i) => (
                <IndexTable.Row id={o._id} key={o._id} position={i}>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text fontWeight="bold">{o.name}</Text>
                      <Text tone="subdued" variant="bodySm">{o.address}</Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{o.phone}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text>{o.productName}</Text>
                      <Text tone="subdued" variant="bodySm">Qty: {o.quantity}</Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    ₹{((Number(o.productPrice) || 0) * (Number(o.quantity) || 1)).toLocaleString('en-IN')}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {o.email || <Text tone="subdued">—</Text>}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge
                      tone={
                        o.status === 'confirmed'
                          ? 'success'
                          : o.status === 'cancelled'
                          ? 'critical'
                          : undefined
                      }
                    >
                      {o.status}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text tone="subdued" variant="bodySm">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleDateString('en-IN')
                        : '—'}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {o.status === 'pending' && (
                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          variant="primary"
                          onClick={() => updateStatus(o._id, 'confirmed')}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="slim"
                          tone="critical"
                          onClick={() => updateStatus(o._id, 'cancelled')}
                        >
                          Cancel
                        </Button>
                      </InlineStack>
                    )}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
