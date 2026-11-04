'use strict';

/**
 * routes/reviewsProxy.js — storefront reviews through the App Proxy, against a real in-memory
 * MongoDB. The proxy signature check and the image host are replaced; everything else is real.
 */

jest.mock('../utils/shopify', () => ({
  verifyProxySignature: (q) => q && q.signature === 'valid',
}));
jest.mock('../utils/cloudinary', () => ({
  uploadImage: jest.fn(async () => ({ url: 'https://res.cloudinary.com/demo/image/upload/v1/new.png', width: 1, height: 1 })),
}));

const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Review = require('../models/Review');
const ReviewVote = require('../models/ReviewVote');
const ReviewSettings = require('../models/ReviewSettings');
const PurchaseRecord = require('../models/PurchaseRecord');
const { uploadImage } = require('../utils/cloudinary');
const { hashEmail } = require('../utils/reviewsCore');
const router = require('../routes/reviewsProxy');

const A = 'shop-a.myshopify.com';
const B = 'shop-b.myshopify.com';
const PID = '111';

let mongod;
let server;
let base;

async function call(method, path, { shop = A, customer, signature = 'valid', body, query = {} } = {}) {
  const q = new URLSearchParams({ shop, signature, ...(customer ? { logged_in_customer_id: customer } : {}), ...query });
  const r = await fetch(`${base}/apps/cartncodform/reviews${path}?${q}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

const form = (over = {}) => ({
  productId: PID, name: 'Asha', rating: 5, title: 'Lovely', body: 'Really nice quality, would buy again.', email: 'asha@example.com', ...over,
});

const setSettings = (shop, over = {}) =>
  ReviewSettings.findOneAndUpdate({ shopDomain: shop }, { $set: over }, { upsert: true, new: true });

const buy = (shop, { customerId = null, email = null, productIds = [PID], orderId } = {}) =>
  PurchaseRecord.create({ shopDomain: shop, orderId: orderId || String(Math.random()), customerId, emailHash: hashEmail(email), productIds });

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const pngUrl = `data:image/png;base64,${png.toString('base64')}`;

beforeAll(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'demo';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Review.init(), ReviewVote.init(), PurchaseRecord.init(), ReviewSettings.init()]);
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/apps/cartncodform/reviews', router);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
}, 60000); // starting the in-memory database can be slow when every suite runs at once

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([Review.deleteMany({}), ReviewVote.deleteMany({}), ReviewSettings.deleteMany({}), PurchaseRecord.deleteMany({})]);
  uploadImage.mockClear();
  router.resetLimiters();
});

describe('proxy signature and shop', () => {
  it('rejects a missing or bad signature on every endpoint', async () => {
    for (const [m, p, b] of [['GET', '', undefined], ['POST', '', form()], ['POST', '/photo', { dataUrl: pngUrl }], ['POST', `/${new mongoose.Types.ObjectId()}/helpful`, {}]]) {
      const r = await call(m, p, { signature: 'forged', body: b, query: { productId: PID } });
      expect(r.status).toBe(403);
    }
  });
  it('rejects a shop that is not a myshopify.com domain', async () => {
    expect((await call('GET', '', { shop: 'evil.example.com', query: { productId: PID } })).status).toBe(400);
  });
});

describe('GET reviews', () => {
  it('returns only approved reviews of that product and shop, newest first, with a summary', async () => {
    await Review.create([
      { shopDomain: A, productId: PID, rating: 5, body: 'old five star review', authorName: 'One', status: 'approved', createdAt: new Date('2025-01-01') },
      { shopDomain: A, productId: PID, rating: 4, body: 'newer four star review', authorName: 'Two', status: 'approved', createdAt: new Date('2025-02-01') },
      { shopDomain: A, productId: PID, rating: 1, body: 'pending one is not shown', authorName: 'Three', status: 'pending' },
      { shopDomain: A, productId: PID, rating: 1, body: 'hidden one is not shown', authorName: 'Four', status: 'hidden' },
      { shopDomain: A, productId: '999', rating: 1, body: 'other product review', authorName: 'Five', status: 'approved' },
      { shopDomain: B, productId: PID, rating: 1, body: 'other shop review text', authorName: 'Six', status: 'approved' },
    ]);
    const r = await call('GET', '', { query: { productId: PID } });
    expect(r.status).toBe(200);
    expect(r.body.reviews.map((x) => x.name)).toEqual(['Two', 'One']);
    expect(r.body.summary).toMatchObject({ count: 2, rated: 2, average: 4.5 });
  });

  it('never exposes customer ids, email hashes or status', async () => {
    await Review.create({ shopDomain: A, productId: PID, rating: 5, body: 'a good enough review', authorName: 'X', status: 'approved', customerId: '987654321012', emailHash: 'zzhashzz-not-in-any-id' });
    const r = await call('GET', '', { query: { productId: PID } });
    const text = JSON.stringify(r.body);
    expect(text).not.toContain('987654321012');
    expect(text).not.toContain('zzhashzz');
    expect(r.body.reviews[0].status).toBeUndefined();
  });

  it('follows the settings: page size, badge, helpful counts and ratings can be hidden', async () => {
    await setSettings(A, { reviewsPerPage: 2, verifiedBadge: false, helpfulVotes: false, starRating: false, starRequired: false });
    await Review.create([1, 2, 3].map((i) => ({ shopDomain: A, productId: PID, rating: 5, body: `review number ${i} text`, authorName: `N${i}`, status: 'approved', verified: true, helpfulCount: 4, createdAt: new Date(2025, 0, i) })));
    const r = await call('GET', '', { query: { productId: PID } });
    expect(r.body.reviews).toHaveLength(2);
    expect(r.body.pages).toBe(2);
    expect(r.body.reviews[0]).toMatchObject({ verified: false, helpful: null, rating: null });
    expect((await call('GET', '', { query: { productId: PID, page: '2' } })).body.reviews).toHaveLength(1);
  });

  it('tells the form what to show for guests and logged-in customers', async () => {
    const guest = (await call('GET', '', { query: { productId: PID } })).body.form;
    expect(guest).toMatchObject({ whoCanReview: 'verified', loggedIn: false, needsEmail: true, emailRequired: true, canReview: true });
    await setSettings(A, { whoCanReview: 'logged_in' });
    expect((await call('GET', '', { query: { productId: PID } })).body.form).toMatchObject({ canReview: false, reason: 'LOGIN_REQUIRED' });
    expect((await call('GET', '', { customer: '7', query: { productId: PID } })).body.form).toMatchObject({ canReview: true, loggedIn: true, needsEmail: false });
  });

  it('logged-in customers who did not buy it, or already reviewed it, cannot write one', async () => {
    expect((await call('GET', '', { customer: '7', query: { productId: PID } })).body.form).toMatchObject({ canReview: false, reason: 'NOT_VERIFIED_BUYER' });
    await buy(A, { customerId: '7' });
    expect((await call('GET', '', { customer: '7', query: { productId: PID } })).body.form.canReview).toBe(true);
    await Review.create({ shopDomain: A, productId: PID, rating: 5, body: 'already wrote this one', authorName: 'Me', customerId: '7' });
    expect((await call('GET', '', { customer: '7', query: { productId: PID } })).body.form).toMatchObject({ canReview: false, reason: 'ALREADY_REVIEWED' });
  });

  it('rejects a missing or non-numeric product id', async () => {
    expect((await call('GET', '', {})).status).toBe(400);
    expect((await call('GET', '', { query: { productId: 'abc' } })).status).toBe(400);
  });
});

describe('GET reviews - filters, sorting and photo summary', () => {
  const pic = (n) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/${n}.jpg` });
  const add = (over) => Review.create({ shopDomain: A, productId: PID, body: 'a review long enough', authorName: 'X', status: 'approved', ...over });

  beforeEach(async () => {
    await add({ authorName: 'Five-old', rating: 5, helpfulCount: 1, createdAt: new Date('2025-01-01') });
    await add({ authorName: 'Five-new', rating: 5, helpfulCount: 9, photos: [pic('a'), pic('b')], createdAt: new Date('2025-03-01') });
    await add({ authorName: 'Four', rating: 4, helpfulCount: 3, createdAt: new Date('2025-02-01') });
    await add({ authorName: 'Three', rating: 3, helpfulCount: 0, photos: [pic('c')], createdAt: new Date('2025-02-15') });
    await add({ authorName: 'One', rating: 1, helpfulCount: 5, createdAt: new Date('2025-01-15') });
    await add({ authorName: 'Pending', rating: 1, status: 'pending', photos: [pic('z')] });
  });

  const names = (r) => r.body.reviews.map((x) => x.name);

  it('a star filter returns only that rating; counts for the whole product stay in the summary', async () => {
    const r = await call('GET', '', { query: { productId: PID, rating: '5' } });
    expect(names(r)).toEqual(['Five-new', 'Five-old']);
    expect(r.body.filtered).toBe(2);
    expect(r.body.summary.count).toBe(5);
    expect(r.body.summary.distribution).toMatchObject({ 5: 2, 4: 1, 3: 1, 1: 1 });
  });

  it('"low" means 3 stars and below', async () => {
    const r = await call('GET', '', { query: { productId: PID, rating: 'low' } });
    expect(names(r)).toEqual(['Three', 'One']);
  });

  it('photos=1 returns only reviews with photos', async () => {
    const r = await call('GET', '', { query: { productId: PID, photos: '1' } });
    expect(names(r)).toEqual(['Five-new', 'Three']);
    expect(r.body.filtered).toBe(2);
  });

  it('filters combine', async () => {
    const r = await call('GET', '', { query: { productId: PID, rating: '5', photos: '1' } });
    expect(names(r)).toEqual(['Five-new']);
  });

  it.each([
    ['recent', ['Five-new', 'Three', 'Four', 'One', 'Five-old']],
    ['helpful', ['Five-new', 'One', 'Four', 'Five-old', 'Three']],
    ['highest', ['Five-new', 'Five-old', 'Four', 'Three', 'One']],
    ['lowest', ['One', 'Three', 'Four', 'Five-new', 'Five-old']],
  ])('sort=%s', async (sort, expected) => {
    const r = await call('GET', '', { query: { productId: PID, sort } });
    expect(names(r)).toEqual(expected);
  });

  it('an unknown sort or filter value is ignored (newest first, everything)', async () => {
    const r = await call('GET', '', { query: { productId: PID, sort: '$where', rating: '9', photos: 'yes' } });
    expect(names(r)).toEqual(['Five-new', 'Three', 'Four', 'One', 'Five-old']);
  });

  it('summary has the number of reviews with photos and up to 8 recent photos (approved only)', async () => {
    const r = await call('GET', '', { query: { productId: PID } });
    expect(r.body.summary.photoCount).toBe(2);
    expect(r.body.summary.gallery).toEqual([pic('a').url, pic('b').url, pic('c').url]);
    expect(JSON.stringify(r.body.summary.gallery)).not.toContain('z.jpg');
  });

  it('the gallery is capped at 8 photos', async () => {
    for (let i = 0; i < 5; i++) await add({ authorName: 'P' + i, rating: 5, photos: [pic('m' + i), pic('n' + i)] });
    const r = await call('GET', '', { query: { productId: PID } });
    expect(r.body.summary.gallery).toHaveLength(8);
  });

  it('pages follow the filtered count', async () => {
    await setSettings(A, { reviewsPerPage: 1 });
    const r = await call('GET', '', { query: { productId: PID, rating: '5' } });
    expect(r.body.pages).toBe(2);
    expect((await call('GET', '', { query: { productId: PID, rating: '5', page: '2' } })).body.reviews.map((x) => x.name)).toEqual(['Five-old']);
  });

  it('star filters are ignored when star rating is switched off', async () => {
    await setSettings(A, { starRating: false, starRequired: false });
    const r = await call('GET', '', { query: { productId: PID, rating: '5' } });
    expect(r.body.filtered).toBe(5);
  });
});

describe('POST review - who can review', () => {
  it('verified: a guest whose email matches an order is accepted and marked verified', async () => {
    await buy(A, { email: 'asha@example.com' });
    const r = await call('POST', '', { body: form() });
    expect(r.body).toMatchObject({ ok: true, status: 'pending' });
    const saved = await Review.findOne({ shopDomain: A });
    expect(saved).toMatchObject({ verified: true, status: 'pending', authorName: 'Asha' });
    expect(saved.emailHash).toBe(hashEmail('asha@example.com'));
    expect(JSON.stringify(saved.toObject())).not.toContain('asha@example.com');
  });

  it('verified: refuses someone who did not buy this product', async () => {
    await buy(A, { email: 'asha@example.com', productIds: ['other'] });
    expect((await call('POST', '', { body: form() })).body.error).toBe('NOT_VERIFIED_BUYER');
    expect((await call('POST', '', { body: form({ email: 'stranger@example.com' }) })).status).toBe(403);
    expect(await Review.countDocuments()).toBe(0);
  });

  it('verified: a purchase in ANOTHER shop does not count', async () => {
    await buy(B, { email: 'asha@example.com' });
    expect((await call('POST', '', { body: form() })).status).toBe(403);
  });

  it('verified: a guest must give an email; a logged-in buyer need not', async () => {
    const r = await call('POST', '', { body: form({ email: '' }) });
    expect(r.body).toMatchObject({ error: 'EMAIL_REQUIRED', field: 'email' });
    await buy(A, { customerId: '7' });
    expect((await call('POST', '', { customer: '7', body: form({ email: '' }) })).body.ok).toBe(true);
  });

  it('the customer id comes from the signed query, not the body', async () => {
    await buy(A, { customerId: '7' });
    const r = await call('POST', '', { body: form({ email: '', customerId: '7', logged_in_customer_id: '7' }) });
    expect(r.status).toBe(400);
  });

  it('logged_in: needs a login but not a purchase; unverified reviews have no badge', async () => {
    await setSettings(A, { whoCanReview: 'logged_in' });
    expect((await call('POST', '', { body: form() })).status).toBe(401);
    const r = await call('POST', '', { customer: '9', body: form({ email: '' }) });
    expect(r.body.ok).toBe(true);
    expect((await Review.findOne({ customerId: '9' })).verified).toBe(false);
  });

  it('anyone: a guest with no email is accepted, and a buyer still gets the verified flag', async () => {
    await setSettings(A, { whoCanReview: 'anyone' });
    expect((await call('POST', '', { body: form({ email: '' }) })).body.ok).toBe(true);
    await buy(A, { email: 'buyer@example.com' });
    await call('POST', '', { body: form({ email: 'buyer@example.com', name: 'Buyer' }) });
    expect((await Review.findOne({ authorName: 'Buyer' })).verified).toBe(true);
    expect((await Review.findOne({ authorName: 'Asha' })).verified).toBe(false);
  });
});

describe('POST review - rules', () => {
  beforeEach(() => setSettings(A, { whoCanReview: 'anyone' }));

  it('approval on: new reviews are pending. approval off: they go live', async () => {
    expect((await call('POST', '', { body: form({ email: 'a@x.co' }) })).body.status).toBe('pending');
    await setSettings(A, { requireApproval: false });
    expect((await call('POST', '', { body: form({ email: 'b@x.co' }) })).body.status).toBe('approved');
    expect(await Review.countDocuments({ status: 'approved' })).toBe(1);
  });

  it('one review per product per email, and per logged-in customer', async () => {
    expect((await call('POST', '', { body: form() })).status).toBe(200);
    const again = await call('POST', '', { body: form({ email: 'ASHA@example.com', body: 'a second try at it now' }) });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('ALREADY_REVIEWED');
    expect((await call('POST', '', { body: form({ productId: '222' }) })).status).toBe(200); // other product is fine
    await call('POST', '', { customer: '5', body: form({ email: '' }) });
    expect((await call('POST', '', { customer: '5', body: form({ email: '' }) })).status).toBe(409);
  });

  it('applies the settings: rating required, short text', async () => {
    expect((await call('POST', '', { body: form({ rating: undefined }) })).body.error).toBe('RATING_REQUIRED');
    expect((await call('POST', '', { body: form({ body: 'tiny' }) })).body.error).toBe('BODY_TOO_SHORT');
    await setSettings(A, { starRating: false, starRequired: false });
    await call('POST', '', { body: form({ rating: 1 }) });
    expect((await Review.findOne()).rating).toBeNull();
  });

  it('keeps only our own photo links, within the photo limit', async () => {
    await setSettings(A, { 'photos.maxPhotos': 2 });
    const mine = 'https://res.cloudinary.com/demo/image/upload/v1/a.png';
    await call('POST', '', { body: form({ photos: [mine, 'https://evil.example/x.png', 'javascript:alert(1)'] }) });
    expect((await Review.findOne()).photos.map((p) => p.url)).toEqual([mine]);
    const many = [1, 2, 3].map((i) => `https://res.cloudinary.com/demo/image/upload/v1/${i}.png`);
    expect((await call('POST', '', { body: form({ email: 'z@x.co', photos: many }) })).body.error).toBe('TOO_MANY_PHOTOS');
  });

  it('stores review text as plain text exactly as typed (escaping is the renderer\'s job)', async () => {
    await call('POST', '', { body: form({ body: '<img src=x onerror=alert(1)> nice product' }) });
    expect((await Review.findOne()).body).toBe('<img src=x onerror=alert(1)> nice product');
  });

  it('ignores status, verified and counters sent by the browser', async () => {
    await call('POST', '', { body: form({ status: 'approved', verified: true, helpfulCount: 99, shopDomain: B }) });
    expect(await Review.findOne()).toMatchObject({ status: 'pending', verified: false, helpfulCount: 0, shopDomain: A });
  });

  it('slows down a device that posts too many reviews', async () => {
    const results = [];
    for (let i = 0; i < 7; i++) results.push((await call('POST', '', { shop: 'spam-shop.myshopify.com', body: form({ email: `u${i}@x.co` }) })).status);
    expect(results.slice(-2)).toEqual([429, 429]);
  });
});

describe('POST photo', () => {
  it('uploads a valid allowed image and returns its link', async () => {
    const r = await call('POST', '/photo', { body: { dataUrl: pngUrl } });
    expect(r.body).toEqual({ ok: true, url: 'https://res.cloudinary.com/demo/image/upload/v1/new.png' });
    expect(uploadImage).toHaveBeenCalledTimes(1);
  });

  it('refuses without calling the image host: wrong type, fake file, too big, photos off', async () => {
    const gif = `data:image/gif;base64,${Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(12)]).toString('base64')}`;
    expect((await call('POST', '/photo', { body: { dataUrl: gif } })).body.error).toBe('BAD_IMAGE_TYPE');
    expect((await call('POST', '/photo', { body: { dataUrl: `data:image/png;base64,${Buffer.from('<html>fake file here</html>').toString('base64')}` } })).body.error).toBe('BAD_IMAGE');
    await setSettings(A, { 'photos.maxFileSizeMb': 1 });
    const big = `data:image/png;base64,${Buffer.concat([png, Buffer.alloc(1024 * 1024)]).toString('base64')}`;
    expect((await call('POST', '/photo', { body: { dataUrl: big } })).body.error).toBe('IMAGE_TOO_LARGE');
    await setSettings(A, { 'photos.enabled': false });
    expect((await call('POST', '/photo', { body: { dataUrl: pngUrl } })).body.error).toBe('PHOTOS_OFF');
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('says so when the image host fails', async () => {
    uploadImage.mockResolvedValueOnce(null);
    expect((await call('POST', '/photo', { body: { dataUrl: pngUrl } })).status).toBe(502);
  });
});

describe('POST helpful', () => {
  const approved = (over = {}) => Review.create({ shopDomain: A, productId: PID, rating: 5, body: 'a review worth a vote', authorName: 'X', status: 'approved', ...over });

  it('counts one vote per visitor', async () => {
    const r = await approved();
    const first = await call('POST', `/${r._id}/helpful`, { body: { visitorId: 'v1' } });
    expect(first.body).toMatchObject({ ok: true, already: false, helpful: 1 });
    expect((await call('POST', `/${r._id}/helpful`, { body: { visitorId: 'v1' } })).body).toMatchObject({ already: true, helpful: 1 });
    expect((await call('POST', `/${r._id}/helpful`, { body: { visitorId: 'v2' } })).body.helpful).toBe(2);
    expect((await Review.findById(r._id)).helpfulCount).toBe(2);
    expect(await ReviewVote.countDocuments()).toBe(2);
  });

  it('a logged-in customer counts once even from different browsers', async () => {
    const r = await approved();
    await call('POST', `/${r._id}/helpful`, { customer: '3', body: { visitorId: 'a' } });
    expect((await call('POST', `/${r._id}/helpful`, { customer: '3', body: { visitorId: 'b' } })).body.already).toBe(true);
  });

  it('only works on approved reviews of the same shop, and when votes are on', async () => {
    const pending = await approved({ status: 'pending' });
    const other = await approved({ shopDomain: B });
    expect((await call('POST', `/${pending._id}/helpful`, { body: {} })).status).toBe(404);
    expect((await call('POST', `/${other._id}/helpful`, { body: {} })).status).toBe(404);
    expect((await call('POST', '/not-an-id/helpful', { body: {} })).status).toBe(400);
    const r = await approved();
    await setSettings(A, { helpfulVotes: false });
    expect((await call('POST', `/${r._id}/helpful`, { body: {} })).status).toBe(403);
    expect((await Review.findById(r._id)).helpfulCount).toBe(0);
  });
});
