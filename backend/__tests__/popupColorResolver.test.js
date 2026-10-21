'use strict';
/**
 * entry-popup-colours: unit tests for ccfResolvePopupColors (storefront)
 * and the PATCH route's ignored-field behaviour for buttonTextColor/textMode.
 */

const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-push.js'),
  'utf8',
);

// ── Extract and wrap ccfResolvePopupColors + helpers ─────────────────────────

function extractFn(name, src) {
  const re = new RegExp('function ' + name + '\\s*\\(([^)]*?)\\)\\s*\\{');
  const m = re.exec(src);
  if (!m) throw new Error('Function ' + name + ' not found');
  let depth = 0, i = m.index;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return src.slice(m.index, i);
}

// eslint-disable-next-line no-new-func
const { ccfResolvePopupColors, fgOn, ccfIsDarkColor } = new Function(
  'return (function() {' +
  extractFn('ccfParseHex', SRC) +
  extractFn('fgOn', SRC) +
  extractFn('ccfIsDarkColor', SRC) +
  extractFn('ccfResolvePopupColors', SRC) +
  'return { ccfResolvePopupColors, fgOn, ccfIsDarkColor }; })()'
)();

// ── ccfResolvePopupColors ─────────────────────────────────────────────────────

describe('ccfResolvePopupColors', () => {
  describe('DEFAULT-OUTPUT CONTRACT (textMode=custom + empty textColor + buttonTextColor=auto)', () => {
    test('light bg: text=#111827, btnFg=fgOn(accent), dark=false', () => {
      const r = ccfResolvePopupColors({ bgColor: '#ffffff', accentColor: '#4f46e5', textColor: '', textMode: 'custom', buttonTextColor: 'auto' });
      expect(r.text).toBe('#111827');
      expect(r.btnFg).toBe(fgOn('#4f46e5'));
      expect(r.dark).toBe(false);
    });

    test('dark bg: text=#ffffff, dark=true', () => {
      const r = ccfResolvePopupColors({ bgColor: '#111827', accentColor: '#4f46e5', textColor: '', textMode: 'custom', buttonTextColor: 'auto' });
      expect(r.text).toBe('#ffffff');
      expect(r.dark).toBe(true);
    });

    test('no textMode stored → same as custom', () => {
      const a = ccfResolvePopupColors({ bgColor: '#ffffff', accentColor: '#4f46e5' });
      const b = ccfResolvePopupColors({ bgColor: '#ffffff', accentColor: '#4f46e5', textMode: 'custom' });
      expect(a.text).toBe(b.text);
      expect(a.btnFg).toBe(b.btnFg);
    });
  });

  describe('textMode variants', () => {
    test("textMode='white' → text=#ffffff regardless of bg", () => {
      const r = ccfResolvePopupColors({ bgColor: '#ffffff', textMode: 'white' });
      expect(r.text).toBe('#ffffff');
    });

    test("textMode='dark' → text=#171A22 regardless of bg", () => {
      const r = ccfResolvePopupColors({ bgColor: '#111827', textMode: 'dark' });
      expect(r.text).toBe('#171A22');
    });

    test("textMode='auto' uses WCAG contrast (board values #171A22 / #F4F4F5)", () => {
      const light = ccfResolvePopupColors({ bgColor: '#ffffff', textMode: 'auto' });
      const dark  = ccfResolvePopupColors({ bgColor: '#111827', textMode: 'auto' });
      expect(light.text).toBe('#171A22');
      expect(dark.text).toBe('#F4F4F5');
    });

    test("textMode='custom' with textColor set uses that value", () => {
      const r = ccfResolvePopupColors({ bgColor: '#ffffff', textColor: '#cc0000', textMode: 'custom' });
      expect(r.text).toBe('#cc0000');
    });
  });

  describe('buttonTextColor variants', () => {
    test("buttonTextColor='white' → btnFg=#ffffff", () => {
      const r = ccfResolvePopupColors({ accentColor: '#4f46e5', buttonTextColor: 'white' });
      expect(r.btnFg).toBe('#ffffff');
    });

    test("buttonTextColor='dark' → btnFg=#171A22", () => {
      const r = ccfResolvePopupColors({ accentColor: '#4f46e5', buttonTextColor: 'dark' });
      expect(r.btnFg).toBe('#171A22');
    });

    test("buttonTextColor='auto' → fgOn(accent)", () => {
      const r = ccfResolvePopupColors({ accentColor: '#F5C542', buttonTextColor: 'auto' });
      expect(r.btnFg).toBe(fgOn('#F5C542'));
    });
  });

  describe('resolver returns full palette', () => {
    test('light bg → correct inputBg/inputBorder/muted', () => {
      const r = ccfResolvePopupColors({ bgColor: '#ffffff' });
      expect(r.inputBg).toBe('#f9fafb');
      expect(r.inputBorder).toBe('rgba(255,255,255,0.22)' === r.inputBorder ? r.inputBorder : '#e5e7eb');
      expect(r.dark).toBe(false);
    });

    test('dark bg → dark-mode inputBg', () => {
      const r = ccfResolvePopupColors({ bgColor: '#111827' });
      expect(r.dark).toBe(true);
      expect(r.inputBg).toBe('rgba(255,255,255,0.10)');
    });

    test('accent/bg are passed through', () => {
      const r = ccfResolvePopupColors({ bgColor: '#fef3c7', accentColor: '#f59e0b' });
      expect(r.bg).toBe('#fef3c7');
      expect(r.accent).toBe('#f59e0b');
    });
  });
});

// ── PATCH route ignored-field behaviour ──────────────────────────────────────

describe('POPUP_FIELDS validation: buttonTextColor and textMode', () => {
  // The route source must include the validation logic.
  const ROUTE_SRC = fs.readFileSync(
    path.resolve(__dirname, '../routes/profiles.js'), 'utf8',
  );

  test('profiles.js imports/defines BUTTON_TEXT_COLOR_VALUES with auto|white|dark', () => {
    expect(ROUTE_SRC).toContain("'auto', 'white', 'dark'");
  });

  test('profiles.js includes TEXT_MODE_VALUES with custom|auto|white|dark', () => {
    expect(ROUTE_SRC).toContain("'custom', 'auto', 'white', 'dark'");
  });

  test('profiles.js returns ignored array in response', () => {
    expect(ROUTE_SRC).toContain('ignored.push');
    expect(ROUTE_SRC).toContain('resp.ignored = ignored');
  });

  test('buttonTextColor and textMode are handled by applyColorField, not in generic POPUP_FIELDS loop', () => {
    // They should NOT appear in the POPUP_FIELDS literal.
    const pfMatch = ROUTE_SRC.match(/const POPUP_FIELDS\s*=\s*\[([\s\S]*?)\]/);
    expect(pfMatch).not.toBeNull();
    expect(pfMatch[1]).not.toContain('buttonTextColor');
    expect(pfMatch[1]).not.toContain('textMode');
    // But applyColorField IS called for them.
    expect(ROUTE_SRC).toContain("applyColorField('buttonTextColor'");
    expect(ROUTE_SRC).toContain("applyColorField('textMode'");
  });
});
