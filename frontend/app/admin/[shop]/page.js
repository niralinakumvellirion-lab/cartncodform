'use client';

import Script from 'next/script';
import { AppProvider, Page, Card, Text } from '@shopify/polaris';
import { useParams } from 'next/navigation';
import '@shopify/polaris/build/esm/styles.css';

export default function AdminHome() {
  const params = useParams();
  const shop = decodeURIComponent(params.shop || '');
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
              Embedded shell loaded successfully for shop: {shop}
            </Text>
          </Card>
        </Page>
      </AppProvider>
    </>
  );
}
