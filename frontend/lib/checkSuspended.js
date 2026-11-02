// Detect the backend's "store is suspended" sentinel. Called on every response
// so callers do not need to think about it. Fires 'ccf:store-suspended' on
// window at most once per page load (idempotent). All other status codes and
// all other 403 bodies are left completely untouched.
let _suspendedFired = false;

export function checkSuspended(status, body) {
  if (status !== 403) return;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  if (body.code !== 'STORE_SUSPENDED') return;
  if (typeof window === 'undefined') return;
  if (_suspendedFired) return;
  _suspendedFired = true;
  window.dispatchEvent(new Event('ccf:store-suspended'));
}

// Same idea for "no active subscription": the backend answers 402 with
// code PLAN_REQUIRED. Fires 'ccf:plan-required' once per page load.
let _planRequiredFired = false;

export function checkPlanRequired(status, body) {
  if (status !== 402) return;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  if (body.code !== 'PLAN_REQUIRED') return;
  if (typeof window === 'undefined') return;
  if (_planRequiredFired) return;
  _planRequiredFired = true;
  window.dispatchEvent(new Event('ccf:plan-required'));
}

// Resets the once-per-page-load flags. Used only by tests; never call this
// from production code.
export function _resetForTest() {
  _suspendedFired = false;
  _planRequiredFired = false;
}
