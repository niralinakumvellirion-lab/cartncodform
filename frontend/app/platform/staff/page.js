import PlatformShell from '../components/PlatformShell';
import StaffScreen from './StaffScreen';

export const metadata = {
  title: 'Staff – ShopiReachBoost Platform',
  robots: { index: false, follow: false },
};

export default function StaffPage() {
  return (
    <PlatformShell>
      <StaffScreen />
    </PlatformShell>
  );
}
