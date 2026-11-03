'use strict';

const {
  hashEmail,
  validateSubmission,
  checkPhotoDataUrl,
  ownPhotoUrls,
  purchaseFromOrder,
  summarizeRatings,
} = require('../utils/reviewsCore');
const { toPublicSettings } = require('../utils/reviewSettings');

const settings = (over = {}, photos = {}) => ({
  ...toPublicSettings(null),
  ...over,
  photos: { ...toPublicSettings(null).photos, ...photos },
});

const goodInput = (over = {}) => ({
  productId: '1234567890',
  name: 'Asha',
  rating: 5,
  title: 'Lovely',
  body: 'Really nice quality, would buy again.',
  email: 'Asha@Example.com',
  ...over,
});

const code = (fn) => { try { fn(); } catch (e) { return e.isValidation ? e.code : `OTHER:${e.message}`; } return null; };

// A tiny "file": right signature bytes, then padding.
const png = (extra = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8 + extra)]);
const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;

describe('hashEmail', () => {
  it('ignores case and spaces, never returns the address', () => {
    expect(hashEmail(' Asha@Example.com ')).toBe(hashEmail('asha@example.com'));
    expect(hashEmail('asha@example.com')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashEmail('asha@example.com')).not.toContain('asha');
  });
  it('is null for empty input', () => {
    expect(hashEmail('')).toBeNull();
    expect(hashEmail(null)).toBeNull();
  });
});

describe('validateSubmission', () => {
  it('accepts a good review and cleans it', () => {
    const out = validateSubmission(settings(), goodInput({ body: '  Great stuff here!\u0007  ' }), []);
    expect(out).toMatchObject({ productId: '1234567890', name: 'Asha', rating: 5, email: 'asha@example.com', body: 'Great stuff here!' });
  });

  it('needs a numeric product id, a name and a body of 10+ characters', () => {
    expect(code(() => validateSubmission(settings(), goodInput({ productId: 'abc' }), []))).toBe('BAD_PRODUCT');
    expect(code(() => validateSubmission(settings(), goodInput({ productId: '1; drop' }), []))).toBe('BAD_PRODUCT');
    expect(code(() => validateSubmission(settings(), goodInput({ name: '  ' }), []))).toBe('NAME_REQUIRED');
    expect(code(() => validateSubmission(settings(), goodInput({ body: 'short' }), []))).toBe('BODY_TOO_SHORT');
  });

  it('keeps text inside the length limits', () => {
    const out = validateSubmission(settings(), goodInput({ name: 'n'.repeat(500), title: 't'.repeat(500), body: 'b'.repeat(9000) }), []);
    expect(out.name).toHaveLength(60);
    expect(out.title).toHaveLength(120);
    expect(out.body).toHaveLength(2000);
  });

  it('rating: required when the shop says so, 1-5 whole numbers only', () => {
    expect(code(() => validateSubmission(settings(), goodInput({ rating: undefined }), []))).toBe('RATING_REQUIRED');
    for (const bad of [0, 6, 2.5, 'x']) {
      expect(code(() => validateSubmission(settings(), goodInput({ rating: bad }), []))).toBe('BAD_RATING');
    }
    expect(validateSubmission(settings({ starRequired: false }), goodInput({ rating: undefined }), []).rating).toBeNull();
  });

  it('rating is ignored entirely when star rating is switched off', () => {
    expect(validateSubmission(settings({ starRating: false, starRequired: false }), goodInput({ rating: 3 }), []).rating).toBeNull();
  });

  it('email is optional here but must look like an email when given', () => {
    expect(validateSubmission(settings(), goodInput({ email: '' }), []).email).toBe('');
    expect(code(() => validateSubmission(settings(), goodInput({ email: 'nope' }), []))).toBe('BAD_EMAIL');
  });

  it('photos: refused when off, and capped at maxPhotos', () => {
    const urls = ['https://x/1', 'https://x/2', 'https://x/3', 'https://x/4'];
    expect(code(() => validateSubmission(settings({}, { enabled: false }), goodInput(), urls.slice(0, 1)))).toBe('PHOTOS_OFF');
    expect(code(() => validateSubmission(settings({}, { maxPhotos: 3 }), goodInput(), urls))).toBe('TOO_MANY_PHOTOS');
    expect(code(() => validateSubmission(settings({}, { maxPhotos: 3 }), goodInput(), urls.slice(0, 3)))).toBeNull();
  });
});

describe('checkPhotoDataUrl', () => {
  it('accepts an allowed type with the right signature', () => {
    expect(checkPhotoDataUrl(settings(), dataUrl('image/png', png()))).toMatchObject({ type: 'png' });
  });

  it('refuses a type the shop did not allow (GIF is off by default)', () => {
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(12)]);
    expect(code(() => checkPhotoDataUrl(settings(), dataUrl('image/gif', gif)))).toBe('BAD_IMAGE_TYPE');
    expect(checkPhotoDataUrl(settings({}, { allowedTypes: ['gif'] }), dataUrl('image/gif', gif)).type).toBe('gif');
  });

  it('refuses files over the size limit', () => {
    const s = settings({}, { maxFileSizeMb: 1 });
    expect(code(() => checkPhotoDataUrl(s, dataUrl('image/png', png(1024 * 1024))))).toBe('IMAGE_TOO_LARGE');
    expect(code(() => checkPhotoDataUrl(s, dataUrl('image/png', png(1000))))).toBeNull();
  });

  it('refuses a file whose bytes do not match its claimed type', () => {
    const fake = Buffer.from('<script>alert(1)</script>');
    expect(code(() => checkPhotoDataUrl(settings(), dataUrl('image/png', fake)))).toBe('BAD_IMAGE');
    expect(code(() => checkPhotoDataUrl(settings(), dataUrl('image/jpeg', png())))).toBe('BAD_IMAGE');
  });

  it('refuses non-images, svg, and malformed data', () => {
    expect(code(() => checkPhotoDataUrl(settings(), 'hello'))).toBe('BAD_IMAGE');
    expect(code(() => checkPhotoDataUrl(settings(), dataUrl('text/html', png())))).toBe('BAD_IMAGE');
    expect(code(() => checkPhotoDataUrl(settings(), dataUrl('image/svg+xml', png())))).toBe('BAD_IMAGE_TYPE');
    expect(code(() => checkPhotoDataUrl(settings(), undefined))).toBe('BAD_IMAGE');
  });

  it('refuses everything when photos are off', () => {
    expect(code(() => checkPhotoDataUrl(settings({}, { enabled: false }), dataUrl('image/png', png())))).toBe('PHOTOS_OFF');
  });
});

describe('ownPhotoUrls', () => {
  it('keeps only https URLs on our own Cloudinary account', () => {
    const mine = 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg';
    const out = ownPhotoUrls([
      mine,
      'https://res.cloudinary.com/someone-else/image/upload/a.jpg',
      'http://res.cloudinary.com/demo/a.jpg',
      'https://evil.example/res.cloudinary.com/demo/a.jpg',
      'javascript:alert(1)',
      'https://res.cloudinary.com/demo/a.jpg"onerror="x',
      42,
    ], 'demo');
    expect(out).toEqual([mine]);
  });
  it('keeps nothing when Cloudinary is not configured or input is not a list', () => {
    expect(ownPhotoUrls(['https://res.cloudinary.com/demo/a.jpg'], '')).toEqual([]);
    expect(ownPhotoUrls('x', 'demo')).toEqual([]);
  });
});

describe('purchaseFromOrder', () => {
  it('collects product ids, customer id and a hashed email', () => {
    const p = purchaseFromOrder({
      id: 99, email: 'Buyer@Example.com', customer: { id: 7 },
      line_items: [{ product_id: 1 }, { product_id: 2 }, { product_id: 1 }, { product_id: null }],
    });
    expect(p).toEqual({ orderId: '99', customerId: '7', emailHash: hashEmail('buyer@example.com'), productIds: ['1', '2'] });
    expect(JSON.stringify(p)).not.toContain('buyer@');
  });
  it('is null without products or without any way to identify the buyer', () => {
    expect(purchaseFromOrder({ id: 1, email: 'a@b.co', line_items: [] })).toBeNull();
    expect(purchaseFromOrder({ id: 1, line_items: [{ product_id: 1 }] })).toBeNull();
    expect(purchaseFromOrder(null)).toBeNull();
  });
  it('works for a guest checkout (email only)', () => {
    expect(purchaseFromOrder({ id: 1, email: 'a@b.co', line_items: [{ product_id: 5 }] }).customerId).toBeNull();
  });
});

describe('summarizeRatings', () => {
  it('averages to one decimal and fills the distribution', () => {
    const s = summarizeRatings([{ _id: 5, n: 2 }, { _id: 4, n: 1 }]);
    expect(s).toEqual({ rated: 3, average: 4.7, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 } });
  });
  it('is zero with no ratings and ignores nonsense', () => {
    expect(summarizeRatings([]).average).toBe(0);
    expect(summarizeRatings([{ _id: 9, n: 4 }, { _id: null, n: 2 }]).rated).toBe(0);
  });
});
