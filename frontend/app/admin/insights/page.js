'use client';
import { Suspense } from 'react';
import { AppProvider } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';
import TodayScreen from '../screens/Today';
import '@shopify/polaris/build/esm/styles.css';

function InsightsContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  return (
    <AppProvider i18n={{}}>
      <NavMenu>
        <a href="/admin" rel="today">Today</a>
        <a href="/admin/customers" rel="customers">Customers</a>
        <a href="/admin/signals" rel="signals">What to act on</a>
        <a href="/admin/messages" rel="messages">Messages</a>
        <a href="/admin/insights" rel="insights">Insights</a>
        <a href="/admin/cod" rel="cod">Cash on delivery</a>
        <a href="/admin/settings-page" rel="settings-page">Settings</a>
      </NavMenu>
      {/* placeholder — dedicated insights screen later */}
      <TodayScreen shop={shop} />
    </AppProvider>
  );
}

export default function InsightsPage() {
  return (
    <Suspense fallback={null}>
      <InsightsContent />
    </Suspense>
  );
}
