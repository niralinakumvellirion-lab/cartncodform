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
  // Set by the Dashboard's Push Subscribers / Emails Captured tiles
  // (navigate(`/admin/customers?filter=...&from=...&to=...`)) —
  // Customers seeds its own filter tab and date range from these
  // instead of always opening on "Everyone", unfiltered by date.
  // `signal` is set by the Dashboard's "Do This Next" rows
  // (navigate(`/admin/customers?signal=<type>&from=...&to=...`)) and
  // shows only profiles with an active Signal of that type.
  const filter = searchParams.get('filter') || '';
  const signal = searchParams.get('signal') || '';
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
      <CustomersScreen shop={shop} initialFilter={filter} initialSignal={signal} initialFrom={from} initialTo={to} />
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
