/**
 * Storefront reviews stylesheet + block: centred page layout, the pop-up pages and their animations.
 * jsdom cannot lay out CSS, so these guard the rules. The real look was checked in a browser: desktop,
 * a content-sized theme container, a 375px phone, in light and dark.
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

  it('the content is centred at a configurable maximum width inside the block', () => {
    const r = rule('.ccf-rv-inner');
    expect(r).toContain('max-width: var(--ccf-rv-max, 1100px)');
    expect(r).toContain('margin: 0 auto');
  });

  it('hero (title, rating, button), button row, cards and pager are centred', () => {
    expect(rule('.ccf-rv-hero')).toContain('justify-items: center');
    expect(rule('.ccf-rv-hero')).toContain('text-align: center');
    expect(rule('.ccf-rv-cta')).toContain('justify-items: center');
    expect(rule('.ccf-rv-list')).toContain('justify-content: center');
    expect(rule('.ccf-rv-pager')).toContain('justify-content: center');
  });

  it('the button row spans the full width so the write button can stretch on narrow blocks', () => {
    expect(rule('.ccf-rv-cta')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rule('.ccf-rv-cta')).toContain('width: 100%');
  });

  it('review cards: border, large radius, shadow, entry animation, wrap by themselves', () => {
    const r = rule('.ccf-rv-item');
    expect(r).toContain('border: 1px solid');
    expect(r).toContain('border-radius: 20px');
    expect(r).toContain('box-shadow');
    expect(r).toContain('animation: ccfRvUp');
    expect(r).toContain('flex: 1 1 320px');
    expect(r).toContain('max-width: 540px');
    expect(rule('.ccf-rv-list')).toContain('flex-wrap: wrap');
  });

  it('uses translucent greys and inherited colours so the page part fits light and dark themes', () => {
    expect(rule('.ccf-rv-item')).toContain('rgba(128,128,128');
    expect(rule('.ccf-rv-bars')).toContain('rgba(128,128,128');
    expect(rule('.ccf-rv-badge')).toContain('color: inherit');
  });

  it('long names, titles and text wrap instead of overflowing', () => {
    expect(rule('.ccf-rv-name')).toContain('overflow-wrap: anywhere');
    expect(rule('.ccf-rv-title')).toContain('overflow-wrap: anywhere');
    expect(rule('.ccf-rv-body')).toContain('overflow-wrap: anywhere');
  });

  it('the compact layout is switched by a class set from the block own width, with a phone media query as backup', () => {
    expect(css).toContain('.ccf-rv--narrow .ccf-rv-btn--write { width: 100%; }');
    expect(css).toContain('.ccf-rv--narrow .ccf-rv-who { grid-template-columns: auto minmax(0, 1fr); }');
    const media = css.slice(css.indexOf('@media (max-width: 620px) {'));
    expect(media).toContain('.ccf-rv .ccf-rv-btn--write { width: 100%; }');
    expect(media).toContain('.ccf-rv .ccf-rv-who { grid-template-columns: auto minmax(0, 1fr); }');
  });

  it('the button text colour follows the brand colour (set by the script), white by default', () => {
    expect(rule('.ccf-rv-btn')).toContain('color: var(--ccf-rv-accent-fg, #fff)');
  });
});

describe('pop-up pages', () => {
  it('cover the whole screen above the theme, with the page scroll handled by the script', () => {
    const r = rule('.ccf-rvm');
    expect(r).toContain('position: fixed');
    expect(r).toContain('inset: 0');
    expect(r).toContain('z-index: 2147483000');
  });

  it('the dialog is a rounded card with a soft shadow, scrolling inside when tall', () => {
    const r = rule('.ccf-rvm-dialog');
    expect(r).toContain('border-radius: 28px');
    expect(r).toContain('max-width: 560px');
    expect(r).toContain('max-height: min(92vh, 780px)');
    expect(rule('.ccf-rvm-stage')).toContain('overflow-y: auto');
  });

  it('has its own light and dark palette, so a theme cannot make it unreadable', () => {
    expect(rule('.ccf-rvm')).toContain('--m-bg: #ffffff');
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\n\s+\.ccf-rvm \{ --m-bg: #0f172a/);
  });

  it('a near-black brand colour gets a light button and progress bar on the dark palette', () => {
    expect(css).toContain('.ccf-rvm[data-acc="dark"] { --m-acc: #f8fafc; }');
    expect(css).toContain('.ccf-rvm[data-acc="dark"] .ccf-rv-btn:not(.ccf-rv-btn--ghost) { background: #f8fafc;');
  });

  it('on phones it becomes a full-width sheet from the bottom', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 640px) {'));
    expect(phone).toContain('.ccf-rvm { align-items: flex-end; padding: 0; }');
    expect(phone).toContain('border-radius: 26px 26px 0 0');
    expect(phone).toContain('animation: ccfRvmSheet');
    expect(phone).toContain('.ccf-rvm-next { max-width: none; }');
  });

  it('every animation the script relies on exists', () => {
    ['ccfRvmFade', 'ccfRvmFadeOut', 'ccfRvmPop', 'ccfRvmSheet', 'ccfRvmInNext', 'ccfRvmInBack', 'ccfRvmInFirst',
      'ccfRvmStarPop', 'ccfRvmShake', 'ccfRvmSpin', 'ccfRvmDraw', 'ccfRvmConf', 'ccfRvUp'].forEach((name) => {
      expect(css).toContain('@keyframes ' + name);
    });
  });

  it('pages slide in from the side you are moving towards', () => {
    expect(rule('.ccf-rvm-in-next')).toContain('animation: ccfRvmInNext');
    expect(rule('.ccf-rvm-in-back')).toContain('animation: ccfRvmInBack');
    expect(css).toMatch(/@keyframes ccfRvmInNext \{ from \{ opacity: 0; transform: translateX\(44px\)/);
    expect(css).toMatch(/@keyframes ccfRvmInBack \{ from \{ opacity: 0; transform: translateX\(-44px\)/);
  });

  it('respects reduced motion: no animation, ticks drawn at once, no confetti', () => {
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {'));
    expect(rm).toContain('animation: none !important');
    expect(rm).toContain('stroke-dashoffset: 0 !important');
    expect(rm).toContain('.ccf-rvm-conf { display: none; }');
  });

  it('the thank-you check mark and ring are drawn with a stroke animation', () => {
    expect(rule('.ccf-rvm-okring')).toContain('stroke-dashoffset: 176');
    expect(rule('.ccf-rvm-oktick')).toContain('animation: ccfRvmDraw');
  });

  it('the photo drop area, thumbnails and viewer are styled', () => {
    expect(rule('.ccf-rvm-drop')).toContain('border: 2px dashed');
    expect(rule('.ccf-rvm-file')).toContain('opacity: 0');
    expect(css).toContain('.ccf-rvm-file:focus-visible + .ccf-rvm-drop');
    expect(rule('.ccf-rvm-bigphoto')).toContain('max-height: 86vh');
  });
});

describe('reviews block (liquid)', () => {
  it('passes the maximum width to the stylesheet, with a default', () => {
    expect(liquid).toContain('--ccf-rv-max: {{ block.settings.max_width | default: 1100 }}px');
  });

  it('offers a Maximum width setting from 600 to 1400px', () => {
    const i = liquid.indexOf('"id": "max_width"');
    expect(i).toBeGreaterThan(-1);
    const line = liquid.slice(i, liquid.indexOf('}', i));
    expect(line).toContain('"min": 600');
    expect(line).toContain('"max": 1400');
    expect(line).toContain('"default": 1100');
  });

  it('has no stylesheet tag (Shopify refuses it in app blocks) and links the css file', () => {
    expect(liquid).not.toContain('{% stylesheet');
    expect(liquid).not.toContain('{%- stylesheet');
    expect(liquid).toContain("{{ 'ccf-reviews.css' | asset_url | stylesheet_tag }}");
  });
});
