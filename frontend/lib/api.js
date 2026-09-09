// Central place for the backend base URL + a small fetch helper.
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

// fetch() rejects with a bare "TypeError: Failed to fetch" for any network-level
// failure (backend down, wrong port, CORS blocked, DNS). Turn that into a
// message that actually says what to check.
function describeNetworkError(err, method, url) {
  const raw = err && err.message ? err.message : String(err);
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(raw)) {
    return (
      `Cannot reach the backend (${method} ${url}). ` +
      `Is it running at ${BACKEND_URL} and is CORS allowing this origin? ` +
      `[${raw}]`
    );
  }
  return raw;
}

// Auth is a Shopify App Bridge session token. App Bridge is loaded
// synchronously by a plain <script> in the root layout <head>, so by the time
// any api call runs window.shopify is normally already there; the short poll
// below just covers the first render. window.shopify.idToken() returns a
// fresh, short-lived JWT and caches/refreshes internally — no caching here.
async function getAuthToken() {
  if (typeof window === 'undefined') {
    throw new Error('Not running in browser');
  }
  let waited = 0;
  while (!window.shopify) {
    if (waited >= 10000) {
      throw new Error('App Bridge did not initialize');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    waited += 100;
  }
  return await window.shopify.idToken();
}

export async function apiGet(path) {
  const url = `${BACKEND_URL}${path}`;
  const token = await getAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  let res;
  try {
    res = await fetch(url, { cache: 'no-store', headers });
  } catch (err) {
    throw new Error(describeNetworkError(err, 'GET', url));
  }

  // App Bridge session tokens live ~1 minute. On a 401, wait briefly (App
  // Bridge needs a moment to mint a new one) then retry ONCE with a fresh token.
  if (res.status === 401) {
    await new Promise((r) => setTimeout(r, 500));
    const freshToken = await getAuthToken();
    let retryRes;
    try {
      retryRes = await fetch(url, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${freshToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      throw new Error(describeNetworkError(err, 'GET', url));
    }
    if (!retryRes.ok) {
      const err = await retryRes.json().catch(() => ({}));
      throw new Error(err.error || `${path} failed (${retryRes.status})`);
    }
    return retryRes.json();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function apiSend(path, method, body) {
  const url = `${BACKEND_URL}${path}`;
  const token = await getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(describeNetworkError(err, method, url));
  }

  // App Bridge session tokens live ~1 minute. On a 401, wait briefly then
  // retry ONCE with a fresh token.
  if (res.status === 401) {
    await new Promise((r) => setTimeout(r, 500));
    const freshToken = await getAuthToken();
    let retryRes;
    try {
      retryRes = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(describeNetworkError(err, method, url));
    }
    if (!retryRes.ok) {
      const err = await retryRes.json().catch(() => ({}));
      throw new Error(err.error || `${method} ${path} failed (${retryRes.status})`);
    }
    return retryRes.json().catch(() => ({}));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `${method} ${path} failed (${res.status})`);
  }
  return data;
}
