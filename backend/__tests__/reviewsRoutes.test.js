'use strict';

/**
 * routes/reviews.js — merchant review settings, against a real in-memory MongoDB.
 * requireOwner is replaced so the shop comes from a test header; the shop-scoping
 * itself is checked through two different shops.
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

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const ReviewSettings = require('../models/ReviewSettings');
const router = require('../routes/reviews');

const A = 'shop-a.myshopify.com';
const B = 'shop-b.myshopify.com';

let mongod;
let server;
let base;

async function call(method, shop, body, asShop = shop) {
  const r = await fetch(`${base}/api/reviews/${shop}/settings`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-shop': asShop },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

function valid(over = {}) {
  return {
    whoCanReview: 'logged_in',
    verifiedBadge: false,
    starRating: true,
    starRequired: false,
    reviewsPerPage: 20,
    photos: { enabled: true, maxPhotos: 5, maxFileSizeMb: 4, allowedTypes: ['jpeg', 'gif'] },
    helpfulVotes: false,
    ...over,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await ReviewSettings.init();
  const app = express();
  app.use(express.json());
  app.use('/api/reviews', router);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
}, 120000);

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongod.stop();
}, 60000); // starting the in-memory database can be slow when every suite runs at once

beforeEach(async () => {
  await ReviewSettings.deleteMany({});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GET settings', () => {
  test('a shop that never saved gets the defaults, and nothing is written', async () => {
    const r = await call('GET', A);
    expect(r.status).toBe(200);
    expect(r.body.settings).toMatchObject({
      whoCanReview: 'verified', verifiedBadge: true, starRating: true, starRequired: true, reviewsPerPage: 10, helpfulVotes: true,
      photos: { enabled: true, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: ['jpeg', 'png', 'webp'] },
    });
    expect(await ReviewSettings.countDocuments()).toBe(0);
  });

  test('another shop\'s token cannot read this shop\'s settings', async () => {
    const r = await call('GET', A, undefined, B);
    expect(r.status).toBe(403);
  });
});

describe('PUT settings', () => {
  test('saves and returns the settings; a later GET returns the same', async () => {
    const put = await call('PUT', A, { settings: valid() });
    expect(put.status).toBe(200);
    expect(put.body.settings).toMatchObject(valid());
    expect(put.body.settings.updatedAt).toBeTruthy();
    const get = await call('GET', A);
    expect(get.body.settings).toMatchObject(valid());
  });

  test('saving twice updates the one document (no duplicates)', async () => {
    await call('PUT', A, { settings: valid() });
    await call('PUT', A, { settings: valid({ whoCanReview: 'anyone', reviewsPerPage: 5 }) });
    expect(await ReviewSettings.countDocuments({ shopDomain: A })).toBe(1);
    expect((await call('GET', A)).body.settings).toMatchObject({ whoCanReview: 'anyone', reviewsPerPage: 5 });
  });

  test('settings are separate per shop', async () => {
    await call('PUT', A, { settings: valid({ whoCanReview: 'anyone' }) });
    await call('PUT', B, { settings: valid({ whoCanReview: 'verified' }) });
    expect((await call('GET', A)).body.settings.whoCanReview).toBe('anyone');
    expect((await call('GET', B)).body.settings.whoCanReview).toBe('verified');
  });

  test('a shop can only write its own settings', async () => {
    const r = await call('PUT', A, { settings: valid() }, B);
    expect(r.status).toBe(403);
    expect(await ReviewSettings.countDocuments()).toBe(0);
  });

  test('the shop in the body is ignored; the stored shop comes from the token', async () => {
    await call('PUT', A, { settings: { ...valid(), shopDomain: B } });
    expect(await ReviewSettings.countDocuments({ shopDomain: B })).toBe(0);
    expect(await ReviewSettings.countDocuments({ shopDomain: A })).toBe(1);
  });

  test('star rating off is stored with "required" off', async () => {
    const r = await call('PUT', A, { settings: valid({ starRating: false, starRequired: true }) });
    expect(r.body.settings.starRating).toBe(false);
    expect(r.body.settings.starRequired).toBe(false);
    const doc = await ReviewSettings.findOne({ shopDomain: A }).lean();
    expect(doc.starRequired).toBe(false);
  });

  test('invalid input is a 400 with the field name, and nothing is saved', async () => {
    const bad = [
      [{ settings: valid({ whoCanReview: 'nobody' }) }, 'whoCanReview'],
      [{ settings: valid({ reviewsPerPage: 500 }) }, 'reviewsPerPage'],
      [{ settings: valid({ photos: { ...valid().photos, allowedTypes: [] } }) }, 'photos.allowedTypes'],
      [{ settings: valid({ photos: { ...valid().photos, maxFileSizeMb: 99 } }) }, 'photos.maxFileSizeMb'],
      [{ settings: valid({ helpfulVotes: 'yes' }) }, 'helpfulVotes'],
      [{}, 'settings'],
      [{ settings: 'x' }, 'settings'],
    ];
    for (const [body, field] of bad) {
      const r = await call('PUT', A, body);
      expect(r.status).toBe(400);
      expect(r.body.field).toBe(field);
      expect(r.body.error).toBeTruthy();
    }
    expect(await ReviewSettings.countDocuments()).toBe(0);
  });

  test('a database failure is a 500 with a safe message', async () => {
    jest.spyOn(ReviewSettings, 'findOneAndUpdate').mockImplementation(() => { throw new Error('secret db detail'); });
    const r = await call('PUT', A, { settings: valid() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secret db detail/);
  });
});
