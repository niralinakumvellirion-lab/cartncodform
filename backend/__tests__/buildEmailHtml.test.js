/**
 * Structural tests for buildEmailHtml() in backend/utils/email.js.
 * No network calls, no mocks needed — pure string-in, string-out.
 */

const { buildEmailHtml } = require('../utils/email');

const BASE = {
  subject: 'Hello',
  bodyHtml: '<p>Test body</p>',
  imageUrl: null,
  ctaLabel: null,
  ctaUrl: null,
  storeName: 'Demo Store',
  logoUrl: null,
  primaryColor: null,
};

test('a. returns a complete <!DOCTYPE html> document', () => {
  const html = buildEmailHtml(BASE);
  expect(html).toMatch(/^<!DOCTYPE html>/i);
  expect(html).toContain('<html');
  expect(html).toContain('<head>');
  expect(html).toContain('<body');
  expect(html).toContain('</html>');
});

test('b. uses table-based layout (not just divs)', () => {
  const html = buildEmailHtml(BASE);
  expect(html).toContain('<table');
  expect(html).toContain('<td');
});

test('c. includes mobile media query in <style> block', () => {
  const html = buildEmailHtml(BASE);
  expect(html).toContain('@media');
  expect(html).toContain('max-width');
});

test('d. shows storeName as text header when logoUrl is absent', () => {
  const html = buildEmailHtml({ ...BASE, storeName: 'Acme Widgets', logoUrl: null });
  expect(html).toContain('Acme Widgets');
  expect(html).not.toContain('<img');
});

test('e. shows logo img when logoUrl is present', () => {
  const html = buildEmailHtml({
    ...BASE,
    logoUrl: 'https://cdn.example.com/logo.png',
    storeName: 'Acme',
  });
  expect(html).toContain('<img');
  expect(html).toContain('https://cdn.example.com/logo.png');
});

test('f. skips hero image when imageUrl is null', () => {
  const html = buildEmailHtml({ ...BASE, imageUrl: null });
  // The only img that may appear is a logo img — we pass no logoUrl either.
  expect(html).not.toContain('<img');
});

test('g. skips hero image when imageUrl is http:// (not https)', () => {
  const html = buildEmailHtml({ ...BASE, imageUrl: 'http://insecure.example.com/img.jpg' });
  expect(html).not.toContain('http://insecure.example.com/img.jpg');
});

test('h. includes hero image when imageUrl is https://', () => {
  const html = buildEmailHtml({
    ...BASE,
    imageUrl: 'https://cdn.shopify.com/hero.jpg',
  });
  expect(html).toContain('https://cdn.shopify.com/hero.jpg');
});

test('i. skips CTA button when ctaUrl is absent', () => {
  const html = buildEmailHtml({ ...BASE, ctaUrl: null });
  // No ctaUrl in the output — only the unsubscribe mailto link is present.
  expect(html).not.toContain('https://example.com');
  expect(html).toContain('mailto:unsubscribe@shopireachboost.com');
});

test('j. includes CTA button (table-based anchor) when ctaUrl is present', () => {
  const html = buildEmailHtml({
    ...BASE,
    ctaUrl: 'https://example.com/shop',
    ctaLabel: 'Buy Now',
  });
  expect(html).toContain('https://example.com/shop');
  expect(html).toContain('Buy Now');
  // Button is table-based: there must be a <td> wrapping the <a>
  expect(html).toMatch(/<td[^>]*>\s*<a[^>]*href="https:\/\/example\.com\/shop"/);
});

test('k. uses primaryColor for the CTA button background', () => {
  const html = buildEmailHtml({
    ...BASE,
    ctaUrl: 'https://example.com/',
    ctaLabel: 'Go',
    primaryColor: '#e63946',
  });
  expect(html).toContain('#e63946');
});

test('l. falls back to default indigo (#4f46e5) when primaryColor is null', () => {
  const html = buildEmailHtml({
    ...BASE,
    ctaUrl: 'https://example.com/',
    ctaLabel: 'Go',
    primaryColor: null,
  });
  expect(html).toContain('#4f46e5');
});

test('m. footer contains storeName and unsubscribe link', () => {
  const html = buildEmailHtml({ ...BASE, storeName: 'My Store' });
  expect(html).toContain('My Store');
  expect(html.toLowerCase()).toContain('unsubscribe');
});

test('n. bodyHtml is present in output unchanged', () => {
  const html = buildEmailHtml({ ...BASE, bodyHtml: 'Line one<br>Line two' });
  expect(html).toContain('Line one<br>Line two');
});

test('o. offer ribbon renders only when offerText is set', () => {
  const with_ = buildEmailHtml({ ...BASE, offerText: 'Navratri · 15% Off' });
  // text-transform:uppercase is CSS-only — the string appears as-is in the HTML.
  expect(with_).toContain('Navratri');
  expect(with_).toContain('text-transform:uppercase');
  expect(with_).toContain('#f5f3ff');

  const without = buildEmailHtml({ ...BASE });
  expect(without).not.toContain('#f5f3ff');
});

test('p. trust line renders only when trustText is set', () => {
  const with_ = buildEmailHtml({ ...BASE, trustText: 'Free shipping on orders above ₹499' });
  // ₹ is not an HTML special char — it passes through unchanged.
  expect(with_).toContain('Free shipping on orders above ₹499');

  const without = buildEmailHtml({ ...BASE });
  // Spot-check: "Free shipping" should not appear in a baseline render
  expect(without).not.toContain('Free shipping');
});

test('q. primaryColor is applied to brand header bar background', () => {
  const html = buildEmailHtml({ ...BASE, primaryColor: '#e63946' });
  // The header <td> bgcolor and inline style must carry the brand color.
  expect(html).toMatch(/bgcolor="#e63946"/);
  expect(html).toMatch(/background:#e63946/);
});

test('r. dynamic strings are HTML-escaped (XSS prevention)', () => {
  const html = buildEmailHtml({
    ...BASE,
    subject: '<script>alert(1)</script>',
    storeName: '&Acme" Co',
    offerText: '<b>50% off</b>',
    trustText: '<em>safe</em>',
    ctaLabel: '<span>Buy</span>',
    ctaUrl: 'https://example.com/',
  });
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&amp;Acme&quot; Co');
  expect(html).not.toContain('<b>50% off</b>');
  expect(html).not.toContain('<em>safe</em>');
  expect(html).not.toContain('<span>Buy</span>');
});
