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
  // No anchor tag with href that points to a ctaUrl.
  // The only anchor is the unsubscribe link in the footer (href="#").
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  expect(hrefs.every(h => h === '#')).toBe(true);
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
