'use client';

import { Suspense } from 'react';
import Script from 'next/script';
import { AppProvider, Page, Card, Text } from '@shopify/polaris';
import { useSearchParams } from 'next/navigation';
import '@shopify/polaris/build/esm/styles.css';

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
