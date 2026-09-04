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

// Cache the short-lived backend JWT in memory so we don't mint a
// fresh one on every single API call. Re-fetched when missing/expired
// (a 401 from the backend triggers one retry with a fresh token).
let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 10 * 60 * 1000; // refresh proactively after 10 min (token itself expires at 15)

async function getAuthToken(forceRefresh = false) {
  const isStale = Date.now() - cachedTokenAt > TOKEN_TTL_MS;
  if (!forceRefresh && cachedToken && !isStale) {
    return cachedToken;
  }
  try {
    const res = await fetch('/api/token', { cache: 'no-store' });
    if (!res.ok) {
      cachedToken = null;
      return null;
    }
    const data = await res.json();
    cachedToken = data.token || null;
    cachedTokenAt = Date.now();
    return cachedToken;
  } catch {
    cachedToken = null;
    return null;
  }
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

  // Retry once with a fresh token on 401 (expired token).
  if (res.status === 401 && token) {
    const freshToken = await getAuthToken(true);
    if (freshToken) {
      try {
        res = await fetch(url, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${freshToken}` },
        });
      } catch (err) {
        throw new Error(describeNetworkError(err, 'GET', url));
      }
    }
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

  // Retry once with a fresh token on 401 (expired token).
  if (res.status === 401 && token) {
    const freshToken = await getAuthToken(true);
    if (freshToken) {
      try {
        res = await fetch(url, {
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
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `${method} ${path} failed (${res.status})`);
  }
  return data;
}
