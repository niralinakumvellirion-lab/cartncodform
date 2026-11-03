/**
 * The Email details drawer reuses the Push users panel (channel="email"):
 * same Count / Revisit / Revisited users views, pointed at the email endpoints.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { apiGet } from '../../../lib/api';
import PushUsersPanel from '../app/admin/dashboard/PushUsersPanel';
import { ChannelDrawer } from '../app/admin/dashboard/ChannelCards';

const SHOP = 'test.myshopify.com';
const FROM = '2026-10-01';
const TO = '2026-10-23';

const EMAIL_USERS = {
  total: 1,
  users: [
    { userKey: 'p_111', name: 'Alice', email: 'a***@shop.com', deviceType: null,
      lastSentAt: '2026-10-20T14:00:00.000Z', sentCount: 3, revisited: true,
      cameBackVia: [{ type: 'cart_abandon', label: 'Cart reminder', count: 1 }] },
  ],
};

function callsTo(fragment) {
  return apiGet.mock.calls.map((c) => c[0]).filter((u) => u.includes(fragment));
}

beforeEach(() => {
  jest.clearAllMocks();
  if (!window.shopify) window.shopify = { idToken: jest.fn().mockResolvedValue('t') };
});

describe('PushUsersPanel with channel="email"', () => {
  it('loads users from the email endpoint, never the push one', async () => {
    apiGet.mockResolvedValue(EMAIL_USERS);
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="email" />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(callsTo('/channels/email/users')).toHaveLength(1);
    expect(callsTo('/channels/push/')).toHaveLength(0);
  });

  it('defaults to push (existing behaviour unchanged)', async () => {
    apiGet.mockResolvedValue(EMAIL_USERS);
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(callsTo('/channels/push/users')).toHaveLength(1);
    expect(callsTo('/channels/email/')).toHaveLength(0);
  });

  it('opens the per-person count and revisit views from the email endpoints', async () => {
    apiGet.mockImplementation((url) => {
      if (url.includes('/count')) return Promise.resolve({ total: 3, byType: [{ type: 'cart_abandon', label: 'Cart reminder', count: 3 }] });
      if (url.includes('/revisit?')) return Promise.resolve({ summary: { sent: 3, revisitedAfter: 1, byType: [] }, notifications: [], page: 0, limit: 20 });
      return Promise.resolve(EMAIL_USERS);
    });
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="email" />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice'));
    await waitFor(() => expect(callsTo('/channels/email/users/p_111/count')).toHaveLength(1));
    // the type pill in the expanded Count view (the filter dropdown also lists the label)
    expect(screen.getAllByText('Cart reminder').some((el) => el.tagName === 'SPAN')).toBe(true);
    expect(callsTo('/channels/push/')).toHaveLength(0);
  });

  it('email recipients with no known address say "Email recipient", never "Device"', async () => {
    apiGet.mockResolvedValue({
      total: 1,
      users: [{ userKey: 'p_999', name: 'Anonymous visitor', email: null, deviceType: null,
        lastSentAt: '2026-10-20T14:00:00.000Z', sentCount: 1, revisited: false }],
    });
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="email" />);
    expect(await screen.findByText('Email recipient - ..._999')).toBeInTheDocument();
    expect(screen.queryByText(/Device -/)).not.toBeInTheDocument();
  });

  it('push anonymous visitors still say Device (unchanged)', async () => {
    apiGet.mockResolvedValue({
      total: 1,
      users: [{ userKey: 'a_333', name: 'Anonymous visitor', email: null, deviceType: 'android',
        lastSentAt: '2026-10-20T14:00:00.000Z', sentCount: 1, revisited: 'not_tracked' }],
    });
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} />);
    expect(await screen.findByText(/Mobile - \.\.\.a333|Mobile - \.\.\.\w{4}/)).toBeInTheDocument();
  });

  it('uses email wording in empty states', async () => {
    apiGet.mockResolvedValue({ total: 0, users: [] });
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="email" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisited users' }));
    expect(await screen.findByText(/opens your store from an email/)).toBeInTheDocument();
    expect(screen.queryByText(/from a notification/)).not.toBeInTheDocument();
  });

  it('shows the revisited users view from the email endpoint with email wording', async () => {
    apiGet.mockImplementation((url) => Promise.resolve(
      url.includes('/revisited')
        ? { total: 2, users: [{ userKey: 'p_1', name: 'Alice', email: 'a***@s.com', revisits: 2, lastVisitAt: '2026-10-20T15:00:00.000Z', cameBackVia: [] }] }
        : EMAIL_USERS
    ));
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="email" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisited users' }));
    expect(await screen.findByText(/came back from emails/)).toBeInTheDocument();
    expect(callsTo('/channels/email/revisited')).toHaveLength(1);
  });

  it('offers the email campaign type in the filter, and only for email', async () => {
    apiGet.mockResolvedValue(EMAIL_USERS);
    const { unmount } = render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="email" />);
    await screen.findByText('Alice');
    expect(screen.getByRole('option', { name: 'Email campaign' })).toBeInTheDocument();
    unmount();
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} />);
    await screen.findByText('Alice');
    expect(screen.queryByRole('option', { name: 'Email campaign' })).not.toBeInTheDocument();
  });
});

describe('ChannelDrawer', () => {
  function renderDrawer(channel, initialStatus) {
    return render(
      <ChannelDrawer shop={SHOP} channel={channel} initialStatus={initialStatus} onClose={() => {}} isMobileView={false} from={FROM} to={TO} />
    );
  }

  it('email Sent tab shows the users panel (same as push)', async () => {
    apiGet.mockResolvedValue(EMAIL_USERS);
    renderDrawer('email', 'sent');
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'All users' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisited users' })).toBeInTheDocument();
    expect(callsTo('/channels/email/users')).toHaveLength(1);
  });

  it('email Pending tab still uses the items list', async () => {
    apiGet.mockResolvedValue({ items: [], total: 0 });
    renderDrawer('email', 'pending');
    await waitFor(() => expect(callsTo('/channels/email/items')).toHaveLength(1));
    expect(callsTo('/channels/email/users')).toHaveLength(0);
  });

  it('push Sent tab is unchanged', async () => {
    apiGet.mockResolvedValue(EMAIL_USERS);
    renderDrawer('push', 'sent');
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(callsTo('/channels/push/users')).toHaveLength(1);
  });

  it('whatsapp Pending tab still uses the items list (it has the Send buttons)', async () => {
    apiGet.mockResolvedValue({ items: [], total: 0 });
    renderDrawer('whatsapp', 'pending');
    await waitFor(() => expect(callsTo('/channels/whatsapp/items')).toHaveLength(1));
    expect(callsTo('/channels/whatsapp/users')).toHaveLength(0);
  });
});
