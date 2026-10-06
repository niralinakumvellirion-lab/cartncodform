'use client';
import { Suspense } from 'react';
import { AppProvider } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import EmailTemplatesScreen from '../screens/EmailTemplates';
import '@shopify/polaris/build/esm/styles.css';

function EmailTemplatesContent() {
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
      <EmailTemplatesScreen />
    </AppProvider>
  );
}

export default function EmailTemplatesPage() {
  return (
    <Suspense fallback={null}>
      <EmailTemplatesContent />
    </Suspense>
  );
}
