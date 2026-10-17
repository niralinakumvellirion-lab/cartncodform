'use strict';

const { run } = require('../../extensions/quantity-tier-discount/src/run');

const TIERS = [
  { minQty: 2, percent: 10, badge: '' },
  { minQty: 3, percent: 15, badge: 'Most popular' },
  { minQty: 4, percent: 25, badge: 'Best value' },
];

function makeInput(lines, enabled = true, tiers = TIERS) {
  return {
    discountNode: {
      metafield: { value: JSON.stringify({ enabled, tiers }) },
    },
    cart: { lines },
  };
}

function variantLine(productId, variantId, quantity) {
  return {
    id: `line-${variantId}`,
    quantity,
    merchandise: {
      __typename: 'ProductVariant',
      id: `gid://shopify/ProductVariant/${variantId}`,
      product: { id: `gid://shopify/Product/${productId}` },
    },
  };
}

// ─── no-discount paths ───────────────────────────────────────────────────────

describe('run() — no discount cases', () => {
  test('no metafield → empty discounts', () => {
    const result = run({ discountNode: { metafield: null }, cart: { lines: [] } });
    expect(result.discounts).toEqual([]);
    expect(result.discountApplicationStrategy).toBe('FIRST');
  });

  test('bad JSON → empty discounts (no throw)', () => {
    const result = run({
      discountNode: { metafield: { value: 'not-json{' } },
      cart: { lines: [] },
    });
    expect(result.discounts).toEqual([]);
  });

  test('enabled false → empty discounts', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 5)], false));
    expect(result.discounts).toEqual([]);
  });

  test('empty tiers array → empty discounts', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 5)], true, []));
    expect(result.discounts).toEqual([]);
  });

  test('qty below all tiers → no discount for that product', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 1)]));
    expect(result.discounts).toEqual([]);
  });

  test('null input → empty discounts (no throw)', () => {
    const result = run(null);
    expect(result.discounts).toEqual([]);
  });
});

// ─── single product tiers ────────────────────────────────────────────────────

describe('run() — single product tiers', () => {
  test('qty 2 → 10% tier', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 2)]));
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].value.percentage.value).toBe('10');
    expect(result.discounts[0].message).toMatch(/Buy 2/);
  });

  test('qty 3 → 15% tier (highest qualifying)', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 3)]));
    expect(result.discounts[0].value.percentage.value).toBe('15');
  });

  test('qty 4 → 25% tier', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 4)]));
    expect(result.discounts[0].value.percentage.value).toBe('25');
  });

  test('qty 10 → 25% tier (above highest — capped at last tier)', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 10)]));
    expect(result.discounts[0].value.percentage.value).toBe('25');
  });
});

// ─── multiple variants summed by product ─────────────────────────────────────

describe('run() — multiple variants of same product', () => {
  test('variant A qty 1 + variant B qty 2 = total 3 → 15% applied to both', () => {
    const lines = [
      variantLine('P1', 'VA', 1),
      variantLine('P1', 'VB', 2),
    ];
    const result = run(makeInput(lines));
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].value.percentage.value).toBe('15');
    expect(result.discounts[0].targets).toHaveLength(2);
  });

  test('each target line maps to the correct variant id', () => {
    const lines = [variantLine('P1', 'VA', 1), variantLine('P1', 'VB', 3)];
    const result = run(makeInput(lines));
    const ids = result.discounts[0].targets.map((t) => t.productVariant.id);
    expect(ids).toContain('gid://shopify/ProductVariant/VA');
    expect(ids).toContain('gid://shopify/ProductVariant/VB');
  });
});

// ─── multiple products ───────────────────────────────────────────────────────

describe('run() — multiple products', () => {
  test('P1 qty 3 → 15%, P2 qty 1 → no discount', () => {
    const lines = [variantLine('P1', 'V1', 3), variantLine('P2', 'V2', 1)];
    const result = run(makeInput(lines));
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].targets[0].productVariant.id).toContain('V1');
  });

  test('P1 qty 2 → 10%, P2 qty 4 → 25% — two discount entries', () => {
    const lines = [variantLine('P1', 'V1', 2), variantLine('P2', 'V2', 4)];
    const result = run(makeInput(lines));
    expect(result.discounts).toHaveLength(2);
    const pcts = result.discounts.map((d) => d.value.percentage.value).sort();
    expect(pcts).toEqual(['10', '25']);
  });

  test('discountApplicationStrategy is MAXIMUM when discounts present', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 3)]));
    expect(result.discountApplicationStrategy).toBe('MAXIMUM');
  });
});

// ─── non-ProductVariant merchandise ─────────────────────────────────────────

describe('run() — non-ProductVariant lines ignored', () => {
  test('CustomProduct lines are skipped', () => {
    const result = run({
      discountNode: { metafield: { value: JSON.stringify({ enabled: true, tiers: TIERS }) } },
      cart: {
        lines: [{
          id: 'line-custom',
          quantity: 5,
          merchandise: { __typename: 'CustomProduct', id: 'gid://custom' },
        }],
      },
    });
    expect(result.discounts).toEqual([]);
  });
});
