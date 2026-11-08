'use client';

import { Suspense, useState, useEffect } from 'react';
import { AppProvider } from '@shopify/polaris';
import { useRouter, useSearchParams } from 'next/navigation';
import '@shopify/polaris/build/esm/styles.css';

import OnboardingScreen from './screens/Onboarding';
import { getOnboarding } from './lib/onboardingApi';

/**
 * /admin is the landing gate: a store that has not finished (or skipped) the setup checklist since this
 * install sees it; everyone else goes to the Dashboard. The state is kept per store on the server, so a
 * reinstall shows the checklist again in any browser.
 */
function AdminHomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || '';
  const [steps, setSteps] = useState(null); // null = still checking

  // Keep shop/host (and any other params) when moving inside the admin.
  const go = (route) => {
    const qs = typeof window !== 'undefined' && window.location.search
      ? window.location.search
      : `?shop=${encodeURIComponent(shop)}`;
    router.replace(`/admin/${route}${qs}`);
  };

  useEffect(() => {
    let cancelled = false;
    if (!shop) { go('dashboard'); return undefined; }
    getOnboarding(shop)
      .then((s) => {
        if (cancelled) return;
        if (!s || s.completed) go('dashboard');
        else setSteps(s.steps || {});
      })
      // The checklist never blocks the app: if it cannot be loaded, open the Dashboard (its setup guide
      // still shows the storefront step).
      .catch(() => { if (!cancelled) go('dashboard'); });
    return () => { cancelled = true; };
  }, []);

  // Blank while checking and while redirecting: never flashes another screen.
  if (!steps) return null;

  return (
    <AppProvider i18n={{}}>
      <OnboardingScreen
        shop={shop}
        initialSteps={steps}
        onNavigate={(route) => go(route)}
        onDone={() => go('dashboard')}
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
