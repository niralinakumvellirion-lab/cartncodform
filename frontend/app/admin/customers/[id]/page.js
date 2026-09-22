'use client';
import { Suspense } from 'react';
import { AppProvider } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams, useParams } from 'next/navigation';
import CustomerDetailScreen from '../../screens/CustomerDetail';
import '@shopify/polaris/build/esm/styles.css';

function CustomerDetailContent() {
  const searchParams = useSearchParams();
  const params = useParams();
  const shop = searchParams.get('shop') || '';
  const id = params?.id ? decodeURIComponent(String(params.id)) : '';
  return (
    <AppProvider i18n={{}}>
      <NavMenu>
        <a href="/admin/dashboard" rel="home">Home</a>
        <a href="/admin/dashboard">Dashboard</a>
        <a href="/admin/activity" rel="activity">Activity</a>
        <a href="/admin/queue" rel="queue">Queue</a>
        <a href="/admin/automation" rel="automation">Automation</a>
        <a href="/admin/customers" rel="customers">Customers</a>
        <a href="/admin/messages" rel="messages">Messages</a>
        <a href="/admin/cod" rel="cod">Cash on delivery</a>
        <a href="/admin/discounts" rel="discounts">Discounts</a>
        <a href="/admin/settings-page" rel="settings-page">Settings</a>
      </NavMenu>
      <CustomerDetailScreen shop={shop} profileId={id} />
    </AppProvider>
  );
}

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={null}>
      <CustomerDetailContent />
    </Suspense>
  );
}
