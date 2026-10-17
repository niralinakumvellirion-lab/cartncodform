'use strict';

const { run } = require('../../extensions/quantity-tier-discount/src/run');

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

// Helper: extract product discount candidates from the new operations array
function getCandidates(result) {
  const ops = result.operations || [];
  const op = ops.find((o) => o.productDiscountsAdd);
  return op ? op.productDiscountsAdd.candidates : [];
}

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
  test('qty 2 → 10% tier', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 2)]));
    expect(getCandidates(result)).toHaveLength(1);
    expect(getCandidates(result)[0].value.percentage.value).toBe('10');
    expect(getCandidates(result)[0].message).toMatch(/Buy 2/);
  });

  test('qty 3 → 15% tier (highest qualifying)', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 3)]));
    expect(getCandidates(result)[0].value.percentage.value).toBe('15');
  });

  test('qty 4 → 25% tier', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 4)]));
    expect(getCandidates(result)[0].value.percentage.value).toBe('25');
  });

  test('qty 10 → 25% tier (above highest — capped at last tier)', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 10)]));
    expect(getCandidates(result)[0].value.percentage.value).toBe('25');
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
    expect(getCandidates(result)).toHaveLength(1);
    expect(getCandidates(result)[0].value.percentage.value).toBe('15');
    expect(getCandidates(result)[0].targets).toHaveLength(2);
  });

  test('each target maps to the correct cart line id', () => {
    const lines = [variantLine('P1', 'VA', 1), variantLine('P1', 'VB', 3)];
    const result = run(makeInput(lines));
    const ids = getCandidates(result)[0].targets.map((t) => t.cartLine.id);
    expect(ids).toContain('line-VA');
    expect(ids).toContain('line-VB');
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
    const pcts = getCandidates(result).map((c) => c.value.percentage.value).sort();
    expect(pcts).toEqual(['10', '25']);
  });

  test('operations array contains one productDiscountsAdd when discounts present', () => {
    const result = run(makeInput([variantLine('P1', 'V1', 3)]));
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd).toBeDefined();
    expect(result.operations[0].productDiscountsAdd.selectionStrategy).toBe('FIRST');
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
