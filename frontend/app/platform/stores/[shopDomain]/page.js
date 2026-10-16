import PlatformShell from '../../components/PlatformShell';
import StoreDetail from './StoreDetail';

export const metadata = {
  title: 'Store – ShopiReachBoost Platform',
  robots: { index: false, follow: false },
};

export default function StoreDetailPage({ params }) {
  const shopDomain = decodeURIComponent(params.shopDomain);
  return (
    <PlatformShell>
      <StoreDetail shopDomain={shopDomain} />
    </PlatformShell>
  );
}
