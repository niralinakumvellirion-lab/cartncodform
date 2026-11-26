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
  texts: { boxTitle: 'Sold out in this size', boxText: 'Get a message.', buttonText: 'Notify me', emailPlaceholder: 'Your email', successText: 'Done! We’ll tell you when {size} is back.' },
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
    <form action="/cart/add"><input type="hidden" name="id" value="${selected}"><button type="submit" name="add">Add to cart</button></form>
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

const submit = (sel) => q(sel).closest('form').dispatchEvent(new Event('submit', { cancelable: true }));
const pct = () => q('.ccf-bis-pct') && q('.ccf-bis-pct').textContent;

describe('ccf-restock.js', () => {
  test('sold-out variant → box with title, email card and browser-alert link, placed after the buy form', async () => {
    await load({ push: okPush() });
    expect(box().hidden).toBe(false);
    expect(q('.ccf-bis-title').textContent).toBe('Sold out in this size');
    expect(q('.ccf-bis-em .ccf-bis-cardtitle').textContent).toBe('Email');
    expect(q('.ccf-bis-email').placeholder).toBe('Your email');
    expect(q('.ccf-bis-pushlink').textContent).toMatch(/Also get a browser alert/);
    expect(q('form[action="/cart/add"]:not([id])').nextElementSibling.id).toBe('ccf-bis-root');
    expect(q('.ccf-bis-meter')).toBeNull(); // no WhatsApp → no priority bar
  });

  test('available variant → hidden; switching to the sold-out one shows it', async () => {
    await load({ selected: '1' });
    expect(box().hidden).toBe(true);
    document.querySelectorAll('[name="id"]').forEach((i) => { i.value = '2'; });
    document.dispatchEvent(new Event('change'));
    await flush();
    expect(box().hidden).toBe(false);
  });

  test('feature off → nothing', async () => {
    await load({ settings: { ...SETTINGS, enabled: false } });
    expect(box()).toBeNull();
  });

  test('email only: bad email caught locally; good one sent → success line', async () => {
    await load();
    q('.ccf-bis-email').value = 'nope';
    submit('.ccf-bis-email');
    expect(q('.ccf-bis-err').hidden).toBe(false);
    expect(posts).toHaveLength(0);
    q('.ccf-bis-email').value = 'asha@example.com';
    submit('.ccf-bis-email');
    await flush();
    expect(posts[0]).toMatchObject({
      channel: 'email', email: 'asha@example.com', productId: '111', variantId: '2', variantTitle: 'M',
      productHandle: 'cotton-kurta', imageUrl: 'https://cdn.shopify.com/k.jpg',
    });
    expect(q('.ccf-bis-done').textContent).toBe('Done! We’ll tell you when M is back.');
  });

  test('remembers the sign-up: reload shows the success line', async () => {
    await load();
    q('.ccf-bis-email').value = 'asha@example.com';
    submit('.ccf-bis-email');
    await flush();
    await load({ keepStorage: true });
    expect(q('.ccf-bis-done')).not.toBeNull();
    expect(q('.ccf-bis-email')).toBeNull();
  });

  test('older saved list of ids still counts as signed up', async () => {
    localStorage.setItem('ccf_bis_demo.myshopify.com', JSON.stringify(['2']));
    await load({ keepStorage: true });
    expect(q('.ccf-bis-done')).not.toBeNull();
  });

  test('push only: full button; subscribes through CCFPush and sends the token', async () => {
    const push = okPush();
    await load({ push, settings: { ...SETTINGS, channels: { push: true, email: false } } });
    expect(q('.ccf-bis-btn.ccf-bis-push')).not.toBeNull();
    q('.ccf-bis-push').click();
    await flush();
    expect(push.subscribe).toHaveBeenCalled();
    expect(posts[0]).toMatchObject({ channel: 'push', pushToken: 'tok_abcdefghijklmnopqrstuvwxyz0123', variantId: '2' });
    expect(q('.ccf-bis-done')).not.toBeNull();
  });

  test('push blocked → tells the shopper to use email', async () => {
    await load({ push: { canPush: () => true, subscribe: jest.fn().mockRejectedValue(new Error('denied')) } });
    q('.ccf-bis-push').click();
    await flush();
    expect(q('.ccf-bis-err').textContent).toMatch(/Use your email/);
    expect(posts).toHaveLength(0);
  });

  test('server error message is shown', async () => {
    await load({ subscribeResult: { ok: false, error: 'Too many tries.' } });
    q('.ccf-bis-email').value = 'asha@example.com';
    submit('.ccf-bis-email');
    await flush();
    expect(q('.ccf-bis-err').textContent).toBe('Too many tries.');
  });

  test('push channel off in settings → no push option even with the embed', async () => {
    await load({ push: okPush(), settings: { ...SETTINGS, channels: { push: false, email: true } } });
    expect(q('.ccf-bis-push')).toBeNull();
  });

  test('theme editor: shown even for an available variant, not moved', async () => {
    await load({ selected: '1', design: 'true' });
    expect(box().hidden).toBe(false);
    expect(q('.elsewhere #ccf-bis-root')).not.toBeNull();
  });
});

describe('WhatsApp + email priority bar', () => {
  const WA = {
    ...SETTINGS,
    channels: { push: true, email: true, whatsapp: true },
    percent: { whatsapp: 80, email: 20 },
    texts: {
      ...SETTINGS.texts, whatsappPlaceholder: 'WhatsApp number', whatsappHint: 'Fastest · we message you the moment it’s back',
      emailHint: 'We email you within 1 hour of the restock', meterLabel: 'Alert priority', partialText: 'Done! Add {next} too to reach 100%.',
    },
  };

  test('cards: WhatsApp first (Fastest, +80%), email second (+20%, later hint); bar at 0%', async () => {
    await load({ settings: WA, push: okPush() });
    const cards = Array.from(document.querySelectorAll('.ccf-bis-card')).map((c) => c.className);
    expect(cards[0]).toContain('ccf-bis-wa');
    expect(cards[1]).toContain('ccf-bis-em');
    expect(q('.ccf-bis-wa .ccf-bis-badge').textContent).toBe('Fastest');
    expect(q('.ccf-bis-wa .ccf-bis-chip').textContent).toBe('+80%');
    expect(q('.ccf-bis-em .ccf-bis-chip').textContent).toBe('+20%');
    expect(q('.ccf-bis-em .ccf-bis-hint').textContent).toBe('We email you within 1 hour of the restock');
    expect(pct()).toBe('0%');
    expect(q('.ccf-bis-meter').getAttribute('aria-valuenow')).toBe('0');
  });

  test('only WhatsApp → 80% + done, email card still offered; then email → 100% all set', async () => {
    await load({ settings: WA });
    q('.ccf-bis-phone').value = '123';
    submit('.ccf-bis-phone');
    expect(q('.ccf-bis-err').textContent).toBe('Enter a valid WhatsApp number');
    q('.ccf-bis-phone').value = '98765 43210';
    submit('.ccf-bis-phone');
    await flush();
    expect(posts[0]).toMatchObject({ channel: 'whatsapp', phone: '9876543210', variantId: '2' });
    expect(pct()).toBe('80%');
    expect(q('.ccf-bis-partial').textContent).toBe('Done! Add email too to reach 100%.');
    expect(q('.ccf-bis-phone')).toBeNull();
    expect(q('.ccf-bis-email')).not.toBeNull();

    q('.ccf-bis-email').value = 'asha@example.com';
    submit('.ccf-bis-email');
    await flush();
    expect(pct()).toBe('100%');
    expect(box().classList.contains('is-full')).toBe(true);
    expect(q('.ccf-bis-done').textContent).toBe('Done! We’ll tell you when M is back.');
    expect(q('.ccf-bis-card')).toBeNull();
  });

  test('only email → 20% + done, WhatsApp card still offered', async () => {
    await load({ settings: WA });
    q('.ccf-bis-email').value = 'asha@example.com';
    submit('.ccf-bis-email');
    await flush();
    expect(pct()).toBe('20%');
    expect(q('.ccf-bis-partial').textContent).toBe('Done! Add WhatsApp too to reach 100%.');
    expect(q('.ccf-bis-phone')).not.toBeNull();
  });

  test('the seller’s split is used (e.g. 70 / 30) and remembered after reload', async () => {
    const s = { ...WA, percent: { whatsapp: 70, email: 30 } };
    await load({ settings: s });
    expect(q('.ccf-bis-wa .ccf-bis-chip').textContent).toBe('+70%');
    q('.ccf-bis-phone').value = '9876543210';
    submit('.ccf-bis-phone');
    await flush();
    await load({ settings: s, keepStorage: true });
    expect(pct()).toBe('70%');
    expect(q('.ccf-bis-phone')).toBeNull();
  });

  test('WhatsApp off → no number box, no bar', async () => {
    await load();
    expect(q('.ccf-bis-phone')).toBeNull();
    expect(q('.ccf-bis-meter')).toBeNull();
  });
});

describe('ccf-push.js public hook', () => {
  test('exposes CCFPush.subscribe / canPush', () => {
    expect(PUSH_SCRIPT).toMatch(/window\.CCFPush\.subscribe = function/);
    expect(PUSH_SCRIPT).toMatch(/window\.CCFPush\.canPush = function/);
  });
});
