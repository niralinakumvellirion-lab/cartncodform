/**
 * Pure routing decision for multi-host deployment.
 * No imports, no side effects — safe to unit-test with plain node.
 *
 * Rules
 * ──────
 * admin.shopireachboost.com:
 *   /platform/*                 → next (already prefixed, no double-prefix)
 *   /admin, /admin/*            → notFound
 *   /cod-form, /cod-form/*      → notFound
 *   /api, /api/*                → notFound
 *   everything else             → rewrite to /platform + path
 *     '/' → '/platform', '/login' → '/platform/login', etc.
 *     Unknown paths then 404 inside Next.js, which is fine.
 *
 * Every other host, production:
 *   /platform/*     → notFound  (platform admin not reachable on app/marketing domain)
 *   all other paths → next
 *
 * Not production (local dev):
 *   all paths → next
 *
 * Port numbers are stripped before comparing; comparison is case-insensitive.
 *
 * @param {{ host?: string, pathname?: string, isProduction?: boolean }}
 * @returns {{ action: 'next'|'rewrite'|'notFound', to?: string }}
 */
export function resolveHostRoute({ host = '', pathname = '/', isProduction = true }) {
  const cleanHost = host.split(':')[0].toLowerCase();
  const isAdminHost = cleanHost === 'admin.shopireachboost.com';

  if (isAdminHost) {
    // Already under /platform — pass through unchanged.
    if (pathname === '/platform' || pathname.startsWith('/platform/')) return { action: 'next' };

    // Block paths that belong to the merchant admin, COD form, or backend API.
    if (
      pathname === '/admin'    || pathname.startsWith('/admin/') ||
      pathname === '/cod-form' || pathname.startsWith('/cod-form/') ||
      pathname === '/api'      || pathname.startsWith('/api/')
    ) {
      return { action: 'notFound' };
    }

    // Every other path (including /, /login, /staff, /audit, /stores/...) rewrites
    // to /platform + path.  Unknown paths then 404 inside Next.js.
    const to = pathname === '/' ? '/platform' : '/platform' + pathname;
    return { action: 'rewrite', to };
  }

  // Non-admin host in production: block the /platform subtree.
  if (isProduction && (pathname === '/platform' || pathname.startsWith('/platform/'))) {
    return { action: 'notFound' };
  }

  return { action: 'next' };
}
