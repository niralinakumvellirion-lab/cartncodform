/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';

// Backend origin for CSP connect-src (evaluated at build time).
const backendOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000').origin;
  } catch {
    return 'http://localhost:4000';
  }
})();

// 'unsafe-eval' only in non-production (React dev mode needs it).
const scriptSrc = isProd
  ? "'self' 'unsafe-inline' https://accounts.google.com/gsi/client"
  : "'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com/gsi/client";

const platformCSP = [
  `script-src ${scriptSrc}`,
  `frame-src https://accounts.google.com/gsi/`,
  `connect-src 'self' ${backendOrigin} https://accounts.google.com/gsi/`,
  `style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style https://fonts.googleapis.com`,
  `font-src https://fonts.gstatic.com`,
  `img-src 'self' data: https:`,
].join('; ');

// Merchant admin pages (folders in app/admin). Shopify opens app paths such as a plan's Redirect URL
// ("/plans", the welcome link after approving a plan) on the app's ORIGIN, not under application_url's
// /admin: https://app.shopireachboost.com/plans answered 404 in App Review. Those land on the real page.
const ADMIN_PAGES = [
  'activity', 'automation', 'cod', 'customers', 'dashboard', 'discounts', 'email-templates', 'insights',
  'journey', 'messages', 'plans', 'queue', 'reviews', 'settings-page', 'signals',
];
// The platform host rewrites every path to /platform (lib/hostRouting.js): leave it alone.
const NOT_PLATFORM_HOST = [{ type: 'host', value: 'admin.shopireachboost.com' }];

const nextConfig = {
  reactStrictMode: true,
  // application_url ends in /admin. If Shopify joins a discount function's create/details path onto it
  // instead of replacing the path, the request arrives as /admin/admin/discounts: send it to the real page.
  // Next.js keeps the query string (shop, host, plan_handle, charge_id ...) on every redirect.
  async redirects() {
    return [
      { source: '/admin/admin/:path*', destination: '/admin/:path*', permanent: false },
      ...ADMIN_PAGES.map((page) => ({
        source: `/${page}/:path*`,
        destination: `/admin/${page}/:path*`,
        permanent: false,
        missing: NOT_PLATFORM_HOST,
      })),
    ];
  },
  async headers() {
    return [
      // ── Existing: Shopify embedded admin CSP ─────────────────────────────
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
          },
        ],
      },

      // ── Platform admin: security headers (no framing, no indexing) ───────
      {
        source: '/platform/:path*',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'Content-Security-Policy',    value: `frame-ancestors 'none'; ${platformCSP}` },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'no-referrer' },
          { key: 'Cache-Control',              value: 'no-store' },
          { key: 'X-Robots-Tag',               value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
