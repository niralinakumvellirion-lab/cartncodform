jest.mock('../models/Store', () => ({ findOne: jest.fn() }));
jest.mock('../models/ProductImageCache', () => ({
  findOne: jest.fn(), deleteOne: jest.fn(), findOneAndUpdate: jest.fn(),
}));
jest.mock('../utils/shopify', () => ({ refreshAccessTokenIfNeeded: jest.fn() }));

const ProductImageCache = require('../models/ProductImageCache');
const { normalizeImageUrl, fetchProductImageWithTimeout } = require('../utils/productImage');

describe('normalizeImageUrl', () => {
  test('protocol-relative gets https', () => {
    expect(normalizeImageUrl('//cdn.shopify.com/a.jpg')).toBe('https://cdn.shopify.com/a.jpg');
  });
  test('http(s) passes through, trimmed', () => {
    expect(normalizeImageUrl(' https://x.com/a.jpg ')).toBe('https://x.com/a.jpg');
    expect(normalizeImageUrl('http://x.com/a.jpg')).toBe('http://x.com/a.jpg');
  });
  test.each([[''], [null], [undefined], ['/relative.jpg'], ['data:image/png;base64,AA'], ['javascript:alert(1)'], [42]])(
    'rejects %p', (v) => { expect(normalizeImageUrl(v)).toBeNull(); }
  );
});

describe('fetchProductImageWithTimeout', () => {
  test('resolves null after the cap when the lookup hangs', async () => {
    ProductImageCache.findOne.mockReturnValue(new Promise(() => {}));
    const t0 = Date.now();
    const out = await fetchProductImageWithTimeout('s.myshopify.com', '1', 50);
    expect(out).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  test('returns a normalised cached URL', async () => {
    ProductImageCache.findOne.mockResolvedValue({ imageUrl: '//cdn.shopify.com/c.jpg' });
    const out = await fetchProductImageWithTimeout('s.myshopify.com', '1', 500);
    expect(out).toBe('https://cdn.shopify.com/c.jpg');
  });
});
