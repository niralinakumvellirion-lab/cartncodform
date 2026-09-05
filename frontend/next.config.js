/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
