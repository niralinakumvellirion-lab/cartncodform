/**
 * Pure routing decision for multi-host deployment.
 * No imports, no side effects — safe to unit-test with plain node.
 *
 * Rules
 * ──────
 * admin.shopireachboost.com:
 *   /               → rewrite to /platform
 *   /platform/*     → next  (already prefixed, no double-prefix)
 *   everything else → notFound  (/admin/*, /cod-form/*, etc. must not leak)
 *
 * Every other host, production:
 *   /platform/*     → notFound  (platform admin not reachable on app/marketing domain)
 *   all other paths → next
 *
 * Not production (local dev):
 *   /platform/*     → next  (reachable directly on localhost for dev convenience)
 *   all other paths → next
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
    if (pathname === '/') return { action: 'rewrite', to: '/platform' };
    if (pathname.startsWith('/platform')) return { action: 'next' };
    // All other paths (/admin/*, /cod-form/*, etc.) are not valid on the
    // platform admin host.
    return { action: 'notFound' };
  }

  // Non-admin host in production: block the /platform subtree.
  if (isProduction && pathname.startsWith('/platform')) {
    return { action: 'notFound' };
  }

  return { action: 'next' };
}
