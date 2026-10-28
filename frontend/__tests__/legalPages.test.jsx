/**
 * Smoke tests for /privacy, /terms, /support pages.
 * Verifies metadata exports, required text content, and mailto link.
 */

// Metadata is a plain export — no React rendering needed.
import { metadata as privacyMeta } from '../app/privacy/page';
import { metadata as termsMeta } from '../app/terms/page';
import { metadata as supportMeta } from '../app/support/page';

// Read raw source to assert specific strings without mounting Next.js router.
const fs = require('fs');
const path = require('path');

const privacySrc = fs.readFileSync(
  path.join(__dirname, '../app/privacy/page.js'),
  'utf8'
);
const termsSrc = fs.readFileSync(
  path.join(__dirname, '../app/terms/page.js'),
  'utf8'
);
const supportSrc = fs.readFileSync(
  path.join(__dirname, '../app/support/page.js'),
  'utf8'
);

// ── Privacy metadata ──────────────────────────────────────────────────────────
describe('Privacy page', () => {
  it('has a non-empty title', () => {
    expect(typeof privacyMeta.title).toBe('string');
    expect(privacyMeta.title.length).toBeGreaterThan(0);
  });

  it('has a non-empty description', () => {
    expect(typeof privacyMeta.description).toBe('string');
    expect(privacyMeta.description.length).toBeGreaterThan(0);
  });

  it('includes the effective date', () => {
    expect(privacySrc).toContain('October 28, 2026');
  });

  it('includes the business name', () => {
    expect(privacySrc).toContain('ShopiReachBoost AI');
  });

  it('mentions the support email', () => {
    expect(privacySrc).toContain('niralinakum.vellirion@gmail.com');
  });

  it('does not contain placeholder text', () => {
    expect(privacySrc).not.toMatch(/TODO|CONFIRM|lorem|^\[.+\]$/m);
  });

  it('does not claim GDPR compliance', () => {
    expect(privacySrc).not.toMatch(/GDPR\s+compliant/i);
  });

  it('lists Firebase as a third party', () => {
    expect(privacySrc).toContain('Firebase');
  });

  it('lists Resend as a third party', () => {
    expect(privacySrc).toContain('Resend');
  });

  it('mentions 90-day retention for StorefrontEvent / attribution data', () => {
    expect(privacySrc).toContain('90 days');
  });

  it('references the /privacy page from its own contact section', () => {
    // Privacy page should have a mailto link in its contact section.
    expect(privacySrc).toContain('mailto:niralinakum.vellirion@gmail.com');
  });
});

// ── Terms metadata ────────────────────────────────────────────────────────────
describe('Terms page', () => {
  it('has a non-empty title', () => {
    expect(typeof termsMeta.title).toBe('string');
    expect(termsMeta.title.length).toBeGreaterThan(0);
  });

  it('has a non-empty description', () => {
    expect(typeof termsMeta.description).toBe('string');
    expect(termsMeta.description.length).toBeGreaterThan(0);
  });

  it('includes the effective date', () => {
    expect(termsSrc).toContain('October 28, 2026');
  });

  it('includes the business name', () => {
    expect(termsSrc).toContain('ShopiReachBoost AI');
  });

  it('mentions the support email', () => {
    expect(termsSrc).toContain('niralinakum.vellirion@gmail.com');
  });

  it('does not contain placeholder text', () => {
    expect(termsSrc).not.toMatch(/TODO|CONFIRM|lorem|^\[.+\]$/m);
  });

  it('links to the Privacy Policy page', () => {
    expect(termsSrc).toContain('href="/privacy"');
  });

  it('describes at least push notifications and COD form', () => {
    expect(termsSrc).toContain('push notification');
    expect(termsSrc).toContain('COD');
  });
});

// ── Support metadata ──────────────────────────────────────────────────────────
describe('Support page', () => {
  it('has a non-empty title', () => {
    expect(typeof supportMeta.title).toBe('string');
    expect(supportMeta.title.length).toBeGreaterThan(0);
  });

  it('has a non-empty description', () => {
    expect(typeof supportMeta.description).toBe('string');
    expect(supportMeta.description.length).toBeGreaterThan(0);
  });

  it('includes the business name', () => {
    expect(supportSrc).toContain('ShopiReachBoost AI');
  });

  it('includes the support mailto link', () => {
    expect(supportSrc).toContain('mailto:niralinakum.vellirion@gmail.com');
  });

  it('does not contain placeholder text', () => {
    expect(supportSrc).not.toMatch(/TODO|CONFIRM|lorem|^\[.+\]$/m);
  });

  it('links to the Privacy Policy page', () => {
    expect(supportSrc).toContain('href="/privacy"');
  });

  it('contains a FAQ section with at least four questions', () => {
    const matches = supportSrc.match(/question=/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Footer ────────────────────────────────────────────────────────────────────
describe('Footer', () => {
  const footerSrc = fs.readFileSync(
    path.join(__dirname, '../app/components/landing/Footer.jsx'),
    'utf8'
  );

  it('links to /privacy', () => {
    expect(footerSrc).toContain('href="/privacy"');
  });

  it('links to /terms', () => {
    expect(footerSrc).toContain('href="/terms"');
  });

  it('links to /support', () => {
    expect(footerSrc).toContain('href="/support"');
  });
});
