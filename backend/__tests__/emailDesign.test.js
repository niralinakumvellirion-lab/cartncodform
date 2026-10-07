/**
 * Tests for backend/utils/emailDesign.js
 *
 * Covers: sanitizeDesignInput validation, designFromTemplate mapping,
 * pickStarterDesign determinism and coverage.
 */

const { sanitizeDesignInput, designFromTemplate, pickStarterDesign } = require('../utils/emailDesign');

// ── sanitizeDesignInput ────────────────────────────────────────────────────────

describe('sanitizeDesignInput', () => {
  // ── happy paths ──────────────────────────────────────────────────────────────

  test('returns ok:true for empty body (all fields optional)', () => {
    const r = sanitizeDesignInput({});
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({});
  });

  test('trims and passes string fields', () => {
    const r = sanitizeDesignInput({ subject: '  Hello  ', eyebrow: ' Sale ', name: 'My Template' });
    expect(r.ok).toBe(true);
    expect(r.value.subject).toBe('Hello');
    expect(r.value.eyebrow).toBe('Sale');
    expect(r.value.name).toBe('My Template');
  });

  test('passes layout when valid', () => {
    const r = sanitizeDesignInput({ layout: 'hero' });
    expect(r.ok).toBe(true);
    expect(r.value.layout).toBe('hero');
  });

  test('clears layout to null when empty string', () => {
    const r = sanitizeDesignInput({ layout: '' });
    expect(r.ok).toBe(true);
    expect(r.value.layout).toBeNull();
  });

  test('normalises hex color to lowercase', () => {
    const r = sanitizeDesignInput({ color: '#FF0000' });
    expect(r.ok).toBe(true);
    expect(r.value.color).toBe('#ff0000');
  });

  test('clears color to null when empty string', () => {
    const r = sanitizeDesignInput({ color: '' });
    expect(r.ok).toBe(true);
    expect(r.value.color).toBeNull();
  });

  test('accepts valid hFont and bFont pair', () => {
    const r = sanitizeDesignInput({ hFont: 'arial', bFont: 'georgia' });
    expect(r.ok).toBe(true);
    expect(r.value.hFont).toBe('arial');
    expect(r.value.bFont).toBe('georgia');
  });

  test('accepts valid radius values', () => {
    expect(sanitizeDesignInput({ radius: 'round' }).ok).toBe(true);
    expect(sanitizeDesignInput({ radius: 'sharp' }).ok).toBe(true);
  });

  test('accepts showLogo: true/false booleans', () => {
    expect(sanitizeDesignInput({ showLogo: true }).value.showLogo).toBe(true);
    expect(sanitizeDesignInput({ showLogo: false }).value.showLogo).toBe(false);
  });

  test('accepts valid https imageUrl', () => {
    const r = sanitizeDesignInput({ imageUrl: 'https://cdn.example.com/img.jpg' });
    expect(r.ok).toBe(true);
    expect(r.value.imageUrl).toBe('https://cdn.example.com/img.jpg');
  });

  test('clears imageUrl to null when empty', () => {
    expect(sanitizeDesignInput({ imageUrl: '' }).value.imageUrl).toBeNull();
    expect(sanitizeDesignInput({ imageUrl: null }).value.imageUrl).toBeNull();
  });

  test('accepts https ctaUrl', () => {
    const r = sanitizeDesignInput({ ctaUrl: 'https://shop.myshopify.com' });
    expect(r.ok).toBe(true);
    expect(r.value.ctaUrl).toBe('https://shop.myshopify.com');
  });

  test('accepts mailto ctaUrl', () => {
    const r = sanitizeDesignInput({ ctaUrl: 'mailto:hi@example.com' });
    expect(r.ok).toBe(true);
    expect(r.value.ctaUrl).toBe('mailto:hi@example.com');
  });

  test('accepts paired imgW + imgH', () => {
    const r = sanitizeDesignInput({ imgW: 1200, imgH: 800 });
    expect(r.ok).toBe(true);
    expect(r.value.imgW).toBe(1200);
    expect(r.value.imgH).toBe(800);
  });

  test('accepts imgW + imgH as numeric strings', () => {
    const r = sanitizeDesignInput({ imgW: '1200', imgH: '800' });
    expect(r.ok).toBe(true);
    expect(r.value.imgW).toBe(1200);
    expect(r.value.imgH).toBe(800);
  });

  test('clears imgW/imgH when both are null', () => {
    const r = sanitizeDesignInput({ imgW: null, imgH: null });
    expect(r.ok).toBe(true);
    expect(r.value.imgW).toBeNull();
    expect(r.value.imgH).toBeNull();
  });

  test('unknown fields are silently dropped', () => {
    const r = sanitizeDesignInput({ shopDomain: 'evil.com', _id: '123', unknownField: 'x' });
    expect(r.ok).toBe(true);
    expect(r.value.shopDomain).toBeUndefined();
    expect(r.value._id).toBeUndefined();
  });

  // ── validation failures ───────────────────────────────────────────────────────

  test('error when subject exceeds 70 chars', () => {
    const r = sanitizeDesignInput({ subject: 'A'.repeat(71) });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('subject');
  });

  test('error when name exceeds 60 chars', () => {
    const r = sanitizeDesignInput({ name: 'X'.repeat(61) });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('name');
  });

  test('error when body exceeds 600 chars', () => {
    const r = sanitizeDesignInput({ body: 'B'.repeat(601) });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('body');
  });

  test('error when offerText exceeds 24 chars', () => {
    const r = sanitizeDesignInput({ offerText: '1234567890123456789012345' }); // 25 chars
    expect(r.ok).toBe(false);
    expect(r.field).toBe('offerText');
  });

  test('error for invalid color', () => {
    const r = sanitizeDesignInput({ color: 'not-a-color' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('color');
  });

  test('error for 3-digit hex (not 6-digit)', () => {
    const r = sanitizeDesignInput({ color: '#fff' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('color');
  });

  test('error for invalid layout', () => {
    const r = sanitizeDesignInput({ layout: 'nonexistent' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('layout');
  });

  test('error for unknown font in hFont', () => {
    const r = sanitizeDesignInput({ hFont: 'comic-sans' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('hFont');
  });

  test('error when heading-only font used as bFont', () => {
    // 'bebas' is heading-only (head:true in FONTS)
    const r = sanitizeDesignInput({ bFont: 'bebas' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('bFont');
    expect(r.error).toMatch(/heading-only/);
  });

  test('error for invalid radius value', () => {
    const r = sanitizeDesignInput({ radius: 'curved' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('radius');
  });

  test('error when showLogo is not a boolean', () => {
    const r = sanitizeDesignInput({ showLogo: 'yes' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('showLogo');
  });

  test('error when imageUrl is http (not https)', () => {
    const r = sanitizeDesignInput({ imageUrl: 'http://example.com/img.jpg' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('imageUrl');
  });

  test('error when imageUrl exceeds 2000 chars', () => {
    const r = sanitizeDesignInput({ imageUrl: 'https://example.com/' + 'a'.repeat(1990) });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('imageUrl');
  });

  test('error when ctaUrl is plain http', () => {
    const r = sanitizeDesignInput({ ctaUrl: 'http://shop.com' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('ctaUrl');
  });

  test('error when only imgW is provided (imgH missing)', () => {
    const r = sanitizeDesignInput({ imgW: 1200 });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('imgH');
  });

  test('error when only imgH is provided (imgW missing)', () => {
    const r = sanitizeDesignInput({ imgH: 800 });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('imgW');
  });

  test('error when imgW is out of range', () => {
    const r = sanitizeDesignInput({ imgW: 0, imgH: 800 });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('imgW');
  });

  test('error when imgH exceeds 12000', () => {
    const r = sanitizeDesignInput({ imgW: 1200, imgH: 12001 });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('imgH');
  });
});

// ── designFromTemplate ────────────────────────────────────────────────────────

describe('designFromTemplate', () => {
  const baseTemplate = {
    shopDomain: 'test.myshopify.com',
    type: 'normal',
    subject: 'Hello from the store',
    body: 'Some body text.',
    offerText: null,
    imageUrl: null,
    ctaLabel: 'Shop now',
    ctaUrl: 'https://test.myshopify.com',
    layout: null,
    color: null,
    hFont: null,
    bFont: null,
    radius: null,
    pageBg: null,
    cardBg: null,
    eyebrow: '',
    headline: '',
    note: '',
    imgW: null,
    imgH: null,
    showLogo: false,
  };

  const baseStore = {
    shopName: 'Test Store',
    logoUrl: null,
    primaryColor: null,
    shopDomain: 'test.myshopify.com',
  };

  test('uses DEFAULT_LAYOUT_BY_TYPE when template.layout is null', () => {
    const d = designFromTemplate({ ...baseTemplate, type: 'special_offer', layout: null }, baseStore, {});
    expect(d.layout).toBe('poster');
  });

  test('uses template.layout when set', () => {
    const d = designFromTemplate({ ...baseTemplate, layout: 'hero' }, baseStore, {});
    expect(d.layout).toBe('hero');
  });

  test('falls back to store primaryColor when template.color is null', () => {
    const store = { ...baseStore, primaryColor: '#aabbcc' };
    const d = designFromTemplate({ ...baseTemplate, color: null }, store, {});
    expect(d.color).toBe('#aabbcc');
  });

  test('uses template.color when valid, ignoring store color', () => {
    const store = { ...baseStore, primaryColor: '#aabbcc' };
    const d = designFromTemplate({ ...baseTemplate, color: '#ff0000' }, store, {});
    expect(d.color).toBe('#ff0000');
  });

  test('falls back to #4f46e5 when both template and store have no color', () => {
    const d = designFromTemplate({ ...baseTemplate, color: null }, { ...baseStore, primaryColor: null }, {});
    expect(d.color).toBe('#4f46e5');
  });

  test('headline falls back to subject when headline is empty', () => {
    const d = designFromTemplate({ ...baseTemplate, headline: '', subject: 'Big Sale' }, baseStore, {});
    expect(d.headline).toBe('Big Sale');
  });

  test('uses template.headline when set', () => {
    const d = designFromTemplate({ ...baseTemplate, headline: 'Own Headline', subject: 'Subject' }, baseStore, {});
    expect(d.headline).toBe('Own Headline');
  });

  test('offer = template.offerText', () => {
    const d = designFromTemplate({ ...baseTemplate, offerText: '20% off' }, baseStore, {});
    expect(d.offer).toBe('20% off');
  });

  test('offer = null when offerText is null', () => {
    const d = designFromTemplate({ ...baseTemplate, offerText: null }, baseStore, {});
    expect(d.offer).toBeNull();
  });

  test('placeholder:true is passed through', () => {
    const d = designFromTemplate(baseTemplate, baseStore, { placeholder: true });
    expect(d.placeholder).toBe(true);
  });

  test('placeholder defaults to false', () => {
    const d = designFromTemplate(baseTemplate, baseStore, {});
    expect(d.placeholder).toBe(false);
  });

  test('store name taken from store.shopName', () => {
    const d = designFromTemplate(baseTemplate, { ...baseStore, shopName: 'My Shop' }, {});
    expect(d.store).toBe('My Shop');
  });

  test('store name falls back to shopDomain prefix when shopName missing', () => {
    const d = designFromTemplate(baseTemplate, { shopDomain: 'mybrand.myshopify.com' }, {});
    expect(d.store).toBe('mybrand');
  });

  test('cta maps from template.ctaLabel', () => {
    const d = designFromTemplate({ ...baseTemplate, ctaLabel: 'Buy now' }, baseStore, {});
    expect(d.cta).toBe('Buy now');
  });
});

// ── pickStarterDesign ─────────────────────────────────────────────────────────

describe('pickStarterDesign', () => {
  const SHOP_A = 'alpha.myshopify.com';
  const SHOP_B = 'zeta.myshopify.com';

  test('returns an object with required design fields', () => {
    const d = pickStarterDesign('special_offer', SHOP_A, null);
    expect(typeof d.layout).toBe('string');
    expect(typeof d.hFont).toBe('string');
    expect(typeof d.bFont).toBe('string');
    expect(d.radius).toBe('round');
    expect(d.ctaLabel).toBe('Shop now');
    expect(d.ctaUrl).toBe('https://' + SHOP_A);
  });

  test('is deterministic: same shop + type → same variant', () => {
    const d1 = pickStarterDesign('festival', SHOP_A, null);
    const d2 = pickStarterDesign('festival', SHOP_A, null);
    expect(d1.layout).toBe(d2.layout);
    expect(d1.hFont).toBe(d2.hFont);
  });

  test('may differ across different shops', () => {
    // With 3 variants it is not guaranteed to differ, but stableHash of
    // two distinct strings is almost always different. We check both are valid.
    const dA = pickStarterDesign('normal', SHOP_A, null);
    const dB = pickStarterDesign('normal', SHOP_B, null);
    const VALID_NORMAL_LAYOUTS = ['letter', 'magazine', 'cards'];
    expect(VALID_NORMAL_LAYOUTS).toContain(dA.layout);
    expect(VALID_NORMAL_LAYOUTS).toContain(dB.layout);
  });

  test('festival type uses festivalName as eyebrow', () => {
    const d = pickStarterDesign('festival', SHOP_A, 'Diwali');
    expect(d.eyebrow).toBe('Diwali');
  });

  test('special_offer type uses "Special offer" eyebrow', () => {
    const d = pickStarterDesign('special_offer', SHOP_A, null);
    expect(d.eyebrow).toBe('Special offer');
  });

  test('normal type has empty eyebrow', () => {
    const d = pickStarterDesign('normal', SHOP_A, null);
    expect(d.eyebrow).toBe('');
  });

  test('unknown type falls back to normal variants', () => {
    const d = pickStarterDesign('unknown_type', SHOP_A, null);
    const VALID_NORMAL_LAYOUTS = ['letter', 'magazine', 'cards'];
    expect(VALID_NORMAL_LAYOUTS).toContain(d.layout);
  });

  test('each type covers all 3 variants across a spread of shops', () => {
    // Generate picks for 30 distinct shop domains and verify all 3 variants appear.
    for (const type of ['special_offer', 'festival', 'normal']) {
      const layouts = new Set();
      for (let i = 0; i < 30; i++) {
        const d = pickStarterDesign(type, `shop${i}.myshopify.com`, null);
        layouts.add(d.layout);
      }
      expect(layouts.size).toBe(3);
    }
  });
});
