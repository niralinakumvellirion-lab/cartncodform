'use client';

import { Suspense, useState } from 'react';
import Script from 'next/script';
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
} from '@shopify/polaris';
import { useSearchParams } from 'next/navigation';
import '@shopify/polaris/build/esm/styles.css';
import { apiSend } from '../../lib/api';

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

// --- Page ---

function AdminHomeContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  const host = searchParams.get('host') || '';
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID;

  return (
    <>
      <meta name="shopify-api-key" content={apiKey} />
      <Script
        src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        strategy="beforeInteractive"
      />
      <AppProvider i18n={{}}>
        <Page title="CartnCodForm">
          <BlockStack gap="400">
            <Card>
              <Text as="p">
                Embedded shell loaded successfully.
              </Text>
              <Text as="p" tone="subdued">
                shop: {shop || '(not provided)'}
              </Text>
              <Text as="p" tone="subdued">
                host: {host || '(not provided)'}
              </Text>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">Component Preview (temporary)</Text>
                <StatusBadge status="abandoned" />
                <WhatsAppButton phone="+911234567890" message="Test message" />
                <SendPushButton
                  shop="test.myshopify.com"
                  cartValue={500}
                  cartItems={[]}
                  productImageUrl={null}
                  sessionId="test123"
                  itemTitle="Test Product"
                  productId="123"
                />
                <Text as="p" tone="subdued">
                  helper self-check — formatMoney(1234.5): {formatMoney(1234.5)} ·
                  formatDate(null): {formatDate(null)} ·
                  cleanPhone(&apos;+91 12-34&apos;): {cleanPhone('+91 12-34')}
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Page>
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
