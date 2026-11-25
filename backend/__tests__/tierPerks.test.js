'use strict';

/**
 * Phase 2b — tier perks: free shipping and a free gift.
 * Covers validation, storefront output, the two Function targets, and the Shopify discount classes.
 */

const {
  sanitizeTiers, sanitizeGift, variantNumericId, publicTiers, hasFreeShipping,
} = require('../utils/quantityTiers');
const { run, runDelivery } = require('../../extensions/quantity-tier-discount/src/run');

const GIFT = { variantId: 'gid://shopify/ProductVariant/555', title: 'Ski Wax', image: 'https://cdn.shopify.com/wax.png' };

// ── validation ───────────────────────────────────────────────────────────────

describe('sanitizeTiers perks', () => {
  test('free shipping and gift are kept; plain tiers keep their shape', () => {
    const out = sanitizeTiers([
      { minQty: 2, percent: 10 },
      { minQty: 3, percent: 15, freeShipping: true, gift: GIFT },
    ]);
    expect(out[0]).toEqual({ minQty: 2, percent: 10, badge: '', subtitle: '' });
    expect(out[1]).toEqual({ minQty: 3, percent: 15, badge: '', subtitle: '', freeShipping: true, gift: GIFT });
  });

  test('freeShipping must be exactly true', () => {
    expect(sanitizeTiers([{ minQty: 2, percent: 10, freeShipping: 'yes' }])[0]).not.toHaveProperty('freeShipping');
  });

  test('gift needs a real variant id', () => {
    expect(() => sanitizeTiers([{ minQty: 2, percent: 10, gift: { variantId: '555' } }])).toThrow(/variant ID/);
    expect(() => sanitizeTiers([{ minQty: 2, percent: 10, gift: 'wax' }])).toThrow(/must be an object/);
  });

  test('gift title capped, non-https image dropped, empty title becomes "Free gift"', () => {
    const g = sanitizeGift({ variantId: GIFT.variantId, title: 'x'.repeat(80), image: 'javascript:alert(1)' }, 0);
    expect(g.title).toHaveLength(60);
    expect(g.image).toBe('');
    expect(sanitizeGift({ variantId: GIFT.variantId, title: '  ' }, 0).title).toBe('Free gift');
    expect(sanitizeGift(null, 0)).toBeNull();
  });

  test('variantNumericId / hasFreeShipping', () => {
    expect(variantNumericId(GIFT.variantId)).toBe('555');
    expect(variantNumericId('gid://shopify/Product/1')).toBe('');
    expect(hasFreeShipping([{ minQty: 2 }, { minQty: 3, freeShipping: true }])).toBe(true);
    expect(hasFreeShipping([{ minQty: 2 }])).toBe(false);
  });

  test('storefront gets the numeric gift id', () => {
    const [t] = publicTiers([{ minQty: 3, percent: 15, freeShipping: true, gift: GIFT }]);
    expect(t.freeShipping).toBe(true);
    expect(t.gift).toEqual({ variantId: '555', title: 'Ski Wax', image: GIFT.image });
  });
});

// ── Function: lines target ───────────────────────────────────────────────────

const TIERS = [
  { minQty: 2, percent: 10 },
  { minQty: 3, percent: 15, freeShipping: true, gift: GIFT },
];

function line(id, productId, variantId, qty, gift) {
  return {
    id,
    quantity: qty,
    giftAttribute: gift ? { value: '1' } : null,
    merchandise: { __typename: 'ProductVariant', id: variantId, product: { id: productId } },
  };
}

function input(lines, extra = {}) {
  return {
    presentmentCurrencyRate: '1.0',
    discount: { metafield: { jsonValue: { enabled: true, tiers: TIERS } } },
    cart: { cost: { subtotalAmount: { currencyCode: 'INR' } }, lines, ...extra },
  };
}

const BOARD = (qty) => line('L1', 'gid://shopify/Product/1', 'gid://shopify/ProductVariant/11', qty);
const WAX = (qty, gift = true) => line('L2', 'gid://shopify/Product/9', GIFT.variantId, qty, gift);

function candidates(result) {
  const op = (result.operations || []).find((o) => o.productDiscountsAdd);
  return op ? op.productDiscountsAdd.candidates : [];
}

describe('Function lines: free gift', () => {
  test('gift tier reached + gift line → one free unit of the gift', () => {
    const cs = candidates(run(input([BOARD(3), WAX(1)])));
    expect(cs).toHaveLength(2);
    const gift = cs.find((c) => c.message === 'Free gift');
    expect(gift.targets).toEqual([{ cartLine: { id: 'L2', quantity: 1 } }]);
    expect(gift.value).toEqual({ percentage: { value: '100' } });
  });

  test('only one unit is free even when the gift line has 2', () => {
    const gift = candidates(run(input([BOARD(3), WAX(2)]))).find((c) => c.message === 'Free gift');
    expect(gift.targets[0].cartLine.quantity).toBe(1);
  });

  test('tier without a gift (qty 2) → gift line is not free', () => {
    const cs = candidates(run(input([BOARD(2), WAX(1)])));
    expect(cs.find((c) => c.message === 'Free gift')).toBeUndefined();
  });

  test('gift lines never count toward a tier', () => {
    // 1 board + 3 gift-marked wax = still only 1 paid item → nothing
    expect(candidates(run(input([BOARD(1), WAX(3)])))).toEqual([]);
  });

  test('the same variant WITHOUT the gift marker is a normal item (not free)', () => {
    const cs = candidates(run(input([BOARD(3), WAX(1, false)])));
    expect(cs.find((c) => c.message === 'Free gift')).toBeUndefined();
  });
});

// ── Function: delivery target ────────────────────────────────────────────────

describe('Function delivery: free shipping', () => {
  const groups = { deliveryGroups: [{ id: 'gid://shopify/CartDeliveryGroup/1' }] };

  test('free-shipping tier reached → 100% off every delivery group', () => {
    const r = runDelivery(input([BOARD(3)], groups));
    const op = r.operations[0].deliveryDiscountsAdd;
    expect(op.selectionStrategy).toBe('ALL');
    expect(op.candidates[0]).toEqual({
      targets: [{ deliveryGroup: { id: 'gid://shopify/CartDeliveryGroup/1' } }],
      value: { percentage: { value: '100' } },
      message: 'Free shipping',
    });
  });

  test('lower tier without free shipping → nothing', () => {
    expect(runDelivery(input([BOARD(2)], groups))).toEqual({ operations: [] });
  });

  test('gift lines do not help reach the free-shipping tier', () => {
    expect(runDelivery(input([BOARD(2), WAX(1)], groups))).toEqual({ operations: [] });
  });

  test('no delivery groups yet / disabled config → nothing', () => {
    expect(runDelivery(input([BOARD(3)], { deliveryGroups: [] }))).toEqual({ operations: [] });
    const off = input([BOARD(3)], groups);
    off.discount.metafield.jsonValue.enabled = false;
    expect(runDelivery(off)).toEqual({ operations: [] });
  });
});

// ── tierSync: SHIPPING class only when needed ────────────────────────────────

jest.mock('../models/Store', () => ({ findOne: jest.fn() }));
jest.mock('../models/DiscountConfig', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../utils/shopify', () => ({ API_VERSION: '2026-10', refreshAccessTokenIfNeeded: jest.fn(async (s) => s) }));

describe('tierSync discount classes', () => {
  const Store = require('../models/Store');
  const DiscountConfig = require('../models/DiscountConfig');
  const { syncTiers } = require('../services/tierSync');

  async function classesFor(tiers) {
    Store.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ accessToken: 'shpat_x' }) }) });
    DiscountConfig.findOne.mockReturnValue({ lean: () => Promise.resolve({ quantityTiers: { enabled: true, tiers, discountId: '' } }) });
    DiscountConfig.updateOne.mockResolvedValue({});
    const bodies = [];
    const replies = [
      { data: { shop: { id: 'gid://shopify/Shop/1' } } },
      { data: { metafieldsSet: { userErrors: [] } } },
      { data: { shopifyFunctions: { nodes: [{ id: 'gid://shopify/ShopifyFunction/1', title: 'Quantity Tier Discount' }] } } },
      { data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://x/1' }, userErrors: [] } } },
    ];
    global.fetch = jest.fn((url, opts) => {
      bodies.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(replies.shift() || { data: {} }) });
    });
    await syncTiers('demo.myshopify.com');
    const create = bodies.find((b) => /discountAutomaticAppCreate/.test(b.query));
    return create.variables.discount.discountClasses;
  }

  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => { jest.restoreAllMocks(); delete global.fetch; });

  test('PRODUCT only without free shipping', async () => {
    expect(await classesFor([{ minQty: 2, percent: 10 }])).toEqual(['PRODUCT']);
  });

  test('PRODUCT + SHIPPING when a tier has free shipping', async () => {
    expect(await classesFor(TIERS)).toEqual(['PRODUCT', 'SHIPPING']);
  });
});

// ── Rewards carry upward (gift on Buy 3+ also applies at 4+) ─────────────────

describe('rewards carry upward', () => {
  const { perksFor } = require('../utils/quantityTiers');
  const UP = [
    { minQty: 2, percent: 10 },
    { minQty: 3, percent: 15, freeShipping: true, gift: GIFT },
    { minQty: 4, percent: 25 },
  ];
  const upInput = (lines, extra = {}) => {
    const i = input(lines, extra);
    i.discount.metafield.jsonValue = { enabled: true, tiers: UP };
    return i;
  };

  test('perksFor', () => {
    expect(perksFor(UP, 2)).toEqual({ freeShipping: false, gift: null });
    expect(perksFor(UP, 3)).toEqual({ freeShipping: true, gift: GIFT });
    expect(perksFor(UP, 6)).toEqual({ freeShipping: true, gift: GIFT });
    // A higher tier's own gift wins over a lower one
    const two = [{ minQty: 2, gift: { variantId: 'gid://shopify/ProductVariant/1' } }, { minQty: 4, gift: GIFT }];
    expect(perksFor(two, 5).gift).toBe(GIFT);
    expect(perksFor(null, 3)).toEqual({ freeShipping: false, gift: null });
  });

  test('4 boards (Buy 4 tier, no own perks) → gift still free', () => {
    const cs = candidates(run(upInput([BOARD(4), WAX(1)])));
    expect(cs.find((c) => c.message === 'Buy 4+, save 25%')).toBeDefined();
    expect(cs.find((c) => c.message === 'Free gift')).toBeDefined();
  });

  test('4 boards → free shipping still applies', () => {
    const r = runDelivery(upInput([BOARD(4)], { deliveryGroups: [{ id: 'g1' }] }));
    expect(r.operations[0].deliveryDiscountsAdd.candidates[0].message).toBe('Free shipping');
  });
});
