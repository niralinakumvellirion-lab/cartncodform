/**
 * Returns the correct href for a platform-admin path.
 *
 * On the admin host (admin.*) the app is mounted at '/', so clean paths like
 * '/login', '/staff', '/audit' are used directly (clean-URL routing).
 * On every other host (app.*, localhost) the platform lives under '/platform',
 * so '/platform/login', '/platform/staff', etc. are returned.
 *
 * Safe to call on the server: the typeof window guard returns the prefixed path.
 *
 * @param {string} path  e.g. '/', '/login', '/staff', '/audit'
 * @returns {string}     href for use in <a>, router.push, window.location.href
 */
export function platformHref(path) {
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname.startsWith('admin.') && hostname !== 'localhost') {
      return path; // clean URL on the admin subdomain
    }
  }
  // Server render, or non-admin host: prefix with /platform.
  return path === '/' ? '/platform' : '/platform' + path;
}
