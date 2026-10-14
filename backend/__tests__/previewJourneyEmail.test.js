/**
 * Tests for POST /api/push/preview-journey-email.
 * Verifies: returns HTML, does NOT call Resend, does NOT create ScheduledJob.
 */

jest.mock('../models/Profile', () => ({ findOne: jest.fn() }));
jest.mock('../models/Store', () => ({ findOne: jest.fn() }));
jest.mock('../models/ScheduledJob', () => ({ create: jest.fn() }));

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => {
    req.shopDomain = req.headers['x-test-shop'] || 'demo.myshopify.com';
    next();
  },
  requireStoreOwner: (_req, _res, next) => next(),
  requireNotSuspended: (_req, _res, next) => next(),
}));

const Profile = require('../models/Profile');
const Store = require('../models/Store');
const ScheduledJob = require('../models/ScheduledJob');

const SHOP = 'demo.myshopify.com';
const PROFILE_ID = '507f1f77bcf86cd799439011';

let server, base;

beforeAll(() => new Promise((resolve) => {
  const express = require('express');
  const pushRouter = require('../routes/push');
  const app = express();
  app.use(express.json());
  app.use('/api/push', pushRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Store.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({ shopName: 'Test Store', logoUrl: null, primaryColor: null }),
  });
});
afterEach(() => jest.restoreAllMocks());

test('p1. returns HTML string for valid inputs', async () => {
  Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: PROFILE_ID }) });

  const res = await fetch(`${base}/api/push/preview-journey-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-shop': SHOP },
    body: JSON.stringify({ profileId: PROFILE_ID, subject: 'Hello', body: 'Test body' }),
  });

  expect(res.status).toBe(200);
  const json = await res.json();
  expect(typeof json.html).toBe('string');
  expect(json.html.length).toBeGreaterThan(10);
  expect(json.html).toContain('Test body');
});

test('p2. does NOT call Resend send', async () => {
  Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: PROFILE_ID }) });

  await fetch(`${base}/api/push/preview-journey-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-shop': SHOP },
    body: JSON.stringify({ profileId: PROFILE_ID, subject: 'S', body: 'B' }),
  });

  expect(mockSend).not.toHaveBeenCalled();
});

test('p3. does NOT create a ScheduledJob', async () => {
  Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: PROFILE_ID }) });

  await fetch(`${base}/api/push/preview-journey-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-shop': SHOP },
    body: JSON.stringify({ profileId: PROFILE_ID, subject: 'S', body: 'B' }),
  });

  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('p4. missing fields -> 400', async () => {
  const res = await fetch(`${base}/api/push/preview-journey-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-shop': SHOP },
    body: JSON.stringify({ profileId: PROFILE_ID, subject: '', body: 'B' }),
  });

  expect(res.status).toBe(400);
});

test('p5. profile not found for this shop -> 404', async () => {
  Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

  const res = await fetch(`${base}/api/push/preview-journey-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-shop': SHOP },
    body: JSON.stringify({ profileId: PROFILE_ID, subject: 'Hi', body: 'there' }),
  });

  expect(res.status).toBe(404);
});
