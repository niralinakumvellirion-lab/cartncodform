'use client';
import { Suspense } from 'react';
import { AppProvider } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';
import CustomersScreen from '../screens/Customers';
import '@shopify/polaris/build/esm/styles.css';

function CustomersContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  return (
    <AppProvider i18n={{}}>
      <NavMenu>
        <a href="/admin" rel="home">Dashboard</a>
        <a href="/admin/activity" rel="activity">Activity</a>
        <a href="/admin/queue" rel="queue">Queue</a>
        <a href="/admin/automation" rel="automation">Automation</a>
        <a href="/admin/customers" rel="customers">Customers</a>
        <a href="/admin/signals" rel="signals">What to act on</a>
        <a href="/admin/messages" rel="messages">Messages</a>
        <a href="/admin/cod" rel="cod">Cash on delivery</a>
        <a href="/admin/discounts" rel="discounts">Discounts</a>
        <a href="/admin/settings-page" rel="settings-page">Settings</a>
      </NavMenu>
      <CustomersScreen shop={shop} />
    </AppProvider>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersContent />
    </Suspense>
  );
}
