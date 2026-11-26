/**
 * @jest-environment jsdom
 *
 * Storefront "Back in stock" (extensions/cartncodform-embed/assets/ccf-restock.js).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-restock.js'), 'utf8');
const PUSH_SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-push.js'), 'utf8');
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

const SETTINGS = {
  enabled: true, channels: { push: true, email: true }, accentColor: '#111827', buttonRadius: 8,
  texts: { boxTitle: 'Sorry, {size} is sold out', boxText: 'Get a message.', chanceLabel: 'Your chance to be notified', triggerText: 'Notify me when it’s back', buttonText: 'Notify me', emailPlaceholder: 'Your email', successText: 'Done! We’ll tell you when {size} is back.' },
};
const VARIANTS = [
  { id: 1, title: 'S', available: true },
  { id: 2, title: 'M', available: false },
];

let posts;
let timers = [];

async function load({ settings = SETTINGS, selected = '2', design = 'false', push = null, subscribeResult = { ok: true }, keepStorage = false } = {}) {
  timers.forEach((t) => clearInterval(t));
  timers = [];
  document.head.innerHTML = '';
  if (!keepStorage) localStorage.clear();
  posts = [];
  document.body.innerHTML = `
    <form id="product-form-installment-1" action="/cart/add"><input type="hidden" name="id" value="${selected}"></form>
    <product-form><form action="/cart/add"><input type="hidden" name="id" value="${selected}"><button type="submit" name="add">Add to cart</button><div class="shopify-payment-button"><button>Buy it now</button></div></form></product-form>
    <div class="elsewhere">
      <div id="ccf-bis-root" data-shop="demo.myshopify.com" data-product-id="111" data-product-title="Cotton Kurta"
           data-product-handle="cotton-kurta" data-product-image="//cdn.shopify.com/k.jpg" data-selected="${selected}"
           data-design-mode="${design}">
        <script type="application/json" class="ccf-bis-variants">${JSON.stringify(VARIANTS)}</script>
      </div>
    </div>`;
  if (push) window.CCFPush = push; else delete window.CCFPush;

  global.fetch = jest.fn((url, opts) => {
    if (String(url).indexOf('/restock/config') !== -1) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, settings }) });
    }
    if (String(url).indexOf('/restock/subscribe') !== -1) {
      posts.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: subscribeResult.ok !== false, json: () => Promise.resolve(subscribeResult) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
  });
  const realSetInterval = window.setInterval;
  window.setInterval = (fn, ms) => { const id = realSetInterval(fn, ms); timers.push(id); return id; };
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)();
  window.setInterval = realSetInterval;
  await flush();
}

const q = (sel) => document.querySelector(sel);
const box = () => q('.ccf-bis');
const okPush = () => ({ canPush: () => true, subscribe: jest.fn().mockResolvedValue('tok_abcdefghijklmnopqrstuvwxyz0123') });

afterEach(() => { timers.forEach((t) => clearInterval(t)); timers = []; });
afterAll(() => { delete global.fetch; delete window.CCFPush; });

const pct = () => q('.ccf-bis-pct') && q('.ccf-bis-pct').textContent;
const trigger = () => q('.ccf-bis-trigger');
const openPanel = () => { trigger().click(); };
const pick = (kind) => q(`.ccf-bis-${kind} .ccf-bis-row`).click();
const notify = async () => { q('.ccf-bis-submit').click(); await flush(); };

describe('ccf-restock.js — Notify me button + panel', () => {
  test('sold-out size: Notify me button with arrow, placed after the buy form; panel closed', async () => {
    await load();
    expect(box().hidden).toBe(false);
    expect(trigger().textContent).toMatch(/Notify me when it’s back|Notify me/);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(q('.ccf-bis-chev')).not.toBeNull();
    expect(q('.ccf-bis-panel')).toBeNull();
    expect(q('product-form').nextElementSibling.id).toBe('ccf-bis-root');
  });

  test('arrow opens the panel: photo, sold-out line with the size, chance label and a 0% ring', async () => {
    await load();
    openPanel();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(q('.ccf-bis-thumb').getAttribute('src')).toBe('https://cdn.shopify.com/k.jpg');
    expect(q('.ccf-bis-sold').textContent).toBe('Sorry, M is sold out');
    expect(q('.ccf-bis-chance').textContent).toBe('Your chance to be notified');
    expect(pct()).toBe('0%');
    expect(q('.ccf-bis-ringwrap').getAttribute('aria-valuenow')).toBe('0');
    expect(q('.ccf-bis-submit').disabled).toBe(true); // nothing picked yet
  });

  test('replaces "Buy it now" on a sold-out size and brings it back when the size is in stock', async () => {
    await load({ selected: '2' });
    const btn = q('.shopify-payment-button');
    expect(btn.style.display).toBe('none');
    document.querySelectorAll('[name="id"]').forEach((i) => { i.value = '1'; });
    document.dispatchEvent(new Event('change'));
    await flush();
    expect(box().hidden).toBe(true);
    expect(btn.style.display).toBe('');
  });

  test('"Replace Buy it now" off → theme button left alone', async () => {
    await load({ settings: { ...SETTINGS, replaceBuyNow: false } });
    expect(q('.shopify-payment-button').style.display).toBe('');
  });

  test('available variant → hidden; feature off → nothing', async () => {
    await load({ selected: '1' });
    expect(box().hidden).toBe(true);
    await load({ settings: { ...SETTINGS, enabled: false } });
    expect(box()).toBeNull();
  });

  test('email only: pick Email → field; bad email caught; good one → 100% + done', async () => {
    await load();
    openPanel();
    expect(q('.ccf-bis-email')).toBeNull();
    pick('em');
    expect(q('.ccf-bis-em').classList.contains('is-on')).toBe(true);
    q('.ccf-bis-email').value = 'nope';
    await notify();
    expect(q('.ccf-bis-err').textContent).toBe('Enter a valid email');
    expect(posts).toHaveLength(0);
    q('.ccf-bis-email').value = 'asha@example.com';
    await notify();
    expect(posts[0]).toMatchObject({
      channel: 'email', email: 'asha@example.com', productId: '111', variantId: '2', variantTitle: 'M',
      productHandle: 'cotton-kurta', imageUrl: 'https://cdn.shopify.com/k.jpg',
    });
    expect(pct()).toBe('100%');
    expect(q('.ccf-bis-done').textContent).toBe('Done! We’ll tell you when M is back.');
    expect(trigger().textContent).toMatch(/You’re on the list/);
  });

  test('remembers the sign-up after reload (and older saved id lists)', async () => {
    await load();
    openPanel(); pick('em');
    q('.ccf-bis-email').value = 'asha@example.com';
    await notify();
    await load({ keepStorage: true });
    expect(trigger().textContent).toMatch(/You’re on the list/);
    localStorage.setItem('ccf_bis_demo.myshopify.com', JSON.stringify(['2']));
    await load({ keepStorage: true });
    expect(trigger().textContent).toMatch(/You’re on the list/);
  });

  test('server error message is shown', async () => {
    await load({ subscribeResult: { ok: false, error: 'Too many tries.' } });
    openPanel(); pick('em');
    q('.ccf-bis-email').value = 'asha@example.com';
    await notify();
    expect(q('.ccf-bis-err').textContent).toBe('Too many tries.');
  });

  test('push only: one Notify me button in the panel, via CCFPush', async () => {
    const push = okPush();
    await load({ push, settings: { ...SETTINGS, channels: { push: true, email: false } } });
    openPanel();
    q('.ccf-bis-push').click();
    await flush();
    expect(push.subscribe).toHaveBeenCalled();
    expect(posts[0]).toMatchObject({ channel: 'push', pushToken: 'tok_abcdefghijklmnopqrstuvwxyz0123' });
    expect(pct()).toBe('100%');
  });

  test('push as an extra link; blocked → asks for email', async () => {
    await load({ push: { canPush: () => true, subscribe: jest.fn().mockRejectedValue(new Error('denied')) } });
    openPanel();
    expect(q('.ccf-bis-pushlink').textContent).toMatch(/Also get a browser alert/);
    q('.ccf-bis-push').click();
    await flush();
    expect(q('.ccf-bis-err').textContent).toMatch(/Use your email/);
  });

  test('theme editor: shown even for an available variant, not moved, Buy it now untouched', async () => {
    await load({ selected: '1', design: 'true' });
    expect(box().hidden).toBe(false);
    expect(q('.elsewhere #ccf-bis-root')).not.toBeNull();
    expect(q('.shopify-payment-button').style.display).toBe('');
  });
});

describe('Email + WhatsApp: round selectors and the % ring', () => {
  const WA = {
    ...SETTINGS,
    channels: { push: false, email: true, whatsapp: true },
    percent: { whatsapp: 80, email: 20 },
    texts: {
      ...SETTINGS.texts, whatsappPlaceholder: 'WhatsApp number', whatsappHint: 'Fastest · we message you the moment it’s back',
      emailHint: 'We email you within 1 hour of the restock', partialText: 'Done! Add {next} too to reach 100%.',
    },
  };

  test('options: Email (+20%) and WhatsApp (Fastest, +80%) with round selectors; WhatsApp field has +91', async () => {
    await load({ settings: WA });
    openPanel();
    expect(q('.ccf-bis-em .ccf-bis-chip').textContent).toBe('+20%');
    expect(q('.ccf-bis-wa .ccf-bis-chip').textContent).toBe('+80%');
    expect(q('.ccf-bis-wa .ccf-bis-badge').textContent).toBe('Fastest');
    expect(document.querySelectorAll('.ccf-bis-radio')).toHaveLength(2);
    pick('wa');
    expect(q('.ccf-bis-wa .ccf-bis-row').getAttribute('aria-checked')).toBe('true');
    expect(q('.ccf-bis-cc').textContent).toBe('+91');
    expect(q('.ccf-bis-wa .ccf-bis-hint').textContent).toMatch(/moment it’s back/);
  });

  test('only WhatsApp → 80% + "add email" note; email still offered', async () => {
    await load({ settings: WA });
    openPanel(); pick('wa');
    q('.ccf-bis-phone').value = '123';
    await notify();
    expect(q('.ccf-bis-err').textContent).toBe('Enter a valid WhatsApp number');
    q('.ccf-bis-phone').value = '98765 43210';
    await notify();
    expect(posts[0]).toMatchObject({ channel: 'whatsapp', phone: '+919876543210', variantId: '2' });
    expect(pct()).toBe('80%');
    expect(q('.ccf-bis-partial').textContent).toBe('Done! Add email too to reach 100%.');
    expect(q('.ccf-bis-wa').classList.contains('is-done')).toBe(true);
    expect(q('.ccf-bis-wa .ccf-bis-added').textContent).toBe('Added');
    expect(trigger().textContent).toMatch(/80%/);
  });

  test('only email → 20% + "add WhatsApp" note', async () => {
    await load({ settings: WA });
    openPanel(); pick('em');
    q('.ccf-bis-email').value = 'asha@example.com';
    await notify();
    expect(pct()).toBe('20%');
    expect(q('.ccf-bis-partial').textContent).toBe('Done! Add WhatsApp too to reach 100%.');
  });

  test('both picked → one Notify me sends both → 100% + done', async () => {
    await load({ settings: WA });
    openPanel(); pick('em');
    q('.ccf-bis-email').value = 'asha@example.com';
    q('.ccf-bis-email').dispatchEvent(new Event('input'));
    pick('wa');
    expect(q('.ccf-bis-email').value).toBe('asha@example.com'); // typed value kept
    q('.ccf-bis-phone').value = '9876543210';
    await notify();
    expect(posts.map((p) => p.channel).sort()).toEqual(['email', 'whatsapp']);
    expect(pct()).toBe('100%');
    expect(box().classList.contains('is-full')).toBe(true);
    expect(q('.ccf-bis-done').textContent).toBe('Done! We’ll tell you when M is back.');
  });

  test('the seller’s split (70 / 30) is used and remembered after reload', async () => {
    const s = { ...WA, percent: { whatsapp: 70, email: 30 } };
    await load({ settings: s });
    openPanel(); pick('wa');
    q('.ccf-bis-phone').value = '9876543210';
    await notify();
    expect(pct()).toBe('70%');
    await load({ settings: s, keepStorage: true });
    expect(trigger().textContent).toMatch(/70%/);
  });
});

describe('ccf-push.js public hook', () => {
  test('exposes CCFPush.subscribe / canPush', () => {
    expect(PUSH_SCRIPT).toMatch(/window\.CCFPush\.subscribe = function/);
    expect(PUSH_SCRIPT).toMatch(/window\.CCFPush\.canPush = function/);
  });
});
