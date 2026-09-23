import './globals.css';

export const metadata = {
  title: 'ShopiReachBoost AI',
  description:
    'Multi-store Shopify platform to recover abandoned carts and accept Cash on Delivery orders.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
