'use client';

import { Suspense, useState, useEffect } from 'react';
import { AppProvider } from '@shopify/polaris';
import { useRouter, useSearchParams } from 'next/navigation';
import '@shopify/polaris/build/esm/styles.css';

import OnboardingScreen from './screens/Onboarding';

function AdminHomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (onboardingChecked) return;
    setOnboardingChecked(true);
    const hasOnboarded = localStorage.getItem('ccf_onboarded') === 'true';
    if (hasOnboarded) {
      // /admin is just a landing gate — send onboarded merchants to the real
      // Dashboard route so the URL matches (and highlights) the Dashboard nav
      // item, instead of rendering DashboardScreen here under the /admin URL.
      router.replace(`/admin/dashboard?shop=${encodeURIComponent(shop)}`);
    } else {
      setShowOnboarding(true);
    }
  }, []);

  // Blank while we check onboarding status (first render) and while the
  // onboarded redirect above is in flight — never flashes another screen.
  if (!onboardingChecked || !showOnboarding) return null;

  return (
    <AppProvider i18n={{}}>
      <OnboardingScreen
        shop={shop}
        onNavigate={() => {}}
        onDone={() => {
          localStorage.setItem('ccf_onboarded', 'true');
          router.replace(`/admin/dashboard?shop=${encodeURIComponent(shop)}`);
        }}
      />
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
