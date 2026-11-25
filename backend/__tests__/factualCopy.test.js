'use strict';

/**
 * App Review 1.1.4 "Use only factual information": the reviewer saw "Only 6 left", "We saved it for you"
 * and "New silks just arrived" in prefilled automatic messages. utils/factualCopy.findUnbackedClaim spots
 * such claims; automatic AI copy that makes one falls back to the factual built-in template; every
 * built-in automatic text and the admin previews/suggestions are free of them.
 */

jest.mock('../models/CopyCache', () => {
  const actual = jest.requireActual('../models/CopyCache');
  return { findOne: jest.fn(), create: jest.fn(), buildCacheKey: actual.buildCacheKey };
});

const fs = require('fs');
const path = require('path');
const CopyCache = require('../models/CopyCache');
const { findUnbackedClaim, isFactual } = require('../utils/factualCopy');
const { generateCopy, generateEmailCopy, _builtInCopy } = require('../services/aiService');

describe('findUnbackedClaim', () => {
  it.each([
    'Still thinking about the Banarasi Silk Saree? Only 6 left.',
    'Your saree is waiting. We saved it for you.',
    "We've missed you. New silks just arrived.",
    'These are selling fast!',
    'Complete your order before it sells out.',
    "Grab it before it's gone.",
    'Almost gone — complete your order',
    'Small batches, limited stock',
    'Ends tonight at midnight',
    'Last chance to shop',
    'New collection just dropped.',
    "We've added exciting products.",
    'Your cart is saved and waiting.',
    'Reserved for you for 2 hours',
    '12 people are viewing this right now',
  ])('catches: %s', (text) => {
    expect(findUnbackedClaim(text)).not.toBeNull();
  });

  it.each([
    "You left something in your cart. Complete your order whenever you're ready.",
    'Still thinking about Kurta? Take another look.',
    "It's been a while. Come back and browse the store whenever you like.",
    'Happy Birthday! We have a personal discount code just for you.',
    'The price just dropped on an item you were viewing.',
  ])('lets factual copy through: %s', (text) => {
    expect(findUnbackedClaim(text)).toBeNull();
  });

  it('"back in stock" only for the back-in-stock signal', () => {
    expect(findUnbackedClaim('It is back in stock.', { signalType: 'back_in_stock' })).toBeNull();
    expect(findUnbackedClaim('New stock is here.', { signalType: 'back_in_stock' })).not.toBeNull();
    expect(isFactual(['ok', undefined, ''], {})).toBe(true);
  });
});

describe('built-in automatic copy is factual', () => {
  it('every signal email template, fallback and editor fallback', () => {
    const { SIGNAL_EMAIL_TEMPLATES, FALLBACK_PUSH, FALLBACK_EMAIL, FALLBACK_TEMPLATE } = _builtInCopy;
    for (const [type, t] of Object.entries(SIGNAL_EMAIL_TEMPLATES)) {
      expect([type, findUnbackedClaim(t.subject, { signalType: type }), findUnbackedClaim(t.body, { signalType: type })])
        .toEqual([type, null, null]);
    }
    for (const t of [FALLBACK_PUSH, FALLBACK_EMAIL, ...Object.values(FALLBACK_TEMPLATE)]) {
      expect(isFactual([t.title, t.subject, t.body])).toBe(true);
    }
  });

  it('the AI is told to use only facts it was given', () => {
    expect(_builtInCopy.SYSTEM_PROMPT).toMatch(/Use only facts given in the input/);
    expect(_builtInCopy.SYSTEM_PROMPT).toMatch(/stock levels or scarcity/);
  });

  it('WhatsApp texts make no invented claims', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/whatsapp.js'), 'utf8');
    const block = src.slice(src.indexOf('const WA_TEMPLATES'), src.indexOf('// --- Phone resolution'));
    expect(block.length).toBeGreaterThan(100);
    expect(findUnbackedClaim(block)).toBeNull();
  });
});

describe('admin preview and auto-filled suggestions are factual', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '../../frontend/app/admin/screens', f), 'utf8');
  const between = (src, start, end) => {
    const i = src.indexOf(start);
    expect(i).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf(end, i));
  };

  it('Settings voice preview: no claims, no invented store or product', () => {
    const src = read('Settings.jsx');
    const block = between(src, 'const previews = [', '];');
    expect(findUnbackedClaim(block)).toBeNull();
    expect(src).not.toMatch(/shreesarees|Banarasi|Silk House|handwoven over weeks/);
    expect(block).toContain('${PRODUCT}');
    expect(src).toContain("const PRODUCT = '[product name]';");
  });

  it.each(['CustomerDetail.jsx', 'Journey.jsx'])('%s signal suggestions and cart/re-engagement templates', (f) => {
    const src = read(f);
    expect(findUnbackedClaim(between(src, 'const SUGGESTIONS = {', '\n};'))).toBeNull();
    expect(src).not.toMatch(/sells? out|selling fast|stock runs out|before it's gone|saved it for you|above ₹999|exciting new products|Urgency nudge/i);
  });
});

describe('automatic AI copy with an invented claim is not sent', () => {
  let savedKey;
  beforeAll(() => { savedKey = process.env.LLM_API_KEY; });
  afterAll(() => {
    if (savedKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = savedKey;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.LLM_API_KEY = 'test-key';
    CopyCache.findOne.mockResolvedValue(null);
    CopyCache.create.mockResolvedValue({});
  });
  afterEach(() => jest.restoreAllMocks());

  const reply = (obj) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ content: [{ text: JSON.stringify(obj) }], usage: { input_tokens: 1 } }),
  });

  it('fresh AI copy claiming "only 3 left" → the factual template is used', async () => {
    global.fetch = jest.fn(() => reply({ subject: 'Hurry', body: 'Only 3 left — grab yours!' }));
    const r = await generateEmailCopy('demo.myshopify.com', { type: 'cart_abandon' }, {}, {});
    expect(r).toEqual(_builtInCopy.SIGNAL_EMAIL_TEMPLATES.cart_abandon);
  });

  it('a cached copy with a claim is not reused', async () => {
    CopyCache.findOne.mockResolvedValue({ subject: 'Hi', body: 'New arrivals are waiting for you.' });
    global.fetch = jest.fn();
    const r = await generateEmailCopy('demo.myshopify.com', { type: 'lapsing' }, {}, {});
    expect(r).toEqual(_builtInCopy.SIGNAL_EMAIL_TEMPLATES.lapsing);
  });

  it('push copy (generateCopy) claiming scarcity → the factual push fallback is used, and it is not cached', async () => {
    global.fetch = jest.fn(() => reply({ title: 'Selling fast', body: 'Only 2 left in your size!' }));
    const r = await generateCopy({ shopDomain: 'demo.myshopify.com', voice: {} }, 'cart_abandon', { productId: '1', title: 'Kurta' }, 'push');
    expect(r).toEqual({ title: _builtInCopy.FALLBACK_PUSH.title, body: _builtInCopy.FALLBACK_PUSH.body, subject: '' });
    expect(CopyCache.create).not.toHaveBeenCalledWith(expect.objectContaining({ body: 'Only 2 left in your size!' }));
  });

  it('factual AI copy is kept', async () => {
    global.fetch = jest.fn(() => reply({ subject: 'Your cart', body: 'Your Kurta is still in your cart. Finish when ready.' }));
    const r = await generateEmailCopy('demo.myshopify.com', { type: 'cart_abandon' }, {}, {});
    expect(r).toEqual({ subject: 'Your cart', body: 'Your Kurta is still in your cart. Finish when ready.' });
  });
});
