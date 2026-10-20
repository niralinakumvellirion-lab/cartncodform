'use strict';
/**
 * Verifies the classic-card buildOfferBtn text-colour fix (regression for
 * the bug introduced in 3faaef5: fgOn(accent) was used on a button that has
 * a transparent background, so the text colour must contrast with the popup
 * background, not with the accent colour).
 *
 * Tests run purely as source checks (regex) + inline fgOn evaluation — no
 * browser / jsdom required.
 */

const fs   = require('fs');
const path = require('path');

const SRC_PATH = path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-push.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

// Extract fgOn from source so we can evaluate real contrast values.
// It depends only on ccfParseHex which is also inline in the file.
function extractFn(name) {
  const re = new RegExp('function ' + name + '\\s*\\(([^)]*?)\\)\\s*\\{');
  const m = re.exec(SRC);
  if (!m) throw new Error('Function ' + name + ' not found in ccf-push.js');
  const start = m.index;
  let depth = 0, i = start;
  while (i < SRC.length) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return SRC.slice(start, i);
}

// eslint-disable-next-line no-new-func
const fgOn = new Function(
  'return (function() {' +
  extractFn('ccfParseHex') +
  extractFn('fgOn') +
  'return fgOn; })()'
)();

describe('ccf-push.js classic-card buildOfferBtn text colour', () => {

  // ── Source check ────────────────────────────────────────────────────────────

  test('line 3082 uses cardDark-based text colour (not fgOn(accent))', () => {
    // Locate the exact call site for the classic-card capture button.
    const line = SRC.split('\n').find(l =>
      l.includes('cardContent.appendChild(buildOfferBtn(accent,') &&
      l.includes('ccfCaptureMode()'));
    expect(line).toBeDefined();
    // Must use the popup-bg-based choice, NOT fgOn(accent)
    expect(line).toContain("cardDark ? '#F4F4F5' : '#171A22'");
    expect(line).not.toContain('fgOn(accent)');
  });

  // ── fgOn contrast smoke tests ───────────────────────────────────────────────

  test('fgOn(indigo) returns white (dark accent)', () => {
    expect(fgOn('#4f46e5')).toBe('#FFFFFF');
  });

  test('fgOn(gold) returns dark (light accent)', () => {
    expect(fgOn('#F5C542')).toBe('#171A22');
  });

  // ── Regression: the old code would produce invisible text ──────────────────

  test('fgOn(accent) is wrong for transparent-bg button on light popup', () => {
    // Light popup (#ffffff): button bg = transparent = shows white.
    // fgOn('#4f46e5') = '#FFFFFF' = white text on white bg = invisible (1:1).
    // cardDark ? '#F4F4F5' : '#171A22' → '#171A22' = dark text on white bg = 16:1.
    const wrongColor = fgOn('#4f46e5');          // old code
    const fixedColor = '#171A22';                // new code (light popup)
    const popupBg = '#ffffff';

    function relativeLuminance(hex) {
      var r = parseInt(hex.slice(1,3),16)/255;
      var g = parseInt(hex.slice(3,5),16)/255;
      var b = parseInt(hex.slice(5,7),16)/255;
      function lin(v){ return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
      return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
    }
    function contrast(fg, bg) {
      var L1 = relativeLuminance(fg), L2 = relativeLuminance(bg);
      var brighter = Math.max(L1,L2), darker = Math.min(L1,L2);
      return (brighter + 0.05) / (darker + 0.05);
    }

    const wrongContrast = contrast(wrongColor, popupBg);
    const fixedContrast = contrast(fixedColor, popupBg);

    // Old code: white on white = 1:1 (< 4.5 WCAG AA threshold)
    expect(wrongContrast).toBeLessThan(1.1);
    // New code: #171A22 on white = 16:1 (> 4.5)
    expect(fixedContrast).toBeGreaterThan(4.5);
  });

  test('fgOn(accent) is wrong for transparent-bg button on dark popup', () => {
    // Dark popup (#111827): button bg = transparent = shows dark.
    // fgOn('#F5C542') = '#171A22' = dark text on dark bg = ~1.3:1 invisible.
    // cardDark ? '#F4F4F5' : '#171A22' → '#F4F4F5' = light text on dark bg = 10:1.
    const wrongColor = fgOn('#F5C542');          // old code (dark accent = dark text)
    const fixedColor = '#F4F4F5';                // new code (dark popup)
    const popupBg = '#111827';

    function relativeLuminance(hex) {
      var r = parseInt(hex.slice(1,3),16)/255;
      var g = parseInt(hex.slice(3,5),16)/255;
      var b = parseInt(hex.slice(5,7),16)/255;
      function lin(v){ return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
      return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
    }
    function contrast(fg, bg) {
      var L1 = relativeLuminance(fg), L2 = relativeLuminance(bg);
      var brighter = Math.max(L1,L2), darker = Math.min(L1,L2);
      return (brighter + 0.05) / (darker + 0.05);
    }

    const wrongContrast = contrast(wrongColor, popupBg);
    const fixedContrast = contrast(fixedColor, popupBg);

    // Old code: dark (#171A22) on dark popup (#111827) = ~1.3:1
    expect(wrongContrast).toBeLessThan(2.0);
    // New code: #F4F4F5 on #111827 ≈ 10:1
    expect(fixedContrast).toBeGreaterThan(4.5);
  });
});
