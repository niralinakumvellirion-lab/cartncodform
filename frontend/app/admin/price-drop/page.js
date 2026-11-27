'use client';
import { Suspense } from 'react';
import { AppProvider } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';
import BackInStockScreen from '../screens/BackInStock';
import '@shopify/polaris/build/esm/styles.css';

function PriceDropContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
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
        <a href="/admin/size-finder" rel="size-finder">Find my size</a>
        <a href="/admin/back-in-stock" rel="back-in-stock">Back in stock</a>
        <a href="/admin/price-drop" rel="price-drop">Price drop</a>
        <a href="/admin/reviews" rel="reviews">Reviews</a>
        <a href="/admin/settings-page" rel="settings-page">Settings</a>
        <a href="/admin/plans" rel="plans">Plans</a>
        <a href="/admin/email-templates" rel="email-templates">Email templates</a>
      </NavMenu>
      <BackInStockScreen shop={shop} kind="price" />
    </AppProvider>
  );
}

export default function PriceDropPage() {
  return (
    <Suspense fallback={null}>
      <PriceDropContent />
    </Suspense>
  );
}
