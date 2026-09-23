export default function AdminLayout({ children }) {
  return (
    <>
      <meta
        name="shopify-api-key"
        content={process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID || ''}
      />
      {/* Shopify App Bridge v4 loads specifically inside embedded admin context */}
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      {children}
    </>
  );
}
