/**
 * @jest-environment jsdom
 *
 * Storefront "Find my size" (extensions/cartncodform-embed/assets/ccf-size.js).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-size.js'), 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 0));

const SETTINGS = {
  enabled: true, productTag: '', buttonText: 'Find my size', accentColor: '#111827', unit: 'cm',
  genders: ['women', 'men'],
  charts: {
    women: [{ size: 'S', chest: 86, waist: 71, length: 105 }, { size: 'M', chest: 91, waist: 76, length: 106 }],
    men: [{ size: 'M', chest: 97, waist: 83, length: 73 }],
  },
};

let recommendBodies;
let sizeEvents = [];
// One listener for the whole file (a listener per test would record each event several times).
document.addEventListener('ccf:size-selected', (e) => sizeEvents.push(e.detail));

async function load({ settings = SETTINGS, tags = 'kurta', sizeOption = 'Size', sizeValues = 'S|M|L', design = 'false', recommend, keepStorage = false, pageHtml, configFailures = 0 } = {}) {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  if (!keepStorage) localStorage.clear();
  recommendBodies = [];
  sizeEvents = [];

  // Theme product form with a Size option as radio buttons
  document.body.innerHTML = pageHtml || `
    <form action="/cart/add">
      <fieldset><legend>Size</legend>
        <input type="radio" name="Size" value="S" checked>
        <input type="radio" name="Size" value="M">
        <input type="radio" name="Size" value="L">
      </fieldset>
    </form>
    <div id="ccf-sf-root" data-shop="demo.myshopify.com" data-tags="${tags}" data-size-option="${sizeOption}"
         data-size-values="${sizeValues}" data-design-mode="${design}"></div>`;

  global.fetch = jest.fn((url, opts) => {
    if (String(url).indexOf('/size-finder/config') !== -1) {
      if (configFailures > 0) { configFailures -= 1; return Promise.reject(new Error('network')); }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, settings }) });
    }
    if (String(url).indexOf('/size-finder/recommend') !== -1) {
      recommendBodies.push(JSON.parse(opts.body));
      const d = recommend || { ok: true, size: 'M', outOfRange: false, saved: false,
        reasons: [{ area: 'chest', status: 'right' }, { area: 'waist', status: 'roomy' }, { area: 'length', status: 'info', value: 106 }] };
      return Promise.resolve({ ok: d.ok !== false, json: () => Promise.resolve(d) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
  });

  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)();
  await flush(); await flush();
}

const q = (sel) => document.querySelector(sel);
// Buttons by accessible name: aria-label (option cards) or visible text.
const btn = (text) => Array.from(document.querySelectorAll('button'))
  .find((b) => (b.getAttribute('aria-label') || b.textContent.trim()) === text);

afterAll(() => { delete global.fetch; });

window.__ccfSizeCreatingMs = 0; // no waiting on the "Creating your avatar" step in tests

const ADD_PAGE = (extra = '') => `
  <div class="shopify-section">
    <form action="/cart/add">
      <fieldset><legend>Size</legend>
        <input type="radio" name="Size" value="S" checked>
        <input type="radio" name="Size" value="M">
        <input type="radio" name="Size" value="L">
      </fieldset>
      <button type="submit" name="add" id="theme-add" ${extra}>Add to cart</button>
    </form>
    <div id="ccf-sf-root" data-shop="demo.myshopify.com" data-tags="kurta" data-size-option="Size"
         data-size-values="S|M|L" data-product-title="Cotton Kurta" data-product-price="₹1,299"
         data-product-image="//cdn.shopify.com/k.jpg" data-design-mode="false"></div>
  </div>`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const title = () => q('.ccf-sf-title') && q('.ccf-sf-title').textContent;
const open = () => q('.ccf-sf-open').click();
async function toResult(base = 'Woman', build) {
  open();
  btn(base).click();
  btn('Continue').click();
  if (build) btn(build).click();
  btn('Continue').click();
  await flush(); await flush(); await flush();
}

describe('ccf-size.js — button on the product page', () => {
  test('full-width "Find my ideal size" style button with the caption under it', async () => {
    await load({ settings: { ...SETTINGS, buttonText: 'Find my ideal size', cardText: 'Takes 20 seconds' } });
    expect(q('.ccf-sf-trigger').textContent).toBe('Find my ideal size');
    expect(q('.ccf-sf-caption').textContent).toBe('Takes 20 seconds');
    expect(q('.ccf-sf-panel').hidden).toBe(true);
  });

  test('style and corners from the admin', async () => {
    await load({ settings: { ...SETTINGS, buttonStyle: 'soft', buttonRadius: 8 } });
    expect(q('.ccf-sf-trigger').classList.contains('is-soft')).toBe(true);
    expect(q('.ccf-sf-trigger').style.borderRadius).toBe('8px');
    await load({ settings: { ...SETTINGS, buttonStyle: 'filled' } });
    expect(q('.ccf-sf-trigger').classList.contains('is-filled')).toBe(true);
    expect(q('.ccf-sf-trigger').style.borderRadius).toBe('999px');
  });

  test('hidden when off, when the tag does not match, or when there is no Size option', async () => {
    await load({ settings: { ...SETTINGS, enabled: false } });
    expect(q('#ccf-sf-root')).toBeNull();
    await load({ settings: { ...SETTINGS, productTag: 'size-finder' }, tags: 'kurta|sale' });
    expect(q('#ccf-sf-root')).toBeNull();
    await load({ settings: { ...SETTINGS, productTag: 'Size-Finder' }, tags: 'size-finder' });
    expect(q('.ccf-sf-open')).not.toBeNull();
    await load({ sizeOption: '' });
    expect(q('#ccf-sf-root')).toBeNull();
  });

  test('theme editor explains why it is hidden; stays where it is in the editor', async () => {
    await load({ settings: { ...SETTINGS, enabled: false }, design: 'true' });
    expect(q('#ccf-sf-root').textContent).toMatch(/Turn on "Find my size"/);
    await load({ design: 'true' });
    expect(q('form').nextElementSibling.id).toBe('ccf-sf-root');
  });

  test('moves right under the Size picker, even when the theme put the block lower down', async () => {
    await load({ pageHtml: `
      <div class="shopify-section">
        <form action="/cart/add">
          <variant-selects id="vs"><fieldset><legend>Color</legend></fieldset><fieldset><legend>Size</legend>
            <input type="radio" name="Size" value="S" checked><input type="radio" name="Size" value="M"></fieldset></variant-selects>
        </form>
        <p id="desc">Description</p>
        <div id="ccf-sf-root" data-shop="demo.myshopify.com" data-tags="" data-size-option="Size" data-size-values="S|M" data-design-mode="false"></div>
      </div>` });
    expect(q('#vs').nextElementSibling.id).toBe('ccf-sf-root');
  });

  test('tries the settings call again once when the network fails', async () => {
    jest.useFakeTimers();
    try {
      const p = load({ configFailures: 1 });
      await Promise.resolve();
      for (let i = 0; i < 5; i++) { jest.advanceTimersByTime(1600); await Promise.resolve(); await Promise.resolve(); }
      jest.useRealTimers();
      await p; await flush(); await flush();
      expect(q('.ccf-sf-trigger')).not.toBeNull();
    } finally { jest.useRealTimers(); }
  });
});

describe('ccf-size.js — "Try it on me" steps', () => {
  test('step 1: avatar base — stepper, Man / Woman rows, privacy note', async () => {
    await load();
    open();
    expect(q('.ccf-sf-panel').hidden).toBe(false);
    expect(q('.ccf-sf-htitle').textContent).toBe('Find my size');
    expect(q('.ccf-sf-stepper').getAttribute('aria-label')).toBe('Step 1 of 4');
    expect(document.querySelectorAll('.ccf-sf-dot')).toHaveLength(4);
    expect(title()).toBe('Choose your avatar base');
    const rows = Array.from(document.querySelectorAll('.ccf-sf-row')).map((r) => r.getAttribute('aria-label'));
    expect(rows).toEqual(['Man', 'Woman']);
    expect(q('.ccf-sf-privacy').textContent).toBe('Your data stays private and secure');
  });

  test('step 2: height and weight with values on the right; live "Likely size"; back arrow', async () => {
    await load();
    open();
    btn('Woman').click();
    expect(title()).toBe('Enter your height and weight');
    expect(q('.ccf-sf-stepper').getAttribute('aria-label')).toBe('Step 2 of 4');
    expect(q('.ccf-sf-dot.is-done')).not.toBeNull();
    const vals = Array.from(document.querySelectorAll('.ccf-sf-fval')).map((v) => v.textContent);
    expect(vals).toEqual(['165 cm', '62 kg']);
    const h = q('input[aria-label="Height"]');
    h.value = '178';
    h.dispatchEvent(new Event('input'));
    expect(q('.ccf-sf-fval').textContent).toBe('178 cm');
    await wait(450); await flush();
    expect(q('.ccf-sf-live b').textContent).toBe('M');
    btn('Back').click();
    expect(title()).toBe('Choose your avatar base');
  });

  test('height in feet and weight in pounds', async () => {
    await load();
    open();
    btn('Woman').click();
    btn('ft').click();
    btn('lb').click();
    const vals = Array.from(document.querySelectorAll('.ccf-sf-fval')).map((v) => v.textContent);
    expect(vals[0]).toBe('5′ 5″');
    expect(vals[1]).toBe('137 lb');
  });

  test('step 3: build cards Slim / Athletic / Balanced / Broad with a check; Balanced picked first', async () => {
    await load();
    open();
    btn('Woman').click();
    btn('Continue').click();
    expect(title()).toBe('Choose your build');
    const builds = Array.from(document.querySelectorAll('.ccf-sf-build'));
    expect(builds.map((b) => b.getAttribute('aria-label'))).toEqual(['Slim', 'Athletic', 'Balanced', 'Broad']);
    expect(btn('Balanced').getAttribute('aria-pressed')).toBe('true');
    btn('Athletic').click();
    expect(btn('Athletic').getAttribute('aria-pressed')).toBe('true');
    expect(btn('Balanced').getAttribute('aria-pressed')).toBe('false');
  });

  test('step 4: "Creating your avatar" while the size is worked out, then the result', async () => {
    await load();
    open();
    btn('Man').click();
    const h = q('input[aria-label="Height"]');
    h.value = '178';
    h.dispatchEvent(new Event('input'));
    btn('Continue').click();
    btn('Athletic').click();
    btn('Continue').click();
    expect(title()).toBe('Creating your avatar');
    expect(q('.ccf-sf-status').textContent).toBe('Generating…');
    expect(q('.ccf-sf-pedestal')).not.toBeNull();
    await flush(); await flush(); await flush();
    expect(recommendBodies.at(-1)).toEqual({
      gender: 'men', heightCm: 178, weightKg: 62, shape: 'athletic', fit: 'regular', remember: false, sessionId: '',
    });
    expect(q('.ccf-sf-rtitle').textContent).toBe('Recommended size');
  });

  test('result: product card, recommended size with its neighbours, Select size picks it on the page', async () => {
    await load({ settings: { ...SETTINGS, charts: { ...SETTINGS.charts, women: [
      { size: 'S', chest: 86, waist: 71, length: 105 }, { size: 'M', chest: 91, waist: 76, length: 106 }, { size: 'L', chest: 97, waist: 81, length: 107 },
    ] } } });
    await toResult('Woman');
    const sizes = Array.from(document.querySelectorAll('.ccf-sf-size')).map((s) => s.textContent);
    expect(sizes).toEqual(['SFits close', 'MRecommended', 'LRoomy fit']);
    expect(q('.ccf-sf-size.is-rec').getAttribute('aria-pressed')).toBe('true');
    expect(btn('Change my avatar')).toBeTruthy();
    btn('Select size M').click();
    expect(q('input[name="Size"][value="M"]').checked).toBe(true);
    expect(sizeEvents).toEqual([{ option: 'Size', value: 'M' }]);
    expect(q('.ccf-sf-trigger').classList.contains('is-done')).toBe(true);
    expect(q('.ccf-sf-trigger').textContent).toBe('Your size: MChange');
  });

  test('add to cart: picks the size, shows "Added to cart", then presses the theme button', async () => {
    await load({ pageHtml: ADD_PAGE() });
    let added = 0;
    q('#theme-add').addEventListener('click', (e) => { e.preventDefault(); added += 1; });
    await toResult('Woman');
    expect(q('.ccf-sf-pname').textContent).toBe('Cotton Kurta');
    expect(q('.ccf-sf-pprice').textContent).toBe('₹1,299');
    expect(q('.ccf-sf-thumb').getAttribute('src')).toBe('https://cdn.shopify.com/k.jpg');
    expect(q('.ccf-sf-main').textContent).toBe('Add to cart');
    q('.ccf-sf-main').click();
    await wait(400);
    expect(q('.ccf-sf-main').textContent).toBe(' Added to cart');
    await wait(500);
    expect(added).toBe(1);
    expect(q('input[name="Size"][value="M"]').checked).toBe(true);
    expect(q('.ccf-sf-panel').hidden).toBe(true);
  });

  test('picking another size changes the button; theme button stays disabled → sold out', async () => {
    window.__ccfSizeAddWaitMs = 300;
    await load({ pageHtml: ADD_PAGE('disabled') });
    await toResult('Woman');
    btn('S — Fits close').click();
    expect(q('.ccf-sf-main').textContent).toBe('Add to cart');
    expect(btn('Just select size S')).toBeTruthy();
    try {
      q('.ccf-sf-main').click();
      await wait(150);
      expect(q('.ccf-sf-err')).toBeNull(); // still waiting for the theme
      await wait(450);
      expect(q('.ccf-sf-err').textContent).toBe('Size S is sold out right now.');
    } finally {
      delete window.__ccfSizeAddWaitMs;
    }
  });

  test('theme disables its button while it swaps the size, then enables it → still added', async () => {
    await load({ pageHtml: ADD_PAGE('disabled') });
    let added = 0;
    q('#theme-add').addEventListener('click', (e) => { e.preventDefault(); added += 1; });
    await toResult('Woman');
    q('.ccf-sf-main').click();
    await wait(700);
    q('#theme-add').disabled = false; // the theme finished re-rendering
    await wait(900);
    expect(added).toBe(1);
    expect(q('.ccf-sf-err')).toBeNull();
  });

  test('a size the product does not sell is marked; the nearest sold size is picked instead', async () => {
    await load({ sizeValues: 'S' });
    await toResult('Woman');
    expect(btn('M — Not available')).toBeTruthy();
    expect(q('.ccf-sf-size.is-out')).not.toBeNull();
    expect(q('.ccf-sf-note').textContent).toMatch(/S is the closest size/);
    expect(q('.ccf-sf-note').classList.contains('is-warn')).toBe(true);
    expect(q('.ccf-sf-big b').textContent).toBe('S');
    expect(q('.ccf-sf-pill').textContent).toBe('Closest available');
    expect(q('.ccf-sf-fit').textContent).toBe('One size down from M — expect a closer fit.');
    expect(btn('Select size S')).toBeTruthy();
  });

  test('result card: big size, Best match, fit line, my details on the avatar', async () => {
    await load();
    await toResult('Woman');
    expect(q('.ccf-sf-big b').textContent).toBe('M');
    expect(q('.ccf-sf-pill').textContent).toBe('Best match');
    expect(q('.ccf-sf-fit').textContent).toBe('Chest just right · Waist a little roomy');
    expect(q('.ccf-sf-me').textContent).toMatch(/cm · .*kg/);
    expect(q('.ccf-sf-fine').textContent).toMatch(/A guide, not a guarantee/);
  });

  test('no size the product sells → only Close', async () => {
    await load({ sizeValues: 'XXS' });
    await toResult('Woman');
    expect(btn('Close')).toBeTruthy();
  });

  test('the avatar wears the product: garment shape from the title, fabric from the product photo, "Wearing M"', async () => {
    await load({ pageHtml: ADD_PAGE() });
    await toResult('Woman');
    expect(q('img.ccf-sf-wear')).toBeNull(); // no flat photo any more
    const g = q('.ccf-sf-avatar .ccf-sf-garment');
    expect(g.getAttribute('data-kind')).toBe('kurta'); // "Cotton Kurta"
    expect(q('.ccf-sf-avatar pattern image').getAttribute('href')).toBe('https://cdn.shopify.com/k.jpg');
    expect(g.getAttribute('transform')).toContain('scale(1.000 1.000)');
    expect(q('.ccf-sf-wearing').textContent).toBe('Wearing M');
    expect(q('.ccf-sf-avatar').getAttribute('aria-label')).toBe('Your avatar wearing Cotton Kurta in size M');
  });

  test('another size drapes looser or closer on the avatar', async () => {
    await load({ pageHtml: ADD_PAGE() });
    await toResult('Woman');
    btn('S — Fits close').click();
    expect(q('.ccf-sf-garment').getAttribute('transform')).toContain('scale(0.955 0.985)');
    expect(q('.ccf-sf-wearing').textContent).toBe('Wearing S');
    await load({ pageHtml: ADD_PAGE(), recommend: { ok: true, size: 'S', outOfRange: false, reasons: [] } });
    await toResult('Woman');
    btn('M — Roomy fit').click();
    expect(q('.ccf-sf-garment').getAttribute('transform')).toContain('scale(1.045 1.015)');
    expect(q('.ccf-sf-wearing').textContent).toBe('Wearing M');
  });

  test('garment from title / type / tags: t-shirt before shirt; unknown → t-shirt', async () => {
    await load();
    const kind = window.__ccfSizeFinder.garmentKind;
    expect(kind('Oversized Graphic T-Shirt', '', '')).toBe('tshirt');
    expect(kind('Linen Shirt', '', '')).toBe('shirt');
    expect(kind('Floral Maxi', 'Dresses', '')).toBe('dress');
    expect(kind('Banarasi Silk Saree', '', '')).toBe('saree');
    expect(kind('Slim fit', 'Jeans', '')).toBe('pants');
    expect(kind('Summer co-ord', '', 'shorts sale')).toBe('shorts');
    expect(kind('Zip Hoodie', '', '')).toBe('hoodie');
    expect(kind('Pleated midi', '', 'skirt')).toBe('skirt');
    expect(kind('Anarkali Kurta Set', '', '')).toBe('dress');
    expect(kind('Something', '', '')).toBe('tshirt');
  });

  test('"Dressing your avatar…" while the size is worked out', async () => {
    window.__ccfSizeCreatingMs = 60;
    await load();
    open();
    btn('Woman').click();
    btn('Continue').click();
    btn('Continue').click();
    await wait(45);
    expect(q('.ccf-sf-status').textContent).toBe('Dressing your avatar…');
    await wait(60);
    window.__ccfSizeCreatingMs = 0;
  });

  test('server error → back on the build step with the message', async () => {
    await load({ recommend: { ok: false, error: 'No size chart for this choice' } });
    await toResult('Woman');
    expect(title()).toBe('Choose your build');
    expect(q('.ccf-sf-err').textContent).toBe('No size chart for this choice');
  });

  test('remember my size sends the session id; answers and size pre-fill next time', async () => {
    await load();
    localStorage.setItem('ccf_analytics_session_demo.myshopify.com', 'abc12345-session');
    open();
    btn('Man').click();
    btn('Continue').click();
    q('.ccf-sf-check input').click();
    btn('Continue').click();
    await flush(); await flush(); await flush();
    expect(recommendBodies.at(-1)).toMatchObject({ remember: true, sessionId: 'abc12345-session', gender: 'men' });
    btn('Select size M').click();
    await load({ keepStorage: true });
    expect(q('.ccf-sf-trigger').textContent).toBe('Your size: MChange');
    open();
    expect(title()).toBe('Choose your avatar base');
    expect(q('.ccf-sf-row.is-on').getAttribute('aria-label')).toBe('Man');
  });

  test('a remembered size the product does not sell is not shown', async () => {
    localStorage.setItem('ccf_size_answers_demo.myshopify.com', JSON.stringify({ size: 'XXL' }));
    await load({ keepStorage: true });
    expect(q('.ccf-sf-trigger').classList.contains('is-done')).toBe(false);
  });

  test('size chart, edit details, change my avatar', async () => {
    await load();
    await toResult('Woman');
    btn('View size chart').click();
    expect(q('.ccf-sf-table tr.is-you').textContent).toMatch(/^M/);
    btn('Edit details').click();
    expect(title()).toBe('Enter your height and weight');
    btn('Continue').click();
    btn('Continue').click();
    await flush(); await flush(); await flush();
    btn('Change my avatar').click();
    expect(title()).toBe('Choose your avatar base');
  });

  test('Esc and the backdrop close the sheet', async () => {
    await load();
    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(q('.ccf-sf-panel').hidden).toBe(true);
    open();
    q('.ccf-sf-overlay').click();
    expect(q('.ccf-sf-panel').hidden).toBe(true);
  });
});

describe('ccf-size.js — words and parts set in the admin', () => {
  test('custom words are used', async () => {
    await load({ settings: { ...SETTINGS, texts: {
      advisorTitle: 'Try it on me', menLabel: 'Gents', womenLabel: 'Ladies', step3Title: 'Your body type',
      creatingTitle: 'Building you', privacyText: 'Private', resultTitle: 'Your best size', addToBagText: 'Bag size {size}',
    } }, pageHtml: ADD_PAGE() });
    open();
    expect(q('.ccf-sf-htitle').textContent).toBe('Try it on me');
    expect(btn('Gents')).toBeTruthy();
    expect(q('.ccf-sf-privacy').textContent).toBe('Private');
    btn('Ladies').click();
    btn('Continue').click();
    expect(title()).toBe('Your body type');
    btn('Continue').click();
    expect(title()).toBe('Building you');
    await flush(); await flush(); await flush();
    expect(q('.ccf-sf-rtitle').textContent).toBe('Your best size');
    expect(btn('Bag size M')).toBeTruthy();
  });

  test('parts turned off: live estimate, remember my size, size chart, add to cart', async () => {
    await load({ settings: { ...SETTINGS, options: { liveEstimate: false, rememberSize: false, addToBag: false, sizeChart: false } }, pageHtml: ADD_PAGE() });
    open();
    btn('Woman').click();
    expect(q('.ccf-sf-live')).toBeNull();
    btn('Continue').click();
    expect(q('.ccf-sf-check')).toBeNull();
    btn('Continue').click();
    await flush(); await flush(); await flush();
    expect(btn('View size chart')).toBeFalsy();
    expect(q('.ccf-sf-main').textContent).toBe('Select size M');
  });

  test('only one chart → only that avatar base', async () => {
    await load({ settings: { ...SETTINGS, genders: ['women'] } });
    open();
    const rows = Array.from(document.querySelectorAll('.ccf-sf-row')).map((r) => r.getAttribute('aria-label'));
    expect(rows).toEqual(['Woman']);
  });
});

// ── Phase 8: shoes / rings / bangles stores (one measurement) ─────────────────

describe('ccf-size.js — measure stores', () => {
  const MEASURE = {
    shoes: {
      type: 'shoes', value: 'Foot length', unit: 'cm', min: 18, max: 33, step: 0.1, start: 25,
      title: 'Measure your foot', text: 'Stand on a sheet of paper.', howTo: ['Paper against a wall.', 'Heel on the wall.', 'Measure to the longest toe.'],
      caption: 'Measure your foot · takes 30 seconds', fit: { right: 'True to size, with a little toe room', roomy: 'A little extra room' },
      chart: [{ size: '6', value: 24.6 }, { size: '7', value: 25.4 }, { size: '8', value: 26.2 }],
    },
    rings: {
      type: 'rings', value: 'Finger size (around)', unit: 'mm', min: 40, max: 76, step: 0.5, start: 52,
      title: 'Measure your finger', text: 'Wrap a thread.', howTo: ['a', 'b', 'c'], caption: 'Measure your finger · takes 30 seconds',
      alt: { label: 'A ring that fits', value: 'Inside width of the ring', min: 12.7, max: 24.2, step: 0.1, start: 16.5, toValue: 'circle' },
      fit: { right: 'A comfortable, snug fit', roomy: 'Slightly loose' },
      chart: [{ size: '11', value: 51 }, { size: '12', value: 52 }, { size: '13', value: 53 }],
    },
  };
  const PAGE = (sizes) => `
    <div class="shopify-section">
      <form action="/cart/add">
        <fieldset><legend>Size</legend>
          ${sizes.map((v, i) => `<input type="radio" name="Size" value="${v}"${i === 0 ? ' checked' : ''}>`).join('')}
        </fieldset>
        <button type="submit" name="add" id="theme-add">Add to cart</button>
      </form>
      <div id="ccf-sf-root" data-shop="demo.myshopify.com" data-tags="" data-size-option="Size"
           data-size-values="${sizes.join('|')}" data-product-title="Canvas Sneakers" data-product-price="₹1,499"
           data-product-image="//cdn.shopify.com/s.jpg" data-design-mode="false"></div>
    </div>`;
  const settingsFor = (type) => ({ ...SETTINGS, storeType: type, genders: [], cardText: MEASURE[type].caption, measure: MEASURE[type] });

  test('shoes: button with the type caption; measure screen with drawing, cm/in, − / +, how-to; no avatar steps', async () => {
    await load({ settings: settingsFor('shoes'), pageHtml: PAGE(['6', '7', '8']), recommend: { ok: true, size: '7', outOfRange: false, reasons: [{ area: 'fit', status: 'right', value: 25.4 }] } });
    expect(q('.ccf-sf-caption').textContent).toBe('Measure your foot · takes 30 seconds');
    expect(q('.ccf-sf-trigger svg path').getAttribute('d')).toMatch(/^M3 16.5/); // shoe icon, not the hanger
    open();
    expect(q('.ccf-sf-title').textContent).toBe('Measure your foot');
    expect(q('.ccf-sf-stepper').getAttribute('aria-label')).toBe('Step 1 of 2');
    expect(q('.ccf-sf-art svg')).not.toBeNull();
    expect(btn('Man')).toBeUndefined();
    expect(q('.ccf-sf-fval').textContent).toBe('25 cm');
    btn('More').click();
    expect(q('.ccf-sf-fval').textContent).toBe('25.1 cm');
    btn('in').click();
    expect(q('.ccf-sf-fval').textContent).toBe('9.9 in');
    expect(q('.ccf-sf-howto summary').textContent).toBe('How to measure');
    expect(q('.ccf-sf-howto').querySelectorAll('li')).toHaveLength(3);
  });

  test('shoes: Find my size sends only the measurement (cm) and shows the result with the product picture', async () => {
    await load({ settings: settingsFor('shoes'), pageHtml: PAGE(['6', '7', '8']), recommend: { ok: true, size: '7', outOfRange: false, reasons: [{ area: 'fit', status: 'right', value: 25.4 }] } });
    open();
    q('.ccf-sf-main').click();
    await flush(); await flush(); await flush();
    expect(recommendBodies.at(-1)).toEqual({ value: 25, remember: false, sessionId: '' });
    expect(q('.ccf-sf-big b').textContent).toBe('7');
    expect(q('.ccf-sf-fit').textContent).toBe('True to size, with a little toe room');
    // The product is shown as a shoe (Canvas Sneakers → sneaker) filled with its photo, with a toe-room meter.
    expect(q('.ccf-sf-pvis.is-shoe .ccf-sf-shoe').getAttribute('data-kind')).toBe('sneaker');
    expect(q('.ccf-sf-shoe pattern image').getAttribute('href')).toBe('https://cdn.shopify.com/s.jpg');
    expect(q('.ccf-sf-pvis .ccf-sf-wearing').textContent).toBe('Wearing 7');
    expect(q('.ccf-sf-toetext').textContent).toBe('0.4 cm toe room — just right');
    expect(q('.ccf-sf-toe').classList.contains('is-right')).toBe(true);
    expect(q('.ccf-sf-pvis').getAttribute('aria-label')).toBe('Canvas Sneakers in size 7');
    expect(q('.ccf-sf-avatar')).toBeNull();
    expect(q('.ccf-sf-me').textContent).toBe('Foot 25 cm');
    const sizes = Array.from(document.querySelectorAll('.ccf-sf-size')).map((x) => x.textContent);
    expect(sizes).toEqual(['6Snugger', '7Recommended', '8Looser']);
    expect(btn('Measure again')).toBeTruthy();
    expect(btn('Edit measurement')).toBeTruthy();
    expect(q('.ccf-sf-fine').textContent).toMatch(/Based on your measurement/);
    btn('View size chart').click();
    expect(Array.from(document.querySelectorAll('.ccf-sf-table th')).map((x) => x.textContent)).toEqual(['Size', 'Foot length (cm)']);
    expect(q('.ccf-sf-table tr.is-you').textContent).toBe('725.4');
    q('.ccf-sf-main').click();
    await wait(400);
    expect(document.querySelector('input[name="Size"][value="7"]').checked).toBe(true);
  });

  test('rings: “A ring that fits” sends the inside width as the size around the finger', async () => {
    await load({ settings: settingsFor('rings'), pageHtml: PAGE(['11', '12', '13']), recommend: { ok: true, size: '12', outOfRange: false, reasons: [{ area: 'fit', status: 'right', value: 52 }] } });
    open();
    expect(q('.ccf-sf-fval').textContent).toBe('52 mm');
    btn('A ring that fits').click();
    expect(btn('A ring that fits').getAttribute('aria-pressed')).toBe('true');
    expect(q('.ccf-sf-flabel').textContent).toBe('Inside width of the ring');
    expect(q('.ccf-sf-fval').textContent).toBe('16.5 mm');
    expect(q('.ccf-sf-howto')).toBeNull();
    q('.ccf-sf-main').click();
    await flush(); await flush(); await flush();
    expect(recommendBodies.at(-1).value).toBe(51.8); // π × 16.5
    expect(q('.ccf-sf-me').textContent).toBe('Ring 16.5 mm');
    // The ring is worn on a finger, filled with the product photo, with a fit meter (52 − 51.8 = 0.2 mm).
    expect(q('.ccf-sf-pvis.is-ring .ccf-sf-ring').getAttribute('data-kind')).toBe('solitaire');
    expect(q('.ccf-sf-ring pattern image').getAttribute('href')).toBe('https://cdn.shopify.com/s.jpg');
    expect(q('.ccf-sf-pvis .ccf-sf-wearing').textContent).toBe('Wearing 12');
    expect(q('.ccf-sf-toetext').textContent).toBe('0.2 mm room — comfortable');
    expect(q('.ccf-sf-pvis').getAttribute('aria-label')).toBe('Canvas Sneakers in size 12 on your finger');
  });

  test('measure + remember: saved on this device for next time (value, way of measuring, unit)', async () => {
    await load({ settings: settingsFor('rings'), pageHtml: PAGE(['11', '12', '13']), recommend: { ok: true, size: '12', outOfRange: false, reasons: [] } });
    open();
    btn('More').click();
    q('.ccf-sf-check input').click();
    q('.ccf-sf-main').click();
    await flush(); await flush(); await flush();
    expect(recommendBodies.at(-1)).toMatchObject({ value: 52.5, remember: true });
    const stored = JSON.parse(localStorage.getItem('ccf_size_answers_demo.myshopify.com'));
    expect(stored).toMatchObject({ mval: 52.5, mode: 'self' });
  });

  test('server error → stays on the measure screen with the message', async () => {
    await load({ settings: settingsFor('shoes'), pageHtml: PAGE(['6', '7']), recommend: { ok: false, error: 'Check your measurement and try again.' } });
    open();
    q('.ccf-sf-main').click();
    await flush(); await flush(); await flush();
    expect(q('.ccf-sf-title').textContent).toBe('Measure your foot');
    expect(q('.ccf-sf-err').textContent).toBe('Check your measurement and try again.');
  });

  test('empty measure chart → nothing on the page', async () => {
    await load({ settings: { ...settingsFor('shoes'), measure: { ...MEASURE.shoes, chart: [] } }, pageHtml: PAGE(['6']) });
    expect(q('#ccf-sf-root')).toBeNull();
  });
});

// ── Phase 11: baby & kids clothes ─────────────────────────────────────────────

describe('ccf-size.js — baby clothes', () => {
  const BABY = {
    title: 'Tell us about your baby', text: 'Length and weight give the best fit.',
    howTo: ['Lay flat.', 'Head to heel.', 'Recent weight.'], caption: 'Baby’s size in 20 seconds',
    length: { label: 'Length (head to heel)', min: 40, max: 120, step: 0.5, start: 68 },
    weight: { label: 'Weight', min: 1.5, max: 30, step: 0.1, start: 8 },
    age: { label: 'Age', min: 0, max: 72, step: 1, start: 6 },
    fit: { right: 'Fits now — within this size for length and weight', grow: 'Room to grow — one size up', age: 'Based on age' },
    chart: [
      { size: '0-3 M', maxLength: 62, maxWeight: 6, maxAge: 3 },
      { size: '3-6 M', maxLength: 68, maxWeight: 8, maxAge: 6 },
      { size: '6-9 M', maxLength: 74, maxWeight: 9.5, maxAge: 9 },
    ],
  };
  const PAGE = `
    <div class="shopify-section">
      <form action="/cart/add">
        <fieldset><legend>Size</legend>
          <input type="radio" name="Size" value="0-3 M" checked><input type="radio" name="Size" value="3-6 M"><input type="radio" name="Size" value="6-9 M">
        </fieldset>
        <button type="submit" name="add">Add to cart</button>
      </form>
      <div id="ccf-sf-root" data-shop="demo.myshopify.com" data-tags="" data-size-option="Size"
           data-size-values="0-3 M|3-6 M|6-9 M" data-product-title="Cotton Romper" data-product-price="₹699"
           data-product-image="//cdn.shopify.com/r.jpg" data-design-mode="false"></div>
    </div>`;
  const settings = { ...SETTINGS, storeType: 'baby', genders: [], cardText: BABY.caption, measure: null, baby: BABY };
  const ok = (size, status) => ({ ok: true, size, outOfRange: false, reasons: [{ area: 'fit', status, basis: 'measure' }] });

  test('button with the baby caption; step 1: drawing, Length & weight / Age only, two sliders, fit cards, how-to', async () => {
    await load({ settings, pageHtml: PAGE, recommend: ok('3-6 M', 'right') });
    expect(q('.ccf-sf-caption').textContent).toBe('Baby’s size in 20 seconds');
    open();
    expect(q('.ccf-sf-title').textContent).toBe('Tell us about your baby');
    expect(q('.ccf-sf-stepper').getAttribute('aria-label')).toBe('Step 1 of 2');
    expect(q('.ccf-sf-art svg')).not.toBeNull();
    expect(btn('Length & weight').getAttribute('aria-pressed')).toBe('true');
    expect(Array.from(document.querySelectorAll('.ccf-sf-flabel')).map((e) => e.firstChild.textContent)).toEqual(['Length (head to heel)', 'Weight']);
    expect(Array.from(document.querySelectorAll('.ccf-sf-fval')).map((e) => e.textContent)).toEqual(['68 cm', '8 kg']);
    btn('lb').click();
    expect(Array.from(document.querySelectorAll('.ccf-sf-fval')).map((e) => e.textContent)).toEqual(['68 cm', '17.6 lb']);
    expect(btn('Fits now').getAttribute('aria-pressed')).toBe('true');
    expect(q('.ccf-sf-howto summary').textContent).toBe('How to measure your baby');
    btn('Age only').click();
    expect(q('.ccf-sf-flabel').firstChild.textContent).toBe('Age');
    expect(q('.ccf-sf-fval').textContent).toBe('6 months');
    expect(q('.ccf-sf-howto')).toBeNull();
  });

  test('length + weight → size; result with the picture, measurements, fit line, chart', async () => {
    await load({ settings, pageHtml: PAGE, recommend: ok('3-6 M', 'right') });
    open();
    q('.ccf-sf-main').click();
    await flush(); await flush(); await flush();
    expect(recommendBodies.at(-1)).toEqual({ mode: 'measure', lengthCm: 68, weightKg: 8, grow: false, remember: false, sessionId: '' });
    expect(q('.ccf-sf-big b').textContent).toBe('3-6 M');
    expect(q('.ccf-sf-fit').textContent).toBe('Fits now — within this size for length and weight');
    expect(q('.ccf-sf-me').textContent).toBe('68 cm · 8 kg');
    // The baby wears the outfit (Cotton Romper → romper), filled with the photo, with a grow meter.
    expect(q('.ccf-sf-pvis.is-baby .ccf-sf-baby').getAttribute('data-outfit')).toBe('romper');
    expect(q('.ccf-sf-baby pattern image').getAttribute('href')).toBe('https://cdn.shopify.com/r.jpg');
    expect(q('.ccf-sf-pvis .ccf-sf-wearing').textContent).toBe('Wearing 3-6 M');
    expect(q('.ccf-sf-toetext').textContent).toBe('0 cm room — fits now');
    expect(q('.ccf-sf-pvis').getAttribute('aria-label')).toBe('Your baby wearing Cotton Romper in size 3-6 M');
    btn('View size chart').click();
    expect(Array.from(document.querySelectorAll('.ccf-sf-table th')).map((x) => x.textContent)).toEqual(['Size', 'Length (cm)', 'Weight (kg)', 'Age']);
    expect(q('.ccf-sf-table tr.is-you').textContent).toBe('3-6 Mup to 68up to 83–6 m');
  });

  test('age + room to grow → sends age and grow; fit line says room to grow', async () => {
    await load({ settings, pageHtml: PAGE, recommend: ok('6-9 M', 'grow') });
    open();
    btn('Age only').click();
    btn('Room to grow').click();
    expect(btn('Room to grow').getAttribute('aria-pressed')).toBe('true');
    q('.ccf-sf-main').click();
    await flush(); await flush(); await flush();
    expect(recommendBodies.at(-1)).toEqual({ mode: 'age', ageMonths: 6, grow: true, remember: false, sessionId: '' });
    expect(q('.ccf-sf-fit').textContent).toBe('Room to grow — one size up');
    expect(q('.ccf-sf-me').textContent).toBe('Age 6 months');
    expect(q('.ccf-sf-toetext').textContent).toBe('3 months left in this size — fits now');
  });

  test('remember: the answers stay on this device; only the size goes to the server', async () => {
    await load({ settings, pageHtml: PAGE, recommend: ok('3-6 M', 'right') });
    open();
    q('.ccf-sf-check input').click();
    q('.ccf-sf-main').click();
    await flush(); await flush(); await flush();
    expect(recommendBodies.at(-1)).toMatchObject({ remember: true });
    const stored = JSON.parse(localStorage.getItem('ccf_size_answers_demo.myshopify.com'));
    expect(stored).toMatchObject({ blen: 68, bwt: 8, bmode: 'measure', grow: false });
  });
});

describe('ccf-size.js — add to cart on themes with several cart forms', () => {
  test('a button-less /cart/add form first (Dawn payment terms) → still uses the real Add to cart', async () => {
    await load({ pageHtml: `
      <div class="shopify-section">
        <form action="/cart/add" id="installment"><input type="hidden" name="id" value="1"></form>
        <form action="/cart/add">
          <fieldset><legend>Size</legend>
            <input type="radio" name="Size" value="S" checked><input type="radio" name="Size" value="M">
          </fieldset>
          <button type="submit" name="add" id="real-add">Add to cart</button>
        </form>
        <div id="ccf-sf-root" data-shop="demo.myshopify.com" data-tags="" data-size-option="Size" data-size-values="S|M"
             data-product-title="Tee" data-design-mode="false"></div>
      </div>` });
    await toResult('Woman');
    expect(q('.ccf-sf-main').textContent).toBe('Add to cart');
  });
});

describe('ccf-size.js — shoes worn in a shoe shape', () => {
  test('shoe kind from title / type / tags; unknown → sneaker', async () => {
    await load();
    const kind = window.__ccfSizeFinder.shoeKind;
    expect(kind('Chelsea Leather Boots', '', '')).toBe('boot');
    expect(kind('Block Heel Pumps', '', '')).toBe('heel');
    expect(kind('Kolhapuri Chappal', '', '')).toBe('sandal');
    expect(kind('Comfy Slides', '', '')).toBe('slider');
    expect(kind('Embroidered Jutti', '', '')).toBe('loafer');
    expect(kind('Daily Runner', 'Running Shoes', '')).toBe('sneaker');
    expect(kind('Something', '', '')).toBe('sneaker');
  });

  test('toe room: tight / just right / roomy with the marker position', async () => {
    await load();
    const toe = window.__ccfSizeFinder.toeRoom;
    expect(toe(-0.3)).toMatchObject({ zone: 'tight', text: '0.3 cm shorter than your foot — tight' });
    expect(toe(0.4)).toMatchObject({ zone: 'right', text: '0.4 cm toe room — just right' });
    expect(toe(1.6)).toMatchObject({ zone: 'roomy', text: '1.6 cm toe room — roomy' });
    expect(toe(0.5).pos).toBe(50);
    expect(toe(9).pos).toBe(96);
  });
});

describe('ccf-size.js — rings worn on a finger', () => {
  test('ring style from title / type / tags; unknown → solitaire', async () => {
    await load();
    const kind = window.__ccfSizeFinder.ringKind;
    expect(kind('Classic Gold Wedding Band', '', '')).toBe('band');
    expect(kind('Kundan Cocktail Ring', '', '')).toBe('cocktail');
    expect(kind('Diamond Engagement Ring', '', '')).toBe('solitaire');
    expect(kind('Silver Toe Ring', '', '')).toBe('band');
    expect(kind('Something', '', '')).toBe('solitaire');
  });

  test('ring room: tight / comfortable / may slip', async () => {
    await load();
    const room = window.__ccfSizeFinder.ringRoom;
    expect(room(-0.5)).toMatchObject({ zone: 'tight', text: '0.5 mm smaller than your finger — tight' });
    expect(room(0)).toMatchObject({ zone: 'right', text: 'Exact fit — comfortable' });
    expect(room(1.2)).toMatchObject({ zone: 'right', text: '1.2 mm room — comfortable' });
    expect(room(2.4)).toMatchObject({ zone: 'roomy', text: '2.4 mm extra — may slip' });
  });
});

describe('ccf-size.js — bangles worn on a wrist', () => {
  const BANGLES = {
    type: 'bangles', value: 'Hand width', unit: 'mm', min: 48, max: 80, step: 0.5, start: 60,
    title: 'Measure your hand', text: 'Thumb and little finger together.', howTo: ['a', 'b', 'c'], caption: 'Measure your hand',
    alt: { label: 'A bangle that fits', value: 'Inside width of the bangle', min: 48, max: 80, step: 0.5, start: 60 },
    fit: { right: 'Slides on easily and sits well', roomy: 'A little loose on the wrist' },
    chart: [{ size: '2.4', value: 57.2 }, { size: '2.6', value: 60.3 }, { size: '2.8', value: 63.5 }],
  };
  const PAGE = `
    <div class="shopify-section">
      <form action="/cart/add">
        <fieldset><legend>Size</legend>
          <input type="radio" name="Size" value="2.4" checked><input type="radio" name="Size" value="2.6"><input type="radio" name="Size" value="2.8">
        </fieldset>
        <button type="submit" name="add">Add to cart</button>
      </form>
      <div id="ccf-sf-root" data-shop="demo.myshopify.com" data-tags="" data-size-option="Size" data-size-values="2.4|2.6|2.8"
           data-product-title="Glass Bangle Set" data-product-image="//cdn.shopify.com/b.jpg" data-design-mode="false"></div>
    </div>`;

  test('result: the set worn on the wrist, product photo, "Wearing 2.6", fit meter; a bigger size → looser', async () => {
    await load({ settings: { ...SETTINGS, storeType: 'bangles', genders: [], measure: BANGLES }, pageHtml: PAGE,
      recommend: { ok: true, size: '2.6', outOfRange: false, reasons: [{ area: 'fit', status: 'right', value: 60.3 }] } });
    open();
    q('.ccf-sf-main').click();
    await flush(); await flush(); await flush();
    expect(q('.ccf-sf-pvis.is-bangle .ccf-sf-bangle').getAttribute('data-kind')).toBe('set');
    expect(q('.ccf-sf-bangle pattern image').getAttribute('href')).toBe('https://cdn.shopify.com/b.jpg');
    expect(q('.ccf-sf-pvis .ccf-sf-wearing').textContent).toBe('Wearing 2.6');
    expect(q('.ccf-sf-toetext').textContent).toBe('0.3 mm room — slides on, sits well');
    expect(q('.ccf-sf-pvis').getAttribute('aria-label')).toBe('Glass Bangle Set in size 2.6 on your wrist');
    btn('2.8 — Looser').click();
    expect(q('.ccf-sf-toetext').textContent).toBe('3.5 mm extra — loose on the wrist');
    expect(q('.ccf-sf-toe').classList.contains('is-roomy')).toBe(true);
  });

  test('style from title / type / tags; unknown → single bangle; room words', async () => {
    await load();
    const kind = window.__ccfSizeFinder.bangleKind;
    expect(kind('Gold Plated Kada', '', '')).toBe('kada');
    expect(kind('Silver Charm Bracelet', '', '')).toBe('bracelet');
    expect(kind('Bridal Chooda', '', '')).toBe('set');
    expect(kind('Antique Bangles', '', '')).toBe('bangle');
    expect(kind('Something', '', '')).toBe('bangle');
    const room = window.__ccfSizeFinder.bangleRoom;
    expect(room(-1)).toMatchObject({ zone: 'tight', text: '1 mm smaller than your hand — hard to slip on' });
    expect(room(0)).toMatchObject({ zone: 'right', text: 'Exact fit — slides on, sits well' });
  });
});

describe('ccf-size.js — baby outfit words and grow meter', () => {
  test('outfit from title / type / tags; unknown → romper', async () => {
    await load();
    const kind = window.__ccfSizeFinder.babyOutfit;
    expect(kind('Floral Baby Frock', '', '')).toBe('dress');
    expect(kind('Cotton Jhabla', '', '')).toBe('top');
    expect(kind('Baby Kurta Pyjama', '', '')).toBe('kurta');
    expect(kind('Summer Shorts Set', '', '')).toBe('set');
    expect(kind('Ribbed Joggers', '', '')).toBe('pants');
    expect(kind('Organic Onesie', '', '')).toBe('romper');
    expect(kind('Something', '', '')).toBe('romper');
  });

  test('grow meter by length and by age', async () => {
    await load();
    const room = window.__ccfSizeFinder.babyRoom;
    expect(room(-2, false)).toMatchObject({ zone: 'tight', text: '2 cm longer than this size — too small' });
    expect(room(3, false)).toMatchObject({ zone: 'right', text: '3 cm room — fits now' });
    expect(room(6, false)).toMatchObject({ zone: 'roomy', text: '6 cm room to grow' });
    expect(room(1, true)).toMatchObject({ zone: 'right', text: '1 month left in this size — fits now' });
    expect(room(6, true)).toMatchObject({ zone: 'roomy', text: '6 months to grow into' });
    expect(room(-2, true)).toMatchObject({ zone: 'tight', text: 'Outgrown — 2 months past this size' });
  });
});
