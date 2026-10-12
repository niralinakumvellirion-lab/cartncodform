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
jest.mock('../services/profileService', () => ({
  upsertProfile: jest.fn().mockResolvedValue(null),
}));

const Store = require('../models/Store');
const DiscountConfig = require('../models/DiscountConfig');
const { upsertProfile } = require('../services/profileService');
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

test('f. primary disabled but bothDiscount enabled -> falls back and issues code', async () => {
  global.fetch.mockReturnValue(
    shopifyJson({
      data: {
        discountCodeBasicCreate: {
          userErrors: [],
          codeDiscountNode: { id: 'gid://shopify/DiscountCodeNode/99' },
        },
      },
    })
  );
  DiscountConfig.findOne.mockResolvedValue({
    pushDiscount: { enabled: false, percentage: 10, prefix: 'PUSH', maxUses: 100, expiryDays: 7 },
    bothDiscount: { enabled: true, percentage: 20, prefix: 'VIP', maxUses: 50, expiryDays: 14 },
  });

  const r = await generateDiscount(SHOP, { action: 'push' });

  expect(typeof r.code).toBe('string');
  expect(r.code).toMatch(/^VIP_[A-Z0-9]{6}$/);
  expect(r.percentage).toBe(20);
  expect(r.expiryDays).toBe(14);
});

test('g. both primary and bothDiscount disabled -> code null, no Shopify call', async () => {
  DiscountConfig.findOne.mockResolvedValue({
    emailDiscount: { enabled: false, percentage: 15, prefix: 'EMAIL', maxUses: 100, expiryDays: 7 },
    bothDiscount: { enabled: false, percentage: 20, prefix: 'VIP', maxUses: 50, expiryDays: 14 },
  });

  const r = await generateDiscount(SHOP, { action: 'email' });

  expect(r.code).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('h. upsertProfile failure is logged with shop+action only — no PII in args', async () => {
  const err = new Error('DB timeout');
  upsertProfile.mockRejectedValueOnce(err);

  global.fetch.mockReturnValue(
    shopifyJson({
      data: {
        discountCodeBasicCreate: {
          codeDiscountNode: { id: 'gid://shopify/DiscountCodeBasic/1' },
          userErrors: [],
        },
      },
    })
  );
  DiscountConfig.findOne.mockResolvedValue(PUSH_CFG);

  // generateDiscount returns synchronously before the fire-and-forget settles;
  // await a tick so the .catch() handler runs.
  await generateDiscount(SHOP, { action: 'push', email: 'user@example.com', sessionId: 's1' });
  await new Promise((r) => setImmediate(r));

  const errorCalls = console.error.mock.calls.filter((c) =>
    c.some((a) => typeof a === 'string' && a.includes('[discount]'))
  );
  expect(errorCalls.length).toBeGreaterThan(0);

  // Shop domain and action must appear; raw email must NOT appear.
  const logged = errorCalls[0].join(' ');
  expect(logged).toContain(SHOP);
  expect(logged).toContain('push');
  expect(logged).not.toContain('user@example.com');
});
