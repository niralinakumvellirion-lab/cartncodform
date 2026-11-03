/**
 * Storefront reviews block (extensions/cartncodform-embed/assets/ccf-reviews.js) in jsdom, built to the
 * approved design: header (label, title, Write a review), summary (average, star bars, customer photos),
 * filter chips + sort, review rows, Load more, and the pop-up pages one question at a time.
 * fetch is replaced by a small fake of the App Proxy endpoints.
 */
import fs from 'fs';
import path from 'path';
import { waitFor, fireEvent } from '@testing-library/react';

const SCRIPT = path.join(__dirname, '../../extensions/cartncodform-embed/assets/ccf-reviews.js');

const rules = (over = {}) => ({
  whoCanReview: 'anyone', loggedIn: false, needsEmail: true, emailRequired: false, starRating: true, starRequired: true,
  photos: { maxPhotos: 2, maxFileSizeMb: 5, allowedTypes: ['gif', 'png'] }, helpfulVotes: true, requireApproval: true,
  canReview: true, reason: null, ...over,
});

const review = (over = {}) => ({
  id: 'a1', name: 'Asha', rating: 5, title: 'Lovely', body: 'Soft and well made.', verified: true, photos: [],
  helpful: 2, createdAt: '2025-03-04T10:00:00.000Z', ...over,
});

let calls;
let handlers;

function mockFetch() {
  calls = [];
  global.fetch = jest.fn((url, opts = {}) => {
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ url, method, body });
    const h = handlers.find((x) => x.method === method && (typeof x.match === 'string' ? url.includes(x.match) : x.match.test(url)));
    const out = h ? h.reply(body, url) : { status: 404, body: { ok: false } };
    if (out && typeof out.then === 'function') return out;
    return Promise.resolve({ status: out.status || 200, json: () => Promise.resolve(out.body) });
  });
}

function listReply(over = {}) {
  return {
    ok: true,
    summary: { count: 2, rated: 2, average: 4.5, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 }, photoCount: 0, gallery: [] },
    reviews: [review()], page: 1, pages: 1, filtered: 2, form: rules(), ...over,
  };
}

function mount(attrs = '') {
  document.body.innerHTML = `<div id="root" data-ccf-reviews data-product-id="111" data-product-handle="blue-kurta" data-product-title="Blue Kurta" data-eyebrow="Customer reviews" data-heading="What customers are saying" ${attrs}></div>`;
  jest.isolateModules(() => { require(SCRIPT); });
  return document.getElementById('root');
}

const text = (node) => node.textContent;
const byText = (root, sel, t) => Array.from(root.querySelectorAll(sel)).find((n) => n.textContent.includes(t));
const gets = () => calls.filter((c) => c.method === 'GET');
const lastGet = () => gets()[gets().length - 1].url;
const dialog = () => document.querySelector('.ccf-rvm-dialog');
const nextBtn = () => document.querySelector('.ccf-rvm-next');
const backBtn = () => document.querySelector('.ccf-rvm-back');
const stepTitle = () => document.querySelector('.ccf-rvm-title').textContent;
const stepCount = () => document.querySelector('.ccf-rvm-count').textContent;
const errText = () => (document.querySelector('.ccf-rvm-errmsg') || {}).textContent;
const goNext = () => fireEvent.click(nextBtn());
const goBack = () => fireEvent.click(backBtn());
const type = (id, value) => fireEvent.input(document.getElementById(id), { target: { value } });
const stars = (n) => fireEvent.click(document.querySelector(`[aria-label="${n} star${n === 1 ? '' : 's'}"]`));

async function ready(root) {
  await waitFor(() => expect(root.querySelector('.ccf-rv-item, .ccf-rv-empty, .ccf-rv-none, .ccf-rv-note')).toBeTruthy());
  return root;
}

async function openWizard(formRules, replyOver) {
  handlers[0].reply = () => ({ body: listReply({ ...(replyOver || {}), ...(formRules ? { form: formRules } : {}) }) });
  const root = mount();
  await waitFor(() => expect(root.querySelector('.ccf-rv-btn--write')).toBeTruthy());
  fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
  return root;
}

// Walks a customer through every page with valid answers, stopping on the final "check" page.
function fillAllPages() {
  stars(4); goNext();
  type('ccf-rv-title', 'Great'); type('ccf-rv-body', 'Really nice quality, would buy again.'); goNext();
  goNext(); // photos (optional)
  type('ccf-rv-name', '  Asha '); type('ccf-rv-email', 'asha@example.com'); goNext();
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.overflow = '';
  handlers = [{ method: 'GET', match: '/apps/cartncodform/reviews?', reply: () => ({ body: listReply() }) }];
  mockFetch();
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

// ─────────────────────────────── the page ───────────────────────────────────

describe('page: header', () => {
  it('asks the proxy for this product, newest first, no filter', async () => {
    await ready(mount());
    expect(gets()[0].url).toBe('/apps/cartncodform/reviews?productId=111&page=1');
  });

  it('shows the small label, the title and the Write a review button at the top', async () => {
    const root = await ready(mount());
    const head = root.querySelector('.ccf-rv-head');
    expect(head.querySelector('.ccf-rv-eyebrow').textContent).toBe('Customer reviews');
    expect(head.querySelector('h2').textContent).toBe('What customers are saying');
    expect(head.querySelector('.ccf-rv-btn--write').textContent).toBe('Write a review');
    expect(root.querySelector('.ccf-rv-inner').firstChild).toBe(head);
  });

  it('the small label is not repeated when it is the same as the title (older block settings)', async () => {
    document.body.innerHTML = '<div id="root" data-ccf-reviews data-product-id="1" data-eyebrow="Customer reviews" data-heading="Customer reviews"></div>';
    jest.isolateModules(() => { require(SCRIPT); });
    const root = await ready(document.getElementById('root'));
    expect(root.querySelector('.ccf-rv-eyebrow')).toBeNull();
    expect(root.querySelector('h2').textContent).toBe('Customer reviews');
  });

  it('logged-in only: guests get a login link instead of the button', async () => {
    handlers[0].reply = () => ({ body: listReply({ form: rules({ canReview: false, reason: 'LOGIN_REQUIRED' }) }) });
    const root = await ready(mount());
    const a = byText(root, 'a', 'Log in to write a review');
    expect(a.getAttribute('href')).toContain('/account/login?return_url=');
    expect(root.querySelector('button.ccf-rv-btn--write')).toBeNull();
  });

  it.each([
    ['NOT_VERIFIED_BUYER', 'Only customers who bought this product can write a review.'],
    ['ALREADY_REVIEWED', 'Thank you, you have already reviewed this product.'],
  ])('%s shows a message instead of the button', async (reason, message) => {
    handlers[0].reply = () => ({ body: listReply({ form: rules({ canReview: false, reason }) }) });
    const root = await ready(mount());
    expect(root.querySelector('.ccf-rv-reason').textContent).toBe(message);
    expect(root.querySelector('.ccf-rv-btn--write')).toBeNull();
  });
});

describe('page: summary', () => {
  it('shows the average, vector stars and the review count', async () => {
    const root = await ready(mount());
    expect(root.querySelector('.ccf-rv-avg').textContent).toBe('4.5');
    expect(text(root.querySelector('.ccf-rv-score'))).toContain('out of 5');
    expect(text(root.querySelector('.ccf-rv-score'))).toContain('Based on 2 reviews');
    const s = root.querySelector('.ccf-rv-sumstars');
    expect(s.getAttribute('aria-label')).toBe('4.5 out of 5 stars');
    expect(s.querySelectorAll('svg')).toHaveLength(5);
    expect(text(root)).not.toContain('★');
  });

  it('5-to-1 star bars with counts; clicking a bar filters, clicking it again clears the filter', async () => {
    const root = await ready(mount());
    const bars = root.querySelectorAll('.ccf-rv-bar');
    expect(bars).toHaveLength(5);
    expect(bars[0].textContent).toBe('5 stars1');
    expect(bars[0].querySelector('.ccf-rv-bar-fill').style.width).toBe('50%');
    fireEvent.click(bars[0]);
    await waitFor(() => expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=1&rating=5'));
    await waitFor(() => expect(root.querySelector('.ccf-rv-bar.on')).toBeTruthy());
    expect(root.querySelector('.ccf-rv-bar.on').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(root.querySelector('.ccf-rv-bar.on'));
    await waitFor(() => expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=1'));
  });

  it('customer photos: up to 4 tiles, the 4th shows "+N" and opens the photo filter; others open the viewer', async () => {
    const pics = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => `https://res.cloudinary.com/demo/${n}.jpg`);
    handlers[0].reply = () => ({ body: listReply({ summary: { ...listReply().summary, photoCount: 5, gallery: pics } }) });
    const root = await ready(mount());
    const tiles = root.querySelectorAll('.ccf-rv-gtile');
    expect(tiles).toHaveLength(4);
    expect(tiles[3].querySelector('.ccf-rv-gmore').textContent).toBe('+2');
    expect(text(root.querySelector('.ccf-rv-gallery'))).toContain('See all 5 reviews with photos');
    fireEvent.click(tiles[0]);
    expect(document.querySelector('.ccf-rvm-lightbox .ccf-rvm-bigphoto').getAttribute('src')).toBe(pics[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    fireEvent.click(tiles[3]);
    await waitFor(() => expect(lastGet()).toContain('&photos=1'));
  });

  it('no photos: no photo block; no ratings: no average or bars', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ rating: null })], summary: { count: 1, rated: 0, average: 0, distribution: {}, photoCount: 0, gallery: [] }, form: rules({ starRating: false, starRequired: false }) }) });
    const root = await ready(mount());
    expect(root.querySelector('.ccf-rv-gallery')).toBeNull();
    expect(root.querySelector('.ccf-rv-avg')).toBeNull();
    expect(root.querySelector('.ccf-rv-bars')).toBeNull();
    expect(text(root.querySelector('.ccf-rv-score'))).toContain('Based on 1 review');
  });
});

describe('page: filters and sort', () => {
  it('chips: All, With photos, 5, 4, "3 stars and below" with their counts; empty ones are left out', async () => {
    handlers[0].reply = () => ({ body: listReply({ summary: { count: 10, rated: 10, average: 4.2, distribution: { 5: 6, 4: 2, 3: 1, 2: 0, 1: 1 }, photoCount: 3, gallery: [] } }) });
    const root = await ready(mount());
    expect(Array.from(root.querySelectorAll('.ccf-rv-chip')).map((c) => c.textContent)).toEqual(['All reviews10', 'With photos3', '5 stars6', '4 stars2', '3 stars and below2']);
    handlers[0].reply = () => ({ body: listReply({ summary: { count: 2, rated: 2, average: 5, distribution: { 5: 2 }, photoCount: 0, gallery: [] } }) });
    const other = await ready(mount());
    expect(Array.from(other.querySelectorAll('.ccf-rv-chip')).map((c) => c.textContent)).toEqual(['All reviews2', '5 stars2']);
  });

  it('a chip asks the server for that filter and is shown as pressed', async () => {
    handlers[0].reply = () => ({ body: listReply({ summary: { ...listReply().summary, count: 3, rated: 3, distribution: { 5: 1, 4: 1, 3: 1 }, photoCount: 1 } }) });
    const root = await ready(mount());
    fireEvent.click(byText(root, '.ccf-rv-chip', 'With photos'));
    await waitFor(() => expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=1&photos=1'));
    await waitFor(() => expect(byText(root, '.ccf-rv-chip', 'With photos').getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(byText(root, '.ccf-rv-chip', '3 stars and below'));
    await waitFor(() => expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=1&rating=low'));
    fireEvent.click(byText(root, '.ccf-rv-chip', 'All reviews'));
    await waitFor(() => expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=1'));
  });

  it('sort select: four orders, sent to the server; filter and sort combine', async () => {
    const root = await ready(mount());
    const sel = root.querySelector('.ccf-rv-sort');
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['recent', 'helpful', 'highest', 'lowest']);
    fireEvent.change(sel, { target: { value: 'lowest' } });
    await waitFor(() => expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=1&sort=lowest'));
    fireEvent.click(byText(root, '.ccf-rv-chip', '5 stars'));
    await waitFor(() => expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=1&rating=5&sort=lowest'));
    expect(root.querySelector('.ccf-rv-sort').value).toBe('lowest');
  });

  it('sort options that do not apply are left out (no stars, no helpful votes)', async () => {
    handlers[0].reply = () => ({ body: listReply({ form: rules({ starRating: false, starRequired: false, helpfulVotes: false }) }) });
    const root = await ready(mount());
    expect(Array.from(root.querySelector('.ccf-rv-sort').options).map((o) => o.value)).toEqual(['recent']);
  });

  it('nothing matches: a message with a way back to all reviews', async () => {
    const root = await ready(mount());
    handlers[0].reply = () => ({ body: listReply({ reviews: [], filtered: 0 }) });
    fireEvent.click(byText(root, '.ccf-rv-chip', '5 stars'));
    await waitFor(() => expect(root.querySelector('.ccf-rv-none')).toBeTruthy());
    expect(text(root.querySelector('.ccf-rv-none'))).toContain('No reviews match this filter.');
    handlers[0].reply = () => ({ body: listReply() });
    fireEvent.click(byText(root, '.ccf-rv-none button', 'Show all reviews'));
    await waitFor(() => expect(root.querySelector('.ccf-rv-item')).toBeTruthy());
  });
});

describe('page: review rows', () => {
  it('row: initials, name, Verified buyer, stars, date, title, text', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ name: 'Priya Sharma' })] }) });
    const root = await ready(mount());
    const item = root.querySelector('.ccf-rv-item');
    expect(item.querySelector('.ccf-rv-ava').textContent).toBe('PS');
    expect(item.querySelector('.ccf-rv-ava').getAttribute('aria-hidden')).toBe('true');
    expect(item.querySelector('.ccf-rv-name').textContent).toBe('Priya Sharma');
    expect(item.querySelector('.ccf-rv-badge').textContent).toBe('Verified buyer');
    expect(item.querySelector('.ccf-rv-stars').getAttribute('aria-label')).toBe('5 out of 5 stars');
    expect(item.querySelectorAll('.ccf-rv-staricon.on')).toHaveLength(5);
    expect(item.querySelector('.ccf-rv-date').textContent).not.toBe('');
    expect(item.querySelector('h3.ccf-rv-title').textContent).toBe('Lovely');
    expect(item.querySelector('.ccf-rv-body').textContent).toBe('Soft and well made.');
  });

  it('initials: one name gives one letter, an empty name gives ?', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ id: '1', name: 'zoya' }), review({ id: '2', name: '   ' })] }) });
    const root = await ready(mount());
    expect(Array.from(root.querySelectorAll('.ccf-rv-ava')).map((n) => n.textContent)).toEqual(['Z', '?']);
  });

  it('a 3-star review fills three stars', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ rating: 3 })] }) });
    const root = await ready(mount());
    expect(root.querySelectorAll('.ccf-rv-item .ccf-rv-staricon.on')).toHaveLength(3);
  });

  it('shows review text as plain text, never as HTML', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ body: '<img src=x onerror=alert(1)>', name: '<b>Bob</b>', title: '<script>x</script>' })] }) });
    const root = await ready(mount());
    expect(text(root)).toContain('<img src=x onerror=alert(1)>');
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
  });

  it('the script never writes HTML strings into the page', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).not.toMatch(/\.innerHTML|insertAdjacentHTML|document\.write|outerHTML/);
  });

  it('settings off: no stars on rows, no Helpful, no badge', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ rating: null, helpful: null, verified: false })], form: rules({ starRating: false, starRequired: false, helpfulVotes: false }) }) });
    const root = await ready(mount());
    expect(root.querySelector('.ccf-rv-item .ccf-rv-stars')).toBeNull();
    expect(root.querySelector('.ccf-rv-help')).toBeNull();
    expect(root.querySelector('.ccf-rv-badge')).toBeNull();
  });

  it('photo on a row opens the viewer; Escape closes it and focus returns', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ photos: ['https://res.cloudinary.com/demo/a.jpg'] })] }) });
    const root = await ready(mount());
    const opener = root.querySelector('.ccf-rv-photo');
    fireEvent.click(opener);
    const img = document.querySelector('.ccf-rvm-lightbox .ccf-rvm-bigphoto');
    expect(img.alt).toBe('Photo from Asha');
    expect(document.documentElement.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(opener);
  });

  it('empty product: friendly message, no summary or toolbar', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [], filtered: 0, summary: { count: 0, rated: 0, average: 0, distribution: {}, photoCount: 0, gallery: [] } }) });
    const root = await ready(mount());
    expect(text(root.querySelector('.ccf-rv-empty'))).toContain('No reviews yet');
    expect(text(root.querySelector('.ccf-rv-empty'))).toContain('Be the first to share your thoughts.');
    expect(root.querySelector('.ccf-rv-summary').hidden).toBe(true);
    expect(root.querySelector('.ccf-rv-toolbar').hidden).toBe(true);
  });

  it('error note when reviews cannot load', async () => {
    handlers[0].reply = () => ({ status: 500, body: { ok: false } });
    const root = await ready(mount());
    expect(text(root)).toContain('Reviews could not be loaded right now.');
  });
});

describe('page: Load more', () => {
  it('"Showing X of Y", and Load more adds the next page below', async () => {
    handlers[0].reply = (_b, url) => ({ body: listReply({ pages: 2, filtered: 2, page: url.includes('page=2') ? 2 : 1, reviews: [review({ id: url.includes('page=2') ? 'p2' : 'p1', name: url.includes('page=2') ? 'Second' : 'First' })] }) });
    const root = await ready(mount());
    expect(text(root.querySelector('.ccf-rv-foot'))).toContain('Showing 1 of 2 reviews');
    fireEvent.click(root.querySelector('.ccf-rv-more'));
    await waitFor(() => expect(root.querySelectorAll('.ccf-rv-item')).toHaveLength(2));
    expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=2');
    expect(Array.from(root.querySelectorAll('.ccf-rv-name')).map((n) => n.textContent)).toEqual(['First', 'Second']);
    expect(text(root.querySelector('.ccf-rv-foot'))).toContain('Showing 2 of 2 reviews');
    expect(root.querySelector('.ccf-rv-more')).toBeNull();
  });

  it('Load more keeps the current filter and sort', async () => {
    handlers[0].reply = (_b, url) => ({ body: listReply({ pages: 2, page: url.includes('page=2') ? 2 : 1 }) });
    const root = await ready(mount());
    fireEvent.change(root.querySelector('.ccf-rv-sort'), { target: { value: 'helpful' } });
    await waitFor(() => expect(lastGet()).toContain('sort=helpful'));
    await waitFor(() => expect(root.querySelector('.ccf-rv-more')).toBeTruthy());
    fireEvent.click(root.querySelector('.ccf-rv-more'));
    await waitFor(() => expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=2&sort=helpful'));
  });

  it('a failed Load more shows a message and keeps what is already shown', async () => {
    let n = 0;
    handlers[0].reply = () => (++n === 1 ? { body: listReply({ pages: 2 }) } : { status: 500, body: { ok: false } });
    const root = await ready(mount());
    fireEvent.click(root.querySelector('.ccf-rv-more'));
    await waitFor(() => expect(text(root)).toContain('Could not load more reviews.'));
    expect(root.querySelectorAll('.ccf-rv-item')).toHaveLength(1);
  });
});

describe('page: helpful votes', () => {
  it('sends one vote, updates the count, and remembers it', async () => {
    handlers.push({ method: 'POST', match: '/a1/helpful', reply: () => ({ body: { ok: true, already: false, helpful: 3 } }) });
    const root = await ready(mount());
    expect(text(root.querySelector('.ccf-rv-helpful'))).toContain('Was this helpful?');
    fireEvent.click(byText(root, 'button', 'Yes (2)'));
    await waitFor(() => expect(byText(root, 'button', 'Yes (3)')).toBeTruthy());
    expect(calls.find((c) => c.url.endsWith('/a1/helpful')).body.visitorId).toMatch(/^v/);
    expect(byText(root, 'button', 'Yes (3)').disabled).toBe(true);
    expect(byText(root, 'button', 'Yes (3)').getAttribute('aria-pressed')).toBe('true');

    mockFetch();
    const again = await ready(mount());
    expect(byText(again, 'button', 'Yes (2)').disabled).toBe(true);
  });

  it('re-enables the button if the vote did not go through', async () => {
    handlers.push({ method: 'POST', match: '/a1/helpful', reply: () => ({ status: 429, body: { ok: false } }) });
    const root = await ready(mount());
    fireEvent.click(byText(root, 'button', 'Yes (2)'));
    await waitFor(() => expect(byText(root, 'button', 'Yes (2)').disabled).toBe(false));
  });

  it('works when localStorage is blocked', async () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    handlers.push({ method: 'POST', match: '/a1/helpful', reply: () => ({ body: { ok: true, helpful: 3 } }) });
    const root = await ready(mount());
    fireEvent.click(byText(root, 'button', 'Yes (2)'));
    await waitFor(() => expect(byText(root, 'button', 'Yes (3)')).toBeTruthy());
    spy.mockRestore();
  });
});

describe('page: colours on dark themes', () => {
  function withComputedVars(fn) {
    const orig = window.getComputedStyle;
    window.getComputedStyle = (el, ...r) => {
      const cs = orig(el, ...r);
      return new Proxy(cs, { get: (t, p) => (p === 'getPropertyValue' ? (n) => (el.style && el.style.getPropertyValue(n)) || t.getPropertyValue(n) : Reflect.get(t, p)) });
    };
    return Promise.resolve(fn()).finally(() => { window.getComputedStyle = orig; });
  }

  it('dark theme + near-black button and stars: the page uses the theme text colour; the white pop-up keeps the chosen colours', () => withComputedVars(async () => {
    const root = await ready(mount('style="color: rgb(242, 242, 242); --ccf-rv-accent: #141414; --ccf-rv-star: #141414"'));
    expect(root.style.getPropertyValue('--ccf-rv-accent')).toBe('rgb(242, 242, 242)');
    expect(root.style.getPropertyValue('--ccf-rv-star')).toBe('rgb(242, 242, 242)');
    expect(root.style.getPropertyValue('--ccf-rv-accent-fg')).toBe('#141414');
    fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
    const layer = document.querySelector('.ccf-rvm');
    expect(layer.style.getPropertyValue('--ccf-rv-accent')).toBe('#141414');
    expect(layer.style.getPropertyValue('--ccf-rv-star')).toBe('#141414');
    expect(layer.style.getPropertyValue('--ccf-rv-accent-fg')).toBe('#ffffff');
  }));

  it('light theme: the chosen colours are used as they are', () => withComputedVars(async () => {
    const root = await ready(mount('style="color: rgb(20, 20, 20); --ccf-rv-accent: #1F3A5F; --ccf-rv-star: #E0A100"'));
    expect(root.style.getPropertyValue('--ccf-rv-accent')).toBe('#1F3A5F');
    expect(root.style.getPropertyValue('--ccf-rv-star')).toBe('#E0A100');
    expect(root.style.getPropertyValue('--ccf-rv-accent-fg')).toBe('#ffffff');
  }));

  it('dark theme with a bright brand colour: kept, with dark text on the button', () => withComputedVars(async () => {
    const root = await ready(mount('style="color: rgb(242, 242, 242); --ccf-rv-accent: #facc15; --ccf-rv-star: #E0A100"'));
    expect(root.style.getPropertyValue('--ccf-rv-accent')).toBe('#facc15');
    expect(root.style.getPropertyValue('--ccf-rv-star')).toBe('#E0A100');
    expect(root.style.getPropertyValue('--ccf-rv-accent-fg')).toBe('#141414');
  }));
});

// ─────────────────────────── the pop-up pages ───────────────────────────────

describe('pop-up: opening and closing', () => {
  it('opens a dialog on <body> (outside the theme container), locks page scroll, starts on the rating page', async () => {
    const root = await openWizard();
    expect(dialog().getAttribute('role')).toBe('dialog');
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(root.contains(dialog())).toBe(false);
    expect(dialog().closest('.ccf-rvm').parentElement).toBe(document.body);
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(stepTitle()).toBe('How would you rate it?');
    expect(stepCount()).toBe('Step 1 of 5 · Rating');
  });

  it('shows the product it is for: name and picture', async () => {
    document.body.innerHTML = '<div id="root" data-ccf-reviews data-product-id="111" data-product-title="Blue Kurta" data-product-image="https://cdn.shopify.com/k.jpg"></div>';
    jest.isolateModules(() => { require(SCRIPT); });
    const root = document.getElementById('root');
    await waitFor(() => expect(root.querySelector('.ccf-rv-btn--write')).toBeTruthy());
    fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
    expect(document.querySelector('.ccf-rvm-pname').textContent).toBe('Blue Kurta');
    expect(document.querySelector('.ccf-rvm-pkicker').textContent).toBe('Write a review');
    expect(document.querySelector('.ccf-rvm-pthumb img').getAttribute('src')).toBe('https://cdn.shopify.com/k.jpg');
  });

  it('without a product name or picture it still reads well', async () => {
    document.body.innerHTML = '<div id="root" data-ccf-reviews data-product-id="111"></div>';
    jest.isolateModules(() => { require(SCRIPT); });
    const root = document.getElementById('root');
    await waitFor(() => expect(root.querySelector('.ccf-rv-btn--write')).toBeTruthy());
    fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
    expect(document.querySelector('.ccf-rvm-pname').textContent).toBe('This product');
    expect(document.querySelector('.ccf-rvm-pthumb img')).toBeNull();
  });

  it('the first star gets the focus', async () => {
    await openWizard();
    expect(document.activeElement.className).toContain('ccf-rvm-star');
  });

  it('Escape closes it, gives the scroll back and the focus returns to the write button', async () => {
    const root = await openWizard();
    const btn = root.querySelector('.ccf-rv-btn--write');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(btn);
  });

  it('the X button and a click on the dark backdrop close it too', async () => {
    const root = await openWizard();
    fireEvent.click(document.querySelector('.ccf-rvm-x'));
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
    fireEvent.click(document.querySelector('.ccf-rvm-backdrop'));
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
  });

  it('Tab stays inside the dialog (last wraps to first)', async () => {
    await openWizard();
    const items = Array.from(dialog().querySelectorAll('button')).filter((n) => !n.disabled && !n.hidden && n.style.visibility !== 'hidden');
    items[items.length - 1].focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);
  });

  it('Shift+Tab from the first control wraps to the last one', async () => {
    await openWizard();
    const items = Array.from(dialog().querySelectorAll('button')).filter((n) => !n.disabled && !n.hidden && n.style.visibility !== 'hidden');
    items[0].focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

describe('pop-up: the pages, one at a time', () => {
  it('with everything on there are 5 pages in this order', async () => {
    await openWizard();
    const seen = [stepTitle()];
    stars(5); goNext(); seen.push(stepTitle());
    type('ccf-rv-body', 'Really nice quality, would buy again.'); goNext(); seen.push(stepTitle());
    goNext(); seen.push(stepTitle());
    type('ccf-rv-name', 'Asha'); goNext(); seen.push(stepTitle());
    expect(seen).toEqual(['How would you rate it?', 'Tell us about it', 'Add photos', 'About you', 'Check your review']);
    expect(stepCount()).toBe('Step 5 of 5 · Check and submit');
  });

  it('star rating off removes the rating page; photos off removes the photos page', async () => {
    await openWizard(rules({ starRating: false, starRequired: false, photos: null }));
    expect(stepTitle()).toBe('Tell us about it');
    expect(stepCount()).toBe('Step 1 of 3 · Your review');
    expect(document.querySelectorAll('.ccf-rvm-seg')).toHaveLength(3);
  });

  it('the progress segments fill as you go', async () => {
    await openWizard();
    expect(document.querySelectorAll('.ccf-rvm-seg.on')).toHaveLength(1);
    stars(3); goNext();
    expect(document.querySelectorAll('.ccf-rvm-seg.on')).toHaveLength(2);
  });

  it('Back is hidden on the first page (and on phones removed so Continue is full width), then goes back keeping what was typed', async () => {
    await openWizard();
    expect(backBtn().style.visibility).toBe('hidden');
    expect(document.querySelector('.ccf-rvm-foot').className).toContain('ccf-rvm-first');
    stars(4); goNext();
    expect(backBtn().style.visibility).toBe('visible');
    expect(document.querySelector('.ccf-rvm-foot').className).not.toContain('ccf-rvm-first');
    type('ccf-rv-title', 'Nice'); type('ccf-rv-body', 'Really nice quality, would buy again.');
    goBack();
    expect(document.querySelector('[aria-label="4 stars"]').getAttribute('aria-checked')).toBe('true');
    goNext();
    expect(document.getElementById('ccf-rv-title').value).toBe('Nice');
    expect(document.getElementById('ccf-rv-body').value).toBe('Really nice quality, would buy again.');
  });

  it('pages slide in the direction you are going', async () => {
    await openWizard();
    expect(document.querySelector('.ccf-rvm-step').className).toContain('ccf-rvm-in-first');
    stars(4); goNext();
    expect(document.querySelector('.ccf-rvm-step').className).toContain('ccf-rvm-in-next');
    goBack();
    expect(document.querySelector('.ccf-rvm-step').className).toContain('ccf-rvm-in-back');
  });

  it('the button says Continue, and Submit review on the last page; Skip only on the photos page', async () => {
    await openWizard();
    expect(nextBtn().textContent).toBe('Continue');
    expect(document.querySelector('.ccf-rvm-skip').hidden).toBe(true);
    stars(4); goNext(); type('ccf-rv-body', 'Really nice quality, would buy again.'); goNext();
    expect(document.querySelector('.ccf-rvm-skip').hidden).toBe(false);
    fireEvent.click(document.querySelector('.ccf-rvm-skip'));
    expect(stepTitle()).toBe('About you');
    type('ccf-rv-name', 'Asha'); goNext();
    expect(nextBtn().textContent).toBe('Submit review');
  });
});

describe('pop-up: rating page', () => {
  it('stars are a radio group; choosing one fills that many and shows its word', async () => {
    await openWizard();
    expect(document.querySelector('[role="radiogroup"]').getAttribute('aria-label')).toBe('Your rating');
    expect(document.querySelectorAll('[role="radio"]')).toHaveLength(5);
    expect(document.querySelector('.ccf-rvm-ratelabel').textContent).toBe('Select a rating');
    expect(document.querySelectorAll('.ccf-rvm-star.on')).toHaveLength(0);
    stars(4);
    expect(document.querySelector('.ccf-rvm-ratelabel').textContent).toBe('Very good');
    expect(document.querySelectorAll('.ccf-rvm-star.on')).toHaveLength(4);
    expect(document.querySelector('[aria-label="4 stars"]').getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[aria-label="3 stars"]').getAttribute('aria-checked')).toBe('false');
  });

  it('REGRESSION: the star icons themselves are not pre-filled (they showed 5 filled for a 4-star choice)', async () => {
    await openWizard();
    stars(4);
    expect(document.querySelectorAll('.ccf-rvm-star .ccf-rv-staricon.on')).toHaveLength(0);
  });

  it('hovering previews a rating and leaving puts it back', async () => {
    await openWizard();
    stars(2);
    fireEvent.mouseEnter(document.querySelector('[aria-label="5 stars"]'));
    expect(document.querySelector('.ccf-rvm-ratelabel').textContent).toBe('Excellent');
    fireEvent.mouseLeave(document.querySelector('.ccf-rvm-stars'));
    expect(document.querySelector('.ccf-rvm-ratelabel').textContent).toBe('Fair');
  });

  it('arrow keys change the rating', async () => {
    await openWizard();
    stars(3);
    fireEvent.keyDown(document.querySelector('[aria-label="3 stars"]'), { key: 'ArrowRight' });
    expect(document.querySelector('[aria-label="4 stars"]').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(document.querySelector('[aria-label="4 stars"]'), { key: 'ArrowLeft' });
    expect(document.querySelector('[aria-label="3 stars"]').getAttribute('aria-checked')).toBe('true');
  });

  it('a rating is required when the shop says so', async () => {
    await openWizard();
    goNext();
    expect(errText()).toBe('Choose a star rating to continue.');
    expect(stepTitle()).toBe('How would you rate it?');
    stars(5);
    expect(errText()).toBeUndefined();
    goNext();
    expect(stepTitle()).toBe('Tell us about it');
  });

  it('when rating is optional you can go on without choosing', async () => {
    await openWizard(rules({ starRequired: false }));
    goNext();
    expect(stepTitle()).toBe('Tell us about it');
  });
});

describe('pop-up: review text and about you', () => {
  it('the text needs at least 10 characters, with a live counter; the headline is optional', async () => {
    await openWizard();
    stars(5); goNext();
    expect(document.querySelector('label[for="ccf-rv-title"]').textContent).toBe('HeadlineOptional');
    goNext();
    expect(errText()).toBe('Write at least 10 characters.');
    type('ccf-rv-body', 'short');
    expect(document.querySelector('.ccf-rvm-counter').textContent).toBe('5 / 2000');
    expect(document.querySelector('.ccf-rvm-counter').className).not.toContain('ok');
    type('ccf-rv-body', 'Long enough text here.');
    expect(document.querySelector('.ccf-rvm-counter').className).toContain('ok');
    goNext();
    expect(stepTitle()).toBe('Add photos');
  });

  it('name is required; email is optional for "anyone" but must look like an email', async () => {
    await openWizard();
    stars(5); goNext(); type('ccf-rv-body', 'Long enough text here.'); goNext(); goNext();
    expect(document.querySelector('label[for="ccf-rv-email"]').textContent).toBe('EmailOptional');
    goNext();
    expect(errText()).toBe('Enter your name.');
    type('ccf-rv-name', 'Asha');
    type('ccf-rv-email', 'not-an-email');
    goNext();
    expect(errText()).toBe('Enter a valid email address.');
    type('ccf-rv-email', '');
    goNext();
    expect(stepTitle()).toBe('Check your review');
  });

  it('verified buyers only: the email is required and explained', async () => {
    await openWizard(rules({ emailRequired: true }));
    stars(5); goNext(); type('ccf-rv-body', 'Long enough text here.'); goNext(); goNext();
    expect(document.querySelector('label[for="ccf-rv-email"]').textContent).toBe('Email');
    expect(text(dialog())).toContain('Use the email from your order. It is never shown.');
    type('ccf-rv-name', 'Asha');
    goNext();
    expect(errText()).toBe('Enter the email you used to order.');
  });

  it('logged-in customers get no email box', async () => {
    await openWizard(rules({ needsEmail: false, loggedIn: true }));
    stars(5); goNext(); type('ccf-rv-body', 'Long enough text here.'); goNext(); goNext();
    expect(document.getElementById('ccf-rv-email')).toBeNull();
  });

  it('Enter in the headline moves to the text; Enter in the name goes to the next page', async () => {
    await openWizard();
    stars(5); goNext();
    fireEvent.keyDown(document.getElementById('ccf-rv-title'), { key: 'Enter' });
    expect(document.activeElement).toBe(document.getElementById('ccf-rv-body'));
    type('ccf-rv-body', 'Long enough text here.'); goNext(); goNext();
    type('ccf-rv-name', 'Asha');
    fireEvent.keyDown(document.getElementById('ccf-rv-name'), { key: 'Enter' });
    expect(stepTitle()).toBe('Check your review');
  });
});

describe('pop-up: photos page', () => {
  const gif = (name = 'a.gif', type = 'image/gif') => new File([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3, 4, 5, 6])], name, { type });
  const pick = (...files) => fireEvent.change(document.getElementById('ccf-rv-photos'), { target: { files } });
  const tiles = () => Array.from(document.querySelectorAll('.ccf-rvm-tiles > *')).map((t) => t.className.replace('ccf-rvm-', '').split(' ')[0]);

  async function onPhotos() {
    await openWizard();
    stars(5); goNext(); type('ccf-rv-body', 'Long enough text here.'); goNext();
  }

  it('tiles: an "Add photo" tile and empty tiles; the hint says the limits', async () => {
    await onPhotos();
    expect(tiles()).toEqual(['add', 'empty', 'empty']);
    expect(document.getElementById('ccf-rv-photos').accept).toBe('image/gif,image/png');
    expect(document.querySelector('.ccf-rvm-hint').textContent).toBe('GIF or PNG · up to 2 photos · 5 MB each');
  });

  it('"Add photo" opens the file picker', async () => {
    await onPhotos();
    const input = document.getElementById('ccf-rv-photos');
    const spy = jest.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(document.querySelector('.ccf-rvm-add'));
    expect(spy).toHaveBeenCalled();
  });

  it('uploads a photo, shows it, keeps one Add tile while there is room, and sends the link with the review', async () => {
    handlers.push(
      { method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/image/upload/v1/p.gif' } }) },
      { method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'pending' } }) },
    );
    await onPhotos();
    pick(gif());
    await waitFor(() => expect(document.querySelector('.ccf-rvm-thumb:not(.busy)')).toBeTruthy());
    expect(tiles()).toEqual(['thumb', 'add', 'empty']);
    expect(calls.find((c) => c.url.endsWith('/photo')).body.dataUrl).toMatch(/^data:image\/gif;base64,/);
    goNext();
    type('ccf-rv-name', 'Asha'); goNext();
    expect(text(document.querySelector('.ccf-rvm-preview'))).toContain('1 photo attached');
    goNext();
    await waitFor(() => expect(calls.some((c) => /reviews$/.test(c.url) && c.method === 'POST')).toBe(true));
    expect(calls.find((c) => /reviews$/.test(c.url) && c.method === 'POST').body.photos).toEqual(['https://res.cloudinary.com/demo/image/upload/v1/p.gif']);
  });

  it('no Add tile once the limit is reached', async () => {
    handlers.push({ method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/x.gif' } }) });
    await onPhotos();
    pick(gif('1.gif'), gif('2.gif'));
    await waitFor(() => expect(document.querySelectorAll('.ccf-rvm-thumb:not(.busy)')).toHaveLength(2));
    expect(tiles()).toEqual(['thumb', 'thumb', 'empty']);
  });

  it('refuses a type that is not allowed, without uploading', async () => {
    await onPhotos();
    pick(gif('a.jpg', 'image/jpeg'));
    expect(errText()).toBe('Only GIF or PNG photos are allowed.');
    expect(calls.some((c) => c.url.endsWith('/photo'))).toBe(false);
  });

  it('stops at the photo limit', async () => {
    handlers.push({ method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/x.gif' } }) });
    await onPhotos();
    pick(gif('1.gif'), gif('2.gif'), gif('3.gif'));
    expect(errText()).toBe('You can add up to 2 photos.');
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/photo'))).toHaveLength(2));
  });

  it('drops a photo the server refuses and shows why', async () => {
    handlers.push({ method: 'POST', match: '/photo', reply: () => ({ status: 400, body: { ok: false, message: 'That file is not a valid image.' } }) });
    await onPhotos();
    pick(gif());
    await waitFor(() => expect(errText()).toBe('That file is not a valid image.'));
    expect(document.querySelectorAll('.ccf-rvm-thumb')).toHaveLength(0);
  });

  it('a photo can be removed', async () => {
    handlers.push({ method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/x.gif' } }) });
    await onPhotos();
    pick(gif());
    await waitFor(() => expect(document.querySelector('.ccf-rvm-thumb:not(.busy)')).toBeTruthy());
    fireEvent.click(document.querySelector('[aria-label="Remove photo"]'));
    expect(tiles()).toEqual(['add', 'empty', 'empty']);
  });

  it('will not go on while a photo is still uploading', async () => {
    let finish;
    const original = global.fetch;
    global.fetch = jest.fn((url, opts = {}) => {
      if ((opts.method || 'GET') === 'POST' && url.endsWith('/photo')) {
        calls.push({ url, method: 'POST', body: JSON.parse(opts.body) });
        return new Promise((resolve) => { finish = () => resolve({ status: 200, json: () => Promise.resolve({ ok: true, url: 'https://res.cloudinary.com/demo/x.gif' }) }); });
      }
      return original(url, opts);
    });
    await onPhotos();
    pick(gif());
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/photo'))).toBe(true));
    goNext();
    expect(errText()).toBe('Wait for your photos to finish uploading.');
    expect(stepTitle()).toBe('Add photos');
    finish();
    await waitFor(() => expect(document.querySelector('.ccf-rvm-thumb.busy')).toBeNull());
    goNext();
    expect(stepTitle()).toBe('About you');
  });

  it('photos survive going Back and forth', async () => {
    handlers.push({ method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/x.gif' } }) });
    await onPhotos();
    pick(gif());
    await waitFor(() => expect(document.querySelector('.ccf-rvm-thumb:not(.busy)')).toBeTruthy());
    goNext(); goBack();
    expect(document.querySelectorAll('.ccf-rvm-thumb')).toHaveLength(1);
  });
});

describe('pop-up: check page and sending', () => {
  it('shows the review as it will appear, with Edit links back to the right pages', async () => {
    await openWizard();
    fillAllPages();
    const card = document.querySelector('.ccf-rvm-preview');
    expect(card.querySelector('.ccf-rv-name').textContent).toBe('Asha');
    expect(card.querySelector('.ccf-rv-stars').getAttribute('aria-label')).toBe('4 out of 5 stars');
    expect(card.querySelector('.ccf-rvm-ptitle').textContent).toBe('Great');
    expect(card.querySelector('.ccf-rv-body').textContent).toBe('Really nice quality, would buy again.');
    expect(text(dialog())).toContain('The store checks every review before it is published.');
    fireEvent.click(card.querySelector('[aria-label="Edit your rating"]'));
    expect(stepTitle()).toBe('How would you rate it?');
    goNext(); goNext(); goNext(); goNext();
    fireEvent.click(document.querySelector('[aria-label="Edit your name"]'));
    expect(stepTitle()).toBe('About you');
  });

  it('says so when reviews are published right away', async () => {
    await openWizard(rules({ requireApproval: false }));
    fillAllPages();
    expect(text(dialog())).toContain('Your review is published right away.');
  });

  it('sends the review, then the Thank you page', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'pending' } }) });
    await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(stepTitle()).toBe('Thank you, Asha'));
    const post = calls.find((c) => c.method === 'POST');
    expect(post.url).toBe('/apps/cartncodform/reviews');
    expect(post.body).toMatchObject({ productId: '111', productHandle: 'blue-kurta', rating: 4, name: 'Asha', email: 'asha@example.com', title: 'Great', body: 'Really nice quality, would buy again.', photos: [] });
    expect(text(dialog())).toContain('It will appear on the product page once the store approves it.');
    expect(document.querySelector('.ccf-rvm-okmark')).toBeTruthy();
    expect(document.querySelector('.ccf-rvm-foot').hidden).toBe(true);
    expect(document.querySelector('.ccf-rvm-progress').hidden).toBe(true);
    expect(document.querySelector('.ccf-rvm-donebtn').textContent).toBe('Back to the product');
  });

  it('says the review is live when approval is off', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'approved' } }) });
    await openWizard(rules({ requireApproval: false }));
    fillAllPages();
    goNext();
    await waitFor(() => expect(text(dialog())).toContain('Your review is now live on the product page.'));
  });

  it('after sending, the list reloads (filter cleared), Back to the product closes and focus goes to the new button', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'approved' } }) });
    const root = await openWizard();
    fillAllPages();
    const before = gets().length;
    goNext();
    await waitFor(() => expect(stepTitle()).toBe('Thank you, Asha'));
    await waitFor(() => expect(gets().length).toBe(before + 1));
    expect(lastGet()).toBe('/apps/cartncodform/reviews?productId=111&page=1');
    fireEvent.click(document.querySelector('.ccf-rvm-donebtn'));
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(root.querySelector('.ccf-rv-btn--write'));
  });

  it('shows a loading state, and a double click sends only once', async () => {
    let release;
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => new Promise((resolve) => { release = () => resolve({ status: 200, json: () => Promise.resolve({ ok: true, status: 'pending' }) }); }) });
    await openWizard();
    fillAllPages();
    goNext(); goNext();
    expect(nextBtn().disabled).toBe(true);
    expect(nextBtn().className).toContain('loading');
    expect(backBtn().disabled).toBe(true);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    release();
    await waitFor(() => expect(stepTitle()).toBe('Thank you, Asha'));
  });

  it('draft is kept when the pages are closed and re-opened, and cleared after a sent review', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'pending' } }) });
    const root = await openWizard();
    stars(4); goNext();
    type('ccf-rv-body', 'A draft I will come back to.');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
    expect(document.querySelector('[aria-label="4 stars"]').getAttribute('aria-checked')).toBe('true');
    goNext();
    expect(document.getElementById('ccf-rv-body').value).toBe('A draft I will come back to.');
    goNext(); goNext(); type('ccf-rv-name', 'Asha'); goNext(); goNext();
    await waitFor(() => expect(stepTitle()).toBe('Thank you, Asha'));
    fireEvent.click(document.querySelector('.ccf-rvm-donebtn'));
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    await waitFor(() => expect(root.querySelector('.ccf-rv-btn--write')).toBeTruthy());
    fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
    expect(document.querySelector('[aria-label="4 stars"]').getAttribute('aria-checked')).toBe('false');
  });
});

describe('pop-up: errors from the server', () => {
  it('a message about a field takes the customer back to the page with that field', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ status: 400, body: { ok: false, error: 'BAD_EMAIL', field: 'email', message: 'Please enter a valid email address.' } }) });
    await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(stepTitle()).toBe('About you'));
    expect(errText()).toBe('Please enter a valid email address.');
    expect(nextBtn().disabled).toBe(false);
  });

  it('a refusal such as "not a verified buyer" is shown on the check page, and what was typed stays', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ status: 403, body: { ok: false, error: 'NOT_VERIFIED_BUYER', message: 'Only customers who bought this product can review it.' } }) });
    await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(errText()).toBe('Only customers who bought this product can review it.'));
    expect(stepTitle()).toBe('Check your review');
    goBack(); goBack(); goBack();
    expect(stepTitle()).toBe('Tell us about it');
    expect(document.getElementById('ccf-rv-body').value).toBe('Really nice quality, would buy again.');
  });

  it('login needed', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ status: 401, body: { ok: false, error: 'LOGIN_REQUIRED' } }) });
    await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(errText()).toBe('Log in to write a review.'));
  });

  it('a network failure shows a message and lets the customer try again', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => Promise.reject(new Error('offline')) });
    await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(errText()).toContain('Check your connection'));
    expect(nextBtn().disabled).toBe(false);
    expect(backBtn().disabled).toBe(false);
  });
});
