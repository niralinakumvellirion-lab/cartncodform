'use strict';

/**
 * The admin URL handle: live app stays 'cartncod-form'; the dev app overrides it with
 * SHOPIFY_APP_HANDLE (backend/.env.dev), so after install Shopify opens the DEV app, not the live one.
 */

const ORIGINAL = process.env.SHOPIFY_APP_HANDLE;

function loadHandle(value) {
  jest.resetModules();
  if (value === undefined) delete process.env.SHOPIFY_APP_HANDLE;
  else process.env.SHOPIFY_APP_HANDLE = value;
  return require('../utils/appHandle').APP_HANDLE;
}

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.SHOPIFY_APP_HANDLE;
  else process.env.SHOPIFY_APP_HANDLE = ORIGINAL;
  jest.resetModules();
});

describe('APP_HANDLE', () => {
  test('defaults to the live handle', () => {
    expect(loadHandle(undefined)).toBe('cartncod-form');
  });

  test('dev handle from SHOPIFY_APP_HANDLE', () => {
    expect(loadHandle('shopireachboost-ai-dev')).toBe('shopireachboost-ai-dev');
  });

  test('anything that is not a plain handle falls back to live', () => {
    expect(loadHandle('evil/../x')).toBe('cartncod-form');
    expect(loadHandle('')).toBe('cartncod-form');
  });

  test('billing pricing-page URL uses the handle', () => {
    loadHandle('shopireachboost-ai-dev');
    const billing = require('../utils/billing');
    const fn = Object.values(billing).find((v) => typeof v === 'function' && /pricing_plans/.test(v.toString()));
    if (fn) expect(fn('demo.myshopify.com')).toContain('/charges/shopireachboost-ai-dev/pricing_plans');
  });
});
