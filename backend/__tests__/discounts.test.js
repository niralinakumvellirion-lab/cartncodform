/**
 * Tests for generateDiscount() in backend/routes/discounts.js.
 *
 * Store + DiscountConfig are mocked; global.fetch is stubbed. These cover the
 * fix-discount-create hardening: a code is only returned when Shopify actually
 * created the discount node.
 */

jest.mock('../models/Store', () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../models/DiscountConfig', () => ({
  findOne: jest.fn(),
}));

const Store = require('../models/Store');
const DiscountConfig = require('../models/DiscountConfig');
const { generateDiscount } = require('../routes/discounts');

const SHOP = 'demo.myshopify.com';
const PUSH_CFG = {
  pushDiscount: { enabled: true, percentage: 10, maxUses: 100, expiryDays: 7, prefix: 'PUSH' },
};

function shopifyJson(body) {
  return Promise.resolve({ json: () => Promise.resolve(body) });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = jest.fn();

  DiscountConfig.findOne.mockResolvedValue(PUSH_CFG);
  Store.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({ accessToken: 'shpat_test' }),
  });
  Store.updateOne.mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());

test('a. top-level GraphQL errors -> code null (+ needsReauth on ACCESS_DENIED)', async () => {
  global.fetch.mockReturnValue(
    shopifyJson({ errors: [{ extensions: { code: 'ACCESS_DENIED' }, message: 'no' }] })
  );

  const r = await generateDiscount(SHOP, { action: 'push' });

  expect(r.code).toBeNull();
  expect(r.error).toBe('Discount creation failed');
  expect(Store.updateOne).toHaveBeenCalledWith(
    { shopDomain: SHOP },
    { $set: { needsReauth: true } }
  );
});

test('a2. top-level errors without ACCESS_DENIED -> code null, no reauth flag', async () => {
  global.fetch.mockReturnValue(
    shopifyJson({ errors: [{ message: 'Throttled' }] })
  );

  const r = await generateDiscount(SHOP, { action: 'push' });

  expect(r.code).toBeNull();
  expect(Store.updateOne).not.toHaveBeenCalled();
});

test('b. missing codeDiscountNode.id -> code null', async () => {
  global.fetch.mockReturnValue(
    shopifyJson({ data: { discountCodeBasicCreate: { userErrors: [], codeDiscountNode: null } } })
  );

  const r = await generateDiscount(SHOP, { action: 'push' });

  expect(r.code).toBeNull();
  expect(r.error).toBe('Discount creation failed');
});

test('c. happy path -> returns a PUSH_ code with percentage/expiry', async () => {
  global.fetch.mockReturnValue(
    shopifyJson({
      data: {
        discountCodeBasicCreate: {
          userErrors: [],
          codeDiscountNode: { id: 'gid://shopify/DiscountCodeNode/123' },
        },
      },
    })
  );

  const r = await generateDiscount(SHOP, { action: 'push' });

  expect(typeof r.code).toBe('string');
  expect(r.code).toMatch(/^PUSH_[A-Z0-9]{6}$/);
  expect(r.percentage).toBe(10);
  expect(r.expiryDays).toBe(7);
  expect(Store.updateOne).not.toHaveBeenCalled();
});

test('d. userErrors from the mutation -> code null', async () => {
  global.fetch.mockReturnValue(
    shopifyJson({
      data: {
        discountCodeBasicCreate: {
          userErrors: [{ field: ['code'], message: 'Code already exists' }],
          codeDiscountNode: null,
        },
      },
    })
  );

  const r = await generateDiscount(SHOP, { action: 'push' });

  expect(r.code).toBeNull();
  expect(r.error).toBe('Code already exists');
});

test('e. action disabled in config -> code null, no Shopify call', async () => {
  DiscountConfig.findOne.mockResolvedValue({
    pushDiscount: { enabled: false, percentage: 10 },
  });

  const r = await generateDiscount(SHOP, { action: 'push' });

  expect(r.code).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();
});
