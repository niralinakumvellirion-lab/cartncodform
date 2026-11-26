/**
 * Admin "Back in stock" screen + preview (jsdom + React Testing Library).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import BackInStockScreen, { cornerValue, formatMoney, waitingSince } from '../app/admin/screens/BackInStock';
import BackInStockPreview, { restockText, restockRadius, RESTOCK_TEXT_DEFAULTS } from '../app/admin/screens/BackInStockPreview';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const SHOP = 'test.myshopify.com';
const SETTINGS = {
  enabled: true, channels: { push: true, email: true }, accentColor: '#111827', buttonRadius: 8,
  texts: { ...RESTOCK_TEXT_DEFAULTS },
};
const OVERVIEW = {
  waitingTotal: 3,
  waiting: [{ variantId: '10', productTitle: 'Cotton Kurta', variantTitle: 'M', imageUrl: '', count: 2, push: 1, email: 1, since: new Date().toISOString() }],
  last30: { sent: 12, clicked: 5, orders: 2, revenue: 2598 },
};

const PEOPLE = [
  { id: 'r1', variantId: '10', channel: 'email', email: 'asha@example.com', customerId: '55', profileId: 'p1', createdAt: new Date().toISOString() },
  { id: 'r2', variantId: '10', channel: 'push', email: null, customerId: null, profileId: null, createdAt: new Date().toISOString() },
];

let WA_TO_SEND = [];

function mockApi(settings = SETTINGS, overview = OVERVIEW) {
  apiGet.mockImplementation((url) => Promise.resolve(
    url.endsWith('/overview') ? JSON.parse(JSON.stringify(overview))
      : url.includes('/waiting') ? { people: PEOPLE }
        : url.endsWith('/whatsapp') ? { toSend: WA_TO_SEND }
          : { settings: JSON.parse(JSON.stringify(settings)) }
  ));
  apiSend.mockImplementation((url, method, body) => Promise.resolve({ settings: body.settings }));
}

beforeEach(() => {
  jest.clearAllMocks();
  WA_TO_SEND = [];
  mockApi();
});

async function renderScreen() {
  render(<BackInStockScreen shop={SHOP} />);
  await screen.findByRole('switch', { name: 'Turn on Back in stock' });
}
async function saved() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalled());
  const [url, method, body] = apiSend.mock.calls[0];
  expect(url).toBe(`/api/restock/${SHOP}/config`);
  expect(method).toBe('PUT');
  return body.settings;
}
const lit = () => Array.from(document.querySelectorAll('.bp .is-hl'));

describe('helpers', () => {
  test('corner value, money, waiting since', () => {
    expect(cornerValue(undefined)).toBe(8);
    expect(cornerValue(99)).toBe(24);
    expect(formatMoney(2598)).toBe('₹2,598');
    expect(waitingSince(Date.now())).toBe('today');
    expect(waitingSince(Date.now() - 3 * 24 * 3600 * 1000)).toBe('3 days');
  });
  test('preview text fills {product}/{size}; empty → default', () => {
    expect(restockText({ pushTitle: '{size} {product}!' }, 'pushTitle')).toBe('M Cotton Kurta!');
    expect(restockText({ pushTitle: '  ' }, 'pushTitle')).toBe('Cotton Kurta is back in stock 🎉');
    expect(restockRadius(24)).toBe('999px');
    expect(restockRadius(4)).toBe('4px');
  });
});

describe('Back in stock screen', () => {
  test('loads settings, results and the waiting list', async () => {
    await renderScreen();
    expect(apiGet).toHaveBeenCalledWith(`/api/restock/${SHOP}/config`);
    expect(apiGet).toHaveBeenCalledWith(`/api/restock/${SHOP}/overview`);
    const results = screen.getByRole('region', { name: 'Results' });
    await within(results).findByText('₹2,598');
    expect(within(results).getByText('12')).toBeInTheDocument();
    const list = screen.getByRole('table', { name: 'Waiting list' });
    expect(within(list).getByText('Cotton Kurta')).toBeInTheDocument();
    expect(within(list).getByText('1 push · 1 email')).toBeInTheDocument();
  });

  test('View shows who is waiting for a size; Open customer goes to the customer', async () => {
    await renderScreen();
    const list = await screen.findByRole('table', { name: 'Waiting list' });
    const view = within(list).getByRole('button', { name: /View who is waiting for Cotton Kurta M/ });
    fireEvent.click(view);
    expect(apiGet).toHaveBeenCalledWith(`/api/restock/${SHOP}/waiting?variantId=10`);
    const people = await screen.findByRole('list', { name: 'People waiting' });
    expect(within(people).getByText('asha@example.com')).toBeInTheDocument();
    expect(within(people).getByText(/Logged-in customer/)).toBeInTheDocument();
    expect(within(people).getByText('Push subscriber (no email yet)')).toBeInTheDocument();
    fireEvent.click(within(people).getByRole('button', { name: 'Open customer' }));
    expect(mockPush).toHaveBeenCalledWith(`/admin/customers/p1?shop=${encodeURIComponent(SHOP)}`);
    fireEvent.click(within(list).getByRole('button', { name: /Hide who is waiting/ }));
    expect(screen.queryByRole('list', { name: 'People waiting' })).toBeNull();
  });

  test('empty waiting list shows a tip', async () => {
    mockApi(SETTINGS, { ...OVERVIEW, waitingTotal: 0, waiting: [] });
    await renderScreen();
    await screen.findByText(/No one is waiting yet/);
  });

  test('edits words, colour, corners and channels, then saves', async () => {
    await renderScreen();
    fireEvent.change(screen.getByLabelText('Button text'), { target: { value: 'Alert me' } });
    fireEvent.change(screen.getByLabelText('Push title'), { target: { value: '{product} is here!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Round' }));
    fireEvent.change(screen.getByLabelText('Colour hex'), { target: { value: '#ff0000' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Notify by email' }));
    const s = await saved();
    expect(s.texts.buttonText).toBe('Alert me');
    expect(s.texts.pushTitle).toBe('{product} is here!');
    expect(s.buttonRadius).toBe(24);
    expect(s.accentColor).toBe('#ff0000');
    expect(s.channels).toEqual({ push: true, email: false });
    expect(screen.queryByLabelText('Email subject')).toBeNull(); // email texts hidden when email is off
  });

  test('cannot turn off both channels', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('switch', { name: 'Notify by email' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Notify by push' }));
    expect(screen.getByRole('switch', { name: 'Notify by push' })).toHaveAttribute('aria-checked', 'true');
  });

  test('off: no settings or preview, a turn-on card; turning on shows them', async () => {
    mockApi({ ...SETTINGS, enabled: false });
    await renderScreen();
    expect(screen.getByText('Back in stock is off')).toBeInTheDocument();
    expect(screen.queryByLabelText('Button text')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Live preview' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on Back in stock' }));
    expect(screen.getByLabelText('Button text')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Live preview' })).toBeInTheDocument();
    expect((await saved()).enabled).toBe(true);
  });

  test('preview updates as you type', async () => {
    await renderScreen();
    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'Gone for now' } });
    expect(within(screen.getByTestId('preview-box')).getByText('Gone for now')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Push text'), { target: { value: 'Size {size} is back!' } });
    expect(within(screen.getByTestId('preview-messages')).getByText('Size M is back!')).toBeInTheDocument();
  });

  test('preview follows the section and highlights the field being edited', async () => {
    await renderScreen();
    expect(screen.getByTestId('preview-box')).toBeInTheDocument();
    expect(screen.getByTestId('preview-messages')).toBeInTheDocument();
    expect(lit()).toHaveLength(0);

    fireEvent.focus(screen.getByLabelText('Heading'));
    expect(screen.queryByTestId('preview-messages')).toBeNull();
    expect(lit().map((e) => e.className.split(' ')[0])).toEqual(['bp-title']);
    expect(screen.getByTestId('preview-editing')).toHaveTextContent('Editing: Heading');

    fireEvent.focus(screen.getByLabelText('After sign-up')); // switches the box to its "after" state
    expect(lit()[0].className).toContain('bp-done');

    fireEvent.focus(screen.getByLabelText('Email subject'));
    expect(screen.queryByTestId('preview-box')).toBeNull();
    expect(lit()[0].className).toContain('bp-subject');

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByTestId('preview-box')).toBeInTheDocument();
  });

  test('save error is shown', async () => {
    apiSend.mockRejectedValue(new Error('Use a colour like #111827'));
    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a colour like #111827');
  });
});

describe('preview', () => {
  test('email-only box uses the main button style; no push card', () => {
    render(<BackInStockPreview settings={{ ...SETTINGS, channels: { push: false, email: true } }} />);
    expect(document.querySelector('.bp-form.is-only')).not.toBeNull();
    expect(document.querySelector('.bp-notif')).toBeNull();
    expect(document.querySelector('.bp-or')).toBeNull();
  });
});

describe('WhatsApp (seller sends by hand) and email wait', () => {
  test('turning WhatsApp on shows its words, message and the email wait; saves them', async () => {
    await renderScreen();
    expect(screen.queryByLabelText('WhatsApp message')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Notify by whatsapp' }));
    fireEvent.change(screen.getByLabelText('WhatsApp box hint'), { target: { value: 'Your WhatsApp' } });
    fireEvent.change(screen.getByLabelText('WhatsApp message'), { target: { value: 'Hi, {product} is back: {link}' } });
    fireEvent.change(screen.getByLabelText('Send email alerts after'), { target: { value: '120' } });
    const s = await saved();
    expect(s.channels).toEqual({ push: true, email: true, whatsapp: true });
    expect(s.texts.whatsappPlaceholder).toBe('Your WhatsApp');
    expect(s.texts.whatsappMessage).toBe('Hi, {product} is back: {link}');
    expect(s.emailDelayMinutes).toBe(120);
  });

  test('preview: WhatsApp first with Fastest, email note shows the wait, WhatsApp bubble', async () => {
    mockApi({ ...SETTINGS, channels: { push: true, email: true, whatsapp: true }, emailDelayMinutes: 240 });
    await renderScreen();
    const box = screen.getByTestId('preview-box');
    expect(within(box).getByText('Fastest')).toBeInTheDocument();
    expect(within(box).getByText('WhatsApp number')).toBeInTheDocument();
    expect(within(box).getByText('We email you within 4 hours of the restock')).toBeInTheDocument();
    expect(within(box).getByText(/Get a browser alert/)).toBeInTheDocument();
    const order = Array.from(box.querySelectorAll('.bp-body > *')).map((e) => e.className.split(' ')[0]);
    expect(order[0]).toBe('bp-opt'); // WhatsApp row first
    const msgs = screen.getByTestId('preview-messages');
    expect(within(msgs).getByText(/Cotton Kurta \(M\) is back in stock/)).toBeInTheDocument();
    expect(within(msgs).getByText('WhatsApp · you send it')).toBeInTheDocument();
  });

  test('Send on WhatsApp card: opens the wa.me link and marks it sent', async () => {
    WA_TO_SEND = [{ id: 'a1', phone: '+919876543210', productTitle: 'Cotton Kurta', variantTitle: 'M', waLink: 'https://wa.me/919876543210?text=hi' }];
    await renderScreen();
    const card = await screen.findByRole('region', { name: 'Send on WhatsApp' });
    expect(within(card).getByText('+919876543210')).toBeInTheDocument();
    const link = within(card).getByRole('link', { name: 'Send on WhatsApp' });
    expect(link).toHaveAttribute('href', 'https://wa.me/919876543210?text=hi');
    expect(link).toHaveAttribute('target', '_blank');
    fireEvent.click(link);
    expect(apiSend).toHaveBeenCalledWith(`/api/restock/${SHOP}/whatsapp/a1/sent`, 'POST', {});
    expect(screen.queryByRole('region', { name: 'Send on WhatsApp' })).toBeNull();
  });

  test('no WhatsApp alerts → no card', async () => {
    await renderScreen();
    expect(screen.queryByRole('region', { name: 'Send on WhatsApp' })).toBeNull();
  });
});
