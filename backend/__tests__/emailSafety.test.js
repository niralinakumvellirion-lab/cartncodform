'use strict';
// Must set env before any require so the token module picks it up.
process.env.SHOPIFY_API_SECRET = 'test-secret-for-unsub';
process.env.BACKEND_URL = 'https://backend.example.com';

// ═══════════════════════════════════════════════════════════════════════════════
// Tests:
//   1. Token create/verify (valid, tampered, wrong shop)
//   2. GET /unsubscribe/:token does NOT unsubscribe
//   3. POST /unsubscribe/:token sets suppressed and is idempotent
//   4. Invalid token → error page
//   5. Broadcast emails carry per-recipient header + footer link
//   6. Transactional email has no unsubscribe header/footer
//   7. Suppressed profile skipped by broadcast
// (Test 8 — two concurrent pollers — lives in addEngagement.test.js
//  alongside the existing processFestivalQueue describe)
// ═══════════════════════════════════════════════════════════════════════════════

jest.mock('../models/Profile');
jest.mock('../models/Store');
jest.mock('../models/EmailTemplate');
jest.mock('../services/sendLogService', () => ({
  logBroadcastSend: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/emailDesign', () => ({
  designFromTemplate: jest.fn(() => ({
    subject: 'Test Subject', body: 'Test body', store: 'Store',
    ctaUrl: null, unsubscribeUrl: null,
  })),
}));
jest.mock('../utils/emailEngine', () => ({
  LAYOUT_INFO: [{ k: 'standard', label: 'Standard' }],
  FONT_ORDER: ['Roboto'],
  renderEmailDocument: jest.fn((d) => `<html>unsub:${d.unsubscribeUrl || 'none'}</html>`),
}));
// All Resend instances share one send spy (stored on Resend._send) so tests
// can assert on it without needing to track which instance number was created.
jest.mock('resend', () => {
  const mockSend = jest.fn().mockResolvedValue({ data: { id: 'x' }, error: null });
  const Resend = jest.fn().mockImplementation(() => ({ emails: { send: mockSend } }));
  Resend._send = mockSend;
  return { Resend };
});

const {
  createToken,
  verifyToken,
  buildUnsubscribeUrl,
  buildUnsubscribeHeaders,
} = require('../utils/unsubscribeToken');

const Profile = require('../models/Profile');
const Store = require('../models/Store');
const EmailTemplate = require('../models/EmailTemplate');

const SHOP = 'demo.myshopify.com';
const PID1 = '64a000000000000000000001';
const PID2 = '64a000000000000000000002';

// ─── 1. Token create/verify ──────────────────────────────────────────────────

describe('unsubscribeToken — create/verify', () => {
  test('valid token round-trips', () => {
    const token = createToken(SHOP, PID1);
    const r = verifyToken(token);
    expect(r).not.toBeNull();
    expect(r.shopDomain).toBe(SHOP);
    expect(r.profileId).toBe(PID1);
  });

  test('tampered payload returns null', () => {
    const token = createToken(SHOP, PID1);
    const dot = token.indexOf('.');
    const evilB64 = Buffer.from('evil.myshopify.com|' + PID1).toString('base64url');
    expect(verifyToken(evilB64 + token.slice(dot))).toBeNull();
  });

  test('tampered signature returns null', () => {
    const token = createToken(SHOP, PID1);
    const b64 = token.split('.')[0];
    expect(verifyToken(b64 + '.' + 'a'.repeat(64))).toBeNull();
  });

  test('different shop produces a different token', () => {
    const t1 = createToken(SHOP, PID1);
    const t2 = createToken('other.myshopify.com', PID1);
    expect(t1).not.toBe(t2);
    expect(verifyToken(t1).shopDomain).toBe(SHOP);
    expect(verifyToken(t2).shopDomain).toBe('other.myshopify.com');
  });

  test('empty/garbage strings return null', () => {
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('notvalid')).toBeNull();
    expect(verifyToken('a.b')).toBeNull();
  });

  test('buildUnsubscribeUrl contains token that decodes correctly', () => {
    const url = buildUnsubscribeUrl(SHOP, PID1);
    expect(url).toMatch(/^https:\/\/backend\.example\.com\/api\/unsubscribe\//);
    const token = url.split('/api/unsubscribe/')[1];
    const r = verifyToken(token);
    expect(r.shopDomain).toBe(SHOP);
    expect(r.profileId).toBe(PID1);
  });

  test('buildUnsubscribeHeaders has https + mailto in List-Unsubscribe', () => {
    const h = buildUnsubscribeHeaders(SHOP, PID1);
    expect(h['List-Unsubscribe']).toMatch(/^<https:\/\//);
    expect(h['List-Unsubscribe']).toContain('mailto:unsubscribe@');
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

// ─── 2–4. Unsubscribe route tests ────────────────────────────────────────────

const express = require('express');

let unsubServer;
let unsubBase;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const router = require('../routes/unsubscribe');
  app.use('/', router);
  unsubServer = app.listen(0, () => {
    unsubBase = `http://127.0.0.1:${unsubServer.address().port}`;
    done();
  });
});
afterAll((done) => { unsubServer.close(done); });

beforeEach(() => {
  jest.clearAllMocks();
  Store.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ shopName: 'Cool Store' }),
    }),
  });
  Profile.findOneAndUpdate.mockResolvedValue(null);
});

describe('GET /unsubscribe/:token — confirmation page, no side-effects', () => {
  test('valid token → 200 HTML with store name, does not call findOneAndUpdate', async () => {
    const token = createToken(SHOP, PID1);
    const res = await fetch(`${unsubBase}/${token}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Cool Store');
    expect(html.toLowerCase()).toContain('unsubscribe');
    expect(Profile.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('invalid token → 400 generic error page, no shop or profileId in response', async () => {
    const res = await fetch(`${unsubBase}/badtoken`);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Invalid link');
    expect(html).not.toContain(SHOP);
    expect(html).not.toContain(PID1);
    expect(Profile.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /unsubscribe/:token — sets suppressed, idempotent', () => {
  test('valid token → suppressed=true, 200 confirmation', async () => {
    const token = createToken(SHOP, PID1);
    const res = await fetch(`${unsubBase}/${token}`, { method: 'POST' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('unsubscribed');
    expect(Profile.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: PID1, shopDomain: SHOP },
      { $set: { suppressed: true } }
    );
  });

  test('POST is idempotent — 200 on second call too', async () => {
    const token = createToken(SHOP, PID1);
    const r1 = await fetch(`${unsubBase}/${token}`, { method: 'POST' });
    const r2 = await fetch(`${unsubBase}/${token}`, { method: 'POST' });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(Profile.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  test('invalid token → 400 error page, no Profile update', async () => {
    const res = await fetch(`${unsubBase}/garbage`, { method: 'POST' });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid link');
    expect(Profile.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

// ─── 5. Broadcast emails carry per-recipient header + footer ─────────────────

describe('sendEmailBroadcast — per-recipient unsubscribeUrl and headers', () => {
  const { renderEmailDocument } = require('../utils/emailEngine');
  const { Resend } = require('resend');

  const mockProfiles = [
    { _id: PID1, channels: { email: { address: 'a@test.com' } }, identifiers: {} },
    { _id: PID2, channels: { email: { address: 'b@test.com' } }, identifiers: {} },
  ];

  beforeEach(() => {
    EmailTemplate.findOne.mockResolvedValue({
      _id: 'tpl1', shopDomain: SHOP, subject: 'Sub', body: 'B', imageUrl: '',
    });
    Profile.countDocuments = jest.fn().mockResolvedValue(2);
    Profile.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockProfiles),
      }),
    });
    Store.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ shopName: 'Store' }),
      }),
    });
  });

  test('renderEmailDocument is called once per recipient with a distinct unsubscribeUrl', async () => {
    const { sendEmailBroadcast } = require('../utils/emailBroadcast');
    await sendEmailBroadcast({ shopDomain: SHOP, templateId: 'tpl1', logOrigin: 'scheduled' });

    expect(renderEmailDocument).toHaveBeenCalledTimes(2);
    const url1 = renderEmailDocument.mock.calls[0][0].unsubscribeUrl;
    const url2 = renderEmailDocument.mock.calls[1][0].unsubscribeUrl;
    expect(url1).toBeTruthy();
    expect(url2).toBeTruthy();
    expect(url1).not.toBe(url2);
    expect(verifyToken(url1.split('/api/unsubscribe/')[1]).profileId).toBe(PID1);
    expect(verifyToken(url2.split('/api/unsubscribe/')[1]).profileId).toBe(PID2);
  });

  test('each recipient gets a per-recipient List-Unsubscribe header', async () => {
    const { Resend } = require('resend');
    Resend._send.mockClear();
    const { sendEmailBroadcast } = require('../utils/emailBroadcast');
    await sendEmailBroadcast({ shopDomain: SHOP, templateId: 'tpl1', logOrigin: 'scheduled' });

    const calls = Resend._send.mock.calls;
    expect(calls).toHaveLength(2);
    const h0 = calls[0][0].headers['List-Unsubscribe'];
    const h1 = calls[1][0].headers['List-Unsubscribe'];
    expect(h0).toMatch(/^<https:\/\//);
    expect(h1).toMatch(/^<https:\/\//);
    expect(h0).not.toBe(h1);
    expect(h0).toContain('mailto:');
  });
});

// ─── 6. Transactional email has no unsubscribe header/footer ─────────────────

describe('sendNewCodOrderEmail — transactional, no unsubscribe', () => {
  test('COD order alert to owner has no List-Unsubscribe header and no unsubscribe link', async () => {
    const { Resend } = require('resend');
    Resend._send.mockClear();
    const { sendNewCodOrderEmail } = require('../utils/email');

    await sendNewCodOrderEmail({
      name: 'Bob', phone: '9999', address: '1 St', city: 'Mumbai', pincode: '400001',
      productName: 'Widget', productPrice: 100, quantity: 1,
    }, 'owner@example.com');

    const calls = Resend._send.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const sendArgs = calls[calls.length - 1][0];
    expect(sendArgs.headers).toBeUndefined();
    expect(sendArgs.html.toLowerCase()).not.toContain('unsubscribe');
  });
});

// ─── 7. Suppressed profile excluded by broadcast ─────────────────────────────

describe('sendEmailBroadcast — zero recipients after suppression', () => {
  beforeEach(() => {
    EmailTemplate.findOne.mockResolvedValue({
      _id: 'tpl2', shopDomain: SHOP, subject: 'S', body: 'B', imageUrl: '',
    });
    Store.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ shopName: 'S' }) }),
    });
    Profile.countDocuments = jest.fn().mockResolvedValue(0);
    Profile.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
  });

  test('countDocuments=0 → error result, no emails sent', async () => {
    const { Resend } = require('resend');
    Resend._send.mockClear();
    const { sendEmailBroadcast } = require('../utils/emailBroadcast');
    const result = await sendEmailBroadcast({ shopDomain: SHOP, templateId: 'tpl2', logOrigin: 'scheduled' });

    expect(result.error).toBe('No recipients in segment');
    expect(result.sent).toBe(0);
    expect(Resend._send).not.toHaveBeenCalled();
  });
});
