/**
 * Storefront reviews block (extensions/cartncodform-embed/assets/ccf-reviews.js) in jsdom.
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

beforeEach(() => {
  window.localStorage.clear();
  handlers = [{ method: 'GET', match: '/apps/cartncodform/reviews?', reply: () => ({ body: listReply() }) }];
  mockFetch();
});

describe('showing reviews', () => {
  it('asks the proxy for this product and renders summary, reviews and the verified badge', async () => {
    const root = mount();
    await waitFor(() => expect(text(root)).toContain('Soft and well made.'));
    expect(calls[0].url).toBe('/apps/cartncodform/reviews?productId=111&page=1');
    expect(text(root)).toContain('Customer reviews');
    expect(text(root)).toContain('4.5');
    expect(text(root)).toContain('2 reviews');
    expect(text(root)).toContain('✓ Verified owner');
    expect(text(root)).toContain('Helpful (2)');
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

  it('shows a friendly message when there are no reviews', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [], summary: { count: 0, rated: 0, average: 0, distribution: {} } }) });
    const root = mount();
    await waitFor(() => expect(text(root)).toContain('No reviews yet. Be the first to write one.'));
  });

  it('does not show stars or ratings when star rating is off, and no Helpful button when votes are off', async () => {
    handlers[0].reply = () => ({ body: listReply({ reviews: [review({ rating: null, helpful: null, verified: false })], form: rules({ starRating: false, helpfulVotes: false }) }) });
    const root = mount();
    await waitFor(() => expect(text(root)).toContain('Soft and well made.'));
    expect(root.querySelector('.ccf-rv-avg')).toBeNull();
    expect(root.querySelector('.ccf-rv-help')).toBeNull();
    expect(text(root)).not.toContain('Verified owner');
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
});

describe('who can write', () => {
  it('logged-in only: guests get a login link, not a form button', async () => {
    handlers[0].reply = () => ({ body: listReply({ form: rules({ canReview: false, reason: 'LOGIN_REQUIRED' }) }) });
    const root = mount();
    await waitFor(() => expect(byText(root, 'a', 'Log in to write a review')).toBeTruthy());
    expect(byText(root, 'a', 'Log in').getAttribute('href')).toContain('/account/login?return_url=');
    expect(byText(root, 'button', 'Write a review')).toBeUndefined();
  });

  it.each([
    ['NOT_VERIFIED_BUYER', 'Only customers who bought this product can write a review.'],
    ['ALREADY_REVIEWED', 'Thank you, you have already reviewed this product.'],
  ])('%s shows a message instead of the button', async (reason, message) => {
    handlers[0].reply = () => ({ body: listReply({ form: rules({ canReview: false, reason }) }) });
    const root = mount();
    await waitFor(() => expect(text(root)).toContain(message));
    expect(byText(root, 'button', 'Write a review')).toBeUndefined();
  });
});

describe('writing a review', () => {
  async function openForm(formRules) {
    if (formRules) handlers[0].reply = () => ({ body: listReply({ form: formRules }) });
    const root = mount();
    await waitFor(() => expect(byText(root, 'button', 'Write a review')).toBeTruthy());
    fireEvent.click(byText(root, 'button', 'Write a review'));
    return root;
  }
  const fill = (root, id, value) => fireEvent.change(root.querySelector(id), { target: { value } });
  const submit = (root) => fireEvent.submit(root.querySelector('form'));

  it('checks the fields before sending anything', async () => {
    const root = await openForm();
    submit(root);
    expect(text(root)).toContain('Please choose a star rating.');
    fireEvent.click(root.querySelector('[aria-label="4 stars"]'));
    submit(root);
    expect(text(root)).toContain('Please enter your name.');
    fill(root, '#ccf-rv-name', 'Asha');
    fill(root, '#ccf-rv-body', 'too short');
    submit(root);
    expect(text(root)).toContain('Please write at least 10 characters.');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('asks for the order email only when the shop requires it', async () => {
    const root = await openForm(rules({ emailRequired: true }));
    fireEvent.click(root.querySelector('[aria-label="5 stars"]'));
    fill(root, '#ccf-rv-name', 'Asha');
    fill(root, '#ccf-rv-body', 'A long enough review.');
    submit(root);
    expect(text(root)).toContain('Please enter the email you used to order.');
  });

  it('hides the email box for logged-in customers and the rating when stars are off', async () => {
    const root = await openForm(rules({ needsEmail: false, loggedIn: true, starRating: false, starRequired: false }));
    expect(root.querySelector('#ccf-rv-email')).toBeNull();
    expect(root.querySelector('[role="radiogroup"]')).toBeNull();
  });

  it('sends the review and tells the customer it awaits approval', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'pending' } }) });
    const root = await openForm();
    fireEvent.click(root.querySelector('[aria-label="4 stars"]'));
    fill(root, '#ccf-rv-name', '  Asha ');
    fill(root, '#ccf-rv-email', 'asha@example.com');
    fill(root, '#ccf-rv-title', 'Lovely');
    fill(root, '#ccf-rv-body', 'Really nice quality, would buy again.');
    submit(root);
    await waitFor(() => expect(text(root)).toContain('Thank you! Your review will appear once the store approves it.'));
    const post = calls.find((c) => c.method === 'POST');
    expect(post.url).toBe('/apps/cartncodform/reviews');
    expect(post.body).toMatchObject({ productId: '111', productHandle: 'blue-kurta', rating: 4, name: 'Asha', email: 'asha@example.com', title: 'Lovely', photos: [] });
    expect(root.querySelector('form')).toBeNull();
  });

  it('says the review is live when approval is off', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'approved' } }) });
    const root = await openForm();
    fireEvent.click(root.querySelector('[aria-label="5 stars"]'));
    fill(root, '#ccf-rv-name', 'Asha');
    fill(root, '#ccf-rv-body', 'Really nice quality, would buy again.');
    submit(root);
    await waitFor(() => expect(text(root)).toContain('Your review is now live.'));
  });

  it('shows the server\'s message and keeps what was typed when it refuses', async () => {
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ status: 403, body: { ok: false, error: 'NOT_VERIFIED_BUYER', message: 'Only customers who bought this product can review it.' } }) });
    const root = await openForm();
    fireEvent.click(root.querySelector('[aria-label="5 stars"]'));
    fill(root, '#ccf-rv-name', 'Asha');
    fill(root, '#ccf-rv-body', 'Really nice quality, would buy again.');
    submit(root);
    await waitFor(() => expect(text(root)).toContain('Only customers who bought this product can review it.'));
    expect(root.querySelector('#ccf-rv-body').value).toBe('Really nice quality, would buy again.');
    expect(root.querySelector('button[type="submit"]').disabled).toBe(false);
  });
});

describe('photos', () => {
  const gif = (name = 'a.gif', type = 'image/gif') => new File([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3, 4, 5, 6])], name, { type });

  async function openForm() {
    const root = mount();
    await waitFor(() => expect(byText(root, 'button', 'Write a review')).toBeTruthy());
    fireEvent.click(byText(root, 'button', 'Write a review'));
    return root;
  }
  const pick = (root, ...files) => fireEvent.change(root.querySelector('#ccf-rv-photos'), { target: { files } });

  it('only offers the allowed types, and says the limits', async () => {
    const root = await openForm();
    expect(root.querySelector('#ccf-rv-photos').accept).toBe('image/gif,image/png');
    expect(text(root)).toContain('up to 2, GIF, PNG, each under 5 MB');
  });

  it('uploads each photo, shows it, and sends the returned links with the review', async () => {
    handlers.push(
      { method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/image/upload/v1/p.gif' } }) },
      { method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'pending' } }) },
    );
    const root = await openForm();
    pick(root, gif());
    await waitFor(() => expect(root.querySelectorAll('.ccf-rv-thumb').length).toBe(1));
    await waitFor(() => expect(root.querySelector('.ccf-rv-thumb.busy')).toBeNull());
    const up = calls.find((c) => c.url.endsWith('/photo'));
    expect(up.body.dataUrl).toMatch(/^data:image\/gif;base64,/);

    fireEvent.click(root.querySelector('[aria-label="5 stars"]'));
    fireEvent.change(root.querySelector('#ccf-rv-name'), { target: { value: 'Asha' } });
    fireEvent.change(root.querySelector('#ccf-rv-body'), { target: { value: 'Really nice quality, would buy again.' } });
    fireEvent.submit(root.querySelector('form'));
    await waitFor(() => expect(calls.some((c) => /reviews$/.test(c.url) && c.method === 'POST')).toBe(true));
    expect(calls.find((c) => /reviews$/.test(c.url) && c.method === 'POST').body.photos).toEqual(['https://res.cloudinary.com/demo/image/upload/v1/p.gif']);
  });

  it('refuses a type that is not allowed, without uploading', async () => {
    const root = await openForm();
    pick(root, gif('a.jpg', 'image/jpeg'));
    expect(text(root)).toContain('Only GIF, PNG photos are allowed.');
    expect(calls.some((c) => c.url.endsWith('/photo'))).toBe(false);
    expect(root.querySelectorAll('.ccf-rv-thumb')).toHaveLength(0);
  });

  it('stops at the photo limit', async () => {
    handlers.push({ method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/x.gif' } }) });
    const root = await openForm();
    pick(root, gif('1.gif'), gif('2.gif'), gif('3.gif'));
    expect(text(root)).toContain('You can add up to 2 photos.');
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/photo'))).toHaveLength(2));
  });

  it('drops a photo the server refuses and shows why', async () => {
    handlers.push({ method: 'POST', match: '/photo', reply: () => ({ status: 400, body: { ok: false, message: 'That file is not a valid image.' } }) });
    const root = await openForm();
    pick(root, gif());
    await waitFor(() => expect(text(root)).toContain('That file is not a valid image.'));
    expect(root.querySelectorAll('.ccf-rv-thumb')).toHaveLength(0);
  });

  it('will not send the review while a photo is still uploading', async () => {
    let finish;
    handlers.push({ method: 'POST', match: /reviews$/, reply: () => ({ body: { ok: true, status: 'pending' } }) });
    // the fake replies at once, so hold this photo upload open by hand
    const original = global.fetch;
    global.fetch = jest.fn((url, opts = {}) => {
      if ((opts.method || 'GET') === 'POST' && url.endsWith('/photo')) {
        calls.push({ url, method: 'POST', body: JSON.parse(opts.body) });
        return new Promise((resolve) => { finish = () => resolve({ status: 200, json: () => Promise.resolve({ ok: true, url: 'https://res.cloudinary.com/demo/x.gif' }) }); });
      }
      return original(url, opts);
    });
    const root = await openForm();
    pick(root, gif());
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/photo'))).toBe(true));
    fireEvent.click(root.querySelector('[aria-label="5 stars"]'));
    fireEvent.change(root.querySelector('#ccf-rv-name'), { target: { value: 'Asha' } });
    fireEvent.change(root.querySelector('#ccf-rv-body'), { target: { value: 'Really nice quality, would buy again.' } });
    fireEvent.submit(root.querySelector('form'));
    expect(text(root)).toContain('Please wait for your photos to finish uploading.');
    expect(calls.some((c) => /reviews$/.test(c.url) && c.method === 'POST')).toBe(false);
    finish();
    await waitFor(() => expect(root.querySelector('.ccf-rv-thumb.busy')).toBeNull());
  });

  it('a photo can be removed before sending', async () => {
    handlers.push({ method: 'POST', match: '/photo', reply: () => ({ body: { ok: true, url: 'https://res.cloudinary.com/demo/x.gif' } }) });
    const root = await openForm();
    pick(root, gif());
    await waitFor(() => expect(root.querySelector('.ccf-rv-thumb:not(.busy)')).toBeTruthy());
    fireEvent.click(root.querySelector('[aria-label="Remove photo"]'));
    expect(root.querySelectorAll('.ccf-rv-thumb')).toHaveLength(0);
  });
});

describe('helpful votes', () => {
  it('sends one vote, updates the count, and remembers it', async () => {
    handlers.push({ method: 'POST', match: '/a1/helpful', reply: () => ({ body: { ok: true, already: false, helpful: 3 } }) });
    const root = mount();
    await waitFor(() => expect(byText(root, 'button', 'Helpful (2)')).toBeTruthy());
    fireEvent.click(byText(root, 'button', 'Helpful (2)'));
    await waitFor(() => expect(byText(root, 'button', 'Helpful (3)')).toBeTruthy());
    const post = calls.find((c) => c.url.endsWith('/a1/helpful'));
    expect(post.body.visitorId).toMatch(/^v/);
    expect(byText(root, 'button', 'Helpful (3)').disabled).toBe(true);

    // a later visit shows it as already voted
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
