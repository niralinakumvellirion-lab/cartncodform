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

const nextConfig = {
  reactStrictMode: true,
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
