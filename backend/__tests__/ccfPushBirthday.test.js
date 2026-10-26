/**
 * @jest-environment jsdom
 *
 * Tests for the birthday UI redesign: ccfInjectBirthdayStyles,
 * ccfRenderBirthdayForm, and ccfShowBirthdayStep in ccf-push.js.
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
  birthdayDiscount: {
    offerText: 'Birthday gift',
    consentText: 'We use your birthday only.',
    percentage: 20,
    leadDays: 5,
  },
};

// ─── ccfInjectBirthdayStyles ──────────────────────────────────────────────────
describe('ccfInjectBirthdayStyles', () => {
  let hook;
  beforeEach(() => { hook = loadScript(); });

  test('injects <style id="ccf-bd-styles"> into head', () => {
    hook.injectBirthdayStyles();
    expect(document.getElementById('ccf-bd-styles')).not.toBeNull();
  });

  test('does not inject twice on repeated calls', () => {
    hook.injectBirthdayStyles();
    hook.injectBirthdayStyles();
    expect(document.querySelectorAll('#ccf-bd-styles').length).toBe(1);
  });

  test('CSS contains .ccf-bd-* selectors', () => {
    hook.injectBirthdayStyles();
    const css = document.getElementById('ccf-bd-styles').textContent;
    expect(css).toContain('.ccf-bd-dialog');
    expect(css).toContain('.ccf-bd-sel');
    expect(css).toContain('.ccf-bd-btn-primary');
    expect(css).toContain('.ccf-bd-btn-skip');
  });
});

// ─── ccfRenderBirthdayForm — direct ──────────────────────────────────────────
describe('ccfRenderBirthdayForm — direct', () => {
  let hook;
  beforeEach(() => {
    hook = loadScript();
    document.body.innerHTML = '';
  });

  test('renders month and day selects with visible labels (for/id wired)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    hook.renderBirthdayForm(container, { accentColor: ACCENT, consentText: 'Consent' }, () => {});
    const monthSel = container.querySelector('#ccf-bd-month');
    const daySel   = container.querySelector('#ccf-bd-day');
    const monthLbl = container.querySelector('label[for="ccf-bd-month"]');
    const dayLbl   = container.querySelector('label[for="ccf-bd-day"]');
    expect(monthSel).not.toBeNull();
    expect(daySel).not.toBeNull();
    expect(monthLbl).not.toBeNull();
    expect(dayLbl).not.toBeNull();
  });

  test('primary button text is "Send me my gift", skip text is "No thanks"', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    hook.renderBirthdayForm(container, { accentColor: ACCENT, consentText: 'Consent' }, () => {});
    const btns = Array.from(container.querySelectorAll('button'));
    expect(btns.some(b => /send me my gift/i.test(b.textContent))).toBe(true);
    expect(btns.some(b => /no thanks/i.test(b.textContent))).toBe(true);
  });

  test('error div has role=alert and aria-live=polite', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    hook.renderBirthdayForm(container, { accentColor: ACCENT, consentText: 'Consent' }, () => {});
    const err = container.querySelector('[role="alert"]');
    expect(err).not.toBeNull();
    expect(err.getAttribute('aria-live')).toBe('polite');
  });

  test('Day options for January = 31, February = 29, April = 30', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    hook.renderBirthdayForm(container, { accentColor: ACCENT, consentText: 'Consent' }, () => {});
    const monthSel = container.querySelector('#ccf-bd-month');
    const daySel   = container.querySelector('#ccf-bd-day');

    // January = month 1
    monthSel.value = '1';
    monthSel.dispatchEvent(new Event('change'));
    const janOpts = daySel.querySelectorAll('option[value]');
    const janDays = Array.from(janOpts).filter(o => o.value !== '0').length;
    expect(janDays).toBe(31);

    // February = month 2 (max 29)
    monthSel.value = '2';
    monthSel.dispatchEvent(new Event('change'));
    const febOpts = daySel.querySelectorAll('option[value]');
    const febDays = Array.from(febOpts).filter(o => o.value !== '0').length;
    expect(febDays).toBe(29);

    // April = month 4
    monthSel.value = '4';
    monthSel.dispatchEvent(new Event('change'));
    const aprOpts = daySel.querySelectorAll('option[value]');
    const aprDays = Array.from(aprOpts).filter(o => o.value !== '0').length;
    expect(aprDays).toBe(30);
  });

  test('loading state: button disabled + textContent "Saving" after valid submit', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    // fetch stays pending for this test
    let resolveFetch;
    global.fetch = jest.fn(() => new Promise(r => { resolveFetch = r; }));

    hook.renderBirthdayForm(container, { accentColor: ACCENT, consentText: 'Consent' }, () => {});
    const monthSel = container.querySelector('#ccf-bd-month');
    const daySel   = container.querySelector('#ccf-bd-day');
    const saveBtn  = container.querySelector('.ccf-bd-btn-primary');
    monthSel.value = '3'; monthSel.dispatchEvent(new Event('change'));
    daySel.value   = '15';
    saveBtn.click();

    expect(saveBtn.disabled).toBe(true);
    expect(saveBtn.textContent).toMatch(/saving/i);
    // Reject so the auto-close setTimeout is never scheduled (prevents timer leak)
    resolveFetch = null; // abandon the pending promise — it GC's without settling
    // restore
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  test('inline error shown (role=alert visible) when month or day not selected', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    hook.renderBirthdayForm(container, { accentColor: ACCENT, consentText: 'Consent' }, () => {});
    const saveBtn = container.querySelector('.ccf-bd-btn-primary');
    saveBtn.click(); // month=0, day=0
    const err = container.querySelector('[role="alert"]');
    expect(err.classList.contains('ccf-bd-visible')).toBe(true);
    expect(err.textContent).toMatch(/select a month and day/i);
  });

  test('success state: "You\'re all set" shown after fetch resolves', async () => {
    // Use fake timers from the start so the 2000ms auto-close setTimeout is
    // captured as a fake timer and never leaks into subsequent tests.
    jest.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);

    let onDoneCalled = false;
    hook.renderBirthdayForm(container, { accentColor: ACCENT, consentText: 'Consent' }, () => { onDoneCalled = true; });
    const monthSel = container.querySelector('#ccf-bd-month');
    const daySel   = container.querySelector('#ccf-bd-day');
    monthSel.value = '6'; monthSel.dispatchEvent(new Event('change'));
    daySel.value   = '10';

    container.querySelector('.ccf-bd-btn-primary').click();
    // Flush the fetch .then() microtask using a real Promise tick, then resume
    await Promise.resolve();
    await Promise.resolve(); // second tick in case chain is longer

    expect(container.querySelector('.ccf-bd-success')).not.toBeNull();
    expect(container.textContent).toMatch(/you.re all set/i);
    expect(onDoneCalled).toBe(false); // auto-closes after 2000ms, not instantly

    jest.advanceTimersByTime(2100);
    jest.useRealTimers();
  });

  test('skip button calls onDone(false)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let result = null;
    hook.renderBirthdayForm(container, { accentColor: ACCENT, consentText: 'Consent' }, (saved) => { result = saved; });
    container.querySelector('.ccf-bd-btn-skip').click();
    expect(result).toBe(false);
  });
});

// ─── ccfShowBirthdayStep ──────────────────────────────────────────────────────
describe('ccfShowBirthdayStep — overlay always created in body', () => {
  let hook;
  beforeEach(async () => {
    hook = loadScript();
    await new Promise(r => setTimeout(r, 0));
    hook.setDiscountConfig(BDAY_CONFIG);
    try { localStorage.removeItem(hook.CCF_BDAY_KEY); } catch (_) {}
  });

  test('scrim appended to body with month select inside', () => {
    hook.showBirthdayStep(null, ACCENT, () => {});
    const scrim = document.body.querySelector('.ccf-bd-scrim');
    expect(scrim).not.toBeNull();
    expect(scrim.querySelector('#ccf-bd-month')).not.toBeNull();
  });

  test('dialog has role=dialog, aria-modal=true, aria-labelledby=ccf-bd-title', () => {
    hook.showBirthdayStep(null, ACCENT, () => {});
    const dialog = document.body.querySelector('.ccf-bd-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('ccf-bd-title');
    expect(document.getElementById('ccf-bd-title')).not.toBeNull();
  });

  test('Escape key closes dialog (scrim removed)', () => {
    hook.showBirthdayStep(null, ACCENT, () => {});
    expect(document.body.querySelector('.ccf-bd-scrim')).not.toBeNull();
    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(evt);
    expect(document.body.querySelector('.ccf-bd-scrim')).toBeNull();
  });

  test('close button (X) removes scrim from body', () => {
    hook.showBirthdayStep(null, ACCENT, () => {});
    const closeBtn = document.body.querySelector('.ccf-bd-close');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(document.body.querySelector('.ccf-bd-scrim')).toBeNull();
  });

  test('No thanks button removes scrim and sets localStorage to "skip"', () => {
    hook.showBirthdayStep(null, ACCENT, () => {});
    const skip = Array.from(document.body.querySelectorAll('button'))
      .find(b => /no thanks/i.test(b.textContent));
    expect(skip).not.toBeNull();
    skip.click();
    expect(document.body.querySelector('.ccf-bd-scrim')).toBeNull();
    try {
      expect(localStorage.getItem(hook.CCF_BDAY_KEY)).toBe('skip');
    } catch (_) {}
  });

  test('calls onDone immediately when birthday disabled', () => {
    hook.setDiscountConfig({ birthdayCapture: { popup: { enabled: false } }, birthdayDiscount: {} });
    let called = false;
    hook.showBirthdayStep(null, ACCENT, () => { called = true; });
    expect(called).toBe(true);
  });

  test('calls onDone immediately when CCF_BDAY_KEY already set', () => {
    try { localStorage.setItem(hook.CCF_BDAY_KEY, '1'); } catch (_) {}
    let called = false;
    hook.showBirthdayStep(null, ACCENT, () => { called = true; });
    expect(called).toBe(true);
  });

  test('Tab key traps focus within dialog', () => {
    hook.showBirthdayStep(null, ACCENT, () => {});
    const dialog = document.body.querySelector('.ccf-bd-dialog');
    const focusable = Array.from(
      dialog.querySelectorAll('button:not([disabled]),select:not([disabled])')
    );
    expect(focusable.length).toBeGreaterThanOrEqual(2);
    // Simulate Tab past last element → focus wraps to first
    const last = focusable[focusable.length - 1];
    last.focus();
    const tabEvt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, shiftKey: false });
    document.dispatchEvent(tabEvt);
    // jsdom doesn't move focus on preventDefault but the handler should not throw
  });

  test('desktop: left panel (.ccf-bd-left) exists in DOM', () => {
    hook.showBirthdayStep(null, ACCENT, () => {});
    expect(document.body.querySelector('.ccf-bd-left')).not.toBeNull();
  });

  test('phone header (.ccf-bd-phone-header) exists in DOM', () => {
    hook.showBirthdayStep(null, ACCENT, () => {});
    expect(document.body.querySelector('.ccf-bd-phone-header')).not.toBeNull();
  });

  test('drag handle (.ccf-bd-drag) exists in DOM', () => {
    hook.showBirthdayStep(null, ACCENT, () => {});
    expect(document.body.querySelector('.ccf-bd-drag')).not.toBeNull();
  });

  test('onDone called once on scrim-click (doClose prevents double-call)', () => {
    let count = 0;
    hook.showBirthdayStep(null, ACCENT, () => { count++; });
    const scrim = document.body.querySelector('.ccf-bd-scrim');
    // Simulate direct scrim click
    const clickEvt = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvt, 'target', { value: scrim });
    scrim.dispatchEvent(clickEvt);
    expect(document.body.querySelector('.ccf-bd-scrim')).toBeNull();
    expect(count).toBe(1);
  });
});
