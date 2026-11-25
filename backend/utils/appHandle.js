'use strict';

// The app's handle in Shopify admin URLs (admin.shopify.com/store/<store>/apps/<handle>).
// Live app: 'cartncod-form'. The dev app ("ShopiReachBoost AI Dev") sets
// SHOPIFY_APP_HANDLE=shopireachboost-ai-dev in backend/.env.dev. Anything that is not a
// plain lowercase handle is ignored.
const APP_HANDLE = /^[a-z0-9-]+$/.test(process.env.SHOPIFY_APP_HANDLE || '')
  ? process.env.SHOPIFY_APP_HANDLE
  : 'cartncod-form';

module.exports = { APP_HANDLE };
