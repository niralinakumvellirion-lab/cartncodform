jest.mock('../utils/shopifyGraphQL', () => ({ shopifyGraphQL: jest.fn() }));

const { shopifyGraphQL } = require('../utils/shopifyGraphQL');
const { isDevelopmentShop, shouldUseTestCharge } = require('../utils/billing');

const SHOP = 'dev-shop.myshopify.com';
const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe('isDevelopmentShop', () => {
  test('partnerDevelopment true → true', async () => {
    shopifyGraphQL.mockResolvedValue({ shop: { plan: { partnerDevelopment: true } } });
    expect(await isDevelopmentShop(SHOP, 'tok')).toBe(true);
    expect(shopifyGraphQL.mock.calls[0][2]).toMatch(/partnerDevelopment/);
  });

  test('partnerDevelopment false → false', async () => {
    shopifyGraphQL.mockResolvedValue({ shop: { plan: { partnerDevelopment: false } } });
    expect(await isDevelopmentShop(SHOP, 'tok')).toBe(false);
  });

  test('missing plan data → false', async () => {
    shopifyGraphQL.mockResolvedValue({ shop: null });
    expect(await isDevelopmentShop(SHOP, 'tok')).toBe(false);
  });

  test('Shopify error → false (treated as a real store), no throw', async () => {
    shopifyGraphQL.mockRejectedValue(new Error('403'));
    expect(await isDevelopmentShop(SHOP, 'tok')).toBe(false);
  });
});

describe('shouldUseTestCharge', () => {
  test('outside production → always test, no Shopify call', async () => {
    process.env.NODE_ENV = 'development';
    expect(await shouldUseTestCharge(SHOP, 'tok')).toBe(true);
    expect(shopifyGraphQL).not.toHaveBeenCalled();
  });

  test('production + development store → test charge', async () => {
    process.env.NODE_ENV = 'production';
    shopifyGraphQL.mockResolvedValue({ shop: { plan: { partnerDevelopment: true } } });
    expect(await shouldUseTestCharge(SHOP, 'tok')).toBe(true);
  });

  test('production + real store → REAL charge', async () => {
    process.env.NODE_ENV = 'production';
    shopifyGraphQL.mockResolvedValue({ shop: { plan: { partnerDevelopment: false } } });
    expect(await shouldUseTestCharge(SHOP, 'tok')).toBe(false);
  });

  test('production + check fails → REAL charge', async () => {
    process.env.NODE_ENV = 'production';
    shopifyGraphQL.mockRejectedValue(new Error('boom'));
    expect(await shouldUseTestCharge(SHOP, 'tok')).toBe(false);
  });
});
