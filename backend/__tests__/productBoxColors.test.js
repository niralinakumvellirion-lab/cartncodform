'use strict';

/**
 * Tests for backend/utils/productBoxColors.js
 * Verifies parity with frontend/app/admin/lib/productBoxColors.js across ≥30 combinations.
 */

const { resolveProductBoxColors } = require('../utils/productBoxColors');

// Load the frontend ESM module via a small CommonJS shim
const fs = require('fs');
const path = require('path');
const frontendSrc = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/app/admin/lib/productBoxColors.js'),
  'utf8'
);
// Strip ESM export keyword for require() compatibility
const shimSrc = frontendSrc.replace(/^export function /gm, 'function ');
const mod = {};
// eslint-disable-next-line no-new-func
new Function('module', 'exports', shimSrc + '\nmodule.exports={resolveProductBoxColors};')(mod, mod);
const { resolveProductBoxColors: resolveProductBoxColorsFE } = mod.exports;

// ── Helper ──────────────────────────────────────────────────────────────────

function roundtrip(be, fe) {
  // Every key must be equal between backend and frontend
  const keys = ['accent','btnFg','bg','text','muted','fieldBg','fieldBorder','checkBorder','lowBtnContrast','lowTextContrast',
                 'stubFg','sealText','bodyBg','err','errBg','ok'];
  for (const k of keys) {
    expect(fe[k]).toEqual(be[k]);
  }
}

// ── Test combinations ────────────────────────────────────────────────────────

const COMBINATIONS = [
  // All defaults
  {},
  { accentColor: '', bgColor: '', buttonTextMode: 'auto', textMode: 'auto' },
  // Accent presets
  { accentColor: '#4F46E5' },
  { accentColor: '#7C3AED' },
  { accentColor: '#0D9488' },
  { accentColor: '#E11D48' },
  { accentColor: '#171A22' },
  // Button text modes
  { accentColor: '#4F46E5', buttonTextMode: 'white' },
  { accentColor: '#4F46E5', buttonTextMode: 'dark' },
  // Low-contrast accent + forced white text
  { accentColor: '#F5C542', buttonTextMode: 'white' },  // lowBtnContrast=true
  { accentColor: '#FFFFFF', buttonTextMode: 'dark' },   // lowBtnContrast=true
  // Background presets
  { bgColor: '#FFF7ED' },
  { bgColor: '#EEF2FF' },
  { bgColor: '#F3F4F6' },
  { bgColor: '#0F172A' },  // dark bg → light text
  { bgColor: '#171A22' },  // dark bg → light text
  // Text modes
  { bgColor: '#0F172A', textMode: 'white' },
  { bgColor: '#ffffff', textMode: 'dark' },
  { bgColor: '#0F172A', textMode: 'dark' },   // lowTextContrast=true on dark bg with dark text
  { bgColor: '#ffffff', textMode: 'white' },  // lowTextContrast=true on light bg with white text
  // Combined
  { accentColor: '#7C3AED', bgColor: '#FFF7ED', buttonTextMode: 'auto', textMode: 'auto' },
  { accentColor: '#171A22', bgColor: '#171A22', buttonTextMode: 'white', textMode: 'white' },
  { accentColor: '#0D9488', bgColor: '#EEF2FF', buttonTextMode: 'dark', textMode: 'auto' },
  { accentColor: '#E11D48', bgColor: '#F3F4F6', buttonTextMode: 'auto', textMode: 'dark' },
  // No bg (null)
  { accentColor: '#4F46E5', bgColor: '' },
  { accentColor: '#F5C542', bgColor: '' },
  // Low-contrast text
  { bgColor: '#F5F5F5', textMode: 'white' },  // lowTextContrast (light bg + white text)
  { bgColor: '#171A22', textMode: 'dark' },   // lowTextContrast (dark bg + dark text)
  // Invalid hex falls back to defaults
  { accentColor: 'not-a-hex', bgColor: 'invalid' },
  { accentColor: '#ZZZZZZ', bgColor: '' },
  // Additional combos for gift-card keys (brings total ≥36)
  { accentColor: '#10B981' },                                                    // green accent
  { accentColor: '#FBBF24', buttonTextMode: 'auto' },                            // yellow: dark btn text auto
  { bgColor: '#1E293B', textMode: 'white' },                                     // navy bg + explicit white text
  { accentColor: '#F97316', bgColor: '#1E293B', textMode: 'auto' },              // orange on navy
  { accentColor: '#DB2777', bgColor: '#FDF2F8', textMode: 'dark' },              // pink on blush
  { accentColor: '#4F46E5', bgColor: '#0F172A', buttonTextMode: 'white', textMode: 'white' },
  { accentColor: '#000000', bgColor: '#FFFFFF' },                                // pure black on white
];

describe('resolveProductBoxColors — backend/frontend parity', () => {
  test.each(COMBINATIONS.map((cfg, i) => [i, cfg]))(
    'combination %i: %j',
    (_, cfg) => {
      const be = resolveProductBoxColors(cfg);
      const fe = resolveProductBoxColorsFE(cfg);
      roundtrip(be, fe);
    }
  );
});

describe('resolveProductBoxColors — always returns (never null)', () => {
  test('returns an object for all-default config', () => {
    const result = resolveProductBoxColors({});
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      accent: '#4F46E5',
      bg: null,
      text: '#18181B',
      muted: '#71717A',
    });
  });

  test('bg is null when bgColor is empty (outlined box)', () => {
    expect(resolveProductBoxColors({ bgColor: '' }).bg).toBeNull();
    expect(resolveProductBoxColors({}).bg).toBeNull();
  });

  test('bg is a hex string when bgColor is set', () => {
    expect(resolveProductBoxColors({ bgColor: '#FFF7ED' }).bg).toBe('#FFF7ED');
  });
});

describe('resolveProductBoxColors — field colours', () => {
  test('dark bg → light text → dark fieldBg', () => {
    const r = resolveProductBoxColors({ bgColor: '#0F172A', textMode: 'auto' });
    expect(r.fieldBg).toBe('#27272A');
    expect(r.fieldBorder).toBe('#3F3F46');
    expect(r.checkBorder).toBe('#A1A1AA');
  });

  test('light bg → dark text → white fieldBg', () => {
    const r = resolveProductBoxColors({ bgColor: '#FFF7ED', textMode: 'auto' });
    expect(r.fieldBg).toBe('#FFFFFF');
    expect(r.fieldBorder).toBe('#D4D4D8');
    expect(r.checkBorder).toBe('#71717A');
  });
});

describe('resolveProductBoxColors — lowBtnContrast flag', () => {
  test('auto mode: never warns', () => {
    expect(resolveProductBoxColors({ accentColor: '#F5C542', buttonTextMode: 'auto' }).lowBtnContrast).toBe(false);
  });

  test('white text on gold: warns', () => {
    expect(resolveProductBoxColors({ accentColor: '#F5C542', buttonTextMode: 'white' }).lowBtnContrast).toBe(true);
  });

  test('white text on indigo: does not warn', () => {
    expect(resolveProductBoxColors({ accentColor: '#4F46E5', buttonTextMode: 'white' }).lowBtnContrast).toBe(false);
  });
});

describe('resolveProductBoxColors — lowTextContrast flag', () => {
  test('auto mode: never warns', () => {
    expect(resolveProductBoxColors({ bgColor: '#ffffff', textMode: 'auto' }).lowTextContrast).toBe(false);
  });

  test('white text on white bg: warns', () => {
    expect(resolveProductBoxColors({ bgColor: '#ffffff', textMode: 'white' }).lowTextContrast).toBe(true);
  });

  test('dark text on dark bg: warns', () => {
    expect(resolveProductBoxColors({ bgColor: '#171A22', textMode: 'dark' }).lowTextContrast).toBe(true);
  });

  test('white text on dark bg: does not warn', () => {
    expect(resolveProductBoxColors({ bgColor: '#171A22', textMode: 'white' }).lowTextContrast).toBe(false);
  });
});

describe('resolveProductBoxColors — stubFg (gift-card stub text)', () => {
  test('indigo accent ≥4.5:1 on white → stubFg is white', () => {
    expect(resolveProductBoxColors({ accentColor: '#4F46E5' }).stubFg).toBe('#FFFFFF');
  });

  test('gold accent < 4.5:1 on white → stubFg is dark', () => {
    expect(resolveProductBoxColors({ accentColor: '#F5C542' }).stubFg).toBe('#171A22');
  });

  test('stubFg is independent of buttonTextMode', () => {
    const rDark = resolveProductBoxColors({ accentColor: '#4F46E5', buttonTextMode: 'dark' });
    const rAuto = resolveProductBoxColors({ accentColor: '#4F46E5', buttonTextMode: 'auto' });
    expect(rDark.stubFg).toBe('#FFFFFF');
    expect(rAuto.stubFg).toBe('#FFFFFF');
  });
});

describe('resolveProductBoxColors — sealText (gift-card seal text/icon)', () => {
  test('dark indigo ≥3:1 on white → sealText equals accent', () => {
    const r = resolveProductBoxColors({ accentColor: '#4F46E5' });
    expect(r.sealText).toBe('#4F46E5');
  });

  test('near-white accent < 3:1 on white → sealText is #171A22', () => {
    const r = resolveProductBoxColors({ accentColor: '#F9FAFB' });
    expect(r.sealText).toBe('#171A22');
  });
});

describe('resolveProductBoxColors — bodyBg', () => {
  test('no bgColor → bodyBg is #FFFFFF', () => {
    expect(resolveProductBoxColors({}).bodyBg).toBe('#FFFFFF');
  });

  test('bgColor set → bodyBg equals bgColor', () => {
    expect(resolveProductBoxColors({ bgColor: '#FFF7ED' }).bodyBg).toBe('#FFF7ED');
  });

  test('dark bgColor → bodyBg equals dark color', () => {
    expect(resolveProductBoxColors({ bgColor: '#0F172A' }).bodyBg).toBe('#0F172A');
  });
});

describe('resolveProductBoxColors — err / errBg / ok (gift-card status colours)', () => {
  test('light body → dark err (#DC2626), light errBg (#FEE2E2), dark ok (#16A34A)', () => {
    const r = resolveProductBoxColors({ bgColor: '#FFFFFF' });
    expect(r.err).toBe('#DC2626');
    expect(r.errBg).toBe('#FEE2E2');
    expect(r.ok).toBe('#16A34A');
  });

  test('dark body → lighter err (#F87171), dark errBg (#450A0A), lighter ok (#4ADE80)', () => {
    const r = resolveProductBoxColors({ bgColor: '#0F172A' });
    expect(r.err).toBe('#F87171');
    expect(r.errBg).toBe('#450A0A');
    expect(r.ok).toBe('#4ADE80');
  });

  test('explicit white textMode on dark bg → still uses light-text branch', () => {
    const r = resolveProductBoxColors({ bgColor: '#171A22', textMode: 'white' });
    expect(r.err).toBe('#F87171');
    expect(r.ok).toBe('#4ADE80');
  });

  test('explicit dark textMode on light bg → uses dark-text branch', () => {
    const r = resolveProductBoxColors({ bgColor: '#FFFFFF', textMode: 'dark' });
    expect(r.err).toBe('#DC2626');
    expect(r.ok).toBe('#16A34A');
  });
});
