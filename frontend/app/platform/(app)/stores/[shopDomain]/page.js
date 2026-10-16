import StoreDetail from '../../../stores/[shopDomain]/StoreDetail';

export const metadata = {
  title: 'Store – ShopiReachBoost Platform',
  robots: { index: false, follow: false },
};

export default function StoreDetailPage({ params }) {
  const shopDomain = decodeURIComponent(params.shopDomain);
  return <StoreDetail shopDomain={shopDomain} />;
}
