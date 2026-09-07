'use client';

import { Suspense, useState, useCallback, useEffect, useMemo } from 'react';
import {
  AppProvider,
  Page,
  Card,
  Text,
  Badge,
  Button,
  Popover,
  TextField,
  FormLayout,
  BlockStack,
  Box,
  InlineStack,
  Checkbox,
  Banner,
  ResourceList,
  ResourceItem,
  Modal,
  Grid,
  SkeletonBodyText,
  Thumbnail,
  Tabs,
  IndexTable,
  Select,
  Spinner,
} from '@shopify/polaris';
import { useSearchParams } from 'next/navigation';
import '@shopify/polaris/build/esm/styles.css';
import { apiGet, apiSend } from '../../lib/api';

// --- Ported pure helpers (byte-for-byte from dashboard/[shop]/page.js) ---

function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

// Strip spaces, plus signs and dashes so the number is wa.me-friendly.
function cleanPhone(phone) {
  return String(phone || '').replace(/[\s+\-]/g, '');
}

// --- Ported components (logic unchanged; rendering layer -> Polaris) ---

function WhatsAppButton({ phone, message }) {
  const href = `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`;
  return (
    <Button url={href} external>
      💬 WhatsApp
    </Button>
  );
}

function SendPushButton({ shop, cartValue, cartItems, productImageUrl, sessionId, itemTitle, productId }) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('You left items in your cart! 🛒');
  const [body, setBody] = useState(
    itemTitle
      ? `You left "${itemTitle}" in your cart!`
      : `Your cart has items worth ₹${cartValue}. Complete your order now!`
  );
  const [state, setState] = useState('idle'); // idle | sending | sent | error

  async function send(e) {
    e.stopPropagation();
    setState('sending');
    try {
      await apiSend('/api/push/send-customer', 'POST', {
        shopDomain: shop,
        title: title,
        body: body,
        url: `https://${shop}`,
        imageUrl: productImageUrl || cartItems?.[0]?.imageUrl || null,
        cartToken: sessionId || null,
        productId: productId || null,
      });
      setState('sent');
      setTimeout(() => {
        setExpanded(false);
        setState('idle');
      }, 1500);
    } catch (err) {
      console.error('[push] send-customer failed:', err);
      setState('error');
    }
  }

  const label =
    state === 'sending' ? 'Sending…' :
    state === 'sent' ? 'Sent!' :
    state === 'error' ? 'Failed — Retry' :
    'Send';

  const activator = (
    <Button onClick={(e) => { e.stopPropagation(); setExpanded(true); }}>
      🔔 Push
    </Button>
  );

  return (
    <Popover
      active={expanded}
      activator={activator}
      onClose={() => setExpanded(false)}
      preferredAlignment="right"
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 264 }}>
        <Card>
          <FormLayout>
            <TextField
              label="Title"
              value={title}
              onChange={(value) => setTitle(value)}
              autoComplete="off"
            />
            <TextField
              label="Message"
              value={body}
              onChange={(value) => setBody(value)}
              multiline={2}
              autoComplete="off"
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                onClick={send}
                loading={state === 'sending'}
                disabled={state === 'sending'}
              >
                {label}
              </Button>
              <Button onClick={(e) => { e.stopPropagation(); setExpanded(false); }}>
                Cancel
              </Button>
            </div>
          </FormLayout>
        </Card>
      </div>
    </Popover>
  );
}

function SendEmailButton({ shop, sessionId, cartToken }) {
  const [active, setActive] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sending, setSending] = useState(false);

  async function sendEmail() {
    setSending(true);
    try {
      await apiSend(
        `/api/push/send-email-test`,
        'POST',
        { shopDomain: shop, cartToken: sessionId, subject: emailSubject, body: emailBody },
      );
      setActive(false);
      setEmailSubject('');
      setEmailBody('');
    } catch (e) {
      console.error('[email] send-email-test failed:', e);
    } finally {
      setSending(false);
    }
  }

  const activator = (
    <Button onClick={(e) => { e.stopPropagation(); setActive(true); }}>
      ✉️ Email
    </Button>
  );

  return (
    <Popover
      active={active}
      activator={activator}
      onClose={() => setActive(false)}
      preferredAlignment="right"
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 264 }}>
        <Card>
          <FormLayout>
            <TextField
              label="Subject"
              value={emailSubject}
              onChange={(value) => setEmailSubject(value)}
              autoComplete="off"
            />
            <TextField
              label="Message"
              value={emailBody}
              onChange={(value) => setEmailBody(value)}
              multiline={2}
              autoComplete="off"
            />
            <InlineStack gap="200">
              <Button
                variant="primary"
                onClick={sendEmail}
                loading={sending}
                disabled={sending}
              >
                Send
              </Button>
              <Button variant="plain" onClick={(e) => { e.stopPropagation(); setActive(false); }}>
                Cancel
              </Button>
            </InlineStack>
          </FormLayout>
        </Card>
      </div>
    </Popover>
  );
}

function StatusBadge({ status }) {
  // Maps the original Tailwind color classes to Polaris Badge tones:
  //   abandoned  bg-red-100 text-red-700     -> critical
  //   recovered  bg-green-100 text-green-700 -> success
  //   pending    bg-amber-100 text-amber-700 -> warning
  //   confirmed  bg-green-100 text-green-700 -> success
  //   cancelled  bg-gray-200 text-gray-600   -> (default neutral, no tone)
  //   (unknown)  bg-gray-100 text-gray-600   -> (default neutral, no tone)
  const toneMap = {
    abandoned: 'critical',
    recovered: 'success',
    pending: 'warning',
    confirmed: 'success',
    cancelled: undefined,
  };
  return <Badge tone={toneMap[status]}>{status}</Badge>;
}

// --- Ported: automation rule editor (logic unchanged; JSX -> Polaris) ---

function StepEditor({ step, onChange, onRemove, canRemove }) {
  return (
    <Box
      background="bg-surface-secondary"
      borderColor="border"
      borderWidth="025"
      borderRadius="200"
      padding="300"
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="span" variant="bodySm" fontWeight="medium">
            Delay (minutes after cart abandoned)
          </Text>
          {canRemove && (
            <Button variant="plain" tone="critical" onClick={onRemove}>
              Remove step
            </Button>
          )}
        </InlineStack>
        <FormLayout>
          <TextField
            label="Delay (minutes after cart abandoned)"
            labelHidden
            type="number"
            min={1}
            value={step.delayMinutes}
            onChange={(value) => onChange({ ...step, delayMinutes: value })}
            autoComplete="off"
            placeholder="e.g. 30"
          />
          <Select
            label="Channel"
            options={[
              { label: 'Push Notification', value: 'push' },
              { label: 'Email', value: 'email' },
            ]}
            value={step.channel || 'push'}
            onChange={(value) => onChange({ ...step, channel: value })}
          />
          {step.channel === 'email' && (
            <TextField
              label="Email Subject"
              value={step.subject || ''}
              onChange={(value) => onChange({ ...step, subject: value })}
              placeholder="e.g. You left something behind..."
              autoComplete="off"
            />
          )}
          <TextField
            label={step.channel === 'email' ? 'Email Intro Text' : 'Notification title'}
            value={step.title}
            onChange={(value) => onChange({ ...step, title: value })}
            autoComplete="off"
            placeholder="Still thinking it over?"
          />
          <TextField
            label="Message — use {productTitle} and {cartValue} as placeholders"
            multiline={2}
            value={step.body}
            onChange={(value) => onChange({ ...step, body: value })}
            autoComplete="off"
            placeholder="Your {productTitle} is waiting (₹{cartValue})"
          />
          <Checkbox
            label="Include product image"
            checked={step.imageSource !== 'none'}
            onChange={(checked) => onChange({ ...step, imageSource: checked ? 'product' : 'none' })}
          />
        </FormLayout>
      </BlockStack>
    </Box>
  );
}

function RuleForm({ shop, existingRule, onSaved, onCancel }) {
  const [name, setName] = useState(existingRule?.name || '');
  const [steps, setSteps] = useState(
    existingRule?.steps?.length
      ? existingRule.steps.map(s => ({ ...s, delayMinutes: String(s.delayMinutes) }))
      : [{ delayMinutes: '30', channel: 'push', subject: '', title: '', body: '', imageSource: 'product' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateStep(index, updated) {
    setSteps(prev => prev.map((s, i) => (i === index ? updated : s)));
  }

  function removeStep(index) {
    setSteps(prev => prev.filter((_, i) => i !== index));
  }

  function addStep() {
    setSteps(prev => [...prev, { delayMinutes: '1440', channel: 'push', subject: '', title: '', body: '', imageSource: 'product' }]);
  }

  async function handleSave() {
    setError('');
    if (!name.trim()) {
      setError('Rule name is required');
      return;
    }
    for (const step of steps) {
      if (!step.delayMinutes || Number(step.delayMinutes) < 1) {
        setError('Every step needs a delay of at least 1 minute');
        return;
      }
      if (!step.title.trim() || !step.body.trim()) {
        setError('Every step needs a title and message');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        trigger: 'cart_abandon',
        steps: steps.map(s => ({
          delayMinutes: Number(s.delayMinutes),
          channel: s.channel || 'push',
          subject: (s.subject || '').trim(),
          title: s.title.trim(),
          body: s.body.trim(),
          imageSource: s.imageSource,
        })),
      };

      if (existingRule) {
        await apiSend(`/api/automation/${encodeURIComponent(shop)}/rules/${existingRule._id}`, 'PATCH', payload);
      } else {
        await apiSend(`/api/automation/${encodeURIComponent(shop)}/rules`, 'POST', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <BlockStack gap="400">
        <FormLayout>
          <TextField
            label="Rule name"
            value={name}
            onChange={(value) => setName(value)}
            autoComplete="off"
            placeholder="e.g. Cart abandonment reminders"
          />
        </FormLayout>

        <BlockStack gap="200">
          <Text as="p" variant="bodyMd" fontWeight="bold">
            Trigger: when a customer abandons their cart
          </Text>
          <BlockStack gap="300">
            {steps.map((step, i) => (
              <StepEditor
                key={i}
                step={step}
                onChange={(updated) => updateStep(i, updated)}
                onRemove={() => removeStep(i)}
                canRemove={steps.length > 1}
              />
            ))}
          </BlockStack>
          <InlineStack>
            <Button variant="plain" onClick={addStep}>
              + Add follow-up step
            </Button>
          </InlineStack>
        </BlockStack>

        {error && (
          <Text as="p" variant="bodySm" tone="critical">
            {error}
          </Text>
        )}

        <InlineStack gap="200">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            disabled={saving}
          >
            {saving ? 'Saving...' : existingRule ? 'Save changes' : 'Create rule'}
          </Button>
          <Button variant="plain" onClick={onCancel}>
            Cancel
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function AutomationRules({ shop }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  // Modal-based confirm replaces window.confirm (see STAGE2B_AUTOMATION_AUDIT.txt).
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet(`/api/automation/${encodeURIComponent(shop)}/rules`);
      setRules(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  async function toggleActive(rule) {
    try {
      await apiSend(`/api/automation/${encodeURIComponent(shop)}/rules/${rule._id}`, 'PATCH', {
        active: !rule.active,
      });
      loadRules();
    } catch (err) {
      setError(err.message);
    }
  }

  function deleteRule(rule) {
    setDeleteTarget(rule);
  }

  async function confirmDelete() {
    const rule = deleteTarget;
    setDeleteTarget(null);
    if (!rule) return;
    try {
      await apiSend(`/api/automation/${encodeURIComponent(shop)}/rules/${rule._id}`, 'DELETE');
      loadRules();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleFormSaved() {
    setShowForm(false);
    setEditingRule(null);
    loadRules();
  }

  if (showForm || editingRule) {
    return (
      <RuleForm
        shop={shop}
        existingRule={editingRule}
        onSaved={handleFormSaved}
        onCancel={() => { setShowForm(false); setEditingRule(null); }}
      />
    );
  }

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="p" variant="bodyMd" tone="subdued">
          Automatically remind customers who leave items in their cart.
        </Text>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + New rule
        </Button>
      </InlineStack>

      {error && (
        <Banner tone="critical">{error}</Banner>
      )}

      {loading ? (
        <Text as="p" variant="bodyMd" tone="subdued">Loading rules...</Text>
      ) : rules.length === 0 ? (
        <Box borderColor="border" borderWidth="025" borderRadius="200" padding="800">
          <Text as="p" alignment="center" tone="subdued">
            No automation rules yet. Create one to start sending automatic reminders.
          </Text>
        </Box>
      ) : (
        <ResourceList
          resourceName={{ singular: 'rule', plural: 'rules' }}
          items={rules}
          renderItem={(rule) => (
            <ResourceItem id={rule._id} onClick={() => setEditingRule(rule)}>
              <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h3" variant="bodyMd" fontWeight="bold">{rule.name}</Text>
                    <Badge tone={rule.active ? 'success' : undefined}>
                      {rule.active ? 'Active' : 'Paused'}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Cart abandonment · {rule.steps.length} step{rule.steps.length === 1 ? '' : 's'}
                  </Text>
                  <BlockStack gap="050">
                    {rule.steps.map((step, i) => (
                      <Text as="p" key={i} variant="bodySm" tone="subdued">
                        Step {i + 1}: after {step.delayMinutes} min — &quot;{step.title}&quot;
                      </Text>
                    ))}
                  </BlockStack>
                </BlockStack>
                <BlockStack gap="200">
                  <Button variant="plain" onClick={() => setEditingRule(rule)}>Edit</Button>
                  <Button variant="plain" onClick={() => toggleActive(rule)}>
                    {rule.active ? 'Pause' : 'Resume'}
                  </Button>
                  <Button variant="plain" tone="critical" onClick={() => deleteRule(rule)}>
                    Delete
                  </Button>
                </BlockStack>
              </InlineStack>
            </ResourceItem>
          )}
        />
      )}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete automation rule"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          onAction: confirmDelete,
        }}
        secondaryActions={[
          { content: 'Cancel', onAction: () => setDeleteTarget(null) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

// --- Ported: revenue attribution KPI tiles (logic unchanged; JSX -> Polaris) ---

function RevenueStats({ customers }) {
  const stats = useMemo(() => {
    const recovered = customers.filter(c => c.status === 'recovered');
    const withRevenue = recovered.filter(c =>
      typeof c.recoveredRevenue === 'number' && c.recoveredRevenue > 0
    );

    const totalRevenue = withRevenue.reduce((sum, c) => sum + c.recoveredRevenue, 0);
    const pushAttributed = withRevenue.filter(c => c.attributionSource === 'push');
    const pushRevenue = pushAttributed.reduce((sum, c) => sum + c.recoveredRevenue, 0);

    const totalCarts = customers.length;
    const recoveryRate = totalCarts > 0
      ? ((recovered.length / totalCarts) * 100).toFixed(1)
      : '0.0';

    // Determine a display currency — use the most common one found,
    // fall back to no symbol if mixed/absent.
    const currencies = withRevenue
      .map(c => c.recoveredCurrency)
      .filter(Boolean);
    const currencyCounts = {};
    currencies.forEach(c => { currencyCounts[c] = (currencyCounts[c] || 0) + 1; });
    const topCurrency = Object.keys(currencyCounts).sort(
      (a, b) => currencyCounts[b] - currencyCounts[a]
    )[0] || null;
    const mixedCurrencies = new Set(currencies).size > 1;

    const revenuePerSend = pushAttributed.length > 0
      ? (pushRevenue / pushAttributed.length).toFixed(2)
      : null;

    return {
      totalRevenue,
      pushRevenue,
      recoveredCount: recovered.length,
      recoveryRate,
      totalCarts,
      revenuePerSend,
      topCurrency,
      mixedCurrencies,
      hasData: withRevenue.length > 0,
    };
  }, [customers]);

  function formatCurrency(amount) {
    if (stats.mixedCurrencies) return amount.toFixed(2);
    const symbol = stats.topCurrency === 'INR' ? '₹'
      : stats.topCurrency === 'USD' ? '$'
      : stats.topCurrency === 'EUR' ? '€'
      : '';
    return `${symbol}${amount.toFixed(2)}`;
  }

  if (!stats.hasData) {
    return (
      <Box
        background="bg-surface-secondary"
        borderColor="border"
        borderWidth="025"
        borderRadius="200"
        padding="400"
      >
        <Text as="p" variant="bodySm" tone="subdued">
          No recovered revenue yet. Revenue will appear here once a customer completes
          an order after receiving a push notification or reminder.
        </Text>
      </Box>
    );
  }

  return (
    <Grid>
      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
        <Card>
          <BlockStack gap="100">
            <Text variant="headingSm" as="h3">Recovered Revenue</Text>
            <Text variant="headingLg" as="p">{formatCurrency(stats.totalRevenue)}</Text>
          </BlockStack>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
        <Card>
          <BlockStack gap="100">
            <Text variant="headingSm" as="h3">From Push Notifications</Text>
            <Text variant="headingLg" as="p">{formatCurrency(stats.pushRevenue)}</Text>
          </BlockStack>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
        <Card>
          <BlockStack gap="100">
            <Text variant="headingSm" as="h3">Recovery Rate</Text>
            <Text variant="headingLg" as="p">{stats.recoveryRate}%</Text>
            <Text variant="bodySm" tone="subdued">
              {stats.recoveredCount} of {stats.totalCarts} carts
            </Text>
          </BlockStack>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
        <Card>
          <BlockStack gap="100">
            <Text variant="headingSm" as="h3">Revenue per Push Sent</Text>
            <Text variant="headingLg" as="p">
              {stats.revenuePerSend !== null ? formatCurrency(Number(stats.revenuePerSend)) : '—'}
            </Text>
          </BlockStack>
        </Card>
      </Grid.Cell>
    </Grid>
  );
}

// --- Ported: customer journey slide-over (state/effect/API unchanged; JSX -> Polaris Modal) ---

function CustomerAnalytics({ open, shop, customer, onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) return;

    const sessionId = customer.sessionId;
    if (!sessionId) {
      setLoading(false);
      return;
    }

    // Step 1: resolve ccfSessionId from cartToken (sessionId)
    apiGet(`/api/events/${encodeURIComponent(shop)}/resolve/${encodeURIComponent(sessionId)}`)
      .then(function(data) {
        const ccfSessionId = data.ccfSessionId;
        if (!ccfSessionId) {
          // No subscription found for this cart — try direct sessionId lookup
          return apiGet(`/api/events/${encodeURIComponent(shop)}/customer/${encodeURIComponent(sessionId)}`);
        }
        // Step 2: fetch events by stable ccfSessionId
        return apiGet(`/api/events/${encodeURIComponent(shop)}/ccfsession/${encodeURIComponent(ccfSessionId)}`);
      })
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [shop, customer]);

  const iconFor = (type) => ({
    page_view: '👁️',
    product_view: '🛍️',
    collection_view: '📂',
    search: '🔍',
    cart_view: '🛒',
    add_to_cart: '➕',
    remove_from_cart: '➖',
    cart_update: '✏️',
    reached_checkout: '💳',
    page_exit: '🚪',
  }[type] || '📍');

  return (
    <Modal open={open} onClose={onClose} title="Customer Journey" size="large">
      <Modal.Section>
        {loading ? (
          <SkeletonBodyText lines={4} />
        ) : events.length === 0 ? (
          <Box padding="400">
            <Text as="p" tone="subdued">No journey events found.</Text>
          </Box>
        ) : (
          <ResourceList
            resourceName={{ singular: 'event', plural: 'events' }}
            items={events}
            idForItem={(item, index) => String(index)}
            renderItem={(e, id) => (
              <ResourceItem id={id}>
                <InlineStack gap="300" blockAlign="start" wrap={false}>
                  {e.type === 'product_view' && e.meta?.imageUrl ? (
                    <Thumbnail source={e.meta.imageUrl} alt="" size="small" />
                  ) : (
                    <Text as="span" variant="headingLg">{iconFor(e.type)}</Text>
                  )}
                  <BlockStack gap="050">
                    <InlineStack align="space-between" blockAlign="center" gap="200">
                      <Badge>{e.type.replace(/_/g, ' ')}</Badge>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {new Date(e.ts).toLocaleTimeString()}
                      </Text>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued" truncate>{e.path}</Text>
                    {e.meta && (
                      <BlockStack gap="050">
                        {e.meta.title && (
                          <Text as="p" variant="bodySm" tone="subdued">{e.meta.title}</Text>
                        )}
                        {e.meta.query && (
                          <Text as="p" variant="bodySm" tone="subdued">Search: &quot;{e.meta.query}&quot;</Text>
                        )}
                        {e.meta.dwellSeconds !== undefined && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {e.meta.dwellSeconds}s on page · {e.meta.scrollDepth || 0}% scrolled
                          </Text>
                        )}
                        {e.meta.cartValue && (
                          <Text as="p" variant="bodySm" tone="subdued">Cart: ₹{e.meta.cartValue}</Text>
                        )}
                        {e.meta.itemCount && (
                          <Text as="p" variant="bodySm" tone="subdued">{e.meta.itemCount} items</Text>
                        )}
                      </BlockStack>
                    )}
                  </BlockStack>
                </InlineStack>
              </ResourceItem>
            )}
          />
        )}
      </Modal.Section>
    </Modal>
  );
}

// --- Ported: the real embedded store view (Stage 2c) ---

const COD_STATUS_OPTIONS = [
  { label: 'pending', value: 'pending' },
  { label: 'confirmed', value: 'confirmed' },
  { label: 'cancelled', value: 'cancelled' },
];

function StoreView({ shop }) {
  const [tab, setTab] = useState('abandoned');
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyticsCustomer, setAnalyticsCustomer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [c, o] = await Promise.all([
        apiGet(`/api/stores/${encodeURIComponent(shop)}/customers`),
        apiGet(`/api/stores/${encodeURIComponent(shop)}/orders`),
      ]);
      setCustomers(c);
      setOrders(o);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    load();
  }, [load]);

  // TODO: re-evaluate foreground push notifications for embedded context

  async function updateOrderStatus(id, status) {
    // optimistic update
    setOrders((prev) => prev.map((o) => (o._id === id ? { ...o, status } : o)));
    try {
      await apiSend(`/api/cod/order/${id}`, 'PATCH', { status });
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  const tabs = [
    { id: 'abandoned', content: `Abandoned Carts (${customers.length})`, panelID: 'abandoned-panel' },
    { id: 'cod', content: `COD Orders (${orders.length})`, panelID: 'cod-panel' },
    { id: 'automation', content: 'Automations', panelID: 'automation-panel' },
  ];
  const selectedTab = Math.max(0, tabs.findIndex((t) => t.id === tab));

  return (
    <>
      <CustomerAnalytics
        open={!!analyticsCustomer}
        shop={shop}
        customer={analyticsCustomer}
        onClose={() => setAnalyticsCustomer(null)}
      />
      <Page
        title={shop}
        subtitle="Abandoned carts & COD orders"
        secondaryActions={[{ content: 'Refresh', onAction: load }]}
      >
        <BlockStack gap="400">
          {/* TODO: port PushNotificationSetup */}

          {!loading && <RevenueStats customers={customers} />}

          {error && (
            <Banner
              tone="critical"
              title="Couldn't load store data"
              action={{ content: 'Try again', onAction: load }}
            >
              <Text as="p">{error}</Text>
            </Banner>
          )}

          {loading && (
            <InlineStack gap="200" blockAlign="center">
              <Spinner accessibilityLabel="Loading store data" size="small" />
              <Text as="span" tone="subdued">Loading store data…</Text>
            </InlineStack>
          )}

          <Tabs tabs={tabs} selected={selectedTab} onSelect={(idx) => setTab(tabs[idx].id)}>
            {!loading && tab === 'abandoned' && (
              <IndexTable
                resourceName={{ singular: 'cart', plural: 'carts' }}
                itemCount={customers.length}
                selectable={false}
                headings={[
                  { title: 'Customer Email' },
                  { title: 'Phone' },
                  { title: 'Cart Items' },
                  { title: 'Cart Value' },
                  { title: 'Date' },
                  { title: 'Status' },
                  { title: 'Actions' },
                ]}
                emptyState={
                  <Box padding="400">
                    <Text as="p" alignment="center" tone="subdued">No abandoned carts yet.</Text>
                  </Box>
                }
              >
                {customers.map((c, index) => {
                  const anon = !c.email && !c.phone;
                  const itemCount = Array.isArray(c.cartItems)
                    ? c.cartItems.reduce((s, i) => s + (i.quantity || 1), 0)
                    : 0;
                  return (
                    <IndexTable.Row
                      id={c._id}
                      key={c._id}
                      position={index}
                      onClick={() => setAnalyticsCustomer(c)}
                    >
                      <IndexTable.Cell>
                        {anon ? (
                          <Text as="span" tone="subdued">Anonymous</Text>
                        ) : (
                          c.email || <Text as="span" tone="subdued">—</Text>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {c.phone || <Text as="span" tone="subdued">—</Text>}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {Array.isArray(c.cartItems) && c.cartItems.length > 0 ? (
                          <BlockStack gap="100">
                            {c.cartItems.map((item, idx) => (
                              <InlineStack key={idx} align="space-between" blockAlign="center" gap="200">
                                <Text as="span" variant="bodySm" truncate>
                                  {item.title} x{item.quantity || 1}
                                </Text>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <InlineStack gap="100" blockAlign="center">
                                    <SendPushButton
                                      shop={shop}
                                      cartValue={c.cartValue}
                                      cartItems={c.cartItems}
                                      productImageUrl={item.imageUrl || c.productImageUrl}
                                      sessionId={c.sessionId}
                                      itemTitle={item.title}
                                      productId={item.productId || null}
                                    />
                                    <SendEmailButton
                                      shop={shop}
                                      sessionId={c.sessionId}
                                      cartToken={c.sessionId}
                                    />
                                  </InlineStack>
                                </div>
                              </InlineStack>
                            ))}
                          </BlockStack>
                        ) : (
                          <Text as="span" tone="subdued">
                            {itemCount} item{itemCount === 1 ? '' : 's'}
                          </Text>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>{formatMoney(c.cartValue)}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" tone="subdued">{formatDate(c.createdAt)}</Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <StatusBadge status={c.status} />
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {c.phone && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <WhatsAppButton
                              phone={c.phone}
                              message={
                                `Hi! We noticed you left some items in your cart.\n` +
                                `Items: ${
                                  Array.isArray(c.cartItems) && c.cartItems.length > 0
                                    ? c.cartItems
                                        .map((i) => `${i.title} x${i.quantity || 1}`)
                                        .join(', ')
                                    : '-'
                                }\n` +
                                `Cart Value: ${formatMoney(c.cartValue)}\n` +
                                `Please complete your order. We'd love to help!`
                              }
                            />
                          </div>
                        )}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            )}

            {!loading && tab === 'cod' && (
              <IndexTable
                resourceName={{ singular: 'order', plural: 'orders' }}
                itemCount={orders.length}
                selectable={false}
                headings={[
                  { title: 'Name' },
                  { title: 'Phone' },
                  { title: 'Address' },
                  { title: 'Product' },
                  { title: 'Price' },
                  { title: 'Qty' },
                  { title: 'Status' },
                  { title: 'Date' },
                  { title: 'Actions' },
                ]}
                emptyState={
                  <Box padding="400">
                    <Text as="p" alignment="center" tone="subdued">No COD orders yet.</Text>
                  </Box>
                }
              >
                {orders.map((o, index) => (
                  <IndexTable.Row id={o._id} key={o._id} position={index}>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="medium">{o.name}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{o.phone}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <span title={`${o.address}, ${o.city} ${o.pincode}`}>
                        <Text as="span" truncate>
                          {o.address}{o.city ? `, ${o.city}` : ''} {o.pincode}
                        </Text>
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{o.productName || '—'}</IndexTable.Cell>
                    <IndexTable.Cell>{formatMoney(o.productPrice)}</IndexTable.Cell>
                    <IndexTable.Cell>{o.quantity}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Select
                        label="Status"
                        labelHidden
                        options={COD_STATUS_OPTIONS}
                        value={o.status}
                        onChange={(value) => updateOrderStatus(o._id, value)}
                      />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued">{formatDate(o.createdAt)}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <WhatsAppButton
                        phone={o.phone}
                        message={
                          `Hi ${o.name}! Your COD order has been received.\n` +
                          `Product: ${o.productName || '-'}\n` +
                          `Amount: ₹${formatMoney(o.productPrice)}\n` +
                          `Quantity: ${o.quantity}\n` +
                          `We will process your order soon!`
                        }
                      />
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}

            {tab === 'automation' && (
              <AutomationRules shop={shop} />
            )}
          </Tabs>
        </BlockStack>
      </Page>
    </>
  );
}

// --- Page ---

function AdminHomeContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID;

  return (
    <>
      <meta name="shopify-api-key" content={apiKey} />
      <AppProvider i18n={{}}>
        <StoreView shop={shop} />
      </AppProvider>
    </>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={null}>
      <AdminHomeContent />
    </Suspense>
  );
}
