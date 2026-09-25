/**
 * Unit tests for backend/utils/popupStyles.js — the mirrored style id list
 * and styleFields sanitizer used by PATCH /api/profiles/:shop/popup.
 */

const {
  STYLE_IDS, MOBILE_ONLY_STYLE_IDS, isValidStyleId, sanitizeStyleFields, resolveStyleId,
} = require('../utils/popupStyles');

describe('isValidStyleId', () => {
  test.each(STYLE_IDS)('accepts registered id %s', (id) => {
    expect(isValidStyleId(id)).toBe(true);
  });

  test.each(['editorial', 'hologram', 'made-up', '', null, undefined, 42, 'full_takeover'])(
    'rejects unregistered id %p', (id) => {
      expect(isValidStyleId(id)).toBe(false);
    }
  );
});

// mobile-only styles: bottom_sheet/top_bar/story_card must
// never resolve for a desktop context, and an unrecognized id must always
// fall back to classic — the same contract promised by
// frontend/app/admin/lib/popupStyles.js's resolveStyleId() and
// ccf-push.js's ccfResolveStyle() (see audits/mobile-popup-styles-
// proposal.txt Q1/Q2).
describe('resolveStyleId', () => {
  test.each(MOBILE_ONLY_STYLE_IDS)('%s resolves for mobile', (id) => {
    expect(resolveStyleId(id, 'mobile')).toBe(id);
  });

  test.each(MOBILE_ONLY_STYLE_IDS)('%s falls back to classic for desktop', (id) => {
    expect(resolveStyleId(id, 'desktop')).toBe('classic');
  });

  test.each(['classic', 'flash_sale', 'gift_reveal'])(
    '%s (not mobile-only) resolves for both devices unchanged', (id) => {
      expect(resolveStyleId(id, 'desktop')).toBe(id);
      expect(resolveStyleId(id, 'mobile')).toBe(id);
    }
  );

  test.each(['editorial', 'made-up', '', null, undefined, 42, 'full_takeover'])(
    'unrecognized/removed id %p falls back to classic regardless of device', (id) => {
      expect(resolveStyleId(id, 'desktop')).toBe('classic');
      expect(resolveStyleId(id, 'mobile')).toBe('classic');
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

  test('bottom_sheet: booleans coerced', () => {
    expect(sanitizeStyleFields({ iconArtEnabled: 1, dragHandleEnabled: '' }))
      .toEqual({ iconArtEnabled: true, dragHandleEnabled: false });
  });

  test('top_bar: arrowCta boolean coerced', () => {
    expect(sanitizeStyleFields({ arrowCta: 'yes' })).toEqual({ arrowCta: true });
  });

  test('story_card: scrimEnabled boolean coerced', () => {
    expect(sanitizeStyleFields({ scrimEnabled: 0 })).toEqual({ scrimEnabled: false });
  });
});

describe('normalizeLayout', () => {
  const { normalizeLayout } = require('../utils/popupStyles');
  test('banner becomes card; other values are untouched', () => {
    expect(normalizeLayout('banner')).toBe('card');
    expect(normalizeLayout('split')).toBe('split');
    expect(normalizeLayout('card')).toBe('card');
    expect(normalizeLayout(undefined)).toBe(undefined);
  });
});

describe('round 3 styles (spotlight, noir, color_block)', () => {
  test('registered as valid, not mobile-only', () => {
    ['spotlight', 'noir', 'color_block'].forEach((id) => {
      expect(isValidStyleId(id)).toBe(true);
      expect(resolveStyleId(id, 'desktop')).toBe(id);
      expect(resolveStyleId(id, 'mobile')).toBe(id);
    });
  });
  test('spotlight fields are validated', () => {
    expect(sanitizeStyleFields({ spotlightTone: 'sage', showSquiggle: 1, shape: 'oval' }))
      .toEqual({ spotlightTone: 'sage', showSquiggle: true, shape: 'oval' });
    expect(sanitizeStyleFields({ spotlightTone: 'neon', shape: 'star' })).toEqual({});
  });
  test('noir fields are validated', () => {
    expect(sanitizeStyleFields({ noirTone: 'plum', imageSide: 'right' }))
      .toEqual({ noirTone: 'plum', imageSide: 'right' });
    expect(sanitizeStyleFields({ noirTone: 'pink', imageSide: 'top' })).toEqual({});
  });
  test('color_block fields are validated and offerFigure is capped', () => {
    const out = sanitizeStyleFields({ fieldTone: 'mint', offerFigure: '  ' + 'x'.repeat(30) + '  ' });
    expect(out.fieldTone).toBe('mint');
    expect(out.offerFigure).toHaveLength(12);
    expect(sanitizeStyleFields({ fieldTone: 'lime' })).toEqual({});
  });
});
