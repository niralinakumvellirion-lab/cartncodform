/**
 * Storefront reviews block (extensions/cartncodform-embed/assets/ccf-reviews.js) in jsdom:
 * the page (title + write button, summary, cards) and the pop-up pages (one question at a time,
 * Back/Next, submit page, thank-you page). fetch is replaced by a small fake of the App Proxy endpoints.
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
    summary: { count: 2, rated: 2, average: 4.5, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } },
    reviews: [review()], page: 1, pages: 1, form: rules(), ...over,
  };
}

function mount() {
  document.body.innerHTML = '<div id="root" data-ccf-reviews data-product-id="111" data-product-handle="blue-kurta" data-heading="Customer reviews"></div>';
  jest.isolateModules(() => { require(SCRIPT); });
  return document.getElementById('root');
}

const text = (root) => root.textContent;
const byText = (root, sel, t) => Array.from(root.querySelectorAll(sel)).find((n) => n.textContent.includes(t));
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

async function openWizard(formRules, replyOver) {
  handlers[0].reply = () => ({ body: listReply({ ...(replyOver || {}), ...(formRules ? { form: formRules } : {}) }) });
  const root = mount();
  await waitFor(() => expect(root.querySelector('.ccf-rv-btn--write')).toBeTruthy());
  fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
  return root;
}

// Walks a customer through every page with valid answers, stopping on the final "submit" page.
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

describe('page: title and write button first, then summary and review cards', () => {
  it('asks the proxy for this product', async () => {
    const root = mount();
    await waitFor(() => expect(text(root)).toContain('Soft and well made.'));
    expect(calls[0].url).toBe('/apps/cartncodform/reviews?productId=111&page=1');
  });

  it('shows the title and the Write a review button together at the top', async () => {
    const root = mount();
    await waitFor(() => expect(root.querySelector('.ccf-rv-btn--write')).toBeTruthy());
    const hero = root.querySelector('.ccf-rv-hero');
    expect(hero.querySelector('h2').textContent).toBe('Customer reviews');
    expect(hero.querySelector('.ccf-rv-btn--write').textContent).toBe('Write a review');
    const kids = Array.from(root.querySelector('.ccf-rv-inner').children).map((n) => n.className);
    expect(kids[0]).toBe('ccf-rv-hero');
    expect(kids.indexOf('ccf-rv-list')).toBeGreaterThan(kids.indexOf('ccf-rv-hero'));
  });

  it('shows the average, stars, count and the 5-to-1 bars', async () => {
    const root = mount();
    await waitFor(() => expect(text(root)).toContain('Soft and well made.'));
    expect(root.querySelector('.ccf-rv-avg').textContent).toBe('4.5');
    expect(text(root)).toContain('Based on 2 reviews');
    expect(root.querySelector('.ccf-rv-stars--big').getAttribute('aria-label')).toBe('4.5 out of 5 stars');
    expect(root.querySelectorAll('.ccf-rv-bar')).toHaveLength(5);
  });

  it('review card: avatar with the first letter, name, Verified owner badge, stars, date, title, text', async () => {
    const root = mount();
    await waitFor(() => expect(text(root)).toContain('Soft and well made.'));
    const item = root.querySelector('.ccf-rv-item');
    expect(item.querySelector('.ccf-rv-ava').textContent).toBe('A');
    expect(item.querySelector('.ccf-rv-ava').getAttribute('aria-hidden')).toBe('true');
    expect(item.querySelector('.ccf-rv-name').textContent).toBe('Asha');
    expect(item.querySelector('.ccf-rv-badge').textContent).toBe('Verified owner');
    expect(item.querySelector('.ccf-rv-stars').getAttribute('aria-label')).toBe('5 out of 5 stars');
    expect(item.querySelector('.ccf-rv-date').textContent).not.toBe('');
    expect(item.querySelector('.ccf-rv-title').textContent).toBe('Lovely');
  });

  it('the same name always gets the same avatar colour, different names usually differ', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ id: '1', name: 'Zoya' }), review({ id: '2', name: 'Zoya' }), review({ id: '3', name: 'Ben' })] }) });
    const root = mount();
    await waitFor(() => expect(root.querySelectorAll('.ccf-rv-ava')).toHaveLength(3));
    const bg = Array.from(root.querySelectorAll('.ccf-rv-ava')).map((n) => n.style.background);
    expect(bg[0]).toBe(bg[1]);
    expect(bg[0]).not.toBe(bg[2]);
  });

  it('avatar: capital first letter, and ? for an empty name', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ id: 'x1', name: 'zoya' }), review({ id: 'x2', name: '   ' })] }) });
    const root = mount();
    await waitFor(() => expect(root.querySelectorAll('.ccf-rv-ava')).toHaveLength(2));
    expect(Array.from(root.querySelectorAll('.ccf-rv-ava')).map((n) => n.textContent)).toEqual(['Z', '?']);
  });

  it('shows review text as plain text, never as HTML', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ body: '<img src=x onerror=alert(1)>', name: '<b>Bob</b>', title: '<script>x</script>' })] }) });
    const root = mount();
    await waitFor(() => expect(text(root)).toContain('<img src=x onerror=alert(1)>'));
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
  });

  it('the script never writes HTML strings into the page', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).not.toMatch(/\.innerHTML|insertAdjacentHTML|document\.write|outerHTML/);
  });

  it('empty state with a friendly message', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [], summary: { count: 0, rated: 0, average: 0, distribution: {} } }) });
    const root = mount();
    await waitFor(() => expect(root.querySelector('.ccf-rv-empty')).toBeTruthy());
    expect(text(root.querySelector('.ccf-rv-empty'))).toContain('Be the first to write one.');
    expect(text(root)).toContain('No reviews yet');
  });

  it('star rating off: no average, no stars on cards; votes off: no Helpful button; badge follows the server flag', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ rating: null, helpful: null, verified: false })], form: rules({ starRating: false, starRequired: false, helpfulVotes: false }) }) });
    const root = mount();
    await waitFor(() => expect(text(root)).toContain('Soft and well made.'));
    expect(root.querySelector('.ccf-rv-avg')).toBeNull();
    expect(root.querySelector('.ccf-rv-item .ccf-rv-stars')).toBeNull();
    expect(root.querySelector('.ccf-rv-help')).toBeNull();
    expect(root.querySelector('.ccf-rv-badge')).toBeNull();
  });

  it('shows an error note when reviews cannot load', async () => {
    handlers[0].reply = () => ({ status: 500, body: { ok: false } });
    const root = mount();
    await waitFor(() => expect(text(root)).toContain('Reviews could not be loaded right now.'));
  });

  it('pages with Next', async () => {
    handlers[0].reply = (_b, url) => ({ body: listReply({ pages: 2, page: url.includes('page=2') ? 2 : 1 }) });
    const root = mount();
    await waitFor(() => expect(byText(root, 'button', 'Next')).toBeTruthy());
    root.scrollIntoView = jest.fn();
    fireEvent.click(byText(root, 'button', 'Next'));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('page=2'))).toBe(true));
  });

  it('photo on a card opens a viewer; Escape closes it and gives the scroll back', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ photos: ['https://res.cloudinary.com/demo/a.jpg'] })] }) });
    const root = mount();
    await waitFor(() => expect(root.querySelector('.ccf-rv-photo')).toBeTruthy());
    const opener = root.querySelector('.ccf-rv-photo');
    fireEvent.click(opener);
    const img = document.querySelector('.ccf-rvm-lightbox .ccf-rvm-bigphoto');
    expect(img.getAttribute('src')).toBe('https://res.cloudinary.com/demo/a.jpg');
    expect(img.alt).toBe('Photo from Asha');
    expect(document.documentElement.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(opener);
  });
});

describe('page: who can write', () => {
  it('logged-in only: guests get a login link, not a write button', async () => {
    handlers[0].reply = () => ({ body: listReply({ form: rules({ canReview: false, reason: 'LOGIN_REQUIRED' }) }) });
    const root = mount();
    await waitFor(() => expect(byText(root, 'a', 'Log in to write a review')).toBeTruthy());
    expect(byText(root, 'a', 'Log in').getAttribute('href')).toContain('/account/login?return_url=');
    expect(root.querySelector('button.ccf-rv-btn--write')).toBeNull();
  });

  it.each([
    ['NOT_VERIFIED_BUYER', 'Only customers who bought this product can write a review.'],
    ['ALREADY_REVIEWED', 'Thank you, you have already reviewed this product.'],
  ])('%s shows a message instead of the button', async (reason, message) => {
    handlers[0].reply = () => ({ body: listReply({ form: rules({ canReview: false, reason }) }) });
    const root = mount();
    await waitFor(() => expect(text(root)).toContain(message));
    expect(root.querySelector('.ccf-rv-btn--write')).toBeNull();
  });
});

describe('page: helpful votes', () => {
  it('sends one vote, updates the count, and remembers it', async () => {
    handlers.push({ method: 'POST', match: '/a1/helpful', reply: () => ({ body: { ok: true, already: false, helpful: 3 } }) });
    const root = mount();
    await waitFor(() => expect(byText(root, 'button', 'Helpful (2)')).toBeTruthy());
    fireEvent.click(byText(root, 'button', 'Helpful (2)'));
    await waitFor(() => expect(byText(root, 'button', 'Helpful (3)')).toBeTruthy());
    expect(calls.find((c) => c.url.endsWith('/a1/helpful')).body.visitorId).toMatch(/^v/);
    expect(byText(root, 'button', 'Helpful (3)').disabled).toBe(true);

    mockFetch();
    const again = mount();
    await waitFor(() => expect(byText(again, 'button', 'Helpful (2)')).toBeTruthy());
    expect(byText(again, 'button', 'Helpful (2)').disabled).toBe(true);
  });

  it('re-enables the button if the vote did not go through', async () => {
    handlers.push({ method: 'POST', match: '/a1/helpful', reply: () => ({ status: 429, body: { ok: false } }) });
    const root = mount();
    await waitFor(() => expect(byText(root, 'button', 'Helpful (2)')).toBeTruthy());
    fireEvent.click(byText(root, 'button', 'Helpful (2)'));
    await waitFor(() => expect(byText(root, 'button', 'Helpful (2)').disabled).toBe(false));
  });

  it('works when localStorage is blocked', async () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    handlers.push({ method: 'POST', match: '/a1/helpful', reply: () => ({ body: { ok: true, helpful: 3 } }) });
    const root = mount();
    await waitFor(() => expect(byText(root, 'button', 'Helpful (2)')).toBeTruthy());
    fireEvent.click(byText(root, 'button', 'Helpful (2)'));
    await waitFor(() => expect(byText(root, 'button', 'Helpful (3)')).toBeTruthy());
    spy.mockRestore();
  });
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
    expect(stepTitle()).toBe('How was your experience?');
    expect(stepCount()).toBe('Step 1 of 5');
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
    await openWizard();
    fireEvent.click(document.querySelector('.ccf-rvm-x'));
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    const root = document.getElementById('root');
    fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
    fireEvent.click(document.querySelector('.ccf-rvm-backdrop'));
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
  });

  it('Tab stays inside the dialog (wraps from the last control to the first)', async () => {
    await openWizard();
    const items = Array.from(dialog().querySelectorAll('button, input, textarea')).filter((n) => !n.disabled);
    const last = items[items.length - 1];
    last.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);
  });

  it('Shift+Tab from the first control wraps to the last one', async () => {
    await openWizard();
    const items = Array.from(dialog().querySelectorAll('button, input, textarea')).filter((n) => !n.disabled);
    items[0].focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('the dialog takes its colours from the brand colour: a dark one gets the light-button treatment', async () => {
    const orig = window.getComputedStyle;
    window.getComputedStyle = (el, ...r) => {
      const cs = orig(el, ...r);
      return new Proxy(cs, { get: (t, p) => (p === 'getPropertyValue' ? (n) => (el.style && el.style.getPropertyValue(n)) || t.getPropertyValue(n) : Reflect.get(t, p)) });
    };
    try {
      document.body.innerHTML = '<div id="root" data-ccf-reviews data-product-id="1" style="--ccf-rv-accent:#111827;--ccf-rv-star:#f59e0b"></div>';
      jest.isolateModules(() => { require(SCRIPT); });
      const root = document.getElementById('root');
      await waitFor(() => expect(root.querySelector('.ccf-rv-btn--write')).toBeTruthy());
      fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
      const layer = document.querySelector('.ccf-rvm');
      expect(layer.getAttribute('data-acc')).toBe('dark');
      expect(layer.style.getPropertyValue('--ccf-rv-accent-fg')).toBe('#ffffff');
      expect(layer.style.getPropertyValue('--ccf-rv-star')).toBe('#f59e0b');
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());

      root.style.setProperty('--ccf-rv-accent', '#facc15');
      fireEvent.click(root.querySelector('.ccf-rv-btn--write'));
      const light = document.querySelector('.ccf-rvm');
      expect(light.getAttribute('data-acc')).toBe('other');
      expect(light.style.getPropertyValue('--ccf-rv-accent-fg')).toBe('#0f172a');
    } finally {
      window.getComputedStyle = orig;
    }
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
    expect(seen).toEqual(['How was your experience?', 'Tell us more', 'Add some photos', 'About you', 'Ready to submit?']);
    expect(stepCount()).toBe('Step 5 of 5');
  });

  it('star rating off removes the rating page; photos off removes the photos page', async () => {
    await openWizard(rules({ starRating: false, starRequired: false, photos: null }));
    expect(stepTitle()).toBe('Tell us more');
    expect(stepCount()).toBe('Step 1 of 3');
    expect(document.querySelectorAll('.ccf-rvm-dot')).toHaveLength(3);
  });

  it('the progress bar and the dots follow the page', async () => {
    await openWizard();
    expect(document.querySelector('.ccf-rvm-bar').style.width).toBe('20%');
    expect(document.querySelector('.ccf-rvm-dot.now')).toBeTruthy();
    stars(3); goNext();
    expect(document.querySelector('.ccf-rvm-bar').style.width).toBe('40%');
    expect(document.querySelectorAll('.ccf-rvm-dot.done')).toHaveLength(1);
  });

  it('Back is hidden on the first page and goes back after that, keeping what was typed', async () => {
    await openWizard();
    expect(backBtn().style.visibility).toBe('hidden');
    stars(4); goNext();
    expect(backBtn().style.visibility).toBe('visible');
    type('ccf-rv-title', 'Nice'); type('ccf-rv-body', 'Really nice quality, would buy again.');
    goBack();
    expect(stepTitle()).toBe('How was your experience?');
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

  it('the last page says Submit review; the others say Next', async () => {
    await openWizard();
    expect(nextBtn().textContent).toBe('Next');
    fillAllPages();
    expect(nextBtn().textContent).toBe('Submit review');
  });
});

describe('pop-up: rating page', () => {
  it('stars are a radio group; choosing one shows its word', async () => {
    await openWizard();
    expect(document.querySelector('[role="radiogroup"]').getAttribute('aria-label')).toBe('Your rating');
    expect(document.querySelectorAll('[role="radio"]')).toHaveLength(5);
    expect(document.querySelector('.ccf-rvm-ratelabel').textContent).toBe('Select a rating');
    stars(4);
    expect(document.querySelector('.ccf-rvm-ratelabel').textContent).toBe('Very good');
    expect(document.querySelectorAll('.ccf-rvm-star.on')).toHaveLength(4);
    expect(document.querySelector('[aria-label="4 stars"]').getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[aria-label="3 stars"]').getAttribute('aria-checked')).toBe('false');
  });

  it('hovering previews a rating and leaving puts it back', async () => {
    await openWizard();
    stars(2);
    fireEvent.mouseEnter(document.querySelector('[aria-label="5 stars"]'));
    expect(document.querySelector('.ccf-rvm-ratelabel').textContent).toBe('Excellent');
    fireEvent.mouseLeave(document.querySelector('[aria-label="5 stars"]'));
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
    expect(errText()).toBe('Please choose a star rating.');
    expect(stepTitle()).toBe('How was your experience?');
    expect(dialog().className).toContain('ccf-rvm-shake');
    stars(5);
    expect(errText()).toBeUndefined();
    goNext();
    expect(stepTitle()).toBe('Tell us more');
  });

  it('when rating is optional you can go on without choosing', async () => {
    await openWizard(rules({ starRequired: false }));
    goNext();
    expect(stepTitle()).toBe('Tell us more');
  });
});

describe('pop-up: review text, photos, about you', () => {
  it('the text needs at least 10 characters, shows a live counter, and the headline is optional', async () => {
    await openWizard();
    stars(5); goNext();
    goNext();
    expect(errText()).toBe('Please write at least 10 characters.');
    type('ccf-rv-body', 'short');
    expect(document.querySelector('.ccf-rvm-counter').textContent).toBe('5 / 2000');
    expect(document.querySelector('.ccf-rvm-counter').className).not.toContain('ok');
    goNext();
    expect(stepTitle()).toBe('Tell us more');
    type('ccf-rv-body', 'Long enough text here.');
    expect(document.querySelector('.ccf-rvm-counter').className).toContain('ok');
    goNext();
    expect(stepTitle()).toBe('Add some photos');
  });

  it('about you: name is required; email is optional for "anyone", required when the shop asks, and must look like an email', async () => {
    await openWizard();
    stars(5); goNext(); type('ccf-rv-body', 'Long enough text here.'); goNext(); goNext();
    goNext();
    expect(errText()).toBe('Please enter your name.');
    type('ccf-rv-name', 'Asha');
    type('ccf-rv-email', 'not-an-email');
    goNext();
    expect(errText()).toBe('Please enter a valid email address.');
    type('ccf-rv-email', '');
    goNext();
    expect(stepTitle()).toBe('Ready to submit?');
  });

  it('email required (verified buyers only): it must be filled in', async () => {
    await openWizard(rules({ emailRequired: true }));
    stars(5); goNext(); type('ccf-rv-body', 'Long enough text here.'); goNext(); goNext();
    type('ccf-rv-name', 'Asha');
    goNext();
    expect(errText()).toBe('Please enter the email you used to order.');
    expect(document.querySelector('.ccf-rvm-sub').textContent).toContain('never shown');
  });

  it('logged-in customers get no email box', async () => {
    await openWizard(rules({ needsEmail: false, loggedIn: true }));
    stars(5); goNext(); type('ccf-rv-body', 'Long enough text here.'); goNext(); goNext();
    expect(document.getElementById('ccf-rv-email')).toBeNull();
    expect(document.getElementById('ccf-rv-name')).toBeTruthy();
  });

  it('Enter in the headline moves to the text; Enter in the name goes to the next page', async () => {
    await openWizard();
    stars(5); goNext();
    fireEvent.keyDown(document.getElementById('ccf-rv-title'), { key: 'Enter' });
    expect(document.activeElement).toBe(document.getElementById('ccf-rv-body'));
    type('ccf-rv-body', 'Long enough text here.'); goNext(); goNext();
    type('ccf-rv-name', 'Asha');
    fireEvent.keyDown(document.getElementById('ccf-rv-name'), { key: 'Enter' });
    expect(stepTitle()).toBe('Ready to submit?');
  });
});

describe('pop-up: photos page', () => {
  const gif = (name = 'a.gif', type = 'image/gif') => new File([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3, 4, 5, 6])], name, { type });
  const pick = (...files) => fireEvent.change(document.getElementById('ccf-rv-photos'), { target: { files } });

  async function onPhotos() {
    await openWizard();
    stars(5); goNext(); type('ccf-rv-body', 'Long enough text here.'); goNext();
  }

  it('only offers the allowed types, and says the limits', async () => {
    await onPhotos();
    expect(document.getElementById('ccf-rv-photos').accept).toBe('image/gif,image/png');
    expect(document.querySelector('.ccf-rvm-drop small').textContent).toBe('GIF, PNG · up to 2 photos · each under 5 MB');
  });

  it('uploads each photo, shows it, and sends the links with the review', async () => {
    handlers.push(
      { method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/image/upload/v1/p.gif' } }) },
      { method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'pending' } }) },
    );
    await onPhotos();
    pick(gif());
    await waitFor(() => expect(document.querySelectorAll('.ccf-rvm-thumb')).toHaveLength(1));
    await waitFor(() => expect(document.querySelector('.ccf-rvm-thumb.busy')).toBeNull());
    expect(calls.find((c) => c.url.endsWith('/photo')).body.dataUrl).toMatch(/^data:image\/gif;base64,/);
    goNext();
    type('ccf-rv-name', 'Asha'); goNext();
    expect(document.querySelectorAll('.ccf-rvm-preview .ccf-rvm-thumb')).toHaveLength(1);
    goNext();
    await waitFor(() => expect(calls.some((c) => /reviews$/.test(c.url) && c.method === 'POST')).toBe(true));
    expect(calls.find((c) => /reviews$/.test(c.url) && c.method === 'POST').body.photos).toEqual(['https://res.cloudinary.com/demo/image/upload/v1/p.gif']);
  });

  it('refuses a type that is not allowed, without uploading', async () => {
    await onPhotos();
    pick(gif('a.jpg', 'image/jpeg'));
    expect(errText()).toBe('Only GIF, PNG photos are allowed.');
    expect(calls.some((c) => c.url.endsWith('/photo'))).toBe(false);
    expect(document.querySelectorAll('.ccf-rvm-thumb')).toHaveLength(0);
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

  it('a photo can be removed before sending', async () => {
    handlers.push({ method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/x.gif' } }) });
    await onPhotos();
    pick(gif());
    await waitFor(() => expect(document.querySelector('.ccf-rvm-thumb:not(.busy)')).toBeTruthy());
    fireEvent.click(document.querySelector('[aria-label="Remove photo"]'));
    expect(document.querySelectorAll('.ccf-rvm-thumb')).toHaveLength(0);
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
    expect(errText()).toBe('Please wait for your photos to finish uploading.');
    expect(stepTitle()).toBe('Add some photos');
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

describe('pop-up: final page and sending', () => {
  it('shows how the review will look, and the approval note', async () => {
    await openWizard();
    fillAllPages();
    const card = document.querySelector('.ccf-rvm-preview');
    expect(card.querySelector('.ccf-rv-name').textContent).toBe('Asha');
    expect(card.querySelector('.ccf-rv-stars').textContent).toBe('★★★★☆');
    expect(card.querySelector('.ccf-rv-title').textContent).toBe('Great');
    expect(card.querySelector('.ccf-rv-body').textContent).toBe('Really nice quality, would buy again.');
    expect(text(dialog())).toContain('The store checks every review before it is published.');
  });

  it('says so when reviews are published right away', async () => {
    await openWizard(rules({ requireApproval: false }));
    fillAllPages();
    expect(text(dialog())).toContain('Your review is published right away.');
  });

  it('sends the review, then shows the Thank you page', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'pending' } }) });
    await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(stepTitle()).toBe('Thank you!'));
    const post = calls.find((c) => c.method === 'POST');
    expect(post.url).toBe('/apps/cartncodform/reviews');
    expect(post.body).toMatchObject({ productId: '111', productHandle: 'blue-kurta', rating: 4, name: 'Asha', email: 'asha@example.com', title: 'Great', body: 'Really nice quality, would buy again.', photos: [] });
    expect(text(dialog())).toContain('It will appear once the store approves it.');
    expect(document.querySelector('.ccf-rvm-okmark')).toBeTruthy();
    expect(document.querySelectorAll('.ccf-rvm-conf')).toHaveLength(22);
    expect(document.querySelector('.ccf-rvm-foot').style.display).toBe('none');
    expect(document.querySelector('.ccf-rvm-bar').style.width).toBe('100%');
  });

  it('says the review is live when approval is off', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'approved' } }) });
    await openWizard(rules({ requireApproval: false }));
    fillAllPages();
    goNext();
    await waitFor(() => expect(text(dialog())).toContain('Your review is now live.'));
  });

  it('the Done button closes the pages; the review list is reloaded', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'approved' } }) });
    await openWizard();
    fillAllPages();
    const getsBefore = calls.filter((c) => c.method === 'GET').length;
    goNext();
    await waitFor(() => expect(stepTitle()).toBe('Thank you!'));
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET').length).toBe(getsBefore + 1));
    fireEvent.click(document.querySelector('.ccf-rvm-donebtn'));
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('after a sent review the focus goes to the new Write button', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'approved' } }) });
    const root = await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(stepTitle()).toBe('Thank you!'));
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(1));
    fireEvent.click(document.querySelector('.ccf-rvm-donebtn'));
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
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
    await waitFor(() => expect(stepTitle()).toBe('Thank you!'));
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
    await waitFor(() => expect(stepTitle()).toBe('Thank you!'));
    fireEvent.click(document.querySelector('.ccf-rvm-donebtn'));
    await waitFor(() => expect(document.querySelector('.ccf-rvm')).toBeNull());
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

  it('a refusal such as "not a verified buyer" is shown on the last page, and what was typed stays', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ status: 403, body: { ok: false, error: 'NOT_VERIFIED_BUYER', message: 'Only customers who bought this product can review it.' } }) });
    await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(errText()).toBe('Only customers who bought this product can review it.'));
    expect(stepTitle()).toBe('Ready to submit?');
    expect(nextBtn().disabled).toBe(false);
    goBack(); goBack(); goBack();
    expect(stepTitle()).toBe('Tell us more');
    expect(document.getElementById('ccf-rv-body').value).toBe('Really nice quality, would buy again.');
    expect(document.getElementById('ccf-rv-title').value).toBe('Great');
  });

  it('login needed', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ status: 401, body: { ok: false, error: 'LOGIN_REQUIRED' } }) });
    await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(errText()).toBe('Please log in to write a review.'));
  });

  it('a network failure shows a message and lets the customer try again', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => Promise.reject(new Error('offline')) });
    await openWizard();
    fillAllPages();
    goNext();
    await waitFor(() => expect(errText()).toContain('check your connection'));
    expect(nextBtn().disabled).toBe(false);
    expect(backBtn().disabled).toBe(false);
  });
});
