/**
 * Platform admin API client.
 * Token stored in sessionStorage; never logged.
 * All functions are safe to call from client components only.
 */

import { BACKEND_URL } from './api';

const TOKEN_KEY = 'ccf_platform_token';

// ── Token helpers ─────────────────────────────────────────────────────────────

function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function storeToken(t) {
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch {}
}

function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

function loginPath() {
  if (typeof window === 'undefined') return '/platform/login';
  return window.location.pathname.startsWith('/platform')
    ? '/platform/login'
    : '/login';
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Authenticated fetch against the platform backend.
 * On 401: clears token and navigates to the login page.
 * On network error: throws with a human-readable message.
 */
export async function platformFetch(path, options = {}) {
  const token = getToken();
  const url   = `${BACKEND_URL}${path}`;

  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw Object.assign(new Error('Could not reach the server. Try again.'), { status: 0 });
  }

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') {
      window.location.href = loginPath();
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

export function getMe() {
  return platformFetch('/api/platform/me');
}

export function signOut() {
  clearToken();
  if (typeof window !== 'undefined') {
    window.location.href = loginPath();
  }
}
