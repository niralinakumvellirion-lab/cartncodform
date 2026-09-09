'use client';

import { Suspense, useState, useEffect } from 'react';
import { AppProvider } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';
import '@shopify/polaris/build/esm/styles.css';

import TodayScreen from './screens/Today';
import CustomersScreen from './screens/Customers';
import MessagesScreen from './screens/Messages';
import CodScreen from './screens/CodOrders';
import SettingsScreen from './screens/Settings';
import OnboardingScreen from './screens/Onboarding';

function AdminHomeContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  const screenParam = searchParams.get('screen');
  const [activeScreen, setActiveScreen] = useState(screenParam || 'today');
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (onboardingChecked) return;
    setOnboardingChecked(true);
    if (screenParam) return; // URL param takes priority
    // localStorage.removeItem('ccf_onboarded'); // uncomment to test
    const hasOnboarded = localStorage.getItem('ccf_onboarded') === 'true';
    if (!hasOnboarded) {
      setActiveScreen('onboarding');
    }
  }, []);

  // Sync activeScreen when URL screen param changes
  useEffect(() => {
    if (screenParam && screenParam !== activeScreen) {
      setActiveScreen(screenParam);
    }
  }, [screenParam]);

  return (
    <AppProvider i18n={{}}>
      {activeScreen !== 'onboarding' && (
        <NavMenu>
          <a href="?screen=today" rel="today">Today</a>
          <a href="?screen=customers" rel="customers">Customers</a>
          <a href="?screen=signals" rel="signals">What to act on</a>
          <a href="?screen=messages" rel="messages">Messages</a>
          <a href="?screen=insights" rel="insights">Insights</a>
          <a href="?screen=cod" rel="cod">Cash on delivery</a>
          <a href="?screen=settings" rel="settings">Settings</a>
        </NavMenu>
      )}

      {activeScreen === 'onboarding' && (
        <OnboardingScreen
          shop={shop}
          onNavigate={(screen) => setActiveScreen(screen)}
          onDone={() => {
            localStorage.setItem('ccf_onboarded', 'true');
            setActiveScreen('today');
          }}
        />
      )}
      {activeScreen === 'today' && <TodayScreen shop={shop} />}
      {activeScreen === 'customers' && <CustomersScreen shop={shop} />}
      {/* placeholder — dedicated signals screen later */}
      {activeScreen === 'signals' && <TodayScreen shop={shop} />}
      {activeScreen === 'messages' && <MessagesScreen shop={shop} />}
      {/* placeholder — dedicated insights screen later */}
      {activeScreen === 'insights' && <TodayScreen shop={shop} />}
      {activeScreen === 'cod' && <CodScreen shop={shop} />}
      {activeScreen === 'settings' && <SettingsScreen shop={shop} />}
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
