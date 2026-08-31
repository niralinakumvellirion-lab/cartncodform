import './globals.css';
import Providers from '../components/Providers';

export const metadata = {
  title: 'CartnCodForm',
  description:
    'Multi-store Shopify platform to recover abandoned carts and accept Cash on Delivery orders.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
