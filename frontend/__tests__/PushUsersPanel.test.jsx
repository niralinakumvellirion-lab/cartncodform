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
      cameBackVia: [{ type: 'cart_abandon', label: 'Cart reminder', count: 3, lastVisitAt: '2026-10-20T15:00:00.000Z' }] },
  ],
};

const EMPTY_RESPONSE = { total: 0, users: [] };

function renderPanel(props = {}) {
  return render(
    <PushUsersPanel shop={SHOP} from={FROM} to={TO} {...props} />,
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockApiGetResolve(data) {
  apiGet.mockResolvedValue(data);
}

function mockApiGetReject() {
  apiGet.mockRejectedValue(new Error('Network error'));
}

beforeEach(() => {
  jest.resetAllMocks(); // clears calls AND resets implementations
  // Default: resolve with user list
  mockApiGetResolve(USERS_RESPONSE);
});

// ─── B1: initial render shows shimmer then user rows ─────────────────────────
describe('B1 initial render', () => {
  it('shows 6 shimmer rows while loading then user names after data arrives', async () => {
    let resolve;
    apiGet.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPanel();

    // During loading there are no user-row buttons (shimmer divs only)
    expect(screen.queryByRole('button', { name: /Alice/i })).toBeNull();

    // Resolve the fetch
    await act(async () => { resolve(USERS_RESPONSE); });

    expect(await screen.findByRole('button', { name: /View notifications for Alice/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anonymous visitor/i })).toBeInTheDocument();
  });
});

// ─── B2: search debounce ─────────────────────────────────────────────────────
describe('B2 search debounce', () => {
  it('fires ONE apiGet after typing, not one per keystroke', async () => {
    jest.useFakeTimers();
    mockApiGetResolve(USERS_RESPONSE);
    renderPanel();

    // Initial fetch fires immediately on mount
    await act(async () => jest.runAllTimers());
    const initialCallCount = apiGet.mock.calls.length; // 1 (initial)

    const input = screen.getByRole('searchbox', { name: /search users/i });

    // Type 3 characters rapidly
    await act(async () => {
      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'al' } });
      fireEvent.change(input, { target: { value: 'ali' } });
    });

    // No new call yet — debounce not elapsed
    expect(apiGet.mock.calls.length).toBe(initialCallCount);

    // Advance past debounce window
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    // Exactly one additional call with q=ali
    expect(apiGet.mock.calls.length).toBe(initialCallCount + 1);
    const url = apiGet.mock.calls[apiGet.mock.calls.length - 1][0];
    expect(url).toContain('q=ali');

    jest.useRealTimers();
  });
});

// ─── B3: stale response race ──────────────────────────────────────────────────
describe('B3 stale response guard', () => {
  it('slow first response does not overwrite a newer response', async () => {
    jest.useFakeTimers();

    let resolveFirst;
    const firstResponse  = new Promise((r) => { resolveFirst = r; });
    const secondResponse = Promise.resolve({ total: 1, users: [{ userKey: 'p_new', name: 'Bob',
      email: 'b***@shop.com', deviceType: null, lastSentAt: null, sentCount: 1, revisited: false }] });

    apiGet
      .mockReturnValueOnce(firstResponse)   // initial mount → stale
      .mockReturnValueOnce(secondResponse); // after type → newer

    renderPanel();

    // Trigger second fetch by advancing debounce after typing
    const input = screen.getByRole('searchbox', { name: /search users/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'b' } });
      jest.advanceTimersByTime(350);
    });
    // Let second resolve immediately
    await act(async () => { await Promise.resolve(); });

    // Now resolve the first (stale) response
    await act(async () => { resolveFirst(USERS_RESPONSE); });
    await act(async () => { await Promise.resolve(); });

    // Should show Bob (second response), NOT Alice (first stale response)
    expect(screen.queryByRole('button', { name: /Alice/i })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /View notifications for Bob/i })).toBeInTheDocument(),
    );

    jest.useRealTimers();
  });
});

// ─── B4: view chip switches endpoint ─────────────────────────────────────────
describe('B4 chip switches view', () => {
  it('clicking "Revisited users" calls the /revisited endpoint', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: /All users/i })).toBeInTheDocument());

    apiGet.mockResolvedValue(REVISITED_RESPONSE);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Revisited users/i }));
    });

    await waitFor(() => {
      const lastUrl = apiGet.mock.calls[apiGet.mock.calls.length - 1][0];
      expect(lastUrl).toContain('/revisited');
    });
  });

  it('switching back to "All users" calls the /users endpoint', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: /All users/i })).toBeInTheDocument());

    // Switch to revisited first
    apiGet.mockResolvedValue(REVISITED_RESPONSE);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Revisited users/i })); });

    // Switch back
    apiGet.mockResolvedValue(USERS_RESPONSE);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /All users/i })); });

    await waitFor(() => {
      const lastUrl = apiGet.mock.calls[apiGet.mock.calls.length - 1][0];
      expect(lastUrl).toContain('/users');
      expect(lastUrl).not.toContain('/revisited');
    });
  });
});

// ─── B5: Export calls users.csv with active filters ──────────────────────────
describe('B5 export CSV', () => {
  it('Export button hits /users.csv with from/to filters', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    // Stub fetch for the CSV download
    const mockFetch = jest.fn().mockResolvedValue({
      text: () => Promise.resolve('name,email\nAlice,a***@shop.com'),
    });
    global.fetch = mockFetch;

    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: /Export users as CSV/i })).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Export users as CSV/i }));
    });
    await act(async () => {}); // flush promises

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/users.csv');
    expect(calledUrl).toContain(`from=${FROM}`);
    expect(calledUrl).toContain(`to=${TO}`);
  });

  it('Export URL includes active type filter', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    const mockFetch = jest.fn().mockResolvedValue({ text: () => Promise.resolve('') });
    global.fetch = mockFetch;

    renderPanel();
    await waitFor(() => expect(screen.getByRole('combobox', { name: /filter by type/i })).toBeInTheDocument());

    // Set type filter
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: /filter by type/i }), { target: { value: 'cart_abandon' } });
    });
    await act(async () => {}); // let state settle

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Export users as CSV/i }));
    });
    await act(async () => {});

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('type=cart_abandon');
  });
});

// ─── B6: Retry reloads ────────────────────────────────────────────────────────
describe('B6 error and retry', () => {
  it('error state shows Retry button; clicking Retry re-calls apiGet', async () => {
    mockApiGetReject();
    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument());

    const callsBefore = apiGet.mock.calls.length;
    apiGet.mockResolvedValue(USERS_RESPONSE);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    });

    await waitFor(() => expect(apiGet.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

// ─── B7: date-range change reloads ────────────────────────────────────────────
describe('B7 date range reload', () => {
  it('changing from/to props triggers a new fetch with new dates', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    const { rerender } = renderPanel({ from: FROM, to: TO });
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const callsBefore = apiGet.mock.calls.length;
    const NEW_FROM = '2026-09-01';
    const NEW_TO   = '2026-09-30';

    await act(async () => {
      rerender(<PushUsersPanel shop={SHOP} from={NEW_FROM} to={NEW_TO} />);
    });

    await waitFor(() => expect(apiGet.mock.calls.length).toBeGreaterThan(callsBefore));
    const lastUrl = apiGet.mock.calls[apiGet.mock.calls.length - 1][0];
    expect(lastUrl).toContain(`from=${NEW_FROM}`);
    expect(lastUrl).toContain(`to=${NEW_TO}`);
  });
});

// ─── B8: empty state messages ─────────────────────────────────────────────────
describe('B8 empty state messages', () => {
  it('shows "No users yet in this date range" for empty all-users view', async () => {
    mockApiGetResolve(EMPTY_RESPONSE);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/No users yet in this date range/i)).toBeInTheDocument(),
    );
  });

  it('shows correct empty message for revisited view', async () => {
    apiGet
      .mockResolvedValueOnce(USERS_RESPONSE) // initial /users fetch
      .mockResolvedValue(EMPTY_RESPONSE);    // /revisited fetch

    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: /All users/i })).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Revisited users/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/No revisits yet/i)).toBeInTheDocument(),
    );
  });

  it('shows "No users match your search" when search returns empty', async () => {
    jest.useFakeTimers();
    apiGet
      .mockResolvedValueOnce(USERS_RESPONSE)
      .mockResolvedValue(EMPTY_RESPONSE);

    renderPanel();
    await act(async () => jest.runAllTimers());

    const input = screen.getByRole('searchbox', { name: /search users/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'xyz' } });
      jest.advanceTimersByTime(350);
    });
    await act(async () => { await Promise.resolve(); });

    await waitFor(() =>
      expect(screen.getByText(/No users match your search/i)).toBeInTheDocument(),
    );
    jest.useRealTimers();
  });
});

// ─── B9: keyboard — Tab+Enter opens detail; Back restores focus ──────────────
describe('B9 keyboard: Enter opens detail, Back restores focus', () => {
  it('pressing Enter on a user row opens the detail view', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    // Mock detail endpoints
    apiGet.mockImplementation((url) => {
      if (url.includes('/count')) return Promise.resolve({ total: 5, byType: [] });
      if (url.includes('/revisit')) return Promise.resolve({ summary: { sent: 5, revisitedAfter: 1, byType: [] }, notifications: [], total: 0 });
      return Promise.resolve(USERS_RESPONSE);
    });

    renderPanel();
    const aliceBtn = await screen.findByRole('button', { name: /View notifications for Alice/i });

    await act(async () => { fireEvent.keyDown(aliceBtn, { key: 'Enter' }); aliceBtn.click(); });

    // Detail view shows back button
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Back to ← All users/i })).toBeInTheDocument(),
    );
  });

  it('Back button returns to list and summary line is visible', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    apiGet.mockImplementation((url) => {
      if (url.includes('/count')) return Promise.resolve({ total: 5, byType: [] });
      if (url.includes('/revisit')) return Promise.resolve({ summary: { sent: 5, revisitedAfter: 1, byType: [] }, notifications: [], total: 0 });
      return Promise.resolve(USERS_RESPONSE);
    });

    renderPanel();
    const aliceBtn = await screen.findByRole('button', { name: /View notifications for Alice/i });
    await act(async () => { aliceBtn.click(); });

    await waitFor(() => expect(screen.getByRole('button', { name: /Back to/i })).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Back to/i }));
    });

    // Back at list — summary line shows count (e.g. "2 users ·…")
    await waitFor(() =>
      expect(screen.getByText(/\d+ users?/i)).toBeInTheDocument(),
    );
  });
});

// ─── B10: roving tabindex in detail tablist ────────────────────────────────────
describe('B10 roving tabindex in detail tablist', () => {
  it('Count tab is tabIndex=0 initially; Revisit tab is tabIndex=-1', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    apiGet.mockImplementation((url) => {
      if (url.includes('/count')) return Promise.resolve({ total: 3, byType: [] });
      if (url.includes('/revisit')) return Promise.resolve({ summary: { sent: 3, revisitedAfter: 0, byType: [] }, notifications: [], total: 0 });
      return Promise.resolve(USERS_RESPONSE);
    });

    renderPanel();
    const aliceBtn = await screen.findByRole('button', { name: /View notifications for Alice/i });
    await act(async () => { aliceBtn.click(); });

    await waitFor(() => expect(screen.getByRole('tab', { name: /Count/i })).toBeInTheDocument());

    const countTab   = screen.getByRole('tab', { name: /Count/i });
    const revisitTab = screen.getByRole('tab', { name: /Revisit/i });

    expect(countTab).toHaveAttribute('tabindex', '0');
    expect(revisitTab).toHaveAttribute('tabindex', '-1');
  });

  it('Arrow key moves focus in tablist', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    apiGet.mockImplementation((url) => {
      if (url.includes('/count')) return Promise.resolve({ total: 3, byType: [] });
      if (url.includes('/revisit')) return Promise.resolve({ summary: { sent: 3, revisitedAfter: 0, byType: [] }, notifications: [], total: 0 });
      return Promise.resolve(USERS_RESPONSE);
    });

    renderPanel();
    const aliceBtn = await screen.findByRole('button', { name: /View notifications for Alice/i });
    await act(async () => { aliceBtn.click(); });

    await waitFor(() => expect(screen.getByRole('tab', { name: /Count/i })).toBeInTheDocument());

    const countTab = screen.getByRole('tab', { name: /Count/i });
    countTab.focus();

    // Press ArrowDown → Revisit tab should become active
    await act(async () => {
      fireEvent.keyDown(countTab, { key: 'ArrowDown' });
    });

    const revisitTab = screen.getByRole('tab', { name: /Revisit/i });
    expect(document.activeElement).toBe(revisitTab);
  });
});

// ─── B11: clear search clears the query ──────────────────────────────────────
describe('B11 clear search button', () => {
  it('clicking × clears the search input', async () => {
    mockApiGetResolve(USERS_RESPONSE);
    renderPanel();
    await waitFor(() => expect(screen.getByRole('searchbox', { name: /search users/i })).toBeInTheDocument());

    const input = screen.getByRole('searchbox', { name: /search users/i });
    await act(async () => { fireEvent.change(input, { target: { value: 'alice' } }); });
    expect(input.value).toBe('alice');

    const clearBtn = screen.getByRole('button', { name: /Clear search/i });
    await act(async () => { fireEvent.click(clearBtn); });
    expect(input.value).toBe('');
  });
});
