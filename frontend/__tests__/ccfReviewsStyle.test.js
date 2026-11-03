/**
 * Storefront reviews stylesheet + block, built to the approved design. jsdom cannot lay out CSS, so these
 * guard the rules; the look was checked in a real browser (desktop in a content-sized theme container,
 * a 375px phone, light and dark themes).
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '../../extensions/cartncodform-embed');
const css = fs.readFileSync(path.join(root, 'assets/ccf-reviews.css'), 'utf8');
const liquid = fs.readFileSync(path.join(root, 'blocks/product-reviews.liquid'), 'utf8');

// The declarations of the top-level rule "<selector> { ... }" (first one that starts a line).
function rule(selector) {
  const start = css.indexOf('\n' + selector + ' {');
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

describe('page layout', () => {
  it('the rules can be found by the helper (guards the helper itself)', () => {
    expect(rule('.ccf-rv-h')).toContain('font-weight');
    expect(rule('.does-not-exist')).toBe('');
  });

  it('REGRESSION: no size containment (the block collapsed to ~40px in content-sized theme containers)', () => {
    expect(css).not.toContain('container-type');
    expect(css).not.toContain('@container');
  });

  it('the block fills flex and grid parents, cannot shrink to nothing, and has no maximum of its own', () => {
    const r = rule('.ccf-rv');
    expect(r).toContain('width: 100%');
    expect(r).toContain('align-self: stretch');
    expect(r).toContain('justify-self: stretch');
    expect(r).toContain('min-width: min(260px, calc(100vw - 40px))');
    expect(r).not.toContain('max-width');
  });

  it('the content is centred at the configurable maximum width', () => {
    expect(rule('.ccf-rv-inner')).toContain('max-width: var(--ccf-rv-max, 1100px)');
    expect(rule('.ccf-rv-inner')).toContain('margin: 0 auto');
  });

  it('lines and muted text are mixed from the theme text colour (light and dark themes)', () => {
    expect(rule('.ccf-rv')).toContain('--rv-line: rgba(128,128,128,.28)');
    expect(css).toContain('--rv-muted: color-mix(in srgb, currentColor 62%, transparent)');
    expect(rule('.ccf-rv-head')).toContain('border-bottom: 1px solid var(--rv-line)');
  });

  it('header: title left, Write a review right, wrapping on narrow screens', () => {
    const r = rule('.ccf-rv-head');
    expect(r).toContain('display: flex');
    expect(r).toContain('flex-wrap: wrap');
    expect(r).toContain('justify-content: space-between');
  });

  it('summary is a three-part grid that wraps by itself', () => {
    expect(rule('.ccf-rv-summary')).toContain('grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))');
    expect(css).toContain('.ccf-rv-summary[hidden], .ccf-rv-toolbar[hidden] { display: none; }');
  });

  it('stars are vector icons filled with the star colour', () => {
    expect(css).toContain('.ccf-rv-staricon.on path { fill: var(--ccf-rv-star, #141414); stroke: var(--ccf-rv-star, #141414); }');
    expect(rule('.ccf-rv-bar-fill')).toContain('background: var(--ccf-rv-star, #141414)');
  });

  it('review rows: hairline separated, details on the left, review on the right, stacking when narrow', () => {
    const r = rule('.ccf-rv-item');
    expect(r).toContain('border-bottom: 1px solid var(--rv-line)');
    expect(r).toContain('flex-wrap: wrap');
    expect(rule('.ccf-rv-meta')).toContain('flex: 1 1 200px');
    expect(rule('.ccf-rv-main')).toContain('flex: 999 1 420px');
  });

  it('pressed chip uses the button colour and its text colour', () => {
    expect(css).toContain('.ccf-rv-chip.on { background: var(--ccf-rv-accent, #141414); border-color: var(--ccf-rv-accent, #141414); color: var(--ccf-rv-accent-fg, #fff); }');
  });

  it('the button text colour follows the brand colour (set by the script)', () => {
    expect(rule('.ccf-rv-btn')).toContain('color: var(--ccf-rv-accent-fg, #fff)');
  });

  it('long names, titles and text wrap instead of overflowing', () => {
    expect(rule('.ccf-rv-name')).toContain('overflow-wrap: anywhere');
    expect(rule('.ccf-rv-title')).toContain('overflow-wrap: anywhere');
    expect(rule('.ccf-rv-body')).toContain('overflow-wrap: anywhere');
  });

  it('narrow block (class from the script) and phones (media query): full-width Write button', () => {
    expect(css).toContain('.ccf-rv--narrow .ccf-rv-cta, .ccf-rv--narrow .ccf-rv-btn--write { width: 100%; }');
    const media = css.slice(css.indexOf('@media (max-width: 720px) {'));
    expect(media).toContain('.ccf-rv .ccf-rv-cta, .ccf-rv .ccf-rv-btn--write { width: 100%; }');
  });
});

describe('pop-up pages', () => {
  it('cover the whole screen above the theme', () => {
    const r = rule('.ccf-rvm');
    expect(r).toContain('position: fixed');
    expect(r).toContain('inset: 0');
    expect(r).toContain('z-index: 2147483000');
  });

  it('the dialog is a white card, 560px wide, rounded, with a soft shadow', () => {
    const r = rule('.ccf-rvm-dialog');
    expect(r).toContain('max-width: 560px');
    expect(r).toContain('background: #FFFFFF');
    expect(r).toContain('border-radius: 16px');
    expect(r).toContain('box-shadow');
  });

  it('progress is a row of segments filled with the button colour', () => {
    expect(rule('.ccf-rvm-segs')).toContain('display: flex');
    expect(css).toContain('.ccf-rvm-seg.on { background: var(--ccf-rv-accent, #141414); }');
  });

  it('the rating stars are empty outlines until chosen', () => {
    expect(css).toContain('.ccf-rvm-star path { fill: none; stroke: #C9C5C0;');
    expect(css).toContain('.ccf-rvm-star.on path { fill: var(--ccf-rv-star, #141414); stroke: var(--ccf-rv-star, #141414); }');
  });

  it('photo tiles: 3 per row, a dashed "Add photo" tile', () => {
    expect(rule('.ccf-rvm-tiles')).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(rule('.ccf-rvm-add')).toContain('border: 1.5px dashed #C9C5C0');
    expect(rule('.ccf-rvm-file')).toContain('opacity: 0');
  });

  it('on phones it is a full-width sheet from the bottom with a grab handle, and Continue fills the row on the first step', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 640px) {'));
    expect(phone).toContain('.ccf-rvm { align-items: flex-end; padding: 0; }');
    expect(phone).toContain('border-radius: 22px 22px 0 0');
    expect(phone).toContain('animation: ccfRvmSheet');
    expect(phone).toContain('.ccf-rvm-grab { display: block;');
    expect(phone).toContain('.ccf-rvm-first .ccf-rvm-back { display: none; }');
  });

  it('every animation the script relies on exists', () => {
    ['ccfRvmFade', 'ccfRvmFadeOut', 'ccfRvmPop', 'ccfRvmSheet', 'ccfRvmStep', 'ccfRvmStepBack', 'ccfRvmSpin', 'ccfRvmDraw', 'ccfRvIn'].forEach((name) => {
      expect(css).toContain('@keyframes ' + name);
    });
    expect(rule('.ccf-rvm-in-next')).toContain('animation: ccfRvmStep ');
    expect(rule('.ccf-rvm-in-back')).toContain('animation: ccfRvmStepBack ');
  });

  it('the thank-you ring and tick are drawn with a stroke animation', () => {
    expect(rule('.ccf-rvm-okring')).toContain('stroke-dashoffset: 166');
    expect(rule('.ccf-rvm-oktick')).toContain('animation: ccfRvmDraw');
  });

  it('respects reduced motion', () => {
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {'));
    expect(rm).toContain('animation: none !important');
    expect(rm).toContain('stroke-dashoffset: 0 !important');
  });

  it('no confetti or decorative effects', () => {
    expect(css).not.toContain('ccf-rvm-conf');
    expect(css).not.toContain('linear-gradient');
  });
});

describe('reviews block (liquid)', () => {
  it('passes the product name and picture for the pop-up header', () => {
    expect(liquid).toContain('data-product-title="{{ product.title | escape }}"');
    expect(liquid).toContain('data-product-image="{{ product.featured_image | image_url: width: 120 }}"');
  });

  it('has a small label and a heading, with the approved defaults', () => {
    expect(liquid).toContain('data-eyebrow="{{ block.settings.eyebrow | escape }}"');
    expect(liquid).toMatch(/"id": "eyebrow"[^}]*"default": "Customer reviews"/);
    expect(liquid).toMatch(/"id": "heading"[^}]*"default": "What customers are saying"/);
  });

  it('defaults to black button and stars (the script swaps them on dark themes)', () => {
    expect(liquid).toMatch(/"id": "accent_color"[^}]*"default": "#141414"/);
    expect(liquid).toMatch(/"id": "star_color"[^}]*"default": "#141414"/);
    expect(liquid).toContain("--ccf-rv-accent: {{ block.settings.accent_color | default: '#141414' }}");
  });

  it('passes the maximum width, with a default, and offers 600 to 1400px', () => {
    expect(liquid).toContain('--ccf-rv-max: {{ block.settings.max_width | default: 1100 }}px');
    const i = liquid.indexOf('"id": "max_width"');
    const line = liquid.slice(i, liquid.indexOf('}', i));
    expect(line).toContain('"min": 600');
    expect(line).toContain('"max": 1400');
  });

  it('has no stylesheet tag (Shopify refuses it in app blocks) and links the css file', () => {
    expect(liquid).not.toContain('{% stylesheet');
    expect(liquid).toContain("{{ 'ccf-reviews.css' | asset_url | stylesheet_tag }}");
  });
});
