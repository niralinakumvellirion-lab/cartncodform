// Browser storage that never throws. In the Shopify admin iframe (for example
// Chrome incognito with third-party storage blocked) localStorage access throws;
// values then live in memory for the page session instead.
const memory = new Map();

export function getItem(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null && memory.has(key) ? memory.get(key) : value;
  } catch (_) {
    return memory.has(key) ? memory.get(key) : null;
  }
}

export function setItem(key, value) {
  memory.set(key, String(value));
  try {
    window.localStorage.setItem(key, String(value));
  } catch (_) {
    /* storage blocked: the in-memory copy above is used */
  }
}

// Used only by tests.
export function _clearMemory() {
  memory.clear();
}
