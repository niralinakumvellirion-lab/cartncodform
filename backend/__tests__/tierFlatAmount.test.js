'use strict';

/**
 * Phase 2a — flat amount off the bundle ("Buy 2, save ₹200").
 * Covers the shared rule (tierTotal / tierSaving), validation, the prepaid subtotal,
 * the checkout Function (fixedAmount + currency rate + message) and parity between them.
 */

const {
  sanitizeTiers, tierTotal, tierSaving, pickTier, publicTiers, publicTierDisplay, normalizeDiscountType,
} = require('../utils/quantityTiers');
const { subtotalFor } = require('../utils/prepaidOffer');
const { run } = require('../../extensions/quantity-tier-discount/src/run');

const AMOUNT_TIERS = [
  { minQty: 2, percent: 0, amount: 200, badge: '' },
  { minQty: 3, percent: 0, amount: 400, badge: 'Most popular' },
];

// ── validation ───────────────────────────────────────────────────────────────

describe('sanitizeTiers with discountType amount', () => {
  test('keeps amounts (2 dp), stores percent 0', () => {
    const out = sanitizeTiers([
      { minQty: 2, amount: 199.999, badge: '' },
      { minQty: 3, amount: '400', badge: 'Hot' },
    ], 'amount');
    expect(out).toEqual([
      { minQty: 2, percent: 0, amount: 200, badge: '', subtitle: '' },
      { minQty: 3, percent: 0, amount: 400, badge: 'Hot', subtitle: '' },
    ]);
  });

  test('amount must be 1–1,000,000', () => {
    expect(() => sanitizeTiers([{ minQty: 2, amount: 0 }], 'amount')).toThrow(/amount must be between/);
    expect(() => sanitizeTiers([{ minQty: 2, amount: 2000000 }], 'amount')).toThrow(/amount must be between/);
    expect(() => sanitizeTiers([{ minQty: 2 }], 'amount')).toThrow(/amount must be between/);
  });

  test('amounts must strictly increase', () => {
    expect(() => sanitizeTiers([{ minQty: 2, amount: 300 }, { minQty: 3, amount: 300 }], 'amount'))
      .toThrow(/amount must be strictly ascending/);
  });

  test('percent tiers unchanged (no amount key) and unknown type falls back to percent', () => {
    expect(sanitizeTiers([{ minQty: 2, percent: 10 }])).toEqual([{ minQty: 2, percent: 10, badge: '', subtitle: '' }]);
    expect(sanitizeTiers([{ minQty: 2, percent: 10 }], 'weird')[0].percent).toBe(10);
    expect(normalizeDiscountType('amount')).toBe('amount');
    expect(normalizeDiscountType(undefined)).toBe('percent');
  });
});

// ── shared price rule ────────────────────────────────────────────────────────

describe('tierTotal / tierSaving', () => {
  test('amount: flat off the bundle', () => {
    expect(tierTotal(999, 2, AMOUNT_TIERS[0], 'amount')).toBe(1798);
    expect(tierSaving(999, 2, AMOUNT_TIERS[0], 'amount')).toBe(200);
    // Same tier still applies above minQty: flat amount once, not per item
    expect(tierTotal(999, 3, AMOUNT_TIERS[1], 'amount')).toBe(2597);
  });

  test('amount larger than the bundle never goes below 0', () => {
    expect(tierTotal(50, 2, { minQty: 2, amount: 500 }, 'amount')).toBe(0);
    expect(tierSaving(50, 2, { minQty: 2, amount: 500 }, 'amount')).toBe(100);
  });

  test('percent: same as before (rounded per item)', () => {
    expect(tierTotal(999, 2, { minQty: 2, percent: 10 }, 'percent')).toBe(1798.2);
    expect(tierSaving(999, 2, { minQty: 2, percent: 10 }, 'percent')).toBe(199.8);
  });

  test('no tier = full price', () => {
    expect(tierTotal(999, 1, null, 'amount')).toBe(999);
    expect(tierSaving(999, 1, null, 'amount')).toBe(0);
  });
});

describe('prepaid subtotal uses the same rule', () => {
  test('amount tiers', () => {
    const qt = { enabled: true, discountType: 'amount', tiers: AMOUNT_TIERS };
    expect(subtotalFor(999, 1, qt)).toBe(999);
    expect(subtotalFor(999, 2, qt)).toBe(1798);
    expect(subtotalFor(999, 3, qt)).toBe(2597);
  });
});

describe('storefront output', () => {
  test('publicTiers carries amount only when set; display carries discountType', () => {
    expect(publicTiers(AMOUNT_TIERS)[0]).toEqual({ minQty: 2, percent: 0, amount: 200, badge: '', subtitle: '' });
    expect(publicTiers([{ minQty: 2, percent: 10, amount: 0 }])[0]).not.toHaveProperty('amount');
    expect(publicTierDisplay({ discountType: 'amount' }).discountType).toBe('amount');
    expect(publicTierDisplay({}).discountType).toBe('percent');
  });
});

// ── checkout Function ────────────────────────────────────────────────────────

function cart(qty, opts = {}) {
  return {
    presentmentCurrencyRate: opts.rate == null ? '1.0' : String(opts.rate),
    discount: { metafield: { jsonValue: { enabled: true, discountType: 'amount', tiers: AMOUNT_TIERS } } },
    cart: {
      cost: { subtotalAmount: { currencyCode: opts.currency || 'INR' } },
      lines: [
        { id: 'gid://shopify/CartLine/1', quantity: qty, merchandise: { __typename: 'ProductVariant', id: 'v1', product: { id: 'p1' } } },
      ],
    },
  };
}

function candidates(result) {
  const op = (result.operations || []).find((o) => o.productDiscountsAdd);
  return op ? op.productDiscountsAdd.candidates : [];
}

describe('Function: flat amount', () => {
  test('1 item → no discount', () => {
    expect(candidates(run(cart(1)))).toEqual([]);
  });

  test('2 items → fixedAmount 200 once across the lines, ₹ message', () => {
    const [c] = candidates(run(cart(2)));
    expect(c.value).toEqual({ fixedAmount: { amount: '200.00', appliesToEachItem: false } });
    expect(c.message).toBe('Buy 2+, save ₹200');
    expect(c.targets).toEqual([{ cartLine: { id: 'gid://shopify/CartLine/1' } }]);
  });

  test('3 items → higher tier', () => {
    expect(candidates(run(cart(3)))[0].value.fixedAmount.amount).toBe('400.00');
  });

  test('converts to the cart currency with presentmentCurrencyRate', () => {
    const [c] = candidates(run(cart(2, { rate: 0.012, currency: 'USD' })));
    expect(c.value.fixedAmount.amount).toBe('2.40');
    expect(c.message).toBe('Buy 2+, save $2.40');
  });

  test('currency without a known symbol shows the code', () => {
    expect(candidates(run(cart(2, { currency: 'AED' })))[0].message).toBe('Buy 2+, save 200 AED');
  });

  test('percent configs still produce percentage candidates', () => {
    const input = cart(2);
    input.discount.metafield.jsonValue = { enabled: true, tiers: [{ minQty: 2, percent: 10 }] };
    const [c] = candidates(run(input));
    expect(c.value).toEqual({ percentage: { value: '10' } });
  });

  test('parity: Function amount equals the COD/prepaid saving', () => {
    for (const qty of [2, 3, 5]) {
      const tier = pickTier(AMOUNT_TIERS, qty);
      const [c] = candidates(run(cart(qty)));
      expect(Number(c.value.fixedAmount.amount)).toBe(tierSaving(999, qty, tier, 'amount'));
    }
  });
});
