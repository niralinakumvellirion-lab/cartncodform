'use strict';

const { run, discountedUnitCents, perItemDiscount } = require('../../extensions/quantity-tier-discount/src/run');
const { discountedUnitPrice } = require('../utils/quantityTiers');

const TIERS = [
  { minQty: 2, percent: 10, badge: '' },
  { minQty: 3, percent: 15, badge: 'Most popular' },
  { minQty: 4, percent: 25, badge: 'Best value' },
];

// New API: discount.metafield.jsonValue (already-parsed object, not a JSON string)
function makeInput(lines, enabled = true, tiers = TIERS) {
  return {
    discount: {
      metafield: { jsonValue: { enabled, tiers } },
    },
    cart: { lines },
  };
}

// price = the line's unit price in the cart's currency (cost.amountPerQuantity.amount, a Decimal string).
function variantLine(productId, variantId, quantity, price = '100.00') {
  return {
    id: `line-${variantId}`,
    quantity,
    cost: { amountPerQuantity: { amount: price } },
    merchandise: {
      __typename: 'ProductVariant',
      id: `gid://shopify/ProductVariant/${variantId}`,
      product: { id: `gid://shopify/Product/${productId}` },
    },
  };
}

// Helper: extract product discount candidates from the new operations array
function getCandidates(result) {
  const ops = result.operations || [];
  const op = ops.find((o) => o.productDiscountsAdd);
  return op ? op.productDiscountsAdd.candidates : [];
}

// Amount off each item sent to Shopify (fixed amount per item, no percentage).
const offEach = (c) => {
  expect(c.value.percentage).toBeUndefined();
  expect(c.value.fixedAmount.appliesToEachItem).toBe(true);
  return c.value.fixedAmount.amount;
};

// ─── no-discount paths ───────────────────────────────────────────────────────

describe('run() — no discount cases', () => {
  test('no metafield → empty operations', () => {
    const result = run({ discount: { metafield: null }, cart: { lines: [] } });
    expect(result.operations).toEqual([]);
  });

  test('bad JSON string → empty operations (no throw)', () => {
    const result = run({
      discount: { metafield: { jsonValue: 'not-json{' } },
      cart: { lines: [] },
    });
    expect(result.operations).toEqual([]);
  });

  test('enabled false → empty operations', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 5)], false));
    expect(result.operations).toEqual([]);
  });

  test('empty tiers array → empty operations', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 5)], true, []));
    expect(result.operations).toEqual([]);
  });

  test('qty below all tiers → no discount for that product', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 1)]));
    expect(result.operations).toEqual([]);
  });

  test('null input → empty operations (no throw)', () => {
    const result = run(null);
    expect(result.operations).toEqual([]);
  });
});

// ─── single product tiers ────────────────────────────────────────────────────

describe('run() — single product tiers', () => {
  test('qty 2 → 10% tier: 10.00 off each item of a 100.00 product', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 2)]));
    expect(getCandidates(result)).toHaveLength(1);
    expect(offEach(getCandidates(result)[0])).toBe('10.00');
    expect(getCandidates(result)[0].message).toBe('Buy 2+, save 10%');
  });

  test('qty 3 → 15% tier (highest qualifying)', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 3)]));
    expect(offEach(getCandidates(result)[0])).toBe('15.00');
  });

  test('qty 4 → 25% tier', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 4)]));
    expect(offEach(getCandidates(result)[0])).toBe('25.00');
  });

  test('qty 10 → 25% tier (above highest — capped at last tier)', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 10)]));
    expect(offEach(getCandidates(result)[0])).toBe('25.00');
  });
});

// ─── multiple variants summed by product ─────────────────────────────────────

describe('run() — multiple variants of same product', () => {
  test('variant A qty 1 + variant B qty 2 = total 3 → 15% tier on both, each from its own price', () => {
    const lines = [
      variantLine('P1', 'VA', 1, '100.00'),
      variantLine('P1', 'VB', 2, '40.00'),
    ];
    const result = run(makeInput(lines));
    const c = getCandidates(result);
    expect(c).toHaveLength(2);
    expect(c.map((x) => [x.targets[0].cartLine.id, offEach(x)])).toEqual([['line-VA', '15.00'], ['line-VB', '6.00']]);
    expect(c.every((x) => x.message === 'Buy 3+, save 15%')).toBe(true);
  });

  test('each candidate targets exactly one cart line, with the correct id', () => {
    const lines = [variantLine('P1', 'VA', 1), variantLine('P1', 'VB', 3)];
    const result = run(makeInput(lines));
    const ids = getCandidates(result).map((c) => c.targets.map((t) => t.cartLine.id));
    expect(ids).toEqual([['line-VA'], ['line-VB']]);
  });
});

// ─── multiple products ───────────────────────────────────────────────────────

describe('run() — multiple products', () => {
  test('P1 qty 3 → 15%, P2 qty 1 → no discount', () => {
    const lines = [variantLine('P1', 'V1', 3), variantLine('P2', 'V2', 1)];
    const result = run(makeInput(lines));
    expect(getCandidates(result)).toHaveLength(1);
    expect(getCandidates(result)[0].targets[0].cartLine.id).toContain('V1');
  });

  test('P1 qty 2 → 10%, P2 qty 4 → 25% — two candidates', () => {
    const lines = [variantLine('P1', 'V1', 2), variantLine('P2', 'V2', 4)];
    const result = run(makeInput(lines));
    expect(getCandidates(result)).toHaveLength(2);
    expect(getCandidates(result).map(offEach).sort()).toEqual(['10.00', '25.00']);
  });

  test('ALL candidates apply (FIRST discounted only one line when a cart had two tier products)', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 3)]));
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd).toBeDefined();
    expect(result.operations[0].productDiscountsAdd.selectionStrategy).toBe('ALL');
  });
});

// ─── non-ProductVariant merchandise ─────────────────────────────────────────

describe('run() — non-ProductVariant lines ignored', () => {
  test('CustomProduct lines are skipped', () => {
    const result = run({
      discount: { metafield: { jsonValue: { enabled: true, tiers: TIERS } } },
      cart: {
        lines: [{
          id: 'line-custom',
          quantity: 5,
          merchandise: { __typename: 'CustomProduct', id: 'gid://custom' },
        }],
      },
    });
    expect(result.operations).toEqual([]);
  });
});

// ─── cart price == product page price (App Review 2.1.4) ─────────────────────

describe('exact per-item amounts: the cart shows the same unit price as the product page', () => {
  test("the reviewer's case: 18.71 on the card is 18.71 in the cart (no Shopify rounding left)", () => {
    // 20.79 with 10% off: 18.711 -> 18.71. A "10%" percentage let Shopify round to 18.72 per item.
    const tiers = [{ minQty: 4, percent: 10, badge: '' }];
    const result = run(makeInput([variantLine('P1', 'V1', 4, '20.79')], true, tiers));
    const amount = offEach(getCandidates(result)[0]);
    expect(amount).toBe('2.08');
    expect((2079 - Math.round(Number(amount) * 100)) / 100).toBe(18.71);
  });

  test('half a cent always rounds up the same way (exact integer maths, no float drift)', () => {
    expect(discountedUnitCents(1999, 50)).toBe(1000); // 999.5 -> 1000
    expect(discountedUnitCents(1001, 50)).toBe(501); // 500.5 -> 501
    expect(discountedUnitCents(2079, 10)).toBe(1871); // 1871.1
    expect(discountedUnitCents(1, 80)).toBe(0); // 0.2
  });

  test('for prices 0.01-60.00 and every allowed percent, function == backend (COD form / prepaid)', () => {
    let checked = 0;
    for (let cents = 1; cents <= 6000; cents += 7) {
      for (let p = 1; p <= 80; p += 1) {
        const price = cents / 100;
        const off = Number(perItemDiscount(price.toFixed(2), p));
        const cartUnit = Math.round((price - off) * 100);
        const backendUnit = Math.round(discountedUnitPrice(price, p) * 100);
        if (cartUnit !== backendUnit) throw new Error(`price ${price} at ${p}%: cart ${cartUnit} vs backend ${backendUnit}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60000);
  });

  test('a line without a readable price, or nothing to take off, gets no candidate', () => {
    const lines = [variantLine('P1', 'V1', 4, 'abc'), variantLine('P2', 'V2', 4, '0.00'), variantLine('P3', 'V3', 4, '0.01')];
    const tiers = [{ minQty: 2, percent: 10, badge: '' }];
    expect(run(makeInput(lines, true, tiers)).operations).toEqual([]);
    expect(perItemDiscount(undefined, 10)).toBeNull();
  });
});

// ─── product page (ccf-tiers.js) == cart (this function) ─────────────────────

describe('storefront cards use the same price rule as the cart', () => {
  // ccf-tiers.js is a browser script: take its price function out of the source and run it here.
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../extensions/cartncodform-embed/assets/ccf-tiers.js'), 'utf8');
  const fnSrc = src.match(/function discountedUnitPricePaise\(pricePaise, percent\) \{[\s\S]*?\n  \}/);
  // eslint-disable-next-line no-new-func
  const cardUnit = new Function(`${fnSrc[0]}; return discountedUnitPricePaise;`)();

  test('card "each" price == cart per-item price for prices 0.01-60.00 at every allowed percent', () => {
    let checked = 0;
    for (let cents = 1; cents <= 6000; cents += 3) {
      for (let p = 1; p <= 80; p += 1) {
        const off = Math.round(Number(perItemDiscount((cents / 100).toFixed(2), p)) * 100);
        const card = Math.round(cardUnit(cents, p));
        if (card !== cents - off) throw new Error(`${cents} at ${p}%: card ${card} vs cart ${cents - off}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150000);
    expect(cardUnit(2079, 10)).toBe(1871); // the reviewer's 18.71
  });
});

describe('input query', () => {
  test('asks Shopify for each line\'s unit price (without it every line would get no discount)', () => {
    const q = require('fs').readFileSync(require('path').join(__dirname, '../../extensions/quantity-tier-discount/src/cart_lines_discounts_generate_run.graphql'), 'utf8');
    expect(q.replace(/\s+/g, ' ')).toMatch(/lines \{ id quantity cost \{ amountPerQuantity \{ amount \} \}/);
  });
});
