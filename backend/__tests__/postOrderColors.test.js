'use strict';

/**
 * Tests for backend/utils/postOrderColors.js (resolvePostOrderColors).
 * Also proves parity with the frontend mirror at
 * frontend/app/admin/lib/postOrderColors.js via >= 30 combination table.
 */

const { resolvePostOrderColors } = require('../utils/postOrderColors');

// Load frontend mirror via babel-jest (ESM export → CommonJS)
const feModule = require('../../frontend/app/admin/lib/postOrderColors');
const feResolve = feModule.resolvePostOrderColors || feModule.default || feModule;

// ─── null path (all defaults) ─────────────────────────────────────────────────
describe('resolvePostOrderColors — null when all defaults', () => {
  test('all empty / auto → null', () => {
    expect(resolvePostOrderColors({ accentColor: '', bgColor: '', buttonTextMode: 'auto', textMode: 'auto' })).toBeNull();
  });
  test('null cfg → null', () => expect(resolvePostOrderColors(null)).toBeNull());
  test('undefined cfg → null', () => expect(resolvePostOrderColors(undefined)).toBeNull());
  test('empty object → null', () => expect(resolvePostOrderColors({})).toBeNull());
  test('undefined fields → null', () => expect(resolvePostOrderColors({ accentColor: undefined, bgColor: undefined })).toBeNull());
});

// ─── accent overrides ─────────────────────────────────────────────────────────
describe('resolvePostOrderColors — accent', () => {
  test('custom accent, all else default → not null', () => {
    const r = resolvePostOrderColors({ accentColor: '#7A3B74' });
    expect(r).not.toBeNull();
    expect(r.accent).toBe('#7A3B74');
  });

  test('invalid accent string → fallback #4f46e5', () => {
    const r = resolvePostOrderColors({ accentColor: 'notacolour', bgColor: '#000000' });
    expect(r.accent).toBe('#4f46e5');
  });

  test('3-digit hex is invalid → fallback #4f46e5', () => {
    const r = resolvePostOrderColors({ accentColor: '#ABC', bgColor: '#000000' });
    expect(r.accent).toBe('#4f46e5');
  });
});

// ─── button text colour modes ─────────────────────────────────────────────────
describe('resolvePostOrderColors — btnFg', () => {
  test('buttonTextMode white → btnFg #FFFFFF', () => {
    const r = resolvePostOrderColors({ accentColor: '#F5C542', buttonTextMode: 'white' });
    expect(r.btnFg).toBe('#FFFFFF');
  });

  test('buttonTextMode dark → btnFg #171A22', () => {
    const r = resolvePostOrderColors({ accentColor: '#4f46e5', buttonTextMode: 'dark' });
    expect(r.btnFg).toBe('#171A22');
  });

  test('buttonTextMode auto, dark accent → btnFg #FFFFFF (contrast >= 4.5)', () => {
    const r = resolvePostOrderColors({ accentColor: '#4f46e5', buttonTextMode: 'auto' });
    // indigo on white = contrast > 4.5, so white button text
    expect(r.btnFg).toBe('#FFFFFF');
  });

  test('buttonTextMode auto, light accent (Gold) → btnFg #171A22', () => {
    const r = resolvePostOrderColors({ accentColor: '#F5C542', buttonTextMode: 'auto' });
    expect(r.btnFg).toBe('#171A22');
  });
});

// ─── block background ─────────────────────────────────────────────────────────
describe('resolvePostOrderColors — bg', () => {
  test('empty bgColor → bg null', () => {
    const r = resolvePostOrderColors({ accentColor: '#4f46e5' });
    expect(r.bg).toBeNull();
  });

  test('valid bgColor → bg set', () => {
    const r = resolvePostOrderColors({ bgColor: '#FFF7ED' });
    expect(r.bg).toBe('#FFF7ED');
  });

  test('when bg null, sep is #e4e4e7', () => {
    const r = resolvePostOrderColors({ accentColor: '#4f46e5' });
    expect(r.sep).toBe('#e4e4e7');
  });

  test('when bg set, sep is null', () => {
    const r = resolvePostOrderColors({ bgColor: '#0F172A' });
    expect(r.sep).toBeNull();
  });
});

// ─── text colour modes ────────────────────────────────────────────────────────
describe('resolvePostOrderColors — text', () => {
  test('textMode white → text #FFFFFF', () => {
    const r = resolvePostOrderColors({ textMode: 'white', bgColor: '#FFF7ED' });
    expect(r.text).toBe('#FFFFFF');
  });

  test('textMode dark → text #18181B', () => {
    const r = resolvePostOrderColors({ textMode: 'dark', bgColor: '#0F172A' });
    expect(r.text).toBe('#18181B');
  });

  test('textMode auto, light bg (#FFFFFF) → dark text #18181B', () => {
    const r = resolvePostOrderColors({ textMode: 'auto', bgColor: '#FFFFFF' });
    // white bg: contrast(#FFFFFF, #FFFFFF) < 4.5 → dark text
    expect(r.text).toBe('#18181B');
  });

  test('textMode auto, dark bg (#0F172A) → light text #F4F4F5', () => {
    const r = resolvePostOrderColors({ textMode: 'auto', bgColor: '#0F172A' });
    expect(r.text).toBe('#F4F4F5');
  });
});

// ─── muted + skip ─────────────────────────────────────────────────────────────
describe('resolvePostOrderColors — muted/skip', () => {
  test('light text → muted = #C9CDD6', () => {
    const r = resolvePostOrderColors({ textMode: 'white', bgColor: '#0F172A' });
    expect(r.muted).toBe('#C9CDD6');
    expect(r.skip).toBe('#C9CDD6');
  });

  test('dark text → muted = #71717A', () => {
    const r = resolvePostOrderColors({ textMode: 'dark', bgColor: '#FFF7ED' });
    expect(r.muted).toBe('#71717A');
    expect(r.skip).toBe('#71717A');
  });
});

// ─── parity with frontend mirror ─────────────────────────────────────────────
describe('backend/frontend parity — >= 30 combinations', () => {
  const ACCENTS = ['', '#4F46E5', '#7A3B74', '#171A22', '#0F5132', '#F5C542'];
  const BGS     = ['', '#FFF7ED', '#F3F4F6', '#EEF2FF', '#18181B'];
  const MODES   = ['auto', 'white', 'dark'];

  const combos = [];
  for (const ac of ACCENTS) {
    for (const bg of BGS) {
      for (const bm of MODES) {
        for (const tm of MODES) {
          combos.push({ accentColor: ac, bgColor: bg, buttonTextMode: bm, textMode: tm });
          if (combos.length >= 100) break;
        }
        if (combos.length >= 100) break;
      }
      if (combos.length >= 100) break;
    }
    if (combos.length >= 100) break;
  }

  expect(combos.length).toBeGreaterThanOrEqual(30);

  for (const cfg of combos) {
    const desc = `a=${cfg.accentColor||'dflt'} bg=${cfg.bgColor||'dflt'} bm=${cfg.buttonTextMode} tm=${cfg.textMode}`;
    test(desc, () => {
      const be = resolvePostOrderColors(cfg);
      const fe = feResolve(cfg);
      expect(fe).toEqual(be);
    });
  }
});
