import PlatformShell from './components/PlatformShell';
import StoresList from './StoresList';

export const metadata = {
  title: 'Stores – ShopiReachBoost Platform',
  robots: { index: false, follow: false },
};

export default function StoresPage() {
  return (
    <PlatformShell>
      <StoresList />
    </PlatformShell>
  );
}
