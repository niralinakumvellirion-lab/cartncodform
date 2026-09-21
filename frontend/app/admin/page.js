'use client';

import { Suspense, useState, useEffect } from 'react';
import { AppProvider } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';
import '@shopify/polaris/build/esm/styles.css';

import DashboardScreen from './dashboard/DashboardScreen';
import OnboardingScreen from './screens/Onboarding';

function AdminHomeContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (onboardingChecked) return;
    setOnboardingChecked(true);
    const hasOnboarded = localStorage.getItem('ccf_onboarded') === 'true';
    if (!hasOnboarded) setShowOnboarding(true);
  }, []);

  return (
    <AppProvider i18n={{}}>
      {!showOnboarding && (
        <NavMenu>
          <a href="/admin" rel="home">Dashboard</a>
          <a href="/admin/activity" rel="activity">Activity</a>
          <a href="/admin/queue" rel="queue">Queue</a>
          <a href="/admin/automation" rel="automation">Automation</a>
          <a href="/admin/customers" rel="customers">Customers</a>
          <a href="/admin/messages" rel="messages">Messages</a>
          <a href="/admin/cod" rel="cod">Cash on delivery</a>
          <a href="/admin/discounts" rel="discounts">Discounts</a>
          <a href="/admin/settings-page" rel="settings-page">Settings</a>
        </NavMenu>
      )}
      {showOnboarding ? (
        <OnboardingScreen
          shop={shop}
          onNavigate={() => {}}
          onDone={() => {
            localStorage.setItem('ccf_onboarded', 'true');
            setShowOnboarding(false);
          }}
        />
      ) : (
        <DashboardScreen shop={shop} />
      )}
    </AppProvider>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={null}>
      <AdminHomeContent />
    </Suspense>
  );
}
