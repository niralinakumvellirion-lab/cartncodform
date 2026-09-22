/**
 * Unit tests for backend/utils/popupStyles.js — the mirrored style id list
 * and styleFields sanitizer used by PATCH /api/profiles/:shop/popup.
 */

const { STYLE_IDS, isValidStyleId, sanitizeStyleFields } = require('../utils/popupStyles');

describe('isValidStyleId', () => {
  test.each(STYLE_IDS)('accepts registered id %s', (id) => {
    expect(isValidStyleId(id)).toBe(true);
  });

  test.each(['editorial', 'spotlight', 'made-up', '', null, undefined, 42])(
    'rejects unregistered id %p', (id) => {
      expect(isValidStyleId(id)).toBe(false);
    }
  );
});

describe('sanitizeStyleFields', () => {
  test('non-object input returns an empty object', () => {
    expect(sanitizeStyleFields(null)).toEqual({});
    expect(sanitizeStyleFields(undefined)).toEqual({});
    expect(sanitizeStyleFields('nope')).toEqual({});
  });

  test('keeps only known keys across every registered style (flat bag)', () => {
    const out = sanitizeStyleFields({
      badgeText: 'Sale!',
      giftIconEnabled: true,
      notARealField: 'drop me',
      __proto__: 'ignored',
    });
    expect(out).toEqual({ badgeText: 'Sale!', giftIconEnabled: true });
  });

  test('flash_sale: countdownSource only accepts the two real enum values', () => {
    expect(sanitizeStyleFields({ countdownSource: 'fixed_date' }))
      .toEqual({ countdownSource: 'fixed_date' });
    expect(sanitizeStyleFields({ countdownSource: 'discount_expiry' }))
      .toEqual({ countdownSource: 'discount_expiry' });
    // never a fake per-visitor timer value
    expect(sanitizeStyleFields({ countdownSource: 'minutes_from_now' })).toEqual({});
  });

  test('flash_sale: countdownEndsAt and badgeText are trimmed strings, capped', () => {
    const out = sanitizeStyleFields({
      countdownEndsAt: '2026-12-31T23:59:00.000Z',
      badgeText: '  ' + 'x'.repeat(50) + '  ',
    });
    expect(out.countdownEndsAt).toBe('2026-12-31T23:59:00.000Z');
    expect(out.badgeText).toHaveLength(24);
    expect(out.badgeText.startsWith('x')).toBe(true);
  });

  test('gift_reveal: booleans coerced, enum validated', () => {
    expect(sanitizeStyleFields({ giftIconEnabled: 'yes', codeChipEmphasis: 0 }))
      .toEqual({ giftIconEnabled: true, codeChipEmphasis: false });
    expect(sanitizeStyleFields({ secondaryButtonStyle: 'pill' }))
      .toEqual({ secondaryButtonStyle: 'pill' });
    expect(sanitizeStyleFields({ secondaryButtonStyle: 'made-up' })).toEqual({});
  });

  test('classic has no extra fields to keep', () => {
    expect(sanitizeStyleFields({ anything: 'goes-nowhere' })).toEqual({});
  });
});
