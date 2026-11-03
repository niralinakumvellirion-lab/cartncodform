/**
 * Storefront quantity-tier cards (ccf-tiers.js): three tiers must stay on ONE row in a narrow product
 * column; only four tiers drop to two columns. jsdom cannot lay out container queries, so this guards
 * the rules themselves (the layout was checked in a real browser at 400px and 300px).
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '../../extensions/cartncodform-embed/assets/ccf-tiers.js'), 'utf8');

describe('tier cards layout rules', () => {
  it('four tiers go to two columns on narrow boxes', () => {
    expect(src).toMatch(/@container ccf-qt \(max-width:480px\)\{\.ccf-qt-cards-n4\{grid-template-columns:repeat\(2,/);
  });

  it('three tiers are NOT collapsed at 480px (they stay on one row)', () => {
    expect(src).not.toMatch(/max-width:480px\)\{[^}]*ccf-qt-cards-n3/);
  });

  it('three tiers only wrap in a really tiny box', () => {
    expect(src).toMatch(/@container ccf-qt \(max-width:240px\)\{\.ccf-qt-cards-n3\{grid-template-columns:repeat\(2,/);
  });

  it('cards get tighter on narrow columns, after the base card rule so the override wins', () => {
    const base = src.indexOf("'.ccf-qt-card{position:relative");
    const tight = src.indexOf('@container ccf-qt (max-width:440px)');
    expect(base).toBeGreaterThan(-1);
    expect(tight).toBeGreaterThan(base);
    expect(src).toMatch(/max-width:440px\)\{[^']*\.ccf-qt-card\{padding:20px 4px 12px\}/);
  });

  it('the badge shrinks on very narrow columns so "Most popular" is not cut off', () => {
    expect(src).toMatch(/max-width:330px\)\{\.ccf-qt-badge\{font-size:10px/);
  });
});
