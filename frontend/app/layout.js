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
