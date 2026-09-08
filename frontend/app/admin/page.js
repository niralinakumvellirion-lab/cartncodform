'use client';

import { Suspense, useState } from 'react';
import { AppProvider, Frame, Navigation } from '@shopify/polaris';
import {
  HomeIcon,
  PersonIcon,
  NotificationIcon,
  ReceiptIcon,
  SettingsIcon,
  ClipboardChecklistIcon,
} from '@shopify/polaris-icons';
import { useSearchParams } from 'next/navigation';
import '@shopify/polaris/build/esm/styles.css';

import TodayScreen from './screens/Today';
import CustomersScreen from './screens/Customers';
import MessagesScreen from './screens/Messages';
import CodScreen from './screens/CodOrders';
import SettingsScreen from './screens/Settings';
import OnboardingScreen from './screens/Onboarding';

const SCREENS = [
  { id: 'today', label: 'Today', icon: HomeIcon },
  { id: 'customers', label: 'Customers', icon: PersonIcon },
  { id: 'messages', label: 'Messages', icon: NotificationIcon },
  { id: 'cod', label: 'COD Orders', icon: ReceiptIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'onboarding', label: 'Setup', icon: ClipboardChecklistIcon },
];

function AdminHomeContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';

  const [activeScreen, setActiveScreen] = useState('today');

  const navigationMarkup = (
    <Navigation location="/">
      <Navigation.Section
        items={SCREENS.map((s) => ({
          label: s.label,
          icon: s.icon,
          selected: activeScreen === s.id,
          onClick: () => setActiveScreen(s.id),
        }))}
      />
    </Navigation>
  );

  return (
    <>
      <AppProvider i18n={{}}>
        <Frame navigation={navigationMarkup}>
          {activeScreen === 'today' && <TodayScreen shop={shop} />}
          {activeScreen === 'customers' && <CustomersScreen shop={shop} />}
          {activeScreen === 'messages' && <MessagesScreen shop={shop} />}
          {activeScreen === 'cod' && <CodScreen shop={shop} />}
          {activeScreen === 'settings' && <SettingsScreen shop={shop} />}
          {activeScreen === 'onboarding' && (
            <OnboardingScreen
              shop={shop}
              onNavigate={(screen) => setActiveScreen(screen)}
            />
          )}
        </Frame>
      </AppProvider>
    </>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={null}>
      <AdminHomeContent />
    </Suspense>
  );
}
