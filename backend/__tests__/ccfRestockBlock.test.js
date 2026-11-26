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

describe('ccf-restock.js', () => {
  test('sold-out variant → box with title, push button and email form, placed after the buy form', async () => {
    await load({ push: okPush() });
    expect(box().hidden).toBe(false);
    expect(q('.ccf-bis-title').textContent).toBe('Sold out in this size');
    expect(q('.ccf-bis-push').textContent).toMatch(/Notify me/);
    expect(q('.ccf-bis-or').textContent).toBe('or by email');
    expect(q('.ccf-bis-input').placeholder).toBe('Your email');
    expect(q('form[action="/cart/add"]:not([id])').nextElementSibling.id).toBe('ccf-bis-root');
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

  test('no push embed → email only, with the main button style', async () => {
    await load();
    expect(q('.ccf-bis-push')).toBeNull();
    expect(q('.ccf-bis-or')).toBeNull();
    expect(q('.ccf-bis-form').classList.contains('is-only')).toBe(true);
  });

  test('email: bad email is caught locally; good one is sent and shows the success line', async () => {
    await load();
    q('.ccf-bis-input').value = 'nope';
    q('.ccf-bis-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(q('.ccf-bis-err').hidden).toBe(false);
    expect(posts).toHaveLength(0);

    q('.ccf-bis-input').value = 'asha@example.com';
    q('.ccf-bis-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(posts[0]).toMatchObject({
      channel: 'email', email: 'asha@example.com', productId: '111', variantId: '2', variantTitle: 'M',
      productHandle: 'cotton-kurta', imageUrl: 'https://cdn.shopify.com/k.jpg',
    });
    expect(q('.ccf-bis-done').textContent).toBe('Done! We’ll tell you when M is back.');
  });

  test('remembers the request: reload shows the success line', async () => {
    await load();
    q('.ccf-bis-input').value = 'asha@example.com';
    q('.ccf-bis-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    await load({ keepStorage: true });
    expect(q('.ccf-bis-done')).not.toBeNull();
    expect(q('.ccf-bis-input')).toBeNull();
  });

  test('push: subscribes through CCFPush and sends the token', async () => {
    const push = okPush();
    await load({ push });
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
    q('.ccf-bis-input').value = 'asha@example.com';
    q('.ccf-bis-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q('.ccf-bis-err').textContent).toBe('Too many tries.');
  });

  test('push channel off in settings → no push button even with the embed', async () => {
    await load({ push: okPush(), settings: { ...SETTINGS, channels: { push: false, email: true } } });
    expect(q('.ccf-bis-push')).toBeNull();
  });

  test('theme editor: shown even for an available variant, not moved', async () => {
    await load({ selected: '1', design: 'true' });
    expect(box().hidden).toBe(false);
    expect(q('.elsewhere #ccf-bis-root')).not.toBeNull();
  });
});

describe('ccf-push.js public hook', () => {
  test('exposes CCFPush.subscribe / canPush', () => {
    expect(PUSH_SCRIPT).toMatch(/window\.CCFPush\.subscribe = function/);
    expect(PUSH_SCRIPT).toMatch(/window\.CCFPush\.canPush = function/);
  });
});
