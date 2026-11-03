/**
 * The WhatsApp details drawer reuses the same users panel (channel="whatsapp"):
 * Count / Revisit / Revisited users, pointed at the WhatsApp endpoints.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { apiGet } from '../../../lib/api';
import PushUsersPanel from '../app/admin/dashboard/PushUsersPanel';
import { ChannelDrawer } from '../app/admin/dashboard/ChannelCards';

const SHOP = 'test.myshopify.com';
const FROM = '2026-10-01';
const TO = '2026-10-23';

const WA_USERS = {
  total: 3,
  users: [
    { userKey: 'p_111', name: 'Asha', email: 'a***@shop.com', phone: '****3210', deviceType: null,
      lastSentAt: '2026-10-20T14:00:00.000Z', sentCount: 3, revisited: true },
    { userKey: 'p_222', name: 'Customer', email: null, phone: '****2222', deviceType: null,
      lastSentAt: '2026-10-19T14:00:00.000Z', sentCount: 1, revisited: false },
    { userKey: 'p_999', name: 'Anonymous visitor', email: null, phone: null, deviceType: null,
      lastSentAt: '2026-10-18T14:00:00.000Z', sentCount: 1, revisited: false },
  ],
};

function callsTo(fragment) {
  return apiGet.mock.calls.map((c) => c[0]).filter((u) => u.includes(fragment));
}

beforeEach(() => {
  jest.clearAllMocks();
  if (!window.shopify) window.shopify = { idToken: jest.fn().mockResolvedValue('t') };
});

describe('PushUsersPanel with channel="whatsapp"', () => {
  it('loads people from the whatsapp endpoint only', async () => {
    apiGet.mockResolvedValue(WA_USERS);
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="whatsapp" />);
    await waitFor(() => expect(screen.getByText('Asha')).toBeInTheDocument());
    expect(callsTo('/channels/whatsapp/users')).toHaveLength(1);
    expect(callsTo('/channels/push/')).toHaveLength(0);
    expect(callsTo('/channels/email/')).toHaveLength(0);
  });

  it('shows the masked email, or the masked phone when there is no email, or a WhatsApp contact label', async () => {
    apiGet.mockResolvedValue(WA_USERS);
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="whatsapp" />);
    await screen.findByText('Asha');
    expect(screen.getByText('a***@shop.com')).toBeInTheDocument();
    expect(screen.getByText('****2222')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp contact - ..._999')).toBeInTheDocument();
    expect(screen.queryByText(/Device -/)).not.toBeInTheDocument();
  });

  it('opens the per-person count view from the whatsapp endpoint', async () => {
    apiGet.mockImplementation((url) => {
      if (url.includes('/count')) return Promise.resolve({ total: 3, byType: [{ type: 'order', label: 'Order message', count: 3 }] });
      return Promise.resolve(WA_USERS);
    });
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="whatsapp" />);
    fireEvent.click(await screen.findByText('Asha'));
    await waitFor(() => expect(callsTo('/channels/whatsapp/users/p_111/count')).toHaveLength(1));
    expect(screen.getAllByText('Order message').some((el) => el.tagName === 'SPAN')).toBe(true);
  });

  it('offers only WhatsApp types in the filter (Follow-up, Order message)', async () => {
    apiGet.mockResolvedValue(WA_USERS);
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="whatsapp" />);
    await screen.findByText('Asha');
    expect(screen.getByRole('option', { name: 'Follow-up' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Order message' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cart reminder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Email campaign' })).not.toBeInTheDocument();
  });

  it('push and email filters do not show WhatsApp types', async () => {
    apiGet.mockResolvedValue({ total: 0, users: [] });
    const { unmount } = render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} />);
    await screen.findByRole('option', { name: 'Cart reminder' });
    expect(screen.queryByRole('option', { name: 'Follow-up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Order message' })).not.toBeInTheDocument();
    unmount();
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="email" />);
    await screen.findByRole('option', { name: 'Email campaign' });
    expect(screen.queryByRole('option', { name: 'Follow-up' })).not.toBeInTheDocument();
  });

  it('uses WhatsApp wording in the revisited view', async () => {
    apiGet.mockImplementation((url) => Promise.resolve(
      url.includes('/revisited')
        ? { total: 2, users: [{ userKey: 'p_1', name: 'Asha', email: null, phone: '****3210', revisits: 2, lastVisitAt: '2026-10-20T15:00:00.000Z', cameBackVia: [] }] }
        : WA_USERS
    ));
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="whatsapp" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisited users' }));
    expect(await screen.findByText(/came back from WhatsApp messages/)).toBeInTheDocument();
    expect(callsTo('/channels/whatsapp/revisited')).toHaveLength(1);
  });

  it('empty revisited state says WhatsApp message', async () => {
    apiGet.mockResolvedValue({ total: 0, users: [] });
    render(<PushUsersPanel shop={SHOP} from={FROM} to={TO} channel="whatsapp" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisited users' }));
    expect(await screen.findByText(/opens your store from a WhatsApp message/)).toBeInTheDocument();
  });
});

describe('ChannelDrawer for WhatsApp', () => {
  it('Sent tab shows the users panel', async () => {
    apiGet.mockResolvedValue(WA_USERS);
    render(<ChannelDrawer shop={SHOP} channel="whatsapp" initialStatus="sent" onClose={() => {}} isMobileView={false} from={FROM} to={TO} />);
    await waitFor(() => expect(screen.getByText('Asha')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Revisited users' })).toBeInTheDocument();
    expect(callsTo('/channels/whatsapp/users')).toHaveLength(1);
  });
});
