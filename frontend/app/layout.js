import './globals.css';

export const metadata = {
  title: 'CartnCodForm',
  description:
    'Multi-store Shopify platform to recover abandoned carts and accept Cash on Delivery orders.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* App Bridge reads this meta on load — it must be in the real <head>,
            not rendered from a client component inside <Suspense> (Next.js
            App Router does not reliably hoist those). layout.js is a Server
            Component, so the public env var is inlined at build time. */}
        <meta
          name="shopify-api-key"
          content={process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID || ''}
        />
        {/* App Bridge must load synchronously (no async/defer) — a plain
            <script> in the root layout <head> is the only reliable way in
            the Next.js App Router. Do NOT switch this to next/script. */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
