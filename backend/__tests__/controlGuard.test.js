'use strict';
/**
 * Tests for Settings.jsx colour-control guard and mobile-tab style resolution.
 * All checks work from source text — no transpiler needed (popupStyles.js is an
 * ES module; Settings.jsx uses JSX — both are read as plain strings and the
 * relevant declarations are extracted by simple pattern matching).
 *
 * Item 1: every style's supportedFields matches the R2-2 coverage table for
 *   bgColor and textColor; Settings.jsx gates both ColorRows by that array.
 * Item 2: the mobile-tab guard uses the mobile style's supportedFields (not
 *   the desktop style's) when mobileStyleOverride is active.
 * Item 4: offerHeadline hint text is present in Discounts.jsx.
 */

const fs   = require('fs');
const path = require('path');

const POPUP_STYLES_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/app/admin/lib/popupStyles.js'), 'utf8'
);
const SETTINGS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/app/admin/screens/Settings.jsx'), 'utf8'
);
const DISCOUNTS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/app/admin/screens/Discounts.jsx'), 'utf8'
);

// Extract the supportedFields array text for a given style id from popupStyles.js
function extractSF(styleId) {
  const stylePattern = new RegExp(`\\b${styleId}:\\s*\\{`);
  const m = stylePattern.exec(POPUP_STYLES_SRC);
  if (!m) return '';
  const sfStart = POPUP_STYLES_SRC.indexOf('supportedFields:', m.index);
  if (sfStart < 0) return '';
  const arrOpen  = POPUP_STYLES_SRC.indexOf('[', sfStart);
  const arrClose = POPUP_STYLES_SRC.indexOf(']', arrOpen);
  return POPUP_STYLES_SRC.slice(arrOpen, arrClose + 1);
}

function hasSF(styleId, field) {
  return new RegExp(`['"]${field}['"]`).test(extractSF(styleId));
}

// Mirrors resolveStyleId from popupStyles.js (same logic — mobileOnly styles
// fall back to classic on desktop)
const MOBILE_ONLY = new Set(['bottom_sheet', 'top_bar', 'story_card']);
function resolveStyleId(styleId, device) {
  const known = POPUP_STYLES_SRC.includes(`  ${styleId}:`);
  if (!known) return 'classic';
  if (MOBILE_ONLY.has(styleId) && device !== 'mobile') return 'classic';
  return styleId;
}

// ── Item 1: supportedFields vs R2-2 ──────────────────────────────────────────

describe('popupStyles.js — R2-2 bgColor/textColor correctness (control guard)', () => {
  // flash_sale: E* in R2-2 → storefront ignores → should be removed from supportedFields
  test('flash_sale supportedFields does not contain bgColor (E* → hidden)', () => {
    expect(hasSF('flash_sale', 'bgColor')).toBe(false);
  });
  test('flash_sale supportedFields does not contain textColor (E* → hidden)', () => {
    expect(hasSF('flash_sale', 'textColor')).toBe(false);
  });

  // story_card: E* in R2-2 for both → removed
  test('story_card supportedFields does not contain bgColor (E* → hidden)', () => {
    expect(hasSF('story_card', 'bgColor')).toBe(false);
  });
  test('story_card supportedFields does not contain textColor (E* → hidden)', () => {
    expect(hasSF('story_card', 'textColor')).toBe(false);
  });

  // top_bar: bgColor=X (never used), textColor=E+U (storefront reads it)
  test('top_bar supportedFields does not contain bgColor (X per R2-2)', () => {
    expect(hasSF('top_bar', 'bgColor')).toBe(false);
  });
  test('top_bar supportedFields DOES contain textColor (E+U per R2-2)', () => {
    expect(hasSF('top_bar', 'textColor')).toBe(true);
  });

  // Styles that keep both controls (E+U for both)
  test.each(['classic', 'gift_reveal', 'bottom_sheet', 'spotlight', 'noir', 'color_block'])(
    '%s supportedFields contains bgColor (E+U)', (id) => {
      expect(hasSF(id, 'bgColor')).toBe(true);
    }
  );
  test.each(['classic', 'gift_reveal', 'bottom_sheet', 'spotlight', 'noir', 'color_block'])(
    '%s supportedFields contains textColor (E+U)', (id) => {
      expect(hasSF(id, 'textColor')).toBe(true);
    }
  );
});

// ── Item 1: Settings.jsx guard wiring ────────────────────────────────────────

describe('Settings.jsx — ColorRow guards read supportedFields', () => {
  test('Background ColorRow is wrapped in a supportedFields.includes(bgColor) guard', () => {
    const bgIdx = SETTINGS_SRC.indexOf('ColorRow label="Background"');
    expect(bgIdx).toBeGreaterThan(0);
    const before = SETTINGS_SRC.slice(bgIdx - 250, bgIdx);
    expect(before).toMatch(/POPUP_STYLES\[activeStyleId\]\.supportedFields.*includes\(['"]bgColor/s);
  });

  test('Text color ColorRow is wrapped in a supportedFields.includes(textColor) guard', () => {
    const tcIdx = SETTINGS_SRC.indexOf('ColorRow label="Text color"');
    expect(tcIdx).toBeGreaterThan(0);
    const before = SETTINGS_SRC.slice(tcIdx - 250, tcIdx);
    expect(before).toMatch(/POPUP_STYLES\[activeStyleId\]\.supportedFields.*includes\(['"]textColor/s);
  });
});

// ── Item 2: Mobile tab uses correct style's supportedFields ──────────────────

describe('Settings.jsx — mobile tab resolves correct supportedFields', () => {
  test('mobileUsesOwnStyle is derived from (popupDevice === mobile && mobileStyleOverride)', () => {
    expect(SETTINGS_SRC).toMatch(
      /mobileUsesOwnStyle\s*=\s*popupDevice\s*===\s*['"]mobile['"].*&&.*mobileStyleOverride/
    );
  });

  test('activeStyleId uses mobilePopup.styleId when mobileUsesOwnStyle is true', () => {
    expect(SETTINGS_SRC).toMatch(
      /mobileUsesOwnStyle\s*\?\s*mobilePopup\.styleId\s*:\s*popup\.styleId/
    );
  });

  test('ColorRow guards reference POPUP_STYLES[activeStyleId] (device-aware)', () => {
    expect(SETTINGS_SRC).toMatch(
      /POPUP_STYLES\[activeStyleId\]\.supportedFields.*includes\(['"]bgColor/s
    );
    expect(SETTINGS_SRC).toMatch(
      /POPUP_STYLES\[activeStyleId\]\.supportedFields.*includes\(['"]textColor/s
    );
  });

  // TC1: desktop=classic, mobile=top_bar, override=true
  // Desktop tab → activeStyleId='classic' → bgColor shown, textColor shown
  // Mobile tab  → activeStyleId='top_bar' → bgColor hidden, textColor shown
  describe('TC1: desktop=classic, mobile=top_bar', () => {
    const desktopId = resolveStyleId('classic', 'desktop');
    const mobileId  = resolveStyleId('top_bar', 'mobile');

    test('desktop activeStyleId resolves to classic', () => {
      expect(desktopId).toBe('classic');
    });
    test('desktop bgColor control is shown (classic has bgColor)', () => {
      expect(hasSF(desktopId, 'bgColor')).toBe(true);
    });
    test('desktop textColor control is shown (classic has textColor)', () => {
      expect(hasSF(desktopId, 'textColor')).toBe(true);
    });
    test('mobile activeStyleId resolves to top_bar', () => {
      expect(mobileId).toBe('top_bar');
    });
    test('mobile bgColor control is hidden (top_bar has no bgColor)', () => {
      expect(hasSF(mobileId, 'bgColor')).toBe(false);
    });
    test('mobile textColor control is shown (top_bar has textColor per R2-2)', () => {
      expect(hasSF(mobileId, 'textColor')).toBe(true);
    });
  });

  // TC2: desktop=flash_sale, mobile=classic, override=true
  // Desktop tab → activeStyleId='flash_sale' → both hidden
  // Mobile tab  → activeStyleId='classic'    → both shown
  describe('TC2: desktop=flash_sale, mobile=classic', () => {
    const desktopId = resolveStyleId('flash_sale', 'desktop');
    const mobileId  = resolveStyleId('classic', 'mobile');

    test('desktop activeStyleId resolves to flash_sale', () => {
      expect(desktopId).toBe('flash_sale');
    });
    test('desktop bgColor control is hidden (flash_sale has no bgColor)', () => {
      expect(hasSF(desktopId, 'bgColor')).toBe(false);
    });
    test('desktop textColor control is hidden (flash_sale has no textColor)', () => {
      expect(hasSF(desktopId, 'textColor')).toBe(false);
    });
    test('mobile activeStyleId resolves to classic (not mobileOnly, inherits normally)', () => {
      expect(mobileId).toBe('classic');
    });
    test('mobile bgColor control is shown (classic has bgColor)', () => {
      expect(hasSF(mobileId, 'bgColor')).toBe(true);
    });
    test('mobile textColor control is shown (classic has textColor)', () => {
      expect(hasSF(mobileId, 'textColor')).toBe(true);
    });
  });
});

// ── Item 4: offerHeadline hint ────────────────────────────────────────────────

describe('Discounts.jsx — offerHeadline hint text', () => {
  test('hint "Shown on the desktop popup (Classic, split layout)…" is present', () => {
    expect(DISCOUNTS_SRC).toContain(
      'Shown on the desktop popup (Classic, split layout). Phones and other styles use the fields below.'
    );
  });

  test('hint appears after the offerHeadline input element', () => {
    const inputIdx = DISCOUNTS_SRC.indexOf('onChange={(e) => setConfig((c) => ({ ...c, offerHeadline: e.target.value }))');
    const hintIdx  = DISCOUNTS_SRC.indexOf('Shown on the desktop popup');
    expect(inputIdx).toBeGreaterThan(0);
    expect(hintIdx).toBeGreaterThan(inputIdx);
  });
});
