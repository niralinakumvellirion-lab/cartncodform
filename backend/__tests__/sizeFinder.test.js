'use strict';

/**
 * Phase 3 — "Find my size": size maths, validation, admin routes, storefront (App Proxy) routes.
 */

jest.mock('../models/SizeFinderConfig', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => next(),
  requireStoreOwner: (req, _res, next) => { req.store = { shopDomain: 'demo.myshopify.com' }; next(); },
}));
jest.mock('../utils/shopify', () => ({ verifyProxySignature: jest.fn(() => true) }));
jest.mock('../services/profileService', () => ({ upsertProfile: jest.fn().mockResolvedValue({ _id: 'p1' }) }));

const S = require('../utils/sizeFinder');
const SizeFinderConfig = require('../models/SizeFinderConfig');
const { verifyProxySignature } = require('../utils/shopify');
const { upsertProfile } = require('../services/profileService');
const adminRouter = require('../routes/sizeFinder');
const proxyRouter = require('../routes/sizeFinderProxy');

function handler(router, path, method) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  return layer.route.stack.map((s) => s.handle);
}
async function run(router, path, method, req) {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  const chain = handler(router, path, method);
  let i = 0;
  const next = async () => { const h = chain[i++]; if (h) await h(req, res, next); };
  await next();
  return res;
}
const lean = (v) => ({ lean: () => Promise.resolve(v) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  verifyProxySignature.mockReturnValue(true);
  proxyRouter._limiter.reset();
});
afterEach(() => jest.restoreAllMocks());

// ── Size maths ───────────────────────────────────────────────────────────────

describe('size maths', () => {
  const size = (g, h, w, shape = 'average', fit = 'regular') => {
    const a = S.sanitizeAnswers({ gender: g, heightCm: h, weightKg: w, shape, fit });
    return S.recommendSize(S.DEFAULT_CHARTS[g], S.estimateBody(a), fit);
  };

  test('typical shoppers land on sensible sizes', () => {
    expect(size('women', 162, 58).size).toBe('M');
    expect(size('women', 155, 48).size).toBe('S');
    expect(size('men', 175, 72).size).toBe('M');
    expect(size('men', 168, 60).size).toBe('S');
  });

  test('relaxed fit and broad shape never pick a smaller size', () => {
    const order = S.DEFAULT_CHARTS.women.map((r) => r.size);
    const base = order.indexOf(size('women', 162, 58).size);
    expect(order.indexOf(size('women', 162, 58, 'average', 'relaxed').size)).toBeGreaterThanOrEqual(base);
    expect(order.indexOf(size('women', 162, 58, 'broad').size)).toBeGreaterThanOrEqual(base);
    expect(order.indexOf(size('women', 162, 58, 'slim', 'snug').size)).toBeLessThanOrEqual(base);
  });

  test('bigger than the chart → largest size, flagged', () => {
    const r = size('women', 170, 120);
    expect(r.size).toBe('XXL');
    expect(r.outOfRange).toBe(true);
  });

  test('reasons: chest + waist status, length as info', () => {
    const r = size('men', 175, 72);
    expect(r.reasons.map((x) => x.area)).toEqual(['chest', 'waist', 'length']);
    expect(r.reasons[2]).toEqual({ area: 'length', status: 'info', value: 73 });
    expect(['right', 'snug', 'roomy']).toContain(r.reasons[0].status);
  });

  test('answers out of range are rejected', () => {
    expect(S.sanitizeAnswers({ gender: 'women', heightCm: 90, weightKg: 50 })).toBeNull();
    expect(S.sanitizeAnswers({ gender: 'women', heightCm: 160, weightKg: 300 })).toBeNull();
    expect(S.sanitizeAnswers({ gender: 'kids', heightCm: 160, weightKg: 50 })).toBeNull();
    expect(S.sanitizeAnswers({ gender: 'men', heightCm: 170, weightKg: 70, shape: 'x', fit: 'y' }))
      .toEqual({ gender: 'men', heightCm: 170, weightKg: 70, shape: 'average', fit: 'regular' });
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe('sanitizeSettings / sanitizeChart', () => {
  const ok = { enabled: true, charts: { women: S.DEFAULT_CHARTS.women, men: [] } };

  test('valid settings, defaults filled', () => {
    const s = S.sanitizeSettings(ok);
    expect(s.enabled).toBe(true);
    expect(s.buttonText).toBe('Find my ideal size');
    expect(s.unit).toBe('cm');
    expect(s.charts.women).toHaveLength(6);
    expect(s.charts.men).toEqual([]);
  });

  test('card heading and small text: trimmed, capped, default when empty, sent to the storefront', () => {
    const d = S.sanitizeSettings(ok);
    expect(d.cardTitle).toBe('Not sure about your size?');
    expect(d.cardText).toBe('3 quick questions · takes 20 seconds');
    const s = S.sanitizeSettings({ ...ok, cardTitle: '  Find your perfect fit  ', cardText: 'x'.repeat(200) });
    expect(s.cardTitle).toBe('Find your perfect fit');
    expect(s.cardText).toHaveLength(80);
    const pub = S.publicSettings({ ...ok, cardTitle: 'Your fit', cardText: 'Quick help' });
    expect(pub.cardTitle).toBe('Your fit');
    expect(pub.cardText).toBe('Quick help');
    expect(S.publicSettings({}).cardTitle).toBe('Not sure about your size?');
  });

  test('size advisor words and on/off parts: defaults, trimmed, capped, booleans only', () => {
    const d = S.sanitizeSettings(ok);
    expect(d.texts.womenLabel).toBe('Woman');
    expect(d.texts.addToBagText).toBe('Add to cart');
    expect(d.texts.step3Title).toBe('Choose your build');
    expect(d.texts.creatingTitle).toBe('Creating your avatar');
    expect(d.texts.privacyText).toBe('Your data stays private and secure');
    expect(d.options).toEqual({ liveEstimate: true, rememberSize: true, addToBag: true, sizeChart: true });
    const s = S.sanitizeSettings({ ...ok,
      texts: { womenLabel: '  Ladies  ', menLabel: '', step1Text: 'x'.repeat(300), hacker: 'nope' },
      options: { liveEstimate: false, addToBag: 'no', extra: true } });
    expect(s.texts.womenLabel).toBe('Ladies');
    expect(s.texts.menLabel).toBe('Man');
    expect(s.texts.step1Text).toHaveLength(90);
    expect(s.texts.hacker).toBeUndefined();
    expect(s.options).toEqual({ liveEstimate: false, rememberSize: true, addToBag: true, sizeChart: true });
    expect(S.publicSettings({ ...ok, texts: { menLabel: 'Gents' } }).texts.menLabel).toBe('Gents');
  });

  test('old default words are upgraded to the new ones; the store’s own words are kept', () => {
    const d = S.withDefaults({ buttonText: 'Find my size', texts: { advisorTitle: 'Size advisor', step1Title: 'Let’s find your fit', resultTitle: 'Your size', menLabel: 'Gents' } });
    expect(d.buttonText).toBe('Find my ideal size');
    expect(d.texts.advisorTitle).toBe('Find my size');
    expect(d.texts.step1Title).toBe('Choose your avatar base');
    expect(d.texts.resultTitle).toBe('Recommended size');
    expect(d.texts.menLabel).toBe('Gents');
    expect(S.withDefaults({ buttonText: 'Check my size' }).buttonText).toBe('Check my size');
  });

  test('builds: athletic is accepted; it gives a broader chest and a narrower waist than balanced', () => {
    const a = S.sanitizeAnswers({ gender: 'men', heightCm: 178, weightKg: 79, shape: 'athletic' });
    expect(a.shape).toBe('athletic');
    const ath = S.estimateBody(a);
    const avg = S.estimateBody({ ...a, shape: 'average' });
    expect(ath.chest).toBeGreaterThan(avg.chest);
    expect(ath.waist).toBeLessThan(avg.waist);
    expect(S.sanitizeAnswers({ gender: 'men', heightCm: 178, weightKg: 79, shape: 'giant' }).shape).toBe('average');
  });

  test('button style and corner radius: allowed values only, 0–24, defaults outline + round', () => {
    const d = S.sanitizeSettings(ok);
    expect(d.buttonStyle).toBe('outline');
    expect(d.buttonRadius).toBe(24);
    expect(S.sanitizeSettings({ ...ok, buttonStyle: 'outline', buttonRadius: 8 })).toMatchObject({ buttonStyle: 'outline', buttonRadius: 8 });
    expect(S.sanitizeSettings({ ...ok, buttonStyle: 'neon', buttonRadius: 99 })).toMatchObject({ buttonStyle: 'outline', buttonRadius: 24 });
    expect(S.sanitizeSettings({ ...ok, buttonRadius: -5 }).buttonRadius).toBe(0);
    expect(S.sanitizeSettings({ ...ok, buttonRadius: 'abc' }).buttonRadius).toBe(24);
    expect(S.publicSettings({ buttonStyle: 'soft', buttonRadius: 0 })).toMatchObject({ buttonStyle: 'soft', buttonRadius: 0 });
  });

  test('chest must go up row by row', () => {
    expect(() => S.sanitizeChart([{ size: 'S', chest: 90, waist: 70 }, { size: 'M', chest: 90, waist: 74 }], 'women'))
      .toThrow(/chest must be bigger/);
  });

  test('duplicate sizes, missing names and wild numbers are rejected', () => {
    expect(() => S.sanitizeChart([{ size: 'M', chest: 90, waist: 70 }, { size: 'm', chest: 95, waist: 74 }], 'women')).toThrow(/twice/);
    expect(() => S.sanitizeChart([{ size: '', chest: 90, waist: 70 }], 'women')).toThrow(/size name/);
    expect(() => S.sanitizeChart([{ size: 'M', chest: 900, waist: 70 }], 'women')).toThrow(/chest/);
    expect(() => S.sanitizeChart(new Array(13).fill({ size: 'M', chest: 90, waist: 70 }), 'women')).toThrow(/at most 12/);
  });

  test('both charts empty → error; bad colour → default', () => {
    expect(() => S.sanitizeSettings({ charts: { women: [], men: [] } })).toThrow(/at least one size chart/);
    expect(S.sanitizeSettings({ ...ok, accentColor: 'red' }).accentColor).toBe('#111827');
  });

  test('never-saved shop gets the starter charts; public settings list genders with a chart', () => {
    const d = S.withDefaults(null);
    expect(d.enabled).toBe(false);
    expect(d.charts.men).toHaveLength(5);
    expect(S.publicSettings({ charts: { women: S.DEFAULT_CHARTS.women, men: [] } }).genders).toEqual(['women']);
  });
});

// ── Admin routes ─────────────────────────────────────────────────────────────

describe('admin routes', () => {
  test('GET returns defaults for a new shop', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean(null));
    const res = await run(adminRouter, '/:shopDomain/config', 'get', { params: { shopDomain: 'demo.myshopify.com' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.settings.charts.women).toHaveLength(6);
    expect(SizeFinderConfig.findOne).toHaveBeenCalledWith({ shopDomain: 'demo.myshopify.com' });
  });

  test('PUT saves clean settings for the verified shop', async () => {
    SizeFinderConfig.findOneAndUpdate.mockReturnValue(lean({ enabled: true, charts: { women: S.DEFAULT_CHARTS.women, men: [] } }));
    const res = await run(adminRouter, '/:shopDomain/config', 'put', {
      params: { shopDomain: 'other.myshopify.com' },
      body: { settings: { enabled: true, productTag: ' size-finder ', charts: { women: S.DEFAULT_CHARTS.women, men: [] } } },
    });
    expect(res.statusCode).toBe(200);
    const [filter, update] = SizeFinderConfig.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ shopDomain: 'demo.myshopify.com' });
    expect(update.$set.productTag).toBe('size-finder');
    expect(update.$set.enabled).toBe(true);
  });

  test('PUT with a bad chart → 400 with the reason', async () => {
    const res = await run(adminRouter, '/:shopDomain/config', 'put', {
      params: {}, body: { settings: { charts: { women: [{ size: 'M', chest: 'x', waist: 70 }] } } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/chest/);
    expect(SizeFinderConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

// ── Storefront routes ────────────────────────────────────────────────────────

describe('storefront routes', () => {
  const ON = { enabled: true, charts: { women: S.DEFAULT_CHARTS.women, men: S.DEFAULT_CHARTS.men } };
  const req = (body, extraQuery = {}) => ({
    query: { shop: 'demo.myshopify.com', signature: 'x', ...extraQuery }, body, ip: '1.2.3.4',
  });

  test('bad signature → 403', async () => {
    verifyProxySignature.mockReturnValue(false);
    const res = await run(proxyRouter, '/config', 'get', req());
    expect(res.statusCode).toBe(403);
  });

  test('config is public settings', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean(ON));
    const res = await run(proxyRouter, '/config', 'get', req());
    expect(res.body.settings.enabled).toBe(true);
    expect(res.body.settings.genders).toEqual(['women', 'men']);
  });

  test('recommend returns a size and does not save without "remember"', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean(ON));
    const res = await run(proxyRouter, '/recommend', 'post', req({ gender: 'women', heightCm: 162, weightKg: 58 }));
    expect(res.statusCode).toBe(200);
    expect(res.body.size).toBe('M');
    expect(res.body.saved).toBe(false);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  test('remember → only size, gender and fit go on the profile (never height or weight)', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean(ON));
    const res = await run(proxyRouter, '/recommend', 'post', req(
      { gender: 'men', heightCm: 175, weightKg: 72, fit: 'relaxed', remember: true, sessionId: 'abc12345-session' },
      { logged_in_customer_id: '777' },
    ));
    expect(res.body.saved).toBe(true);
    const [shop, ids, updates] = upsertProfile.mock.calls[0];
    expect(shop).toBe('demo.myshopify.com');
    expect(ids).toEqual({ customerId: '777', sessionId: 'abc12345-session' });
    expect(Object.keys(updates).sort()).toEqual(['sizeProfile.fit', 'sizeProfile.gender', 'sizeProfile.kind', 'sizeProfile.size', 'sizeProfile.updatedAt']);
    // Height (175) and weight (72) must not be stored. Leave the timestamp out of the check: its
    // milliseconds can contain "175" or "72" by chance.
    const { 'sizeProfile.updatedAt': when, ...stored } = updates;
    expect(when).toBeInstanceOf(Date);
    expect(stored).toEqual({ 'sizeProfile.size': res.body.size, 'sizeProfile.gender': 'men', 'sizeProfile.fit': 'relaxed', 'sizeProfile.kind': 'clothing' });
  });

  test('remember without any id → nothing saved', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean(ON));
    const res = await run(proxyRouter, '/recommend', 'post', req({ gender: 'women', heightCm: 162, weightKg: 58, remember: true, sessionId: 'bad id!' }));
    expect(res.body.saved).toBe(false);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  test('turned off → 404; bad answers → 400; no chart for that choice → 400', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean({ ...ON, enabled: false }));
    expect((await run(proxyRouter, '/recommend', 'post', req({ gender: 'women', heightCm: 162, weightKg: 58 }))).statusCode).toBe(404);
    SizeFinderConfig.findOne.mockReturnValue(lean(ON));
    expect((await run(proxyRouter, '/recommend', 'post', req({ gender: 'women', heightCm: 50, weightKg: 58 }))).statusCode).toBe(400);
    SizeFinderConfig.findOne.mockReturnValue(lean({ enabled: true, charts: { women: S.DEFAULT_CHARTS.women, men: [] } }));
    expect((await run(proxyRouter, '/recommend', 'post', req({ gender: 'men', heightCm: 175, weightKg: 72 }))).statusCode).toBe(400);
  });

  test('more than 30 tries a minute → 429', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean(ON));
    let last;
    for (let i = 0; i < 31; i++) last = await run(proxyRouter, '/recommend', 'post', req({ gender: 'women', heightCm: 162, weightKg: 58 }));
    expect(last.statusCode).toBe(429);
  });

  test('height and weight never reach the logs', async () => {
    SizeFinderConfig.findOne.mockReturnValue({ lean: () => Promise.reject(new Error('db down')) });
    await run(proxyRouter, '/recommend', 'post', req({ gender: 'women', heightCm: 163, weightKg: 57 }));
    const logged = JSON.stringify(console.error.mock.calls) + JSON.stringify(console.warn.mock.calls);
    expect(logged).not.toMatch(/163|57/);
  });
});

describe('admin preview', () => {
  test('uses the unsaved chart sent by the admin', async () => {
    const res = await run(adminRouter, '/:shopDomain/preview', 'post', {
      params: {},
      body: {
        answers: { gender: 'women', heightCm: 162, weightKg: 58 },
        chart: [{ size: 'Small', chest: 95, waist: 80, length: 100 }, { size: 'Big', chest: 110, waist: 95, length: 104 }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.size).toBe('Small');
    expect(SizeFinderConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('bad chart or answers → 400 with the reason', async () => {
    const bad = await run(adminRouter, '/:shopDomain/preview', 'post', {
      params: {}, body: { answers: { gender: 'women', heightCm: 162, weightKg: 58 }, chart: [{ size: 'M', chest: 'x', waist: 70 }] },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error).toMatch(/chest/);
    const empty = await run(adminRouter, '/:shopDomain/preview', 'post', {
      params: {}, body: { answers: { gender: 'men', heightCm: 175, weightKg: 72 }, chart: [] },
    });
    expect(empty.statusCode).toBe(400);
    const out = await run(adminRouter, '/:shopDomain/preview', 'post', {
      params: {}, body: { answers: { gender: 'men', heightCm: 90, weightKg: 72 }, chart: [] },
    });
    expect(out.statusCode).toBe(400);
  });
});

// ── Phase 8: store types (shoes · rings · bangles · none) ─────────────────────

describe('store types', () => {
  const req = (body, extraQuery = {}) => ({
    query: { shop: 'demo.myshopify.com', signature: 'x', ...extraQuery }, body, ip: '9.9.9.9',
  });
  beforeEach(() => proxyRouter._limiter.reset());

  test('never saved → no type yet (off); saved before store types → clothing', () => {
    expect(S.withDefaults(null)).toMatchObject({ storeType: '', enabled: false });
    expect(S.withDefaults({ enabled: true, charts: {} })).toMatchObject({ storeType: 'clothing', enabled: true });
    expect(S.withDefaults({ enabled: true, storeType: 'none' }).enabled).toBe(false);
    expect(S.withDefaults(null).measureCharts.shoes).toHaveLength(10);
    expect(S.withDefaults(null).measureCharts.bangles.map((r) => r.size)).toEqual(['2.2', '2.4', '2.6', '2.8', '2.10', '2.12']);
  });

  test('every kind has search words; jewellery finds rings and bangles; electronics → not needed', () => {
    const find = (q) => S.STORE_TYPE_CATALOG.filter((t) => t.words.some((w) => w.includes(q))).map((t) => t.id);
    expect(find('sneakers')).toEqual(['shoes']);
    expect(find('saree')).toEqual(['clothing']);
    expect(find('jewellery')).toEqual(['rings', 'bangles']);
    expect(find('mobile')).toEqual(['none']);
    S.STORE_TYPES.forEach((t) => expect(S.STORE_TYPE_CATALOG.find((c) => c.id === t)).toBeTruthy());
  });

  test('sanitizeSettings: type must be known; measure chart validated; none is always off', () => {
    expect(() => S.sanitizeSettings({ storeType: 'cars' })).toThrow(/what your store sells/);
    const shoes = S.sanitizeSettings({ storeType: 'shoes', enabled: true, charts: { women: [], men: [] }, measureCharts: { shoes: [{ size: ' 7 ', value: '25.4' }] } });
    expect(shoes.storeType).toBe('shoes');
    expect(shoes.measureCharts.shoes).toEqual([{ size: '7', value: 25.4 }]);
    expect(shoes.measureCharts.rings).toHaveLength(19); // untouched types keep the starter chart
    expect(() => S.sanitizeSettings({ storeType: 'shoes', measureCharts: { shoes: [] } })).toThrow(/at least one size/);
    expect(() => S.sanitizeSettings({ storeType: 'shoes', measureCharts: { shoes: [{ size: '6', value: 26 }, { size: '7', value: 25 }] } })).toThrow(/bigger than the size above/);
    expect(() => S.sanitizeSettings({ storeType: 'rings', measureCharts: { rings: [{ size: '6', value: 200 }] } })).toThrow(/40–76 mm/);
    expect(() => S.sanitizeSettings({ storeType: 'rings', measureCharts: { rings: [{ size: '6', value: 46 }, { size: '6', value: 47 }] } })).toThrow(/twice/);
    expect(S.sanitizeSettings({ storeType: 'none', enabled: true }).enabled).toBe(false);
  });

  test('recommendByMeasure: smallest size that covers it; right / roomy; bigger than the chart → largest, flagged', () => {
    const shoes = S.DEFAULT_MEASURE_CHARTS.shoes;
    expect(S.recommendByMeasure(shoes, 25.0, 'shoes')).toMatchObject({ size: '7', outOfRange: false, reasons: [{ area: 'fit', status: 'right', value: 25.4 }] });
    expect(S.recommendByMeasure(shoes, 24.7, 'shoes').reasons[0].status).toBe('roomy');
    expect(S.recommendByMeasure(shoes, 31, 'shoes')).toMatchObject({ size: '12', outOfRange: true });
    expect(S.recommendByMeasure(S.DEFAULT_MEASURE_CHARTS.rings, 52, 'rings').size).toBe('12');
    expect(S.recommendByMeasure(S.DEFAULT_MEASURE_CHARTS.bangles, 58, 'bangles').size).toBe('2.6');
    expect(S.sanitizeMeasure({ value: 10 }, 'shoes')).toBeNull();
    expect(S.sanitizeMeasure({ value: '26.04' }, 'shoes')).toBe(26);
    expect(S.sanitizeMeasure({ value: 26 }, 'clothing')).toBeNull();
  });

  test('public settings: measure words + chart for that type; no genders; type caption when unchanged', () => {
    const pub = S.publicSettings({ enabled: true, storeType: 'rings' });
    expect(pub.storeType).toBe('rings');
    expect(pub.genders).toEqual([]);
    expect(pub.measure).toMatchObject({ type: 'rings', unit: 'mm', min: 40, max: 76, title: 'Measure your finger' });
    expect(pub.measure.chart).toHaveLength(19);
    expect(pub.measure.tolerance).toBeUndefined();
    expect(pub.cardText).toBe('Measure your finger · takes 30 seconds');
    expect(S.publicSettings({ enabled: true, storeType: 'rings', cardText: 'Quick ring sizer' }).cardText).toBe('Quick ring sizer');
    expect(S.publicSettings({ enabled: true }).measure).toBeNull();
  });

  test('admin GET sends the search words and measure types; PUT saves the type and chart', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean(null));
    const got = await run(adminRouter, '/:shopDomain/config', 'get', { params: {} });
    expect(got.body.settings.storeType).toBe('');
    expect(got.body.storeTypes.map((t) => t.id)).toEqual(['clothing', 'shoes', 'rings', 'bangles', 'none']);
    expect(got.body.measureTypes.shoes).toMatchObject({ unit: 'cm', value: 'Foot length' });
    SizeFinderConfig.findOneAndUpdate.mockReturnValue(lean({ enabled: true, storeType: 'bangles' }));
    const put = await run(adminRouter, '/:shopDomain/config', 'put', {
      params: {}, body: { settings: { enabled: true, storeType: 'bangles', measureCharts: { bangles: [{ size: '2.4', value: 57 }] } } },
    });
    expect(put.statusCode).toBe(200);
    const [, update] = SizeFinderConfig.findOneAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({ storeType: 'bangles', enabled: true });
    expect(update.$set.measureCharts.bangles).toEqual([{ size: '2.4', value: 57 }]);
    expect(put.body.settings.storeType).toBe('bangles');
  });

  test('admin preview for a measure type uses the unsaved chart', async () => {
    const ok = await run(adminRouter, '/:shopDomain/preview', 'post', {
      params: {}, body: { storeType: 'shoes', value: 26, chart: [{ size: 'UK 7', value: 25.4 }, { size: 'UK 8', value: 26.2 }] },
    });
    expect(ok.body).toMatchObject({ size: 'UK 8', outOfRange: false });
    const bad = await run(adminRouter, '/:shopDomain/preview', 'post', { params: {}, body: { storeType: 'shoes', value: 99, chart: [] } });
    expect(bad.statusCode).toBe(400);
  });

  test('storefront: shoes measurement → size; remember saves size + kind only; out of range → 400', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean({ enabled: true, storeType: 'shoes' }));
    const res = await run(proxyRouter, '/recommend', 'post', req({ value: 26.0, remember: true, sessionId: 'abc12345-session' }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, size: '8', saved: true });
    const [, , updates] = upsertProfile.mock.calls[0];
    const { 'sizeProfile.updatedAt': when, ...stored } = updates;
    expect(when).toBeInstanceOf(Date);
    expect(stored).toEqual({ 'sizeProfile.size': '8', 'sizeProfile.gender': null, 'sizeProfile.fit': null, 'sizeProfile.kind': 'shoes' });
    expect((await run(proxyRouter, '/recommend', 'post', req({ value: 50 }))).statusCode).toBe(400);
  });

  test('storefront: none → off', async () => {
    SizeFinderConfig.findOne.mockReturnValue(lean({ enabled: true, storeType: 'none' }));
    expect((await run(proxyRouter, '/recommend', 'post', req({ value: 26 }))).statusCode).toBe(404);
    expect((await run(proxyRouter, '/config', 'get', req())).body.settings.enabled).toBe(false);
  });
});
