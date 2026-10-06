'use client';
import { Suspense } from 'react';
import { AppProvider } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';
import ActivityScreen from './ActivityScreen';
import '@shopify/polaris/build/esm/styles.css';

function ActivityContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  // Set by the Dashboard's attributed-activity tiles (navigate(`/admin/
  // activity?type=${key}&from=...&to=...`)) — ActivityScreen seeds its
  // own filter state from these instead of always defaulting to "all
  // types, last 7 days".
  const type = searchParams.get('type') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
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
        <a href="/admin/email-templates" rel="email-templates">Email templates</a>
      </NavMenu>
      <ActivityScreen shop={shop} initialType={type} initialFrom={from} initialTo={to} />
    </AppProvider>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityContent />
    </Suspense>
  );
}
