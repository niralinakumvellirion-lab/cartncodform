/**
 * Platform admin API client.
 * Token stored in sessionStorage; never logged.
 * All functions are safe to call from client components only.
 */

import { BACKEND_URL } from './api.js';
import { platformHref } from './platformPaths.js';

const TOKEN_KEY = 'ccf_platform_token';

// ── Token helpers ─────────────────────────────────────────────────────────────

export function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function storeToken(t) {
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch {}
}

function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Authenticated fetch against the platform backend.
 * On 401: clears token and navigates to the login page.
 * On network error: throws with a human-readable message.
 */
export async function platformFetch(path, options = {}) {
  const { noRedirectOn401, ...fetchOptions } = options;
  const token = getToken();
  const url   = `${BACKEND_URL}${path}`;

  let res;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw Object.assign(new Error('Could not reach the server. Try again.'), { status: 0 });
  }

  if (res.status === 401) {
    clearToken();
    if (!noRedirectOn401 && typeof window !== 'undefined') {
      window.location.href = platformHref('/login');
    }
    throw Object.assign(new Error('Session expired'), { status: 401 });
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    throw Object.assign(
      new Error(data.error || `Request failed (${res.status})`),
      { status: res.status }
    );
  }
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Exchange a Google credential string for a platform JWT.
 * Stores the token; returns the staff object.
 * Never logs the credential.
 */
export async function loginWithGoogle(idToken) {
  const url = `${BACKEND_URL}/api/platform/auth/google`;
  let res;
  try {
    res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken }),
    });
  } catch {
    throw Object.assign(new Error('Could not reach the server. Try again.'), { status: 0 });
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    throw Object.assign(
      new Error(data.error || `Login failed (${res.status})`),
      { status: res.status }
    );
  }
  storeToken(data.token);
  return data.staff;
}

export function getMe(options) {
  return platformFetch('/api/platform/me', options);
}

export function signOut() {
  clearToken();
  if (typeof window !== 'undefined') {
    window.location.href = platformHref('/login');
  }
}

/**
 * Like platformFetch but returns the raw Response (for blob downloads).
 * Applies Authorization header; handles 401 the same way as platformFetch.
 * Caller reads res.blob() and res.headers.get('Content-Disposition').
 */
export async function platformFetchBlob(path) {
  const token = getToken();
  const url   = `${BACKEND_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw Object.assign(new Error('Could not reach the server. Try again.'), { status: 0 });
  }

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') {
      window.location.href = platformHref('/login');
    }
    throw Object.assign(new Error('Session expired'), { status: 401 });
  }

  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch {}
    throw Object.assign(
      new Error(data.error || `Request failed (${res.status})`),
      { status: res.status }
    );
  }

  return res;
}

// ── Finance ───────────────────────────────────────────────────────────────────

export function getFinanceSummary(tzOffsetMinutes) {
  return platformFetch(`/api/platform/finance/summary?tzOffsetMinutes=${tzOffsetMinutes}`);
}

export function getFinanceActivity(range, tzOffsetMinutes) {
  return platformFetch(`/api/platform/finance/activity?range=${range}&tzOffsetMinutes=${tzOffsetMinutes}`);
}

export function getFinanceStores(group, page, limit) {
  return platformFetch(`/api/platform/finance/stores?group=${group}&page=${page}&limit=${limit}`);
}

export function patchFinanceInternal(shopDomain, internal) {
  return platformFetch(`/api/platform/finance/stores/${encodeURIComponent(shopDomain)}/internal`, {
    method: 'PATCH',
    body: JSON.stringify({ internal }),
  });
}
