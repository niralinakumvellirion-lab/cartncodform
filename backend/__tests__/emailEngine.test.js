/**
 * Tests for backend/utils/emailEngine.js
 * No network calls, no mocks — pure functions.
 */

const {
  esc, lum, cr, mix, soften, onColour,
  FONTS, FONT_ORDER, LAYOUT_INFO,
  themeFor, renderEmail, renderEmailDocument,
} = require('../utils/emailEngine');

// ── helpers ───────────────────────────────────────────────────────────────────

const LAYOUTS = LAYOUT_INFO.map((l) => l.k);

function baseDesign(layout) {
  return {
    layout,
    color: '#4f46e5',
    hFont: 'arial',
    bFont: 'arial',
    radius: 'round',
    store: 'Test Store',
    subject: 'Test Subject',
    eyebrow: 'Test Eyebrow',
    headline: 'Test Headline',
    offer: '20% OFF',
    body: 'Test body text.\nLine two.',
    cta: 'Shop Now',
    ctaUrl: 'https://example.com/shop',
    note: 'Limited time only',
    unsubscribeUrl: 'https://example.com/unsub',
  };
}

// ── 1. All layouts render without "undefined" or "NaN" ──────────────────────

describe('all layouts produce clean HTML', () => {
  for (const L of LAYOUTS) {
    test(`${L}: no "undefined" or "NaN"`, () => {
      const html = renderEmailDocument(baseDesign(L));
      expect(html).not.toMatch(/\bundefined\b/);
      expect(html).not.toMatch(/\bNaN\b/);
    });

    test(`${L}: contains footer + unsubscribe link`, () => {
      const html = renderEmailDocument(baseDesign(L));
      expect(html.toLowerCase()).toContain('unsubscribe');
      expect(html).toContain('Test Store');
    });

    test(`${L}: under 60 KB`, () => {
      const html = renderEmailDocument(baseDesign(L));
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(60 * 1024);
    });

    test(`${L}: table-based layout`, () => {
      const html = renderEmailDocument(baseDesign(L));
      expect(html).toContain('<table');
      expect(html).toContain('<td');
    });

    test(`${L}: full HTML document structure`, () => {
      const html = renderEmailDocument(baseDesign(L));
      expect(html).toMatch(/^<!DOCTYPE html>/i);
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<head>');
      expect(html).toContain('</html>');
    });
  }
});

// ── 2. Image tag hygiene ───────────────────────────────────────────────────────

describe('<img> tag hygiene', () => {
  const DESIGN_WITH_IMAGE = {
    ...baseDesign('hero'),
    image: 'https://cdn.example.com/hero.jpg',
    imgW: 1200,
    imgH: 800,
    showLogo: true,
    logoUrl: 'https://cdn.example.com/logo.png',
  };

  test('every <img> has width attribute', () => {
    const html = renderEmailDocument(DESIGN_WITH_IMAGE);
    const imgs = html.match(/<img\b[^>]*>/gi) || [];
    expect(imgs.length).toBeGreaterThan(0);
    imgs.forEach((tag) => {
      expect(tag).toMatch(/\bwidth=/);
    });
  });

  test('every <img> has height attribute', () => {
    const html = renderEmailDocument(DESIGN_WITH_IMAGE);
    const imgs = html.match(/<img\b[^>]*>/gi) || [];
    imgs.forEach((tag) => {
      expect(tag).toMatch(/\bheight=/);
    });
  });

  test('every <img> style has height:auto', () => {
    const html = renderEmailDocument(DESIGN_WITH_IMAGE);
    const imgs = html.match(/<img\b[^>]*>/gi) || [];
    imgs.forEach((tag) => {
      expect(tag).toContain('height:auto');
    });
  });

  test('no <img> uses object-fit', () => {
    const html = renderEmailDocument(DESIGN_WITH_IMAGE);
    expect(html).not.toContain('object-fit');
  });

  test('no <img> uses border-radius in its own style', () => {
    const html = renderEmailDocument(DESIGN_WITH_IMAGE);
    const imgs = html.match(/<img\b[^>]*>/gi) || [];
    imgs.forEach((tag) => {
      expect(tag).not.toContain('border-radius');
    });
  });

  test('images render in all 11 layouts', () => {
    for (const L of LAYOUTS) {
      const html = renderEmailDocument({
        ...baseDesign(L),
        image: 'https://cdn.example.com/img.jpg',
      });
      expect(html).toContain('https://cdn.example.com/img.jpg');
    }
  });
});

// ── 3. Image URL sanitisation ──────────────────────────────────────────────────

describe('image URL sanitisation', () => {
  test('http:// image is upgraded to https://', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), image: 'http://cdn.example.com/img.jpg' });
    expect(html).not.toContain('http://cdn.example.com/img.jpg');
    expect(html).toContain('https://cdn.example.com/img.jpg');
  });

  test('data: URI is dropped (no <img> rendered)', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), image: 'data:image/png;base64,abc' });
    // No real image, no placeholder flag → no <img> at all
    expect(html).not.toContain('data:image');
  });

  test('javascript: URI is dropped', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), image: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript:');
  });

  test('relative URL is dropped', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), image: '/relative/path.jpg' });
    expect(html).not.toContain('/relative/path.jpg');
  });

  test('https:// image is kept as-is', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), image: 'https://cdn.example.com/ok.jpg' });
    expect(html).toContain('https://cdn.example.com/ok.jpg');
  });
});

// ── 4. Placeholder ────────────────────────────────────────────────────────────

describe('placeholder box', () => {
  test('placeholder:true shows "appears here" text', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), placeholder: true });
    expect(html).toContain('appears here');
  });

  test('placeholder:false (default) never shows "appears here"', () => {
    const html = renderEmailDocument(baseDesign('hero'));
    expect(html).not.toContain('appears here');
  });

  test('placeholder undefined never shows "appears here"', () => {
    const d = baseDesign('hero');
    delete d.placeholder;
    const html = renderEmailDocument(d);
    expect(html).not.toContain('appears here');
  });

  test('placeholder:true works across all layouts', () => {
    for (const L of LAYOUTS) {
      const html = renderEmailDocument({ ...baseDesign(L), placeholder: true });
      expect(html).toContain('appears here');
    }
  });
});

// ── 5. CTA button ─────────────────────────────────────────────────────────────

describe('CTA button', () => {
  test('valid https ctaUrl renders anchor inside table cell', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), ctaUrl: 'https://shop.example.com/offer' });
    expect(html).toContain('https://shop.example.com/offer');
    expect(html).toMatch(/<td[^>]*>\s*<a[^>]*href="https:\/\/shop\.example\.com\/offer"/);
  });

  test('mailto: ctaUrl is accepted', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), ctaUrl: 'mailto:hello@shop.com', cta: 'Email Us' });
    expect(html).toContain('mailto:hello@shop.com');
    expect(html).toContain('Email Us');
  });

  test('http:// ctaUrl drops the button', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), ctaUrl: 'http://insecure.example.com' });
    expect(html).not.toContain('http://insecure.example.com');
    // unsubscribe link is still present (mailto:)
    expect(html.toLowerCase()).toContain('unsubscribe');
  });

  test('javascript: ctaUrl drops the button', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), ctaUrl: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript:');
  });

  test('empty ctaUrl drops the button', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), ctaUrl: '' });
    // No shop.com link in output
    expect(html).not.toContain('example.com/shop');
  });

  test('null ctaUrl drops the button', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), ctaUrl: null });
    expect(html).not.toContain('example.com/shop');
  });

  test('coupon layout: no CTA → offer fills whole ticket (no second dashed column)', () => {
    const html = renderEmailDocument({ ...baseDesign('coupon'), ctaUrl: null });
    // dashed border-left only appears in the two-column variant
    expect(html).not.toContain('border-left:2px dashed');
  });

  test('coupon layout: with CTA → two-column ticket', () => {
    const html = renderEmailDocument(baseDesign('coupon'));
    expect(html).toContain('border-left:2px dashed');
  });
});

// ── 6. Logo ───────────────────────────────────────────────────────────────────

describe('logo', () => {
  test('showLogo:true + https logoUrl → <img> in output', () => {
    const html = renderEmailDocument({
      ...baseDesign('hero'),
      showLogo: true,
      logoUrl: 'https://cdn.example.com/logo.png',
    });
    expect(html).toContain('<img');
    expect(html).toContain('https://cdn.example.com/logo.png');
  });

  test('showLogo:false → no logo img', () => {
    const html = renderEmailDocument({
      ...baseDesign('hero'),
      showLogo: false,
      logoUrl: 'https://cdn.example.com/logo.png',
      image: null,
    });
    expect(html).not.toContain('<img');
  });

  test('showLogo:true + http:// logoUrl → falls back to text', () => {
    const html = renderEmailDocument({
      ...baseDesign('hero'),
      showLogo: true,
      logoUrl: 'http://cdn.example.com/logo.png',
      image: null,
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('Test Store');
  });
});

// ── 7. XSS escaping ───────────────────────────────────────────────────────────

describe('XSS escaping', () => {
  const EVIL = {
    ...baseDesign('hero'),
    store: '&Acme" Co<script>',
    subject: '<script>alert(1)</script>',
    eyebrow: '<img onerror="xss">',
    headline: '<b>Big</b>',
    offer: '<em>50% off</em>',
    body: '<script>document.cookie</script>',
    cta: '<span>Buy</span>',
    note: '"><svg onload="xss">',
  };

  test('no raw <script> tags in output', () => {
    const html = renderEmailDocument(EVIL);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('store name special chars escaped', () => {
    const html = renderEmailDocument(EVIL);
    expect(html).toContain('&amp;Acme&quot; Co&lt;script&gt;');
  });

  test('offer field special chars escaped', () => {
    const html = renderEmailDocument(EVIL);
    expect(html).not.toContain('<em>50% off</em>');
    expect(html).toContain('&lt;em&gt;50% off&lt;/em&gt;');
  });

  test('CTA label special chars escaped', () => {
    const html = renderEmailDocument({ ...EVIL, ctaUrl: 'https://safe.example.com' });
    expect(html).not.toContain('<span>Buy</span>');
    expect(html).toContain('&lt;span&gt;Buy&lt;/span&gt;');
  });
});

// ── 8. Body plain-text rendering ──────────────────────────────────────────────

describe('body plain-text rendering', () => {
  test('newlines converted to <br> in output', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), body: 'Line one\nLine two' });
    expect(html).toContain('Line one<br>Line two');
  });

  test('HTML in body is escaped, not rendered', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), body: '<b>Bold</b>' });
    expect(html).not.toContain('<b>Bold</b>');
    expect(html).toContain('&lt;b&gt;Bold&lt;/b&gt;');
  });
});

// ── 9. themeFor contrast ──────────────────────────────────────────────────────

describe('themeFor: acc has sufficient contrast vs cardBg', () => {
  const BRANDS = ['#c2185b', '#facc15', '#111827', '#0f766e', '#4f46e5', '#e63946'];

  for (const brand of BRANDS) {
    for (const L of LAYOUTS) {
      test(`brand ${brand} / layout ${L}: acc contrast passes`, () => {
        const theme = themeFor({ color: brand, layout: L });
        const need = theme.dark ? 4.5 : 3;
        expect(cr(theme.acc, theme.cardBg)).toBeGreaterThanOrEqual(need);
      });
    }
  }

  test('acc also passes on tint background', () => {
    const PALETTE = [
      '#f5f5f5','#e8e8e8','#d4d4d4','#a3a3a3','#737373','#404040','#171717','#0a0a0a',
      '#fef2f2','#fff7ed','#fefce8','#f0fdf4','#ecfdf5','#eff6ff','#f5f3ff','#fdf4ff',
      '#dc2626','#ea580c','#ca8a04','#16a34a','#059669','#2563eb','#7c3aed','#a21caf',
      '#7f1d1d','#7c2d12','#713f12','#14532d','#134e4a','#1e3a8a','#3b0764','#500724',
    ];
    for (const bg of PALETTE) {
      const theme = themeFor({ color: '#4f46e5', cardBg: bg });
      const need = theme.dark ? 4.5 : 3;
      expect(cr(theme.acc, theme.cardBg)).toBeGreaterThanOrEqual(need);
    }
  });

  test('themeFor returns all expected keys', () => {
    const keys = ['dark','ink','sub','mut','acc','onC','onA','tint','soft','mid','deep','hair','footBg','pageBg','cardBg'];
    const theme = themeFor({ color: '#4f46e5' });
    keys.forEach((k) => {
      expect(theme).toHaveProperty(k);
    });
  });

  test('dark mode activates on dark card backgrounds', () => {
    const theme = themeFor({ cardBg: '#111111' });
    expect(theme.dark).toBe(true);
  });

  test('light mode on light card backgrounds', () => {
    const theme = themeFor({ cardBg: '#ffffff' });
    expect(theme.dark).toBe(false);
  });
});

// ── 10. Fonts ────────────────────────────────────────────────────────────────

describe('FONTS and FONT_ORDER', () => {
  test('every FONT_ORDER id resolves in FONTS', () => {
    for (const id of FONT_ORDER) {
      expect(FONTS).toHaveProperty(id);
    }
  });

  test('FONT_ORDER has 24 entries', () => {
    expect(FONT_ORDER).toHaveLength(24);
  });

  test('rich fonts produce a Google Fonts <link> in renderEmailDocument', () => {
    const richId = FONT_ORDER.find((id) => FONTS[id].g === 'rich');
    const html = renderEmailDocument({ ...baseDesign('hero'), hFont: richId });
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('<link rel="stylesheet"');
  });

  test('safe fonts produce no Google Fonts <link>', () => {
    const safeId = FONT_ORDER.find((id) => FONTS[id].g === 'safe');
    const html = renderEmailDocument({ ...baseDesign('hero'), hFont: safeId, bFont: safeId });
    expect(html).not.toContain('fonts.googleapis.com');
  });

  test('two different rich fonts both appear in a single Google Fonts link', () => {
    const rich = FONT_ORDER.filter((id) => FONTS[id].g === 'rich' && FONTS[id].gf);
    const [h, b] = rich;
    const html = renderEmailDocument({ ...baseDesign('hero'), hFont: h, bFont: b });
    const linkMatch = html.match(/<link[^>]*googleapis[^>]*>/);
    expect(linkMatch).not.toBeNull();
    expect(linkMatch[0]).toContain(FONTS[h].gf);
    expect(linkMatch[0]).toContain(FONTS[b].gf);
  });

  test('unknown font id falls back to arial', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), hFont: 'nonexistent', bFont: 'nonexistent' });
    expect(html).not.toMatch(/\bundefined\b/);
  });
});

// ── 11. renderEmail vs renderEmailDocument ────────────────────────────────────

describe('renderEmail vs renderEmailDocument', () => {
  test('renderEmail returns {css, body} fragment (no DOCTYPE)', () => {
    const out = renderEmail(baseDesign('hero'));
    expect(out).toHaveProperty('css');
    expect(out).toHaveProperty('body');
    expect(out.css).toBeTruthy();
    expect(out.body).toBeTruthy();
    expect(out.body).not.toMatch(/<!DOCTYPE/i);
  });

  test('renderEmailDocument returns full HTML document', () => {
    const html = renderEmailDocument(baseDesign('hero'));
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<body');
    expect(html).toContain('</html>');
  });

  test('preheader div injected when preheader provided', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), preheader: 'Secret preview text' });
    expect(html).toContain('Secret preview text');
    expect(html).toContain('display:none');
  });

  test('preheader falls back to first 100 chars of body when not set', () => {
    const d = baseDesign('hero');
    d.body = 'First sentence used as preview.';
    delete d.preheader;
    const html = renderEmailDocument(d);
    expect(html).toContain('First sentence used as preview.');
  });

  test('<title> contains escaped subject', () => {
    const html = renderEmailDocument({ ...baseDesign('hero'), subject: 'Hello & World' });
    expect(html).toContain('<title>Hello &amp; World</title>');
  });
});

// ── 12. esc helper ────────────────────────────────────────────────────────────

describe('esc helper', () => {
  test('escapes &, <, >, "', () => {
    expect(esc('&<>"')).toBe('&amp;&lt;&gt;&quot;');
  });
  test('null/undefined → empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});
