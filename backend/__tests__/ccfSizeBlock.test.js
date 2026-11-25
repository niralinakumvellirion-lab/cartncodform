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

async function load({ settings = SETTINGS, tags = 'kurta', sizeOption = 'Size', sizeValues = 'S|M|L', design = 'false', recommend } = {}) {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  localStorage.clear();
  recommendBodies = [];
  sizeEvents = [];

  // Theme product form with a Size option as radio buttons
  document.body.innerHTML = `
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

describe('ccf-size.js', () => {
  test('shows the button when on and the product has a Size option', async () => {
    await load();
    expect(q('.ccf-sf-open').textContent).toMatch(/Find my size/);
    expect(q('.ccf-sf-panel').hidden).toBe(true);
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

  test('theme editor explains why it is hidden instead of removing it', async () => {
    await load({ settings: { ...SETTINGS, enabled: false }, design: 'true' });
    expect(q('#ccf-sf-root').textContent).toMatch(/Turn on "Find my size"/);
  });

  test('full flow: answers are sent, result shows size and reasons, Select picks it on the page', async () => {
    await load();
    q('.ccf-sf-open').click();
    expect(q('.ccf-sf-step').textContent).toBe('Step 1 of 3');
    btn('Men').click();
    const height = q('input[aria-label="Height"]');
    height.value = '178';
    height.dispatchEvent(new Event('input'));
    btn('Continue').click();
    btn('Broad').click();
    btn('Relaxed').click();
    btn('See my size').click();
    await flush(); await flush();

    expect(recommendBodies[0]).toEqual({
      gender: 'men', heightCm: 178, weightKg: 60, shape: 'broad', fit: 'relaxed', remember: false, sessionId: '',
    });
    expect(q('.ccf-sf-size').textContent).toBe('M');
    const reasons = Array.from(document.querySelectorAll('.ccf-sf-reason')).map((r) => r.textContent);
    expect(reasons).toEqual(['ChestRight for your fit', 'WaistA little roomy', 'LengthGarment length 106 cm']);

    btn('Select size M').click();
    expect(q('input[name="Size"][value="M"]').checked).toBe(true);
    expect(sizeEvents).toEqual([{ option: 'Size', value: 'M' }]);
    expect(q('.ccf-sf-open').textContent).toMatch(/Your size: M/);
  });

  test('"remember" sends the session id; answers pre-fill next time', async () => {
    await load();
    localStorage.setItem('ccf_analytics_session_demo.myshopify.com', 'abc12345-session');
    q('.ccf-sf-open').click();
    btn('Continue').click();
    q('.ccf-sf-check input').click();
    btn('See my size').click();
    await flush(); await flush();
    expect(recommendBodies[0].remember).toBe(true);
    expect(recommendBodies[0].sessionId).toBe('abc12345-session');
    const stored = JSON.parse(localStorage.getItem('ccf_size_answers_demo.myshopify.com'));
    expect(stored.gender).toBe('women');
  });

  test('height in feet and inches', async () => {
    await load();
    q('.ccf-sf-open').click();
    btn('ft').click();
    const values = Array.from(document.querySelectorAll('.ccf-sf-value')).map((v) => v.textContent);
    expect(values[0]).toBe('5′ 4″'); // 162 cm
  });

  test('size the product does not have → explained, no Select button', async () => {
    await load({ sizeValues: 'S|M', recommend: { ok: true, size: 'XL', reasons: [], saved: false } });
    q('.ccf-sf-open').click();
    btn('Continue').click();
    btn('See my size').click();
    await flush(); await flush();
    expect(q('.ccf-sf-result').textContent).toMatch(/doesn’t come in XL/);
    expect(btn('Select size XL')).toBeUndefined();
  });

  test('server error is shown and the shopper can try again', async () => {
    await load({ recommend: { ok: false, error: 'Check your height and weight and try again.' } });
    q('.ccf-sf-open').click();
    btn('Continue').click();
    btn('See my size').click();
    await flush(); await flush();
    expect(q('.ccf-sf-err').textContent).toBe('Check your height and weight and try again.');
    expect(btn('See my size')).toBeDefined();
  });

  test('size chart table in the chosen unit', async () => {
    await load();
    q('.ccf-sf-open').click();
    btn('Continue').click();
    btn('See my size').click();
    await flush(); await flush();
    btn('View size chart').click();
    const cells = Array.from(document.querySelectorAll('.ccf-sf-table td')).map((c) => c.textContent);
    expect(cells.slice(0, 4)).toEqual(['S', '86', '71', '105']);
  });

  test('select dropdown themes are supported too', async () => {
    await load();
    document.body.insertAdjacentHTML('beforeend',
      '<label for="opt-size">Size</label><select id="opt-size" name="options[Size]"><option>S</option><option>M</option></select>');
    expect(window.__ccfSizeFinder.selectSizeOnPage('Size', 'M')).toBe(true);
  });
});

describe('ccf-size.js design details', () => {
  test('progress bar, close button, option card hints and fit meter', async () => {
    await load();
    q('.ccf-sf-open').click();
    expect(document.querySelectorAll('.ccf-sf-progress span.on')).toHaveLength(1);
    btn('Continue').click();
    expect(document.querySelectorAll('.ccf-sf-progress span.on')).toHaveLength(2);
    expect(btn('Broad').textContent).toBe('BroadWider frame');
    btn('See my size').click();
    await flush(); await flush();
    expect(q('.ccf-sf-title').textContent).toBe('Your size');
    expect(q('.ccf-sf-meter-dot').style.left).toBe('50%'); // chest "right"
    btn('Close').click();
    expect(q('.ccf-sf-panel').hidden).toBe(true);
  });
});
