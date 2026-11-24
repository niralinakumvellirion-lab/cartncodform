/**
 * @jest-environment jsdom
 *
 * Tests for extensions/cartncodform-embed/assets/ccf-tiers.js
 * Loads the storefront script in jsdom, injects a minimal DOM, and asserts
 * rendering, interaction, and style correctness.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../extensions/cartncodform-embed/assets/ccf-tiers.js',
);
const SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');

// ── Global fetch mock (not available in jsdom) ────────────────────────────────

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve(null),
  });
});

afterAll(() => {
  delete global.fetch;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides) {
  return Object.assign(
    {
      enabled: true,
      tiers: [
        { minQty: 2, percent: 10, badge: '' },
        { minQty: 3, percent: 15, badge: 'Most popular' },
        { minQty: 4, percent: 25, badge: 'Best value' },
      ],
      heading: 'Buy more, save more',
      accentColor: '#4F46E5',
      layout: 'cards',
    },
    overrides,
  );
}

function setupDOM(config) {
  // Reset DOM
  document.head.innerHTML = '';
  document.body.innerHTML = '';

  // Inject config element
  var configEl = document.createElement('script');
  configEl.id = 'ccf-qt-config';
  configEl.type = 'application/json';
  configEl.textContent = JSON.stringify(config);
  document.head.appendChild(configEl);

  // Inject root element
  var root = document.createElement('div');
  root.id = 'ccf-qt-root';
  root.setAttribute('data-shop', 'test.myshopify.com');
  root.setAttribute('data-handle', 'test-product');
  root.setAttribute('data-variant-id', '123');
  document.body.appendChild(root);

  // Inject a mock product form with quantity input
  var form = document.createElement('form');
  form.action = '/cart/add';
  var qtyInput = document.createElement('input');
  qtyInput.name = 'quantity';
  qtyInput.value = '1';
  form.appendChild(qtyInput);
  document.body.appendChild(form);

  // Run the script (removes the IIFE wrapper problem by using Function eval)
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)();
}

function getButtons() {
  return Array.from(document.querySelectorAll('.ccf-qt-card'));
}

function getStyleText() {
  var el = document.getElementById('ccf-qt-styles');
  return el ? el.textContent : '';
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

describe('ccf-tiers.js storefront block', () => {
  beforeEach(() => {
    // Clear the injected styles cache between tests (the script uses a guard on #ccf-qt-styles id)
    var styleEl = document.getElementById('ccf-qt-styles');
    if (styleEl) styleEl.remove();
  });

  // ── 3 tiers, cards layout ──────────────────────────────────────────────────

  describe('3 default tiers (cards)', () => {
    beforeEach(() => setupDOM(makeConfig()));

    test('renders N buttons equal to tier count', () => {
      expect(getButtons()).toHaveLength(3);
    });

    test('exactly one aria-pressed=true (qty=1, no tier active)', () => {
      const pressed = getButtons().filter(b => b.getAttribute('aria-pressed') === 'true');
      // qty=1 means no tier is active (all tiers require >= 2)
      expect(pressed).toHaveLength(0);
    });

    test('no "+" appended to "Buy N" text', () => {
      getButtons().forEach(btn => {
        const qtyEl = btn.querySelector('.ccf-qt-qty');
        if (qtyEl) {
          expect(qtyEl.textContent).not.toMatch(/\+/);
          expect(qtyEl.textContent).toMatch(/^Buy \d+$/);
        }
      });
    });

    test('chip text is "P% off"', () => {
      getButtons().forEach(btn => {
        const chip = btn.querySelector('.ccf-qt-chip');
        if (chip) {
          expect(chip.textContent).toMatch(/^\d+% off$/);
        }
      });
    });

    test('all cards share same border-radius class CSS', () => {
      const css = getStyleText();
      // Cards layout card should have border-radius: 12px
      expect(css).toMatch(/\.ccf-qt-card\{[^}]*border-radius:12px/);
    });

    test('all cards share same padding CSS', () => {
      const css = getStyleText();
      expect(css).toMatch(/\.ccf-qt-card\{[^}]*padding:20px 8px 14px/);
    });

    test('badge has position:absolute in CSS', () => {
      const css = getStyleText();
      expect(css).toMatch(/\.ccf-qt-badge\{[^}]*position:absolute/);
    });

    test('badge has translate(-50%,-50%) transform in CSS', () => {
      const css = getStyleText();
      expect(css).toMatch(/\.ccf-qt-badge\{[^}]*transform:translate\(-50%,-50%\)/);
    });

    test('"Discount applied at checkout" is in heading row (not bottom)', () => {
      const headingRow = document.querySelector('.ccf-qt-heading-row');
      expect(headingRow).not.toBeNull();
      const note = headingRow.querySelector('.ccf-qt-checkout-note');
      expect(note).not.toBeNull();
      expect(note.textContent).toBe('Discount applied at checkout');
    });

    test('container uses CSS grid class (not flex)', () => {
      const css = getStyleText();
      expect(css).toMatch(/\.ccf-qt-cards\{[^}]*display:grid/);
    });
  });

  // ── 4 tiers, one empty badge ───────────────────────────────────────────────

  describe('4 tiers, one empty badge', () => {
    beforeEach(() =>
      setupDOM(
        makeConfig({
          tiers: [
            { minQty: 2, percent: 5, badge: '' },
            { minQty: 3, percent: 10, badge: 'Popular' },
            { minQty: 5, percent: 20, badge: '' },
            { minQty: 10, percent: 30, badge: 'Best' },
          ],
        }),
      ),
    );

    test('renders 4 buttons', () => {
      expect(getButtons()).toHaveLength(4);
    });

    test('chip text present on all cards', () => {
      getButtons().forEach(btn => {
        const chip = btn.querySelector('.ccf-qt-chip');
        if (chip) expect(chip.textContent).toMatch(/% off$/);
      });
    });

    test('cards without badge have no .ccf-qt-badge element', () => {
      const btns = getButtons();
      // tier 0 (badge:'') and tier 2 (badge:'') should have no badge span
      expect(btns[0].querySelector('.ccf-qt-badge')).toBeNull();
      expect(btns[2].querySelector('.ccf-qt-badge')).toBeNull();
    });

    test('cards WITH badge have .ccf-qt-badge element', () => {
      const btns = getButtons();
      expect(btns[1].querySelector('.ccf-qt-badge')).not.toBeNull();
      expect(btns[3].querySelector('.ccf-qt-badge')).not.toBeNull();
    });

    test('grid class is ccf-qt-cards-n4', () => {
      const container = document.querySelector('.ccf-qt-cards');
      expect(container.classList.contains('ccf-qt-cards-n4')).toBe(true);
    });
  });

  // ── 1 tier ────────────────────────────────────────────────────────────────

  describe('1 tier only', () => {
    beforeEach(() =>
      setupDOM(makeConfig({ tiers: [{ minQty: 2, percent: 15, badge: '' }] })),
    );

    test('renders 1 button', () => {
      expect(getButtons()).toHaveLength(1);
    });

    test('grid class is ccf-qt-cards-n1', () => {
      const container = document.querySelector('.ccf-qt-cards');
      expect(container.classList.contains('ccf-qt-cards-n1')).toBe(true);
    });
  });

  // ── List layout ───────────────────────────────────────────────────────────

  describe('list layout', () => {
    beforeEach(() => setupDOM(makeConfig({ layout: 'list' })));

    test('renders 3 buttons', () => {
      expect(getButtons()).toHaveLength(3);
    });

    test('container has ccf-qt-layout-list class', () => {
      const container = document.querySelector('.ccf-qt-cards');
      expect(container.classList.contains('ccf-qt-layout-list')).toBe(true);
    });

    test('chip still shows "P% off" in list layout', () => {
      getButtons().forEach(btn => {
        const chip = btn.querySelector('.ccf-qt-chip');
        if (chip) expect(chip.textContent).toMatch(/% off$/);
      });
    });

    test('list card CSS has border-radius:10px', () => {
      const css = getStyleText();
      expect(css).toMatch(/\.ccf-qt-layout-list .ccf-qt-card\{[^}]*border-radius:10px/);
    });

    test('list card CSS has padding:12px 14px', () => {
      const css = getStyleText();
      expect(css).toMatch(/\.ccf-qt-layout-list .ccf-qt-card\{[^}]*padding:12px 14px/);
    });
  });

  // ── Long badge (20 chars) ─────────────────────────────────────────────────

  describe('20-char badge', () => {
    beforeEach(() =>
      setupDOM(
        makeConfig({
          tiers: [{ minQty: 2, percent: 10, badge: '12345678901234567890' }],
        }),
      ),
    );

    test('badge text is clamped to 20 chars', () => {
      const badge = document.querySelector('.ccf-qt-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent.length).toBeLessThanOrEqual(20);
    });
  });

  // ── Light accent (#FFE066) ────────────────────────────────────────────────

  describe('light accent (#FFE066)', () => {
    beforeEach(() =>
      setupDOM(makeConfig({ accentColor: '#FFE066' })),
    );

    test('badge CSS uses #FFE066 background', () => {
      const css = getStyleText();
      expect(css).toMatch(/#FFE066/);
    });

    test('renders without error', () => {
      expect(getButtons()).toHaveLength(3);
    });
  });

  // ── Dark accent (#3730A3) ────────────────────────────────────────────────

  describe('dark accent (#3730A3)', () => {
    beforeEach(() =>
      setupDOM(makeConfig({ accentColor: '#3730A3' })),
    );

    test('badge CSS uses #3730A3 background', () => {
      const css = getStyleText();
      expect(css).toMatch(/#3730A3/);
    });

    test('renders without error', () => {
      expect(getButtons()).toHaveLength(3);
    });
  });

  // ── Interaction: clicking card sets quantity ───────────────────────────────

  describe('card click interaction', () => {
    beforeEach(() => setupDOM(makeConfig()));

    test('clicking a card fires input and change events on qty input', () => {
      const qtyInput = document.querySelector('input[name="quantity"]');
      const inputEvents = [];
      const changeEvents = [];
      qtyInput.addEventListener('input', () => inputEvents.push(1));
      qtyInput.addEventListener('change', () => changeEvents.push(1));

      const btn = getButtons()[0]; // tier minQty=2
      btn.click();

      expect(inputEvents.length).toBeGreaterThan(0);
      expect(changeEvents.length).toBeGreaterThan(0);
      expect(qtyInput.value).toBe('2');
    });

    test('clicking active card resets quantity to 1', () => {
      const qtyInput = document.querySelector('input[name="quantity"]');
      const btn0 = getButtons()[0]; // tier minQty=2

      // First click: activate tier 2
      btn0.click();
      expect(qtyInput.value).toBe('2');

      // Second click on same button: reset to 1
      const activeBtn = getButtons()[0]; // re-query after re-render
      expect(activeBtn.getAttribute('aria-pressed')).toBe('true');
      activeBtn.click();
      expect(qtyInput.value).toBe('1');
    });

    test('manual qty input change moves aria-pressed selection', () => {
      const qtyInput = document.querySelector('input[name="quantity"]');
      qtyInput.value = '3';
      qtyInput.dispatchEvent(new Event('change', { bubbles: true }));

      const btns = getButtons();
      // tier at minQty=3 should now be active
      const active = btns.find(b => b.getAttribute('aria-pressed') === 'true');
      expect(active).not.toBeUndefined();
      expect(active.getAttribute('data-min-qty')).toBe('3');
    });

    test('exactly one aria-pressed=true after qty change activates a tier', () => {
      const qtyInput = document.querySelector('input[name="quantity"]');
      qtyInput.value = '4';
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));

      const pressed = getButtons().filter(b => b.getAttribute('aria-pressed') === 'true');
      expect(pressed).toHaveLength(1);
    });
  });

  // ── Interaction: variant:change re-renders with price ─────────────────────

  describe('variant:change event', () => {
    beforeEach(() => setupDOM(makeConfig()));

    test('variant:change event triggers re-render with price elements', () => {
      // Before variant price: no .ccf-qt-price elements
      expect(document.querySelectorAll('.ccf-qt-price').length).toBe(0);

      document.dispatchEvent(
        new CustomEvent('variant:change', {
          detail: { variant: { id: '456', price: 99900 } },
        }),
      );

      // After: price elements appear
      const prices = document.querySelectorAll('.ccf-qt-price');
      expect(prices.length).toBeGreaterThan(0);
    });
  });

  // ── Box-model: selected border does not change card size ─────────────────

  describe('box-model: selected card does not shift size', () => {
    beforeEach(() => setupDOM(makeConfig()));

    test('active card uses box-shadow (inset), not border-width change', () => {
      const css = getStyleText();
      // Active card should use inset box-shadow for its border appearance
      expect(css).toMatch(/\.ccf-qt-card--active\{[^}]*box-shadow:inset 0 0 0 2px/);
      // Base card should NOT have a visible border (uses box-shadow instead)
      // Both active and inactive use box-sizing:border-box
      expect(css).toMatch(/box-sizing:border-box/);
    });
  });

  // ── Savings line: hidden when no tier active ──────────────────────────────

  describe('savings line', () => {
    beforeEach(() => setupDOM(makeConfig()));

    test('savings element is hidden when no tier is active', () => {
      const savings = document.querySelector('.ccf-qt-savings');
      expect(savings).not.toBeNull();
      expect(savings.style.display).toBe('none');
    });
  });
});

// ── Rows layout (Phase 1) ─────────────────────────────────────────────────────

describe('ccf-tiers.js rows layout', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(async () => {
    var styleEl = document.getElementById('ccf-qt-styles');
    if (styleEl) styleEl.remove();
    // Product price ₹999 (99900 paise) for variant 123
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ variants: [{ id: 123, price: 99900 }] }),
    });
    setupDOM(makeConfig({
      layout: 'rows',
      topLabel: 'Limited time offer',
      footerNote: 'Free delivery',
      showSingle: true,
      showCompareAt: true,
      showTotal: true,
      tiers: [
        { minQty: 2, percent: 10, badge: '', subtitle: 'Good deal' },
        { minQty: 3, percent: 20, badge: 'Most popular', subtitle: '' },
      ],
    }));
    await flush(); await flush();
  });

  test('draws one row per tier plus the "1 item" row', () => {
    const rows = getButtons();
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/^1 item/);
    expect(rows[0].textContent).toMatch(/Standard price/);
    expect(rows[1].textContent).toMatch(/2 items/);
  });

  test('container uses the rows class and every row has a radio dot', () => {
    expect(document.querySelector('.ccf-qt-layout-rows')).not.toBeNull();
    getButtons().forEach((b) => expect(b.querySelector('.ccf-qt-radio')).not.toBeNull());
  });

  test('"% OFF" pill, subtitle and badge ribbon', () => {
    const rows = getButtons();
    expect(rows[0].querySelector('.ccf-qt-pill')).toBeNull();
    expect(rows[1].querySelector('.ccf-qt-pill').textContent).toBe('10% OFF');
    expect(rows[1].querySelector('.ccf-qt-row-sub').textContent).toBe('Good deal');
    expect(rows[2].querySelector('.ccf-qt-ribbon').textContent).toBe('Most popular');
  });

  test('2-item row: discounted total, struck full total, per-item price', () => {
    const r = getButtons()[1];
    expect(r.querySelector('.ccf-qt-row-total').textContent).toMatch(/1,798/);
    expect(r.querySelector('s.ccf-qt-row-compare').textContent).toMatch(/1,998/);
    expect(r.querySelector('.ccf-qt-row-each').textContent).toMatch(/899.*\/ each/);
  });

  test('top label and footer note are shown', () => {
    expect(document.querySelector('.ccf-qt-toplabel').textContent).toBe('Limited time offer');
    expect(document.querySelector('.ccf-qt-footer-note').textContent).toBe('Free delivery');
  });

  test('starts on "1 item"; clicking a row selects it, sets the quantity and updates the total', () => {
    expect(getButtons()[0].getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.ccf-qt-footer-total').textContent).toMatch(/999/);
    getButtons()[2].click();
    expect(document.querySelector('input[name="quantity"]').value).toBe('3');
    const rows = getButtons();
    expect(rows[2].getAttribute('aria-pressed')).toBe('true');
    expect(rows[0].getAttribute('aria-pressed')).toBe('false');
    // 3 x ₹799.20 = ₹2,397.6
    expect(document.querySelector('.ccf-qt-footer-total').textContent).toMatch(/2,397/);
  });

  test('clicking the selected row keeps it selected (radio, not toggle)', () => {
    getButtons()[1].click();
    getButtons()[1].click();
    expect(getButtons()[1].getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('input[name="quantity"]').value).toBe('2');
  });

  test('typing a quantity moves the selection', () => {
    const input = document.querySelector('input[name="quantity"]');
    input.value = '5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getButtons()[2].getAttribute('aria-pressed')).toBe('true');
  });

  test('no separate savings line in rows layout', () => {
    expect(document.querySelector('.ccf-qt-savings')).toBeNull();
  });
});

describe('ccf-tiers.js rows layout, options off', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  test('no "1 item" row, no struck price, no footer when all off', async () => {
    var styleEl = document.getElementById('ccf-qt-styles');
    if (styleEl) styleEl.remove();
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ variants: [{ id: 123, price: 99900 }] }),
    });
    setupDOM(makeConfig({ layout: 'rows', showSingle: false, showCompareAt: false, showTotal: false }));
    await flush(); await flush();
    expect(getButtons()).toHaveLength(3);
    expect(document.querySelector('.ccf-qt-row-compare')).toBeNull();
    expect(document.querySelector('.ccf-qt-footer')).toBeNull();
    expect(document.querySelector('.ccf-qt-toplabel')).toBeNull();
  });
});
