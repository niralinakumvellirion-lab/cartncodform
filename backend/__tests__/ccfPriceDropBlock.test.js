/**
 * @jest-environment jsdom
 *
 * Storefront "Price drop" (extensions/cartncodform-embed/assets/ccf-pricedrop.js).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-pricedrop.js'), 'utf8');
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

const SETTINGS = {
  enabled: true, channels: { push: false, email: true, whatsapp: true }, percent: { whatsapp: 80, email: 20 },
  accentColor: '#111827', buttonRadius: 8,
  texts: {
    triggerText: 'Notify me if the price drops', boxTitle: 'Now {price}', chanceLabel: 'Your chance to be notified',
    buttonText: 'Notify me', emailPlaceholder: 'Your email', whatsappPlaceholder: 'WhatsApp number',
    partialText: 'Done! Add {next} too to reach 100%.', successText: 'Done! We’ll tell you when the price drops.',
  },
};
const VARIANTS = [
  { id: 1, title: 'S', available: true, price: '₹1,499' },
  { id: 2, title: 'M', available: false, price: '₹1,499' },
];

let posts;
let timers = [];
let listeners = [];

async function load({ settings = SETTINGS, selected = '1', design = 'false', keepStorage = false } = {}) {
  timers.forEach((t) => clearInterval(t));
  timers = [];
  document.head.innerHTML = '';
  if (!keepStorage) localStorage.clear();
  posts = [];
  document.body.innerHTML = `
    <product-form><form action="/cart/add"><input type="hidden" name="id" value="${selected}"><button type="submit" name="add">Add to cart</button><div class="shopify-payment-button"><button>Buy it now</button></div></form></product-form>
    <div class="elsewhere">
      <div id="ccf-pd-root" data-shop="demo.myshopify.com" data-product-id="111" data-product-title="Cotton Kurta"
           data-product-handle="cotton-kurta" data-product-image="//cdn.shopify.com/k.jpg" data-selected="${selected}"
           data-design-mode="${design}">
        <script type="application/json" class="ccf-pd-variants">${JSON.stringify(VARIANTS)}</script>
      </div>
    </div>`;
  global.fetch = jest.fn((url, opts) => {
    if (String(url).indexOf('/price-drop/config') !== -1) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, settings }) });
    }
    if (String(url).indexOf('/price-drop/subscribe') !== -1) {
      posts.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
  });
  // Remove the page listeners an earlier test's copy of the script added (one copy per page in real life).
  listeners.forEach(([type, fn, opt]) => document.removeEventListener(type, fn, opt));
  listeners = [];
  const realAdd = document.addEventListener;
  document.addEventListener = function (type, fn, opt) { listeners.push([type, fn, opt]); return realAdd.call(this, type, fn, opt); };
  const realSetInterval = window.setInterval;
  window.setInterval = (fn, ms) => { const id = realSetInterval(fn, ms); timers.push(id); return id; };
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)();
  await flush(); // the script adds its page listeners and its 600 ms check once its settings load
  window.setInterval = realSetInterval;
  document.addEventListener = realAdd;
}

const q = (sel) => document.querySelector(sel);
const box = () => q('.ccf-pd');
const pct = () => q('.ccf-pd-pct') && q('.ccf-pd-pct').textContent;
const pick = (kind) => q(`.ccf-pd-${kind} .ccf-pd-row`).click();

afterEach(() => { timers.forEach((t) => clearInterval(t)); timers = []; });
afterAll(() => { delete global.fetch; });

describe('ccf-pricedrop.js', () => {
  test('in-stock size: "Notify me if the price drops" under the buy buttons; Buy it now stays', async () => {
    await load();
    expect(box().hidden).toBe(false);
    expect(q('.ccf-pd-trigger').textContent).toMatch(/Notify me if the price drops/);
    expect(q('product-form').nextElementSibling.id).toBe('ccf-pd-root');
    expect(q('.shopify-payment-button').style.display).toBe('');
  });

  test('sold-out size → hidden (Back in stock covers it)', async () => {
    await load({ selected: '2' });
    expect(box().hidden).toBe(true);
  });

  test('panel: current price, chance ring, live % and sign-up to /price-drop/subscribe', async () => {
    await load();
    q('.ccf-pd-trigger').click();
    expect(q('.ccf-pd-sold').textContent).toBe('Now ₹1,499');
    expect(pct()).toBe('0%');
    pick('wa');
    q('.ccf-pd-phone').value = '9876543210';
    q('.ccf-pd-phone').dispatchEvent(new Event('input'));
    expect(pct()).toBe('80%');
    q('.ccf-pd-submit').click();
    await flush();
    expect(posts[0]).toMatchObject({ channel: 'whatsapp', phone: '+919876543210', variantId: '1', productId: '111' });
    expect(posts[0].basePrice).toBeUndefined(); // the server takes the price
    expect(q('.ccf-pd-partial').textContent).toBe('Done! Add email too to reach 100%.');
  });

  test('remembered per size, separate from Back in stock', async () => {
    localStorage.setItem('ccf_bis_demo.myshopify.com', JSON.stringify({ 1: { email: 1, whatsapp: 1 } }));
    await load({ keepStorage: true });
    expect(q('.ccf-pd-trigger').textContent).not.toMatch(/on the list/);
  });

  test('theme editor: shown even on a sold-out size', async () => {
    await load({ selected: '2', design: 'true' });
    expect(box().hidden).toBe(false);
  });

  test('off → nothing', async () => {
    await load({ settings: { ...SETTINGS, enabled: false } });
    expect(box()).toBeNull();
  });
});
