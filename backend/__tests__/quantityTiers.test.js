'use strict';

const {
  sanitizeTiers,
  pickTier,
  discountedUnitPrice,
  sanitizeAccentColor,
  DEFAULT_ACCENT,
} = require('../utils/quantityTiers');

// ─── sanitizeTiers ───────────────────────────────────────────────────────────

describe('sanitizeTiers', () => {
  test('valid single tier', () => {
    const out = sanitizeTiers([{ minQty: 2, percent: 10, badge: '' }]);
    expect(out).toEqual([{ minQty: 2, percent: 10, badge: '' }]);
  });

  test('valid 4-tier set with badges', () => {
    const out = sanitizeTiers([
      { minQty: 2, percent: 10, badge: '' },
      { minQty: 3, percent: 15, badge: 'Most popular' },
      { minQty: 4, percent: 25, badge: 'Best value' },
      { minQty: 6, percent: 30, badge: '' },
    ]);
    expect(out).toHaveLength(4);
    expect(out[2].percent).toBe(25);
  });

  test('trims badge to 20 chars', () => {
    const out = sanitizeTiers([{ minQty: 2, percent: 5, badge: 'a'.repeat(25) }]);
    expect(out[0].badge).toHaveLength(20);
  });

  test('null badge → empty string', () => {
    const out = sanitizeTiers([{ minQty: 2, percent: 10, badge: null }]);
    expect(out[0].badge).toBe('');
  });

  test('undefined badge → empty string', () => {
    const out = sanitizeTiers([{ minQty: 2, percent: 10 }]);
    expect(out[0].badge).toBe('');
  });

  test('throws on empty array', () => {
    expect(() => sanitizeTiers([])).toThrow('1–4 tiers required');
  });

  test('throws on 5 tiers', () => {
    const tiers = Array.from({ length: 5 }, (_, i) => ({ minQty: i + 2, percent: i + 5, badge: '' }));
    expect(() => sanitizeTiers(tiers)).toThrow('1–4 tiers required');
  });

  test('throws on minQty < 2', () => {
    expect(() => sanitizeTiers([{ minQty: 1, percent: 10, badge: '' }])).toThrow('minQty');
  });

  test('throws on minQty > 99', () => {
    expect(() => sanitizeTiers([{ minQty: 100, percent: 10, badge: '' }])).toThrow('minQty');
  });

  test('throws on fractional minQty', () => {
    expect(() => sanitizeTiers([{ minQty: 2.5, percent: 10, badge: '' }])).toThrow('minQty');
  });

  test('throws on percent < 1', () => {
    expect(() => sanitizeTiers([{ minQty: 2, percent: 0, badge: '' }])).toThrow('percent');
  });

  test('throws on percent > 80', () => {
    expect(() => sanitizeTiers([{ minQty: 2, percent: 81, badge: '' }])).toThrow('percent');
  });

  test('throws when minQty not strictly ascending', () => {
    expect(() => sanitizeTiers([
      { minQty: 3, percent: 10, badge: '' },
      { minQty: 3, percent: 15, badge: '' },
    ])).toThrow('strictly ascending');
  });

  test('throws when percent not strictly ascending', () => {
    expect(() => sanitizeTiers([
      { minQty: 2, percent: 15, badge: '' },
      { minQty: 3, percent: 15, badge: '' },
    ])).toThrow('strictly ascending');
  });

  test('throws on non-array', () => {
    expect(() => sanitizeTiers('not an array')).toThrow('must be an array');
  });
});

// ─── pickTier ────────────────────────────────────────────────────────────────

describe('pickTier', () => {
  const tiers = [
    { minQty: 2, percent: 10, badge: '' },
    { minQty: 3, percent: 15, badge: '' },
    { minQty: 4, percent: 25, badge: '' },
  ];

  test('qty 1 → null (below all tiers)', () => {
    expect(pickTier(tiers, 1)).toBeNull();
  });

  test('qty 2 → first tier (exactly at minQty)', () => {
    expect(pickTier(tiers, 2)).toEqual(tiers[0]);
  });

  test('qty 3 → second tier (exactly at minQty)', () => {
    expect(pickTier(tiers, 3)).toEqual(tiers[1]);
  });

  test('qty 4 → highest tier', () => {
    expect(pickTier(tiers, 4)).toEqual(tiers[2]);
  });

  test('qty above highest → highest tier', () => {
    expect(pickTier(tiers, 99)).toEqual(tiers[2]);
  });

  test('empty tiers → null', () => {
    expect(pickTier([], 5)).toBeNull();
  });

  test('null tiers → null', () => {
    expect(pickTier(null, 5)).toBeNull();
  });

  test('qty 0 → null', () => {
    expect(pickTier(tiers, 0)).toBeNull();
  });

  test('non-number qty → null', () => {
    expect(pickTier(tiers, 'three')).toBeNull();
  });

  test('NaN qty → null', () => {
    expect(pickTier(tiers, NaN)).toBeNull();
  });
});

// ─── discountedUnitPrice ─────────────────────────────────────────────────────

describe('discountedUnitPrice', () => {
  test('10% off 100 → 90.00', () => {
    expect(discountedUnitPrice(100, 10)).toBe(90);
  });

  test('15% off 99.99 → 84.99', () => {
    expect(discountedUnitPrice(99.99, 15)).toBe(84.99);
  });

  test('25% off 199 → 149.25', () => {
    expect(discountedUnitPrice(199, 25)).toBe(149.25);
  });

  test('rounds half-up: 33.33% off 1 → 0.67', () => {
    expect(discountedUnitPrice(1, 33.33)).toBe(0.67);
  });

  test('0% off → same price', () => {
    expect(discountedUnitPrice(50, 0)).toBe(50);
  });

  test('80% off 500 → 100', () => {
    expect(discountedUnitPrice(500, 80)).toBe(100);
  });
});

// ─── sanitizeAccentColor ─────────────────────────────────────────────────────

describe('sanitizeAccentColor', () => {
  test('valid hex returns as-is', () => {
    expect(sanitizeAccentColor('#4F46E5')).toBe('#4F46E5');
  });

  test('lowercase hex is valid', () => {
    expect(sanitizeAccentColor('#aabbcc')).toBe('#aabbcc');
  });

  test('no hash → default', () => {
    expect(sanitizeAccentColor('4F46E5')).toBe(DEFAULT_ACCENT);
  });

  test('empty → default', () => {
    expect(sanitizeAccentColor('')).toBe(DEFAULT_ACCENT);
  });

  test('null → default', () => {
    expect(sanitizeAccentColor(null)).toBe(DEFAULT_ACCENT);
  });

  test('3-char shorthand → default', () => {
    expect(sanitizeAccentColor('#fff')).toBe(DEFAULT_ACCENT);
  });
});
