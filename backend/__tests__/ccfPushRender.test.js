/**
 * @jest-environment jsdom
 *
 * Tests for the entry popup's DOM render order and primary-button visibility.
 *
 * Bug A (DOM order): discountFields (#ccf-discount-fields) is inserted AFTER
 *   deny (#ccf-deny-btn), so "No thanks" appears before the offer/form content.
 * Bug B (invisible primary button): allow.style.display='none' is set before
 *   allowStyleStr = allow.getAttribute('style') reads the attribute, so the
 *   style string includes "display: none" which is then copied onto offerBtn,
 *   making it invisible too.
 */
'use strict';

const path = require('path');
const fs = require('fs');

const SCRIPT = fs.readFileSync(
  path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-push.js'),
  'utf8',
);

const SHOP = 'test.myshopify.com';

// Email discount on, WA off — sufficient to trigger ccfCaptureMode() and
// ccfBuildDiscountFields() without needing a WA phone number.
const DISCOUNT_CONFIG = {
  emailDiscount: { enabled: true, percentage: 15 },
  pushDiscount: { enabled: false, percentage: 0 },
  phoneDiscount: { enabled: false, percentage: 0 },
  bothDiscount: { enabled: false, percentage: 0 },
  whatsappCapture: { enabled: false },
  birthdayCapture: { popup: { enabled: false } },
};

const POPUP_CONFIG = { layout: 'split', showBranding: true };

function loadScript() {
  window.__ccf_test = {};
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

// Position of el among its siblings (0-based).
function indexInParent(el) {
  let i = 0;
  let node = el.previousSibling;
  while (node) { i++; node = node.previousSibling; }
  return i;
}

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  Object.defineProperty(global.navigator, 'serviceWorker', {
    value: { register: jest.fn().mockResolvedValue({}) },
    configurable: true,
  });
});

afterAll(() => {
  delete global.fetch;
});

// ─── Scenario 1: Notification.permission === 'denied' (Chrome Incognito) ────

describe('Entry popup split layout — capture-only (Notification.permission=denied)', () => {
  let hook;

  beforeEach(async () => {
    global.Notification = { permission: 'denied', requestPermission: jest.fn() };
    hook = loadScript();
    await new Promise(r => setTimeout(r, 0));
    hook.setDiscountConfig(DISCOUNT_CONFIG);
    hook.setPopupConfig(POPUP_CONFIG);
    try { sessionStorage.clear(); } catch (_) {}
    hook.showSoftPrompt('page_load');
  });

  afterEach(() => {
    try { sessionStorage.clear(); } catch (_) {}
  });

  // Bug B: offerBtn gets display:none copied from allow's modified style attribute
  test('offerBtn (#ccf-offer-btn) is visible — not display:none', () => {
    const offerBtn = document.getElementById('ccf-offer-btn');
    expect(offerBtn).not.toBeNull();
    expect(offerBtn.style.display).not.toBe('none');
  });

  // Bug A: discountFields inserted after deny, so deny (No thanks) appears first
  test('discount fields appear before deny in DOM (Bug A)', () => {
    const fields = document.getElementById('ccf-discount-fields');
    const deny = document.getElementById('ccf-deny-btn');
    expect(fields).not.toBeNull();
    expect(deny).not.toBeNull();
    expect(fields.parentNode).toBe(deny.parentNode);
    expect(indexInParent(fields)).toBeLessThan(indexInParent(deny));
  });

  // Sanity: allow should still be hidden in capture-only mode
  test('allow button (#ccf-allow-btn) is hidden in capture-only mode', () => {
    const allowBtn = document.getElementById('ccf-allow-btn');
    expect(allowBtn).not.toBeNull();
    expect(allowBtn.style.display).toBe('none');
  });
});

// ─── Scenario 2: No Notification API (push completely unavailable) ───────────

describe('Entry popup split layout — capture-only (no Notification API)', () => {
  let hook;
  let savedNotification;

  beforeEach(async () => {
    savedNotification = global.Notification;
    delete global.Notification;
    hook = loadScript();
    await new Promise(r => setTimeout(r, 0));
    hook.setDiscountConfig(DISCOUNT_CONFIG);
    hook.setPopupConfig(POPUP_CONFIG);
    try { sessionStorage.clear(); } catch (_) {}
    hook.showSoftPrompt('page_load');
  });

  afterEach(() => {
    if (savedNotification) global.Notification = savedNotification;
    try { sessionStorage.clear(); } catch (_) {}
  });

  test('offerBtn visible when Notification API absent', () => {
    const offerBtn = document.getElementById('ccf-offer-btn');
    expect(offerBtn).not.toBeNull();
    expect(offerBtn.style.display).not.toBe('none');
  });

  test('discount fields appear before deny when Notification API absent', () => {
    const fields = document.getElementById('ccf-discount-fields');
    const deny = document.getElementById('ccf-deny-btn');
    expect(fields).not.toBeNull();
    expect(deny).not.toBeNull();
    expect(indexInParent(fields)).toBeLessThan(indexInParent(deny));
  });
});

// ─── Scenario 3: Push available (Notification.permission === 'default') ─────

describe('Entry popup split layout — push available (permission=default)', () => {
  let hook;

  beforeEach(async () => {
    global.Notification = { permission: 'default', requestPermission: jest.fn() };
    hook = loadScript();
    await new Promise(r => setTimeout(r, 0));
    hook.setDiscountConfig(DISCOUNT_CONFIG);
    hook.setPopupConfig(POPUP_CONFIG);
    try { sessionStorage.clear(); } catch (_) {}
    hook.showSoftPrompt('page_load');
  });

  afterEach(() => {
    try { sessionStorage.clear(); } catch (_) {}
  });

  test('allow button is visible when push available', () => {
    const allowBtn = document.getElementById('ccf-allow-btn');
    expect(allowBtn).not.toBeNull();
    expect(allowBtn.style.display).not.toBe('none');
  });

  // Bug A affects all split layout renders, not just capture-only
  test('discount fields appear before deny when push available (Bug A)', () => {
    const fields = document.getElementById('ccf-discount-fields');
    const deny = document.getElementById('ccf-deny-btn');
    expect(fields).not.toBeNull();
    expect(deny).not.toBeNull();
    expect(fields.parentNode).toBe(deny.parentNode);
    expect(indexInParent(fields)).toBeLessThan(indexInParent(deny));
  });
});
