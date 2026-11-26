/**
 * Admin "Back in stock" screen + preview (jsdom + React Testing Library).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import BackInStockScreen, { cornerValue, formatMoney, waitingSince } from '../app/admin/screens/BackInStock';
import BackInStockPreview, { restockText, restockRadius, RESTOCK_TEXT_DEFAULTS } from '../app/admin/screens/BackInStockPreview';

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

function mockApi(settings = SETTINGS, overview = OVERVIEW) {
  apiGet.mockImplementation((url) => Promise.resolve(
    url.endsWith('/overview') ? JSON.parse(JSON.stringify(overview)) : { settings: JSON.parse(JSON.stringify(settings)) }
  ));
  apiSend.mockImplementation((url, method, body) => Promise.resolve({ settings: body.settings }));
}

beforeEach(() => {
  jest.clearAllMocks();
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
