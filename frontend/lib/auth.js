'use client';

// Very small client-side gate for the owner dashboard. This is "basic protection"
// only — the PIN ships to the browser via NEXT_PUBLIC_DASHBOARD_PIN, so it keeps
// casual visitors out, not a determined attacker. Put real auth in front of the
// backend API for anything sensitive.

export const AUTH_KEY = 'cartncodform_auth';

// NEXT_PUBLIC_DASHBOARD_PIN holds the 4-digit PIN. Default kept for local dev.
export const DASHBOARD_PIN = process.env.NEXT_PUBLIC_DASHBOARD_PIN || '1234';

export function isAuthed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AUTH_KEY) === 'true';
  } catch (err) {
    return false;
  }
}

export function setAuthed(value) {
  try {
    if (value) {
      window.localStorage.setItem(AUTH_KEY, 'true');
    } else {
      window.localStorage.removeItem(AUTH_KEY);
    }
  } catch (err) {
    /* localStorage unavailable — ignore */
  }
}

export function checkPin(pin) {
  return /^\d{4}$/.test(pin) && pin === DASHBOARD_PIN;
}
