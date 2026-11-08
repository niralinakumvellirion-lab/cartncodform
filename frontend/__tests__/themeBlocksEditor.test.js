/**
 * Shopify review 5.1.2: theme app blocks must show real output in the Theme Editor, never a
 * "configure in the admin" placeholder. In the editor (request.design_mode) the Quantity Tiers and
 * Birthday box blocks draw the real widget: the merchant's settings when on, otherwise a sample.
 * On the live store they show only what the merchant turned on. jsdom; fetch is faked.
 */
import fs from 'fs';
import path from 'path';
import { waitFor } from '@testing-library/react';

const EXT = path.join(__dirname, '../../extensions/cartncodform-embed');
const TIERS = path.join(EXT, 'assets/ccf-tiers.js');
const BDAY = path.join(EXT, 'assets/ccf-bday-product.js');
// Line endings depend on the checkout (Windows CRLF / LF); compare with LF only.
const read = (p) => fs.readFileSync(path.join(EXT, p), 'utf8').replace(/\r\n/g, '\n');

let calls;
function fakeFetch(config) {
  calls = [];
  global.fetch = jest.fn((url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET' });
    if (String(url).includes('/discount-config')) return Promise.resolve({ json: () => Promise.resolve(config) });
    if (String(url).includes('/products/')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ variants: [{ id: 1, price: 100000 }] }) });
    return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
  });
}

const tiersOff = { quantityTiers: { enabled: false, tiers: [] } };
const tiersOn = { quantityTiers: { enabled: true, heading: 'Bulk deals', accentColor: '#111111', layout: 'cards', tiers: [{ minQty: 4, percent: 20, badge: '' }] } };

function mountTiers(designMode) {
  document.body.innerHTML = `<div id="ccf-qt-root" data-shop="s.myshopify.com" data-handle="" data-variant-id="" data-design-mode="${designMode}"></div>`;
  jest.isolateModules(() => { require(TIERS); });
}

afterEach(() => { delete window.Shopify; document.head.innerHTML = ''; });

describe('no editor placeholders are left in the blocks', () => {
  it.each([
    'blocks/quantity-tiers.liquid', 'blocks/birthday-product.liquid', 'blocks/product-reviews.liquid',
    'assets/ccf-tiers.js', 'assets/ccf-bday-product.js',
  ])('%s has no "configure in the admin" text and no design-mode-only branch', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/configure in/i);
    expect(src).not.toMatch(/\{%-?\s*if request\.design_mode/);
  });

  it('the Tiers and Birthday blocks tell their script when they are in the theme editor', () => {
    expect(read('blocks/quantity-tiers.liquid')).toMatch(/id="ccf-qt-root"[^>]*data-design-mode="\{\{ request\.design_mode \}\}"/);
    expect(read('blocks/birthday-product.liquid')).toMatch(/<ccf-birthday-box[^>]*data-design-mode="\{\{ request\.design_mode \}\}"/);
  });
});

describe('Quantity Tiers block', () => {
  it('theme editor, tiers off → three sample cards with a small "Sample preview" caption', async () => {
    fakeFetch(tiersOff);
    mountTiers(true);
    await waitFor(() => expect(document.querySelectorAll('.ccf-qt-card')).toHaveLength(3));
    const root = document.getElementById('ccf-qt-root');
    expect(root.textContent).toContain('Buy more, save more');
    expect(root.textContent).toContain('10% off');
    expect(root.querySelector('.ccf-qt-sample-note').textContent).toMatch(/^Sample preview/);
  });

  it('theme editor flag from Shopify.designMode works too', async () => {
    fakeFetch(tiersOff);
    window.Shopify = { designMode: true };
    mountTiers(false);
    await waitFor(() => expect(document.querySelectorAll('.ccf-qt-card')).toHaveLength(3));
  });

  it('theme editor, tiers on → the merchant\'s own tiers, no sample caption', async () => {
    fakeFetch(tiersOn);
    mountTiers(true);
    await waitFor(() => expect(document.querySelectorAll('.ccf-qt-card')).toHaveLength(1));
    const root = document.getElementById('ccf-qt-root');
    expect(root.textContent).toContain('Bulk deals');
    expect(root.textContent).toContain('20% off');
    expect(root.querySelector('.ccf-qt-sample-note')).toBeNull();
  });

  it('live store, tiers on → the merchant\'s tiers', async () => {
    fakeFetch(tiersOn);
    mountTiers(false);
    await waitFor(() => expect(document.querySelectorAll('.ccf-qt-card')).toHaveLength(1));
    expect(document.querySelector('.ccf-qt-sample-note')).toBeNull();
  });

  it('live store, tiers off → nothing (no sample, no placeholder)', async () => {
    fakeFetch(tiersOff);
    mountTiers(false);
    await waitFor(() => expect(document.getElementById('ccf-qt-root')).toBeNull());
    expect(document.body.textContent).toBe('');
  });
});

describe('Birthday box block', () => {
  // The custom element is defined once per jsdom window and shares one config fetch, so one page holds
  // an editor box and a live-store box, both with the box turned off in the app.
  it('turned off: the theme editor draws the real gift box, the live store draws nothing; editor submit sends nothing', async () => {
    fakeFetch({ birthdayCapture: { productPage: { enabled: false } } });
    document.body.innerHTML =
      '<ccf-birthday-box id="ed" data-shop="s.myshopify.com" data-design-mode="true"></ccf-birthday-box>' +
      '<ccf-birthday-box id="live" data-shop="s.myshopify.com" data-design-mode="false"></ccf-birthday-box>';
    jest.isolateModules(() => { require(BDAY); });

    const ed = document.getElementById('ed').shadowRoot;
    await waitFor(() => expect(ed.querySelector('.ccf-bp-teaser')).not.toBeNull());
    expect(ed.textContent).toContain('Unlock 15% off your birthday gift');
    expect(ed.textContent).toContain('Open my gift');
    expect(ed.textContent).not.toMatch(/configure/i);
    expect(document.getElementById('live').shadowRoot.childNodes).toHaveLength(0);

    // Fill the form in the editor and send: the thank-you card shows, no request leaves the editor.
    ed.querySelector('.ccf-bp-email').value = 'a@b.co';
    const [month, day] = ed.querySelectorAll('.ccf-bp-select');
    month.value = month.options[month.options.length - 1].value;
    day.value = day.options[day.options.length - 1].value;
    ed.querySelector('.ccf-bp-check').checked = true;
    ed.querySelector('.ccf-bp-btn').click();
    await waitFor(() => expect(ed.querySelector('.ccf-bp-success-card')).not.toBeNull());
    expect(calls.filter((c) => c.url.includes('/birthday'))).toHaveLength(0);
  });
});

describe('Product reviews block', () => {
  it('renders the real widget everywhere (the editor included)', () => {
    const src = read('blocks/product-reviews.liquid');
    expect(src).toMatch(/^\{% comment %\}[^]*?\{% endcomment %\}\n<div\n  class="ccf-rv"/);
    expect(src).toContain("<script src=\"{{ 'ccf-reviews.js' | asset_url }}\" defer></script>");
    expect(read('assets/ccf-reviews.js')).toContain("document.addEventListener('shopify:section:load', initAll)");
  });
});
