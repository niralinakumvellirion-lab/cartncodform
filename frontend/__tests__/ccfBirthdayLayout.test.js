/**
 * Storefront birthday box (ccf-bday-product.js): the closed form must take NO space.
 * With only opacity:0 it kept its full height (355px) and left a big empty gap under the teaser card.
 * Layout was verified in a real browser (box height = teaser height when closed).
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '../../extensions/cartncodform-embed/assets/ccf-bday-product.js'), 'utf8');

describe('birthday box form space', () => {
  it('the closed form is display:none, not just transparent', () => {
    expect(src).toContain("'.ccf-bp-form{display:none;}'");
    expect(src).not.toMatch(/\.ccf-bp-form\{opacity:0/);
  });

  it('the opened form is shown as a block and fades in with an animation', () => {
    expect(src).toMatch(/\.ccf-bp-form\.ccf-bp-visible\{display:block;animation:ccfFormIn/);
    expect(src).toContain('@keyframes ccfFormIn{from{opacity:0}to{opacity:1}}');
  });

  it('reduced-motion users get no fade', () => {
    expect(src).toContain("'.ccf-bp-form.ccf-bp-visible{animation:none;}'");
  });

  it('opening the teaser still adds the visible class and hides the teaser', () => {
    expect(src).toMatch(/teaserWrap\.style\.display = 'none';\s*formContainer\.classList\.add\('ccf-bp-visible'\)/);
  });
});
