/**
 * Storefront reviews block: width handling (ccf-reviews.js).
 * jsdom has no layout, so a tiny fake layout is plugged in: the block can be inside a container that grows
 * with it (self-sizing, like some themes use) or inside a fixed column that never grows.
 * The real layout was checked in a browser in 11 kinds of containers.
 */
import path from 'path';
import { waitFor } from '@testing-library/react';

const SCRIPT = path.join(__dirname, '../../extensions/cartncodform-embed/assets/ccf-reviews.js');

const reply = { ok: true, summary: { count: 1, rated: 1, average: 5, distribution: { 5: 1 } }, reviews: [{ id: 'a', name: 'Asha', rating: 5, title: '', body: 'Lovely, would buy again.', verified: false, photos: [], helpful: 0, createdAt: '2025-03-04T10:00:00.000Z' }],
  page: 1, pages: 1,
  form: { whoCanReview: 'anyone', loggedIn: false, needsEmail: true, emailRequired: false, starRating: true, starRequired: true, photos: null, helpfulVotes: false, requireApproval: true, canReview: true, reason: null } };

// scenario: { viewport, parent: 'grows' | 'fixed', fixedWidth, contentWidth }
let scenario;
let observers;
const origRect = Element.prototype.getBoundingClientRect;

function rootWidth(root) {
  const min = parseInt(root.style.minWidth, 10) || 0;
  return Math.max(scenario.contentWidth, min);
}
function parentWidth(root) {
  return scenario.parent === 'grows' ? rootWidth(root) : scenario.fixedWidth;
}

beforeEach(() => {
  observers = [];
  scenario = { viewport: 1200, parent: 'grows', fixedWidth: 380, contentWidth: 350 };
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => scenario.viewport });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return this.hasAttribute('data-ccf-reviews') ? rootWidth(this) : 0; },
  });
  Element.prototype.getBoundingClientRect = function () {
    const root = document.querySelector('[data-ccf-reviews]');
    let width = 0;
    if (this === root) width = rootWidth(root);
    else if (root && this === root.parentElement) width = parentWidth(root);
    return { left: 20, top: 0, width, height: 0, right: 20 + width, bottom: 0, x: 20, y: 0 };
  };
  window.getComputedStyle = ((orig) => (el, ...rest) => {
    const cs = orig(el, ...rest);
    return new Proxy(cs, { get: (t, p) => (p === 'getPropertyValue' ? (name) => (name === '--ccf-rv-max' ? '1100' : t.getPropertyValue(name)) : Reflect.get(t, p)) });
  })(window.getComputedStyle);
  window.ResizeObserver = class { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} disconnect() {} };
  global.fetch = jest.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(reply) }));
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = origRect;
  delete HTMLElement.prototype.clientWidth;
  delete window.ResizeObserver;
});

async function mount() {
  document.body.innerHTML = '<div id="par"><div id="r" data-ccf-reviews data-product-id="1" data-product-handle="h" data-heading="Reviews"></div></div>';
  jest.isolateModules(() => { require(SCRIPT); });
  const root = document.getElementById('r');
  await waitFor(() => expect(root.querySelector('.ccf-rv-item')).toBeTruthy());
  return root;
}

describe('asking for room when the theme container is only as wide as the content', () => {
  it('self-sizing container + room on the page -> asks for the full width (viewport - 40, capped at the maximum)', async () => {
    const root = await mount();
    expect(root.style.minWidth).toBe('1100px');
  });

  it('a smaller viewport gets viewport - 40', async () => {
    scenario.viewport = 900;
    const root = await mount();
    expect(root.style.minWidth).toBe('860px');
  });

  it('a fixed narrow column that does not grow -> the request is taken back (no overflow)', async () => {
    scenario.parent = 'fixed';
    const root = await mount();
    expect(root.style.minWidth).toBe('');
  });

  it('already wide enough -> nothing is asked for', async () => {
    scenario.contentWidth = 1100;
    const root = await mount();
    expect(root.style.minWidth).toBe('');
  });

  it('phone-sized viewport -> nothing is asked for (the block already fills the screen)', async () => {
    scenario.viewport = 390;
    const root = await mount();
    expect(root.style.minWidth).toBe('');
  });

  it('a request that would run past the right edge of the screen is taken back', async () => {
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const r = orig.call(this);
      return this.hasAttribute && this.hasAttribute('data-ccf-reviews') ? { ...r, left: 600, right: 600 + r.width } : r;
    };
    const root = await mount();
    expect(root.style.minWidth).toBe('');
  });
});

describe('compact layout follows the block own width', () => {
  it('under 620px wide -> ccf-rv--narrow; wide -> not', async () => {
    scenario.parent = 'fixed';
    scenario.fixedWidth = 380;
    scenario.contentWidth = 380;
    let root = await mount();
    expect(root.classList.contains('ccf-rv--narrow')).toBe(true);

    scenario.parent = 'grows';
    scenario.contentWidth = 700;
    root = await mount();
    expect(root.classList.contains('ccf-rv--narrow')).toBe(false);
  });

  it('is re-checked when the block is resized', async () => {
    scenario.parent = 'fixed';
    scenario.contentWidth = 380;
    const root = await mount();
    expect(root.classList.contains('ccf-rv--narrow')).toBe(true);
    scenario.contentWidth = 900;
    scenario.parent = 'grows';
    observers.forEach((o) => o.cb());
    expect(root.classList.contains('ccf-rv--narrow')).toBe(false);
  });

  it('works without ResizeObserver (older browsers): no error, the phone media query still applies', async () => {
    delete window.ResizeObserver;
    scenario.parent = 'fixed';
    scenario.contentWidth = 380;
    const root = await mount();
    expect(root.querySelector('.ccf-rv-item')).toBeTruthy();
  });
});
