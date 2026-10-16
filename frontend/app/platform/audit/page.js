import PlatformShell from '../components/PlatformShell';
import AuditScreen from './AuditScreen';

export const metadata = {
  title: 'Audit log – ShopiReachBoost Platform',
  robots: { index: false, follow: false },
};

export default function AuditPage() {
  return (
    <PlatformShell>
      <AuditScreen />
    </PlatformShell>
  );
}
