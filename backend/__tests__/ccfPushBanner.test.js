/**
 * @jest-environment jsdom
 *
 * jsdom tests for the announcement banner in ccf-push.js.
 * Covers: render from cache, in-place update, removal when disabled,
 * first visit without cache, colour resolution, highlight on/off,
 * animation CSS, dismiss/aria-expanded/Escape, localStorage throws.
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const SCRIPT = fs.readFileSync(
  path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-push.js'),
  'utf8',
);

const SHOP = 'test.myshopify.com';
const BN_CACHE_KEY = 'ccf_bn_cfg_v1';
const BDAY_KEY     = 'ccf_bday_' + SHOP;
const DISMISS_KEY  = 'ccf_bday_dismiss_' + SHOP;

function loadScript(lsInit = {}) {
  window.__ccf_test = {};
  window.Shopify = { shop: SHOP }; // ensures SHOP_DOMAIN = SHOP

  // Pre-populate localStorage
  localStorage.clear();
  for (const [k, v] of Object.entries(lsInit)) {
    localStorage.setItem(k, v);
  }

  document.head.innerHTML = '';
  document.body.innerHTML = '';

  const root = document.createElement('div');
  root.id = 'ccf-embed-root';
  root.setAttribute('data-shop', SHOP);
  document.body.appendChild(root);

  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)();
  return window.__ccf_test;
}

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  global.Notification = { permission: 'default', requestPermission: jest.fn() };
  Object.defineProperty(global.navigator, 'serviceWorker', {
    value: { register: jest.fn().mockResolvedValue({}) },
    configurable: true,
  });
});

afterAll(() => {
  delete global.fetch;
  delete global.Notification;
});

function enabledCfg(overrides = {}) {
  return {
    birthdayCapture: {
      banner: Object.assign(
        { enabled: true, text: 'Birthday deal', buttonText: 'Claim', dismissDays: 7,
          bgColor: '#3730A3', textColor: 'auto', highlight: true },
        overrides
      ),
    },
    birthdayDiscount: { percentage: 20 },
  };
}

// ─── 1. Render from localStorage cache ───────────────────────────────────────
test('bannerCreate renders the bar when called with enabled config', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg());
  expect(document.getElementById('ccf-bday-bar-wrap')).not.toBeNull();
});

// ─── 2. In-place update ───────────────────────────────────────────────────────
test('bannerApplyConfig updates CSS props in-place without re-creating the bar', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg({ bgColor: '#3730A3' }));
  const wrap1 = document.getElementById('ccf-bday-bar-wrap');
  expect(wrap1).not.toBeNull();

  hook.bannerApplyConfig(enabledCfg({ bgColor: '#171A22', textColor: 'white', text: 'New text' }));

  const wrap2 = document.getElementById('ccf-bday-bar-wrap');
  expect(wrap2).toBe(wrap1); // same node
  const refs = hook.getBannerRefs();
  expect(refs.bar.style.getPropertyValue('--ccf-bn-bg')).toBe('#171A22');
  expect(refs.text.textContent).toBe('New text');
});

// ─── 3. Removed when fresh says disabled ─────────────────────────────────────
test('bannerApplyConfig removes bar when banner disabled', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg());
  expect(document.getElementById('ccf-bday-bar-wrap')).not.toBeNull();

  hook.bannerApplyConfig({ birthdayCapture: { banner: { enabled: false } } });
  expect(document.getElementById('ccf-bday-bar-wrap')).toBeNull();
});

// ─── 4. First visit without cache returns false ────────────────────────────────
test('bannerCreate returns false when birthday already saved', () => {
  const hook = loadScript({ [BDAY_KEY]: '1' });
  const result = hook.bannerCreate(enabledCfg());
  expect(result).toBe(false);
  expect(document.getElementById('ccf-bday-bar-wrap')).toBeNull();
});

// ─── 5. Colour resolution — 5 preset backgrounds ─────────────────────────────
const COLOR_CASES = [
  { bgColor: '#F5C542', textColor: 'auto', expectFg: '#171A22', desc: 'Gold → dark fg' },
  { bgColor: '#171A22', textColor: 'auto', expectFg: '#FFFFFF', desc: 'Charcoal → white fg' },
  { bgColor: '#3730A3', textColor: 'auto', expectFg: '#FFFFFF', desc: 'Indigo → white fg' },
  { bgColor: '#0F5132', textColor: 'auto', expectFg: '#FFFFFF', desc: 'Forest → white fg' },
  { bgColor: '#B4472B', textColor: 'auto', expectFg: '#FFFFFF', desc: 'Terracotta → white fg' },
];

for (const { bgColor, textColor, expectFg, desc } of COLOR_CASES) {
  test(`resolveBannerColors: ${desc}`, () => {
    const hook = loadScript();
    const { fg } = hook.resolveBannerColors({ bgColor, textColor });
    expect(fg).toBe(expectFg);
  });
}

// ─── 6. CTA pill inverse ──────────────────────────────────────────────────────
test('CTA pill: white fg → ctaBg=#FFFFFF ctaFg=bg', () => {
  const hook = loadScript();
  const { ctaBg, ctaFg, bg } = hook.resolveBannerColors({ bgColor: '#3730A3', textColor: 'auto' });
  expect(ctaBg).toBe('#FFFFFF');
  expect(ctaFg).toBe(bg);
});

test('CTA pill: dark fg → ctaBg=#171A22 ctaFg=#FFFFFF', () => {
  const hook = loadScript();
  const { ctaBg, ctaFg } = hook.resolveBannerColors({ bgColor: '#F5C542', textColor: 'auto' });
  expect(ctaBg).toBe('#171A22');
  expect(ctaFg).toBe('#FFFFFF');
});

// ─── 7. Highlight on/off — text class ────────────────────────────────────────
test('highlight:true adds ccf-bn-txt-on class to text span', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg({ highlight: true }));
  const textEl = document.querySelector('.ccf-bn-text');
  expect(textEl).not.toBeNull();
  expect(textEl.classList.contains('ccf-bn-txt-on')).toBe(true);
});

test('highlight:false does not add ccf-bn-txt-on class', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg({ highlight: false }));
  const textEl = document.querySelector('.ccf-bn-text');
  expect(textEl).not.toBeNull();
  expect(textEl.classList.contains('ccf-bn-txt-on')).toBe(false);
});

test('bannerApplyConfig in-place toggles ccf-bn-txt-on without recreating textEl', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg({ highlight: true }));
  const textEl1 = document.querySelector('.ccf-bn-text');
  expect(textEl1.classList.contains('ccf-bn-txt-on')).toBe(true);

  hook.bannerApplyConfig(enabledCfg({ highlight: false }));
  const textEl2 = document.querySelector('.ccf-bn-text');
  expect(textEl2).toBe(textEl1); // same DOM node
  expect(textEl2.classList.contains('ccf-bn-txt-on')).toBe(false);

  hook.bannerApplyConfig(enabledCfg({ highlight: true }));
  expect(document.querySelector('.ccf-bn-text')).toBe(textEl1);
  expect(textEl1.classList.contains('ccf-bn-txt-on')).toBe(true);
});

// ─── 8. CSS — @supports, txtsweep keyframes, reduced-motion ─────────────────
test('injected CSS contains prefers-reduced-motion rule', () => {
  const hook = loadScript();
  hook.injectBannerStyles();
  const styleEl = document.getElementById('ccf-bn-styles');
  expect(styleEl).not.toBeNull();
  expect(styleEl.textContent).toContain('prefers-reduced-motion');
});

test('injected CSS uses background-position for text sweep animation', () => {
  const hook = loadScript();
  hook.injectBannerStyles();
  const styleEl = document.getElementById('ccf-bn-styles');
  expect(styleEl.textContent).toContain('ccf-bn-txtsweep');
  expect(styleEl.textContent).toContain('background-position');
});

test('injected CSS wraps txt-on in @supports background-clip:text', () => {
  const hook = loadScript();
  hook.injectBannerStyles();
  const styleEl = document.getElementById('ccf-bn-styles');
  expect(styleEl.textContent).toContain('@supports');
  expect(styleEl.textContent).toContain('background-clip');
});

// ─── 8b. resolveBannerColors hl field ────────────────────────────────────────
test('resolveBannerColors: Indigo → hl is #FFE08A', () => {
  const hook = loadScript();
  const { hl } = hook.resolveBannerColors({ bgColor: '#3730A3', textColor: 'auto' });
  expect(hl).toBe('#FFE08A');
});

test('resolveBannerColors: Gold (dark fg) → hl matches mix(#171A22, bg, 0.35) = 65% fg + 35% bg', () => {
  const hook = loadScript();
  const { hl } = hook.resolveBannerColors({ bgColor: '#F5C542', textColor: 'auto' });
  expect(hl).toBe('#65562d');
});

test('resolveBannerColors: hl parity with backend bannerColors.js', () => {
  const { resolveBannerColors: backendResolve } = require('../utils/bannerColors');
  const hook = loadScript();
  const CASES = ['#3730A3','#171A22','#0F5132','#B4472B','#F5C542'];
  for (const bg of CASES) {
    const storefront = hook.resolveBannerColors({ bgColor: bg, textColor: 'auto' });
    const backend = backendResolve({ bgColor: bg, textColor: 'auto' });
    expect(storefront.hl).toBe(backend.hl);
  }
});

// ─── 9. Dismiss: sets dismiss key and removes bar ─────────────────────────────
test('dismiss button sets dismiss key and removes bar', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg());
  const dismissBtn = document.querySelector('.ccf-bn-dismiss');
  expect(dismissBtn).not.toBeNull();
  dismissBtn.click();
  expect(document.getElementById('ccf-bday-bar-wrap')).toBeNull();
  expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull();
});

// ─── 10. aria-expanded toggles on CTA click ───────────────────────────────────
test('CTA button aria-expanded toggles on click', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg());
  const cta = document.querySelector('.ccf-bn-cta');
  expect(cta.getAttribute('aria-expanded')).toBe('false');
  cta.click();
  expect(cta.getAttribute('aria-expanded')).toBe('true');
});

// ─── 11. Escape key closes panel ──────────────────────────────────────────────
test('Escape key closes open panel', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg());
  const cta = document.querySelector('.ccf-bn-cta');
  cta.click();
  expect(cta.getAttribute('aria-expanded')).toBe('true');
  const evt = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  document.dispatchEvent(evt);
  expect(cta.getAttribute('aria-expanded')).toBe('false');
});

// ─── 12. ccfInjectBannerStyles is idempotent ──────────────────────────────────
test('ccfInjectBannerStyles does not duplicate style tag', () => {
  const hook = loadScript();
  hook.injectBannerStyles();
  hook.injectBannerStyles();
  hook.injectBannerStyles();
  expect(document.querySelectorAll('#ccf-bn-styles').length).toBe(1);
});

// ─── 13. Bar inserted as first child of body ──────────────────────────────────
test('bar wrap is inserted as first child of body', () => {
  const hook = loadScript();
  hook.bannerCreate(enabledCfg());
  expect(document.body.firstChild && document.body.firstChild.id).toBe('ccf-bday-bar-wrap');
});

// ─── 14. bannerCreate returns false and does not throw when localStorage throws ─
test('bannerCreate is safe when localStorage throws', () => {
  const hook = loadScript();
  // Patch localStorage to throw
  const orig = { getItem: localStorage.getItem.bind(localStorage), setItem: localStorage.setItem.bind(localStorage) };
  localStorage.getItem = () => { throw new Error('blocked'); };
  localStorage.setItem = () => { throw new Error('blocked'); };
  let result;
  expect(() => { result = hook.bannerCreate(enabledCfg()); }).not.toThrow();
  // Restore
  localStorage.getItem = orig.getItem;
  localStorage.setItem = orig.setItem;
});
