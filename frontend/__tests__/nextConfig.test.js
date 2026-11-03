/**
 * next.config.js: a doubled /admin/admin/... URL (what Shopify opens if it joins a discount function's
 * path onto application_url, which already ends in /admin) lands on the real admin page.
 */
const config = require('../next.config.js');

describe('next.config redirects', () => {
  it('sends /admin/admin/<page> to /admin/<page>, keeping the rest of the path', async () => {
    const rules = await config.redirects();
    const rule = rules.find((r) => r.source === '/admin/admin/:path*');
    expect(rule).toBeTruthy();
    expect(rule.destination).toBe('/admin/:path*');
    expect(rule.permanent).toBe(false);
  });

  it('does not redirect normal admin pages', async () => {
    const rules = await config.redirects();
    expect(rules.every((r) => r.source.startsWith('/admin/admin'))).toBe(true);
  });
});
