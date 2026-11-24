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
    expect(rules.filter((r) => r.source.startsWith('/admin/')).map((r) => r.source)).toEqual(['/admin/admin/:path*']);
  });

  // Review 2.1.1: a plan's Redirect URL "/plans" opens on the app's origin, which answered 404.
  it('sends /plans (and every other admin page opened on the root) to /admin/..., query kept by Next.js', async () => {
    const rules = await config.redirects();
    const plans = rules.find((r) => r.source === '/plans/:path*');
    expect(plans).toMatchObject({ destination: '/admin/plans/:path*', permanent: false });
    expect(plans.missing).toEqual([{ type: 'host', value: 'admin.shopireachboost.com' }]);
    for (const page of ['dashboard', 'settings-page', 'signals', 'reviews', 'cod', 'discounts']) {
      expect(rules.find((r) => r.source === `/${page}/:path*`)).toMatchObject({ destination: `/admin/${page}/:path*` });
    }
  });

  it('every redirected name is a real admin page, and none hides a public page', async () => {
    const fs = require('fs');
    const path = require('path');
    const rules = (await config.redirects()).filter((r) => !r.source.startsWith('/admin/'));
    const appDir = path.join(__dirname, '../app');
    for (const r of rules) {
      const page = r.source.split('/')[1];
      expect(fs.existsSync(path.join(appDir, 'admin', page, 'page.js'))).toBe(true);
      expect(fs.existsSync(path.join(appDir, page))).toBe(false);
    }
  });
});
