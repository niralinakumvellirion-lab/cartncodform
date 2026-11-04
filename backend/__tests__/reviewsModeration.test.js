'use strict';

/**
 * routes/reviews.js moderation: list / approve / hide / delete, against a real in-memory MongoDB.
 * requireOwner is replaced so the shop comes from a test header.
 */

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, res, next) => next(),
  requireStoreOwner: (req, res, next) => {
    const shop = req.headers['x-test-shop'];
    if (!shop || shop !== req.params.shopDomain) return res.status(403).json({ error: 'Not authorized for this store' });
    req.store = { shopDomain: shop };
    next();
  },
}));

const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Review = require('../models/Review');
const ReviewVote = require('../models/ReviewVote');
const router = require('../routes/reviews');

const A = 'shop-a.myshopify.com';
const B = 'shop-b.myshopify.com';

let mongod;
let server;
let base;

async function call(method, shop, path, { body, asShop = shop } = {}) {
  const r = await fetch(`${base}/api/reviews/${shop}/items${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-shop': asShop },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

const make = (shop, over = {}) => Review.create({
  shopDomain: shop, productId: '1', rating: 5, body: 'a perfectly fine review', authorName: 'Asha', status: 'pending', ...over,
});

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Review.init(), ReviewVote.init()]);
  const app = express();
  app.use(express.json());
  app.use('/api/reviews', router);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
}, 60000); // starting the in-memory database can be slow when every suite runs at once

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(() => Promise.all([Review.deleteMany({}), ReviewVote.deleteMany({})]));

describe('GET items', () => {
  it('lists this shop only, with counts for each status', async () => {
    await make(A, { status: 'pending' });
    await make(A, { status: 'pending' });
    await make(A, { status: 'approved' });
    await make(A, { status: 'hidden' });
    await make(B, { status: 'pending' });
    const all = await call('GET', A, '');
    expect(all.body.counts).toEqual({ pending: 2, approved: 1, hidden: 1, all: 4 });
    expect(all.body.items).toHaveLength(4);
    const pending = await call('GET', A, '?status=pending');
    expect(pending.body.items.every((i) => i.status === 'pending')).toBe(true);
    expect(pending.body.total).toBe(2);
  });

  it('does not expose customer ids or email hashes', async () => {
    await make(A, { customerId: '987654321012', emailHash: 'zzhashzz-not-in-any-id' });
    const text = JSON.stringify((await call('GET', A, '')).body);
    expect(text).not.toContain('987654321012');
    expect(text).not.toContain('zzhashzz');
  });

  it('pages 20 at a time, newest first', async () => {
    for (let i = 0; i < 25; i++) await make(A, { authorName: `N${i}`, createdAt: new Date(2025, 0, 1, 0, i) });
    const p1 = await call('GET', A, '');
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body.pages).toBe(2);
    expect(p1.body.items[0].authorName).toBe('N24');
    expect((await call('GET', A, '?page=2')).body.items).toHaveLength(5);
  });

  it('refuses another shop\'s token', async () => {
    expect((await call('GET', A, '', { asShop: B })).status).toBe(403);
  });
});

describe('PATCH item', () => {
  it('approves, hides and returns to pending', async () => {
    const r = await make(A);
    for (const status of ['approved', 'hidden', 'pending']) {
      const res = await call('PATCH', A, `/${r._id}`, { body: { status } });
      expect(res.body.item.status).toBe(status);
      expect((await Review.findById(r._id)).status).toBe(status);
    }
    expect((await Review.findById(r._id)).moderatedAt).toBeInstanceOf(Date);
  });

  it('rejects an unknown status and a bad id', async () => {
    const r = await make(A);
    expect((await call('PATCH', A, `/${r._id}`, { body: { status: 'deleted' } })).status).toBe(400);
    expect((await call('PATCH', A, `/${r._id}`, { body: {} })).status).toBe(400);
    expect((await call('PATCH', A, '/nope', { body: { status: 'approved' } })).status).toBe(400);
    expect((await Review.findById(r._id)).status).toBe('pending');
  });

  it('cannot touch another shop\'s review, even with its id', async () => {
    const theirs = await make(B);
    expect((await call('PATCH', A, `/${theirs._id}`, { body: { status: 'approved' } })).status).toBe(404);
    expect((await Review.findById(theirs._id)).status).toBe('pending');
  });

  it('only changes the status, nothing else', async () => {
    const r = await make(A, { body: 'original text of review' });
    await call('PATCH', A, `/${r._id}`, { body: { status: 'approved', body: 'edited', rating: 1, helpfulCount: 50 } });
    expect(await Review.findById(r._id)).toMatchObject({ body: 'original text of review', rating: 5, helpfulCount: 0 });
  });
});

describe('DELETE item', () => {
  it('removes the review and its votes', async () => {
    const r = await make(A);
    await ReviewVote.create({ shopDomain: A, reviewId: r._id, voterKey: 'k' });
    expect((await call('DELETE', A, `/${r._id}`)).body.ok).toBe(true);
    expect(await Review.countDocuments()).toBe(0);
    expect(await ReviewVote.countDocuments()).toBe(0);
  });

  it('cannot delete another shop\'s review, and a second delete is a 404', async () => {
    const theirs = await make(B);
    expect((await call('DELETE', A, `/${theirs._id}`)).status).toBe(404);
    expect(await Review.countDocuments({ _id: theirs._id })).toBe(1);
    const mine = await make(A);
    await call('DELETE', A, `/${mine._id}`);
    expect((await call('DELETE', A, `/${mine._id}`)).status).toBe(404);
  });
});
