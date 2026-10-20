'use strict';

const { relativeLuminance, contrastRatio, resolveBannerColors } = require('../utils/bannerColors');

// ─── relativeLuminance ────────────────────────────────────────────────────────
describe('relativeLuminance', () => {
  test('#FFFFFF = 1', () => expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 4));
  test('#000000 = 0', () => expect(relativeLuminance('#000000')).toBeCloseTo(0, 4));
  test('3-char shorthand #FFF = 1', () => expect(relativeLuminance('#FFF')).toBeCloseTo(1, 4));
  test('invalid hex returns 0', () => expect(relativeLuminance('notacolour')).toBe(0));
  test('missing hex returns 0', () => expect(relativeLuminance('')).toBe(0));
});

// ─── contrastRatio ────────────────────────────────────────────────────────────
describe('contrastRatio', () => {
  test('black on white = 21', () => expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0));
  test('white on white = 1', () => expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 2));
  test('indigo #3730A3 on white >= 4.5', () =>
    expect(contrastRatio('#3730A3', '#FFFFFF')).toBeGreaterThanOrEqual(4.5));
  test('gold #F5C542 on white < 4.5', () =>
    expect(contrastRatio('#F5C542', '#FFFFFF')).toBeLessThan(4.5));
});

// ─── resolveBannerColors ──────────────────────────────────────────────────────
describe('resolveBannerColors', () => {
  const CASES = [
    { cfg: { bgColor: '#3730A3', textColor: 'auto' }, expectFg: '#FFFFFF', desc: 'Indigo — dark bg, auto → white fg' },
    { cfg: { bgColor: '#171A22', textColor: 'auto' }, expectFg: '#FFFFFF', desc: 'Charcoal — very dark, auto → white fg' },
    { cfg: { bgColor: '#0F5132', textColor: 'auto' }, expectFg: '#FFFFFF', desc: 'Forest — dark, auto → white fg' },
    { cfg: { bgColor: '#B4472B', textColor: 'auto' }, expectFg: '#FFFFFF', desc: 'Terracotta — dark, auto → white fg' },
    { cfg: { bgColor: '#F5C542', textColor: 'auto' }, expectFg: '#171A22', desc: 'Gold — light bg, auto → dark fg' },
    { cfg: { bgColor: '#3730A3', textColor: 'white' }, expectFg: '#FFFFFF', desc: 'forced white overrides' },
    { cfg: { bgColor: '#F5C542', textColor: 'white' }, expectFg: '#FFFFFF', desc: 'forced white on gold' },
    { cfg: { bgColor: '#3730A3', textColor: 'dark' }, expectFg: '#171A22', desc: 'forced dark overrides' },
  ];

  for (const { cfg, expectFg, desc } of CASES) {
    test(desc, () => {
      const { fg } = resolveBannerColors(cfg);
      expect(fg).toBe(expectFg);
    });
  }

  test('Indigo: CTA pill is white bg / indigo fg', () => {
    const { ctaBg, ctaFg } = resolveBannerColors({ bgColor: '#3730A3', textColor: 'auto' });
    expect(ctaBg).toBe('#FFFFFF');
    expect(ctaFg).toBe('#3730A3');
  });

  test('Gold: CTA pill is near-black bg / white fg', () => {
    const { ctaBg, ctaFg } = resolveBannerColors({ bgColor: '#F5C542', textColor: 'auto' });
    expect(ctaBg).toBe('#171A22');
    expect(ctaFg).toBe('#FFFFFF');
  });

  test('Indigo: lowContrast is false', () => {
    const { lowContrast } = resolveBannerColors({ bgColor: '#3730A3', textColor: 'auto' });
    expect(lowContrast).toBe(false);
  });

  test('forced white on gold: lowContrast is true', () => {
    const { lowContrast } = resolveBannerColors({ bgColor: '#F5C542', textColor: 'white' });
    expect(lowContrast).toBe(true);
  });

  test('invalid bgColor falls back to #3730A3', () => {
    const { bg } = resolveBannerColors({ bgColor: 'notahex', textColor: 'auto' });
    expect(bg).toBe('#3730A3');
  });

  test('missing bgColor falls back to #3730A3', () => {
    const { bg } = resolveBannerColors({});
    expect(bg).toBe('#3730A3');
  });

  test('null cfg falls back to #3730A3 bg and white fg', () => {
    const result = resolveBannerColors(null);
    expect(result.bg).toBe('#3730A3');
    expect(result.fg).toBe('#FFFFFF');
  });

  // hl field — highlight colour for text sweep
  test('Indigo (white fg) → hl is #FFE08A', () => {
    const { hl } = resolveBannerColors({ bgColor: '#3730A3', textColor: 'auto' });
    expect(hl).toBe('#FFE08A');
  });

  test('Charcoal (white fg) → hl is #FFE08A', () => {
    const { hl } = resolveBannerColors({ bgColor: '#171A22', textColor: 'auto' });
    expect(hl).toBe('#FFE08A');
  });

  test('Terracotta (white fg) → hl is #FFE08A', () => {
    const { hl } = resolveBannerColors({ bgColor: '#B4472B', textColor: 'auto' });
    expect(hl).toBe('#FFE08A');
  });

  test('Gold (dark fg) → hl is a valid hex, distinct from fg and bg', () => {
    const { hl, fg, bg } = resolveBannerColors({ bgColor: '#F5C542', textColor: 'auto' });
    expect(hl).toMatch(/^#[0-9a-f]{6}$/);
    expect(hl).not.toBe(fg);
    expect(hl).not.toBe(bg);
  });

  test('Gold (dark fg) → hl matches mix(#171A22, bg, 0.35) = 65% fg + 35% bg', () => {
    const { hl } = resolveBannerColors({ bgColor: '#F5C542', textColor: 'auto' });
    // 65% #171A22 + 35% #F5C542:
    // hlR = round(23*0.65 + 245*0.35) = round(14.95+85.75) = 101 = 0x65
    // hlG = round(26*0.65 + 197*0.35) = round(16.90+68.95) =  86 = 0x56
    // hlB = round(34*0.65 +  66*0.35) = round(22.10+23.10) =  45 = 0x2d
    expect(hl).toBe('#65562d');
  });

  test('forced white on Gold → hl is #FFE08A', () => {
    const { hl } = resolveBannerColors({ bgColor: '#F5C542', textColor: 'white' });
    expect(hl).toBe('#FFE08A');
  });
});
