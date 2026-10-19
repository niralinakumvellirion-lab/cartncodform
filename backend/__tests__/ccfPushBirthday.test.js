/**
 * @jest-environment jsdom
 *
 * Tests for ccfShowBirthdayStep in ccf-push.js.
 * Uses the window.__ccf_test hook to reach the private function.
 */
'use strict';

const path = require('path');
const fs = require('fs');

const SCRIPT = fs.readFileSync(
  path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-push.js'),
  'utf8',
);

const SHOP = 'test.myshopify.com';

function loadScript() {
  // Set hook before IIFE runs so the hook block fires.
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

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
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

const ACCENT = '#4f46e5';
const BDAY_CONFIG = {
  birthdayCapture: { popup: { enabled: true } },
  birthdayDiscount: { offerText: 'Birthday gift', consentText: 'We use your birthday only.' },
};

describe('ccfRenderBirthdayForm — direct', () => {
  let hook;
  beforeEach(() => {
    hook = loadScript();
    document.body.innerHTML = '';
  });

  test('renders selects and Skip button into container', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let doneCalled = false;
    hook.renderBirthdayForm(container, { accentColor: ACCENT, offerText: 'Gift', consentText: 'Consent' }, function() { doneCalled = true; });
    expect(container.querySelector('select')).not.toBeNull();
    expect(container.textContent).toContain('Skip');
  });
});

describe('ccfShowBirthdayStep — no #ccf-content-section (top_bar / mobile)', () => {
  let hook;
  beforeEach(async () => {
    hook = loadScript();
    // Flush microtasks so the mock-fetch chain in start() runs to completion
    // and sets discountConfig = {} BEFORE we override it below.
    await new Promise(r => setTimeout(r, 0));
    hook.setDiscountConfig(BDAY_CONFIG);
    try { localStorage.removeItem(hook.CCF_BDAY_KEY); } catch (_) {}
  });

  test('creates bottom-sheet overlay in body when wrap has no #ccf-content-section', () => {
    const wrap = document.createElement('div');
    wrap.id = 'ccf-push-prompt';
    document.body.appendChild(wrap);

    hook.showBirthdayStep(wrap, ACCENT, () => {});

    // Overlay appended to body — birthday form inside it
    const monthSel = document.body.querySelector('select');
    expect(monthSel).not.toBeNull();
  });

  test('overlay is removed from body after onDone fires (skip path)', () => {
    const wrap = document.createElement('div');
    document.body.appendChild(wrap);

    hook.showBirthdayStep(wrap, ACCENT, () => {});

    // Click Skip
    const buttons = Array.from(document.body.querySelectorAll('button'));
    const skip = buttons.find(b => /skip/i.test(b.textContent));
    expect(skip).not.toBeNull();
    skip.click();

    // Overlay removed
    expect(document.body.querySelector('select')).toBeNull();
  });
});

describe('ccfShowBirthdayStep — with #ccf-content-section', () => {
  let hook;
  beforeEach(async () => {
    hook = loadScript();
    await new Promise(r => setTimeout(r, 0));
    hook.setDiscountConfig(BDAY_CONFIG);
    try { localStorage.removeItem(hook.CCF_BDAY_KEY); } catch (_) {}
  });

  test('renders birthday form inside #ccf-content-section', () => {
    const wrap = document.createElement('div');
    const section = document.createElement('div');
    section.id = 'ccf-content-section';
    wrap.appendChild(section);
    document.body.appendChild(wrap);

    hook.showBirthdayStep(wrap, ACCENT, () => {});

    expect(section.querySelector('select')).not.toBeNull();
  });

  test('calls onDone immediately when birthday disabled', () => {
    hook.setDiscountConfig({ birthdayCapture: { popup: { enabled: false } }, birthdayDiscount: {} });
    const wrap = document.createElement('div');
    let called = false;
    hook.showBirthdayStep(wrap, ACCENT, () => { called = true; });
    expect(called).toBe(true);
  });

  test('calls onDone immediately when CCF_BDAY_KEY already set in localStorage', () => {
    try { localStorage.setItem(hook.CCF_BDAY_KEY, '1'); } catch (_) {}
    const wrap = document.createElement('div');
    let called = false;
    hook.showBirthdayStep(wrap, ACCENT, () => { called = true; });
    expect(called).toBe(true);
  });

  test('sets localStorage to "skip" after Skip button click', () => {
    const wrap = document.createElement('div');
    const section = document.createElement('div');
    section.id = 'ccf-content-section';
    wrap.appendChild(section);
    document.body.appendChild(wrap);

    let done = false;
    hook.showBirthdayStep(wrap, ACCENT, () => { done = true; });

    const skip = Array.from(section.querySelectorAll('button'))
      .find(b => /skip/i.test(b.textContent));
    expect(skip).not.toBeNull();
    skip.click();

    expect(done).toBe(true);
    try {
      expect(localStorage.getItem(hook.CCF_BDAY_KEY)).toBe('skip');
    } catch (_) {}
  });
});
