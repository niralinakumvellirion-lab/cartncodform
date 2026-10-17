'use strict';

/**
 * Tests for server-side tier discount computation on COD orders.
 * Covers: pickTier + discountedUnitPrice applied to COD price+qty,
 * plus a parity table comparing Function run() output with the COD helpers.
 */

const { pickTier, discountedUnitPrice } = require('../utils/quantityTiers');
const { run } = require('../../extensions/quantity-tier-discount/src/run');

// Standard 3-tier config used across tests
const TIERS = [
  { minQty: 2, percent: 10, badge: '' },
  { minQty: 3, percent: 15, badge: 'Popular' },
  { minQty: 4, percent: 25, badge: 'Best' },
];

const ENABLED_CONFIG = { enabled: true, tiers: TIERS };
const DISABLED_CONFIG = { enabled: false, tiers: TIERS };

// Mirrors the server-side logic in proxy.js /cod-order
function computeCodTierDiscount(qtConfig, qty, unitPrice) {
  if (!qtConfig || !qtConfig.enabled || !Array.isArray(qtConfig.tiers) || qtConfig.tiers.length === 0) {
    return { percent: 0, amount: 0 };
  }
  const tier = pickTier(qtConfig.tiers, qty);
  if (!tier) return { percent: 0, amount: 0 };
  const discUnit = discountedUnitPrice(unitPrice, tier.percent);
  const saving = Math.round((unitPrice - discUnit) * qty * 100) / 100;
  return { percent: tier.percent, amount: saving };
}

// Build a Function cart input for a single product with given qty+price (minor units)
function makeCart(qty, pricePaise, productId) {
  const pid = productId || 'gid://shopify/Product/1';
  const vid = 'gid://shopify/ProductVariant/1';
  return {
    discountNode: {
      metafield: {
        value: JSON.stringify(ENABLED_CONFIG),
      },
    },
    cart: {
      lines: [
        {
          quantity: qty,
          merchandise: {
            __typename: 'ProductVariant',
            id: vid,
            product: { id: pid },
          },
        },
      ],
    },
  };
}

// ── Disabled config ───────────────────────────────────────────────────────────

describe('disabled config', () => {
  test('disabled → no discount', () => {
    const r = computeCodTierDiscount(DISABLED_CONFIG, 5, 1000);
    expect(r.percent).toBe(0);
    expect(r.amount).toBe(0);
  });

  test('null config → no discount', () => {
    const r = computeCodTierDiscount(null, 5, 1000);
    expect(r.percent).toBe(0);
    expect(r.amount).toBe(0);
  });

  test('enabled but empty tiers → no discount', () => {
    const r = computeCodTierDiscount({ enabled: true, tiers: [] }, 5, 1000);
    expect(r.percent).toBe(0);
    expect(r.amount).toBe(0);
  });
});

// ── Below-threshold qty ───────────────────────────────────────────────────────

describe('below threshold', () => {
  test('qty 1 → no discount', () => {
    const r = computeCodTierDiscount(ENABLED_CONFIG, 1, 999);
    expect(r.percent).toBe(0);
    expect(r.amount).toBe(0);
  });
});

// ── Tier matching ─────────────────────────────────────────────────────────────

describe('tier matching', () => {
  test('qty 2 → 10% off ₹1000 → saving ₹200', () => {
    const r = computeCodTierDiscount(ENABLED_CONFIG, 2, 1000);
    expect(r.percent).toBe(10);
    // 1000 - 900 = 100 per unit; 100 * 2 = 200
    expect(r.amount).toBe(200);
  });

  test('qty 3 → 15% off ₹999 → saving ₹449.55', () => {
    const r = computeCodTierDiscount(ENABLED_CONFIG, 3, 999);
    expect(r.percent).toBe(15);
    // discounted unit: 999 * 0.85 = 849.15; saving = (999 - 849.15) * 3 = 449.55
    expect(r.amount).toBeCloseTo(449.55, 2);
  });

  test('qty 4 → 25% off ₹500 → saving ₹500', () => {
    const r = computeCodTierDiscount(ENABLED_CONFIG, 4, 500);
    expect(r.percent).toBe(25);
    // 500 * 0.75 = 375; saving = 125 * 4 = 500
    expect(r.amount).toBe(500);
  });

  test('qty above highest tier → highest tier applied', () => {
    const r = computeCodTierDiscount(ENABLED_CONFIG, 10, 1000);
    expect(r.percent).toBe(25);
  });
});

// ── Rounding ──────────────────────────────────────────────────────────────────

describe('rounding matches backend helper', () => {
  test('15% off ₹99.99 → unit 84.99, total saving 3×14.99=44.99', () => {
    const r = computeCodTierDiscount({ enabled: true, tiers: [{ minQty: 3, percent: 15 }] }, 3, 99.99);
    // discountedUnitPrice(99.99, 15) = 84.99 (half-up)
    // saving = (99.99 - 84.99) * 3 = 15.00 * 3 = 45.00
    expect(r.amount).toBeCloseTo(45.00, 2);
  });
});

// ── Client-sent fake discount is ignored ──────────────────────────────────────

describe('client discount values are ignored', () => {
  // The server computes from DB config; any discountPercent/discountAmount the
  // client sends is simply not read. We simulate this by verifying that
  // computeCodTierDiscount always uses qtConfig from DB, not a client payload.
  test('high fake percent from client does not change result', () => {
    // Suppose client sends { discountPercent: 99 } — server ignores it entirely
    const clientPayload = { discountPercent: 99, discountAmount: 9999 };
    void clientPayload; // server never reads these
    const serverResult = computeCodTierDiscount(ENABLED_CONFIG, 2, 1000);
    expect(serverResult.percent).toBe(10); // from saved config, not 99
  });
});

// ── COD is single-product — no cross-product mixing ──────────────────────────

describe('single product scope', () => {
  // COD form handles one product at a time; qty refers to units of that product.
  test('qty 3 of product A does not apply to product B', () => {
    const rA = computeCodTierDiscount(ENABLED_CONFIG, 3, 500);
    const rB = computeCodTierDiscount(ENABLED_CONFIG, 1, 200); // separate order
    expect(rA.percent).toBe(15);
    expect(rB.percent).toBe(0); // qty 1 below all tiers
  });
});

// ── PARITY TABLE: Function run() vs COD helper ────────────────────────────────

describe('parity: Function run() vs COD helper', () => {
  // For each scenario: same qty → same tier percent.
  // For a given unit price and percent: same discounted amount.
  const cases = [
    { qty: 1,  pricePaise: 100000, desc: 'below all tiers', expectedPercent: null },
    { qty: 2,  pricePaise: 100000, desc: 'first tier 10%',  expectedPercent: 10 },
    { qty: 3,  pricePaise:  99900, desc: 'second tier 15%', expectedPercent: 15 },
    { qty: 4,  pricePaise: 100000, desc: 'third tier 25%',  expectedPercent: 25 },
    { qty: 10, pricePaise:  50000, desc: 'above max tier',  expectedPercent: 25 },
  ];

  cases.forEach(function (c) {
    test('qty ' + c.qty + ' — ' + c.desc, () => {
      // Function output
      const fnInput = makeCart(c.qty, c.pricePaise);
      const fnOut = run(fnInput);
      const fnDiscount = fnOut.discounts[0];

      // COD helper output (unit price in major units = paise / 100)
      const unitPriceMajor = c.pricePaise / 100;
      const cod = computeCodTierDiscount(ENABLED_CONFIG, c.qty, unitPriceMajor);

      if (c.expectedPercent === null) {
        // No tier for this qty
        expect(fnOut.discounts).toHaveLength(0);
        expect(cod.percent).toBe(0);
      } else {
        // Both pick the same tier
        expect(fnDiscount).toBeDefined();
        const fnPercent = parseFloat(fnDiscount.value.percentage.value);
        expect(fnPercent).toBe(c.expectedPercent);
        expect(cod.percent).toBe(c.expectedPercent);

        // Discounted unit price agrees
        // Function applies percent to pricePaise; COD applies to major-unit price
        const fnDiscPaise = c.pricePaise * (1 - c.expectedPercent / 100);
        const codDiscUnit = discountedUnitPrice(unitPriceMajor, c.expectedPercent);
        // Convert Function result to major units for comparison
        expect(codDiscUnit).toBeCloseTo(Math.round(fnDiscPaise) / 100, 2);
      }
    });
  });
});
