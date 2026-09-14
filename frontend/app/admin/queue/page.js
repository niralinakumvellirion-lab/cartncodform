'use client';
import { Suspense } from 'react';
import { AppProvider } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';
import QueueScreen from './QueueScreen';
import '@shopify/polaris/build/esm/styles.css';

function QueueContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  return (
    <AppProvider i18n={{}}>
      <NavMenu>
        <a href="/admin" rel="today">Today</a>
        <a href="/admin/activity" rel="activity">Activity</a>
        <a href="/admin/queue" rel="queue">Queue</a>
        <a href="/admin/customers" rel="customers">Customers</a>
        <a href="/admin/journey" rel="journey">Journey</a>
        <a href="/admin/signals" rel="signals">What to act on</a>
        <a href="/admin/messages" rel="messages">Messages</a>
        <a href="/admin/insights" rel="insights">Insights</a>
        <a href="/admin/cod" rel="cod">Cash on delivery</a>
        <a href="/admin/discounts" rel="discounts">Discounts</a>
        <a href="/admin/settings-page" rel="settings-page">Settings</a>
      </NavMenu>
      <QueueScreen shop={shop} />
    </AppProvider>
  );
}

export default function QueuePage() {
  return (
    <Suspense fallback={null}>
      <QueueContent />
    </Suspense>
  );
}
