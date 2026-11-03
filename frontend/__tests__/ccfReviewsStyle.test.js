/**
 * Storefront reviews stylesheet + block: centred layout that adapts to the block's own width.
 * jsdom cannot lay out CSS, so these guard the rules (the look was checked in a real browser at
 * 1180px, a 400px theme column and a 375px phone, in light and dark).
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

describe('reviews stylesheet', () => {
  it('the rules can be found by the helper (guards the helper itself)', () => {
    expect(rule('.ccf-rv-h')).toContain('text-align');
    expect(rule('.does-not-exist')).toBe('');
  });

  it('the block is centred on the page with a configurable maximum width', () => {
    const r = rule('.ccf-rv');
    expect(r).toContain('margin: 48px auto');
    expect(r).toContain('max-width: var(--ccf-rv-max, 1100px)');
    expect(r).toContain('width: 100%');
  });

  it('heading, summary card, form, review list and pager are centred', () => {
    expect(rule('.ccf-rv-h')).toContain('text-align: center');
    expect(rule('.ccf-rv-top')).toContain('margin: 0 auto');
    expect(rule('.ccf-rv-top')).toContain('text-align: center');
    expect(rule('.ccf-rv-list')).toContain('margin: 28px auto 0');
    expect(rule('.ccf-rv-form')).toContain('margin: 24px auto 0');
    expect(rule('.ccf-rv-pager')).toContain('justify-content: center');
  });

  it('reviews are cards (border, radius, padding)', () => {
    const r = rule('.ccf-rv-item');
    expect(r).toContain('border: 1px solid');
    expect(r).toContain('border-radius: 16px');
    expect(r).toContain('padding: 22px 24px');
  });

  it('REGRESSION: the block has NO size containment (it collapsed to ~40px wide in themes whose container is only as wide as its content)', () => {
    expect(css).not.toContain('container-type');
    expect(css).not.toContain('@container');
  });

  it('the block fills flex and grid parents and cannot shrink to nothing', () => {
    const r = rule('.ccf-rv');
    expect(r).toContain('align-self: stretch');
    expect(r).toContain('justify-self: stretch');
    expect(r).toContain('min-width: min(260px, calc(100vw - 40px))');
  });

  it('the compact layout is switched by a class set from the block own width, with a phone media query as backup', () => {
    expect(css).toContain('.ccf-rv--narrow .ccf-rv-sum--bars { grid-template-columns: minmax(0, 1fr); }');
    expect(css).toContain('.ccf-rv--narrow .ccf-rv-btn { width: 100%; }');
    const media = css.slice(css.indexOf('@media (max-width: 620px) {'));
    expect(media).toContain('.ccf-rv .ccf-rv-sum--bars { grid-template-columns: minmax(0, 1fr); }');
    expect(media).toContain('.ccf-rv .ccf-rv-btn { width: 100%; }');
  });

  it('the call-to-action row spans the full width so the button can stretch on narrow blocks', () => {
    expect(rule('.ccf-rv-cta')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rule('.ccf-rv-cta')).toContain('width: 100%');
  });

  it('uses translucent greys and inherited colours so it fits light and dark themes', () => {
    expect(rule('.ccf-rv-top')).toContain('rgba(128,128,128');
    expect(rule('.ccf-rv-item')).toContain('rgba(128,128,128');
    expect(rule('.ccf-rv-badge')).toContain('color: inherit');
  });

  it('long names, titles and text wrap instead of overflowing', () => {
    expect(rule('.ccf-rv-name')).toContain('overflow-wrap: anywhere');
    expect(rule('.ccf-rv-title')).toContain('overflow-wrap: anywhere');
    expect(rule('.ccf-rv-body')).toContain('overflow-wrap: anywhere');
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
