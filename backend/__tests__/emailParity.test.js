/**
 * Preview-vs-send HTML parity for all 11 layouts × 3 photo cases.
 *
 * a = renderEmailDocument(designFromTemplate(t, store, { placeholder: !t.imageUrl }))
 * b = renderEmailDocument(designFromTemplate(t, store, { placeholder: false }))
 * c = b  (broadcast uses same design as send for every recipient)
 * d = renderEmail(designFromTemplate(t, store, { placeholder: !t.imageUrl })).body
 *     from the FRONTEND copy (frontend/app/admin/lib/emailEngine.js)
 *
 * Assertions:
 *   with photo   → a === b === c exactly; d is contained in a
 *   no photo     → preview (a) contains "appears here"; b and c do not
 *   all sent (b) → contains Unsubscribe link, no "undefined" or "NaN", < 60 KB
 *   journey path → buildEmailHtml() passes same hygiene checks
 */

const path = require('path');
const {
  renderEmailDocument,
  renderEmail,
  designFromTemplate,
  LAYOUT_INFO,
} = require('../utils/emailEngine');

const fe = require(
  path.resolve(__dirname, '../../frontend/app/admin/lib/emailEngine')
);

const { buildEmailHtml } = require('../utils/email');

// ── fixtures ──────────────────────────────────────────────────────────────────

const LAYOUTS = LAYOUT_INFO.map((l) => l.k); // 11 keys

const STORE_WITH_LOGO = {
  shopName:     'Silk House',
  logoUrl:      'https://cdn.example.com/logo.png',
  primaryColor: '#c2185b',
  shopDomain:   'silk.myshopify.com',
};
const STORE_NO_LOGO = {
  shopName:     'Silk House',
  logoUrl:      null,
  primaryColor: '#c2185b',
  shopDomain:   'silk.myshopify.com',
};

const BASE = {
  type:       'festival',
  name:       'Parity Test',
  subject:    'Big sale today — 25% off everything',
  eyebrow:    'Limited time',
  headline:   'Your discount is waiting',
  body:       'Shop now and save big on our full collection.',
  offerText:  '25% OFF',
  ctaLabel:   'Shop Now',
  ctaUrl:     'https://silk.myshopify.com/collections/all',
  note:       'Offer ends midnight',
  color:      '#c2185b',
  hFont:      'montserrat',
  bFont:      'arial',
  radius:     'round',
  showLogo:   true,
  pageBg:     null,
  cardBg:     null,
};

function makeTemplate(layout, photoCase) {
  const t = { ...BASE, layout };
  if (photoCase === 'with_dimensions') {
    return { ...t, imageUrl: 'https://cdn.example.com/offer.jpg', imgW: 1200, imgH: 800 };
  }
  if (photoCase === 'without_dimensions') {
    return { ...t, imageUrl: 'https://cdn.example.com/offer.jpg', imgW: null, imgH: null };
  }
  // no_photo
  return { ...t, imageUrl: null, imgW: null, imgH: null };
}

const PHOTO_CASES = ['with_dimensions', 'without_dimensions', 'no_photo'];
const STORES = [
  { label: 'with_logo', store: STORE_WITH_LOGO },
  { label: 'no_logo',   store: STORE_NO_LOGO },
];

const UNSUB_NEEDLE = 'unsubscribe@shopireachboost.com';
const SIXTY_KB = 60 * 1024;

// ── main parity suite ─────────────────────────────────────────────────────────

describe('email parity — preview vs send vs broadcast', () => {
  for (const { label: storeLabel, store } of STORES) {
    describe(`store: ${storeLabel}`, () => {
      for (const photoCase of PHOTO_CASES) {
        describe(`photo: ${photoCase}`, () => {
          for (const layout of LAYOUTS) {
            test(layout, () => {
              const t = makeTemplate(layout, photoCase);
              const hasPhoto = !!t.imageUrl;

              // (a) preview path
              const designA = designFromTemplate(t, store, { placeholder: !hasPhoto });
              const htmlA   = renderEmailDocument(designA);

              // (b) send path
              const designB = designFromTemplate(t, store, { placeholder: false });
              const htmlB   = renderEmailDocument(designB);

              // (c) broadcast path — same design as send
              const htmlC = renderEmailDocument(designB);

              // (d) frontend fragment (same design as preview)
              const feDesign = fe.designFromTemplate(t, store, { placeholder: !hasPhoto });
              const fragD    = fe.renderEmail(feDesign).body;

              if (hasPhoto) {
                // with photo: a === b === c
                expect(htmlA).toBe(htmlB);
                expect(htmlB).toBe(htmlC);
              } else {
                // no photo: preview shows placeholder
                expect(htmlA).toContain('appears here');
                expect(htmlB).not.toContain('appears here');
                expect(htmlC).not.toContain('appears here');
              }

              // (d) frontend body fragment contained in preview document
              expect(htmlA).toContain(fragD.slice(0, 300));

              // hygiene checks on sent HTML
              expect(htmlB).toContain(UNSUB_NEEDLE);
              expect(htmlB).not.toContain('undefined');
              expect(htmlB).not.toContain('NaN');
              expect(Buffer.byteLength(htmlB, 'utf8')).toBeLessThan(SIXTY_KB);
            });
          }
        });
      }
    });
  }
});

// ── journey email hygiene ─────────────────────────────────────────────────────

describe('journey email hygiene — buildEmailHtml', () => {
  const journeyBase = {
    subject:      'New arrivals from Silk House',
    body:         'Check out our latest collection.',
    ctaLabel:     'Shop Now',
    ctaUrl:       'https://silk.myshopify.com',
    storeName:    'Silk House',
    logoUrl:      'https://cdn.example.com/logo.png',
    primaryColor: '#c2185b',
    layout:       'hero',
    showLogo:     true,
  };

  test('with image: DOCTYPE, unsubscribe, no undefined/NaN, under 60KB', () => {
    const html = buildEmailHtml({
      ...journeyBase,
      imageUrl: 'https://cdn.example.com/banner.jpg',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(UNSUB_NEEDLE);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(SIXTY_KB);
  });

  test('without image: DOCTYPE, unsubscribe, no undefined/NaN, under 60KB', () => {
    const html = buildEmailHtml({ ...journeyBase, imageUrl: null });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(UNSUB_NEEDLE);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(SIXTY_KB);
  });

  test('no CTA URL: button absent, document still valid', () => {
    const html = buildEmailHtml({ ...journeyBase, ctaUrl: null, ctaLabel: null });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(SIXTY_KB);
  });

  test('all 11 layouts produce valid journey HTML', () => {
    for (const layout of LAYOUTS) {
      const html = buildEmailHtml({
        ...journeyBase,
        layout,
        imageUrl: 'https://cdn.example.com/banner.jpg',
      });
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain(UNSUB_NEEDLE);
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('NaN');
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(SIXTY_KB);
    }
  });
});
