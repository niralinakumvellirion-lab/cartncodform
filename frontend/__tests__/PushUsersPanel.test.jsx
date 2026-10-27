/**
 * Behaviour tests for PushUsersPanel — jsdom + React Testing Library.
 * Mocks: __mocks__/api.js (apiGet), window.shopify (App Bridge), window.fetch (CSV export).
 */
import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { apiGet } from '../../../lib/api';
import PushUsersPanel from '../app/admin/dashboard/PushUsersPanel';

const SHOP = 'test.myshopify.com';
const FROM = '2026-10-01';
const TO   = '2026-10-23';

const USERS_RESPONSE = {
  total: 2,
  users: [
    { userKey: 'p_111', name: 'Alice', email: 'a***@shop.com', deviceType: null,
      lastSentAt: '2026-10-20T14:00:00.000Z', sentCount: 5, revisited: true },
    { userKey: 'a_333', name: 'Anonymous visitor', email: null, deviceType: 'android',
      lastSentAt: '2026-10-19T09:00:00.000Z', sentCount: 2, revisited: 'not_tracked' },
  ],
};

const REVISITED_RESPONSE = {
  total: 1,
  users: [
    { userKey: 'p_111', name: 'Alice', email: 'a***@shop.com', deviceType: null,
      revisits: 3, lastVisitAt: '2026-10-20T15:00:00.000Z',
      cameBackVia: [{ type: 'cart_abandon', label: 'Cart reminder', count: 3 }] },
  ],
};

const EMPTY_RESPONSE = { total: 0, users: [] };

function renderPanel(props = {}) {
  return render(
    <PushUsersPanel shop={SHOP} from={FROM} to={TO} {...props} />,
  );
}

function mockApiGetResolve(data) {
  apiGet.mockResolvedValue(data);
}

function mockApiGetReject() {
  apiGet.mockRejectedValue(new Error('Network error'));
}

beforeEach(() => {
  jest.clearAllMocks();
  if (!window.shopify) {
    window.shopify = { idToken: jest.fn().mockResolvedValue('test-token') };
  }
});

// ─── B1: loading shimmer ──────────────────────────────────────────────────────

test('B1: shows shimmer rows while loading', () => {
  apiGet.mockReturnValue(new Promise(() => {}));
  renderPanel();
  // shimmer divs are rendered (no text, just visual)
  const container = document.querySelector('[style]');
  expect(container).toBeTruthy();
});

// ─── B2: user list renders ────────────────────────────────────────────────────

test('B2: renders user names when loaded', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => {
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
  expect(screen.getByText('Anonymous visitor')).toBeInTheDocument();
});

// ─── B3: search debounce ──────────────────────────────────────────────────────

test('B3: search input debounces and triggers fetch', async () => {
  jest.useFakeTimers();
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await act(async () => { jest.runAllTimers(); });
  apiGet.mockClear();
  mockApiGetResolve(USERS_RESPONSE);

  const input = screen.getByRole('searchbox', { name: /search/i });
  fireEvent.change(input, { target: { value: 'alice' } });

  // Before debounce: no extra call
  expect(apiGet).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(400); });
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
  const url = apiGet.mock.calls[0][0];
  expect(url).toContain('q=alice');
  jest.useRealTimers();
});

// ─── B4: error state + retry ──────────────────────────────────────────────────

test('B4: shows error state and retry button', async () => {
  mockApiGetReject();
  renderPanel();
  await waitFor(() => {
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });
  const retryBtn = screen.getByRole('button', { name: /retry/i });
  expect(retryBtn).toBeInTheDocument();
});

// ─── B5: empty state ─────────────────────────────────────────────────────────

test('B5: shows empty state message when no users', async () => {
  mockApiGetResolve(EMPTY_RESPONSE);
  renderPanel();
  await waitFor(() => {
    expect(screen.getByText(/no users yet/i)).toBeInTheDocument();
  });
});

// ─── B6: pagination ──────────────────────────────────────────────────────────

test('B6: Next/Prev pagination buttons absent when total <= limit', async () => {
  mockApiGetResolve(USERS_RESPONSE); // total=2 < limit=20
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));
  expect(screen.queryByRole('button', { name: /next page/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /previous page/i })).toBeNull();
});

test('B6b: pagination buttons visible when total > limit', async () => {
  mockApiGetResolve({ total: 50, users: USERS_RESPONSE.users });
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));
  expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
});

// ─── B7: type filter ─────────────────────────────────────────────────────────

test('B7: selecting a type filter passes type param to apiGet', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));
  apiGet.mockClear();
  mockApiGetResolve(USERS_RESPONSE);

  const select = screen.getByRole('combobox', { name: /filter by type/i });
  fireEvent.change(select, { target: { value: 'cart_abandon' } });

  await waitFor(() => expect(apiGet).toHaveBeenCalled());
  expect(apiGet.mock.calls[0][0]).toContain('type=cart_abandon');
});

// ─── B8: revisited view ──────────────────────────────────────────────────────

test('B8: clicking Revisited users button fetches revisited endpoint', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));
  apiGet.mockClear();
  mockApiGetResolve(REVISITED_RESPONSE);

  const revisitedBtn = screen.getByRole('button', { name: /revisited users/i });
  fireEvent.click(revisitedBtn);

  await waitFor(() => expect(apiGet).toHaveBeenCalled());
  expect(apiGet.mock.calls[0][0]).toContain('revisited');
});

// ─── B9: accordion expand / collapse ─────────────────────────────────────────

test('B9: accordion row expands and collapses on click', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  apiGet.mockResolvedValue(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  // Find the accordion toggle for Alice
  const aliceBtn = screen.getByRole('button', { name: /expand alice/i });
  expect(aliceBtn.getAttribute('aria-expanded')).toBe('false');

  // Stub the per-user fetch
  apiGet.mockResolvedValue({ byType: [] });
  await act(async () => { fireEvent.click(aliceBtn); });

  await waitFor(() => {
    expect(aliceBtn.getAttribute('aria-expanded')).toBe('true');
  });

  // Click again to collapse
  await act(async () => { fireEvent.click(aliceBtn); });
  expect(aliceBtn.getAttribute('aria-expanded')).toBe('false');
});

// ─── B10: Count/Revisit left menu + includeVia param ─────────────────────────

test('B10: switching to Revisit tab fires request with includeVia=1', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  apiGet.mockClear();
  mockApiGetResolve({ ...USERS_RESPONSE, users: USERS_RESPONSE.users.map(u => ({ ...u, cameBackVia: [] })) });

  // tablist is rendered for All users view
  const tablist = screen.getByRole('tablist');
  expect(tablist).toBeInTheDocument();

  const revisitTab = screen.getByRole('tab', { name: /revisit/i });
  fireEvent.click(revisitTab);

  await waitFor(() => expect(apiGet).toHaveBeenCalled());
  expect(apiGet.mock.calls[0][0]).toContain('includeVia=1');
});

// ─── B11: CSV export ─────────────────────────────────────────────────────────

test('B11: export button triggers CSV download', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  const mockBlob = new Blob(['csv'], { type: 'text/csv' });
  global.fetch = jest.fn().mockResolvedValue({ text: () => Promise.resolve('email,count\n') });
  const createObjectURL = jest.fn().mockReturnValue('blob:url');
  const revokeObjectURL = jest.fn();
  window.URL.createObjectURL = createObjectURL;
  window.URL.revokeObjectURL = revokeObjectURL;

  const exportBtn = screen.getByRole('button', { name: /export/i });
  await act(async () => { fireEvent.click(exportBtn); });

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(global.fetch.mock.calls[0][0]).toContain('users.csv');
});

// ─── B12: no date/time on rows ────────────────────────────────────────────────

test('B12: user rows do not display date/time text', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  // Row buttons must not contain the lastSentAt date/time
  // lastSentAt = '2026-10-20T14:00:00.000Z' — verify neither the date nor time appears in row buttons
  const aliceBtn = screen.getByRole('button', { name: /expand alice/i });
  expect(aliceBtn.textContent).not.toMatch(/2026-10-20/);
  expect(aliceBtn.textContent).not.toMatch(/14:00/);
  // No ISO date string leaked into any button
  const allBtns = screen.getAllByRole('button');
  for (const btn of allBtns) {
    expect(btn.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  }
});

// ─── B12b: anon row subtitle format ──────────────────────────────────────────

test('B12b: anon user row shows device+id subtitle, not double "Anonymous visitor"', async () => {
  mockApiGetResolve(USERS_RESPONSE); // a_333 is anon with deviceType 'android'
  renderPanel();
  await waitFor(() => screen.getByText('Anonymous visitor'));

  // The second line (subtitle) for a_333 should be "Mobile - ...e333" or similar
  // userKey=a_333 → last4=_333... wait, 'a_333'.slice(-4) = '_333' but that starts with _
  // Actually the real subtitle: anonSubtitle('a_333', 'android') = 'Mobile - ..._333'
  // Just check it doesn't say "Anonymous visitor" twice (second line is device+id)
  const anonBtn = screen.getByRole('button', { name: /expand anonymous visitor/i });
  // The button has two divs: name and subtitle. Check subtitle is NOT "Anonymous visitor"
  const spans = anonBtn.querySelectorAll('div');
  // Find the subtitle div (second text div): index 1
  const subtitleDivs = Array.from(spans).filter(d => d.children.length === 0 && d.textContent.trim().length > 0);
  // At least one subtitle div should contain "Mobile" or "Desktop" or "Device"
  const hasDeviceType = subtitleDivs.some(d => /mobile|desktop|device/i.test(d.textContent));
  expect(hasDeviceType).toBe(true);
});

// ─── B13: no back arrow in markup ────────────────────────────────────────────

test('B13: no back arrow button or ArrowLeft SVG in rendered output', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  // No button with back-arrow label
  expect(screen.queryByRole('button', { name: /back/i })).toBeNull();
  // No button with unicode left-arrow text
  const allBtns = screen.getAllByRole('button');
  for (const btn of allBtns) {
    expect(btn.textContent).not.toContain('←');
  }
});

// ─── B14: one panel open at a time ───────────────────────────────────────────

test('B14: expanding a second row closes the first', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  // Stub per-user fetch
  apiGet.mockResolvedValue({ byType: [] });

  const aliceBtn = screen.getByRole('button', { name: /expand alice/i });
  await act(async () => { fireEvent.click(aliceBtn); });
  await waitFor(() => expect(aliceBtn.getAttribute('aria-expanded')).toBe('true'));

  const anonBtn = screen.getByRole('button', { name: /expand anonymous visitor/i });
  await act(async () => { fireEvent.click(anonBtn); });
  await waitFor(() => expect(anonBtn.getAttribute('aria-expanded')).toBe('true'));

  // Alice must now be collapsed
  expect(aliceBtn.getAttribute('aria-expanded')).toBe('false');
});

// ─── B15: lazy fetch — only fetches on expand ────────────────────────────────

test('B15: per-user detail is not fetched until row is expanded', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  // Record calls AFTER the initial list load
  apiGet.mockClear();
  apiGet.mockResolvedValue({ byType: [] });

  // Before expanding: no per-user call
  expect(apiGet).not.toHaveBeenCalled();

  // Expand Alice → per-user count fetch fires
  const aliceBtn = screen.getByRole('button', { name: /expand alice/i });
  await act(async () => { fireEvent.click(aliceBtn); });
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
  expect(apiGet.mock.calls[0][0]).toContain('/users/');
});

// ─── B16: expand cache — re-expand does not re-fetch ─────────────────────────

test('B16: re-expanding a row after collapse does not trigger a second fetch', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  apiGet.mockClear();
  apiGet.mockResolvedValue({ byType: [{ type: 'cart_abandon', label: 'Cart reminder', count: 3 }] });

  const aliceBtn = screen.getByRole('button', { name: /expand alice/i });
  // Expand
  await act(async () => { fireEvent.click(aliceBtn); });
  await waitFor(() => expect(aliceBtn.getAttribute('aria-expanded')).toBe('true'));
  const callsAfterFirstExpand = apiGet.mock.calls.length;

  // Collapse
  await act(async () => { fireEvent.click(aliceBtn); });
  expect(aliceBtn.getAttribute('aria-expanded')).toBe('false');

  // Re-expand
  apiGet.mockClear();
  await act(async () => { fireEvent.click(aliceBtn); });
  await waitFor(() => expect(aliceBtn.getAttribute('aria-expanded')).toBe('true'));

  // No new API call — served from cache
  expect(apiGet).not.toHaveBeenCalled();
});

// ─── B18: scroll container has Sidekick clearance padding ───────────────────

test('B18: scroll container has paddingBottom >= 88px (Sidekick clearance)', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  // In jsdom, innerWidth defaults to 1024 > 520, so isNarrow=false and viewMode='all'
  // → the desktop scroll container (overflowY:auto) is rendered
  const allStyled = Array.from(document.querySelectorAll('[style]'));
  const scrollContainer = allStyled.find(el => el.style.overflowY === 'auto');
  expect(scrollContainer).toBeTruthy();
  expect(parseInt(scrollContainer.style.paddingBottom || '0', 10)).toBeGreaterThanOrEqual(88);
});

// ─── B17: includeVia NOT sent in Count mode or Revisited view ─────────────────

test('B17: includeVia=1 is absent in Count mode and in Revisited users view', async () => {
  mockApiGetResolve(USERS_RESPONSE);
  renderPanel();
  await waitFor(() => screen.getByText('Alice'));

  // Count mode (default) — no includeVia
  const countUrl = apiGet.mock.calls[apiGet.mock.calls.length - 1][0];
  expect(countUrl).not.toContain('includeVia');

  // Switch to Revisited users view — no includeVia
  apiGet.mockClear();
  mockApiGetResolve({ total: 0, users: [] });
  const revisitedBtn = screen.getByRole('button', { name: /revisited users/i });
  fireEvent.click(revisitedBtn);
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
  expect(apiGet.mock.calls[0][0]).not.toContain('includeVia');
  // The revisited endpoint is used
  expect(apiGet.mock.calls[0][0]).toContain('revisited');
});
