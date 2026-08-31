import './globals.css';

export const metadata = {
  title: 'CartnCodForm',
  description:
    'Multi-store Shopify platform to recover abandoned carts and accept Cash on Delivery orders.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
