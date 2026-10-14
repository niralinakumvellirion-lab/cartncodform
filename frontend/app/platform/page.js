import PlatformShell from './components/PlatformShell';

export const metadata = {
  title: 'Stores – ShopiReachBoost Platform',
  robots: { index: false, follow: false },
};

export default function StoresPage() {
  return (
    <PlatformShell>
      <h1 className="text-xl font-bold text-white mb-2">Stores</h1>
      <p className="text-white/50 text-sm">Coming in the next step.</p>
    </PlatformShell>
  );
}
