/**
 * Admin "Price drop" screen (the Back in stock screen with kind="price") + preview.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import BackInStockScreen, { shopMoney } from '../app/admin/screens/BackInStock';
import BackInStockPreview, { PRICE_TEXT_DEFAULTS } from '../app/admin/screens/BackInStockPreview';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const SHOP = 'test.myshopify.com';
const SETTINGS = {
  enabled: true, channels: { push: true, email: true, whatsapp: true }, minDropPercent: 5, whatsappPercent: 80,
  accentColor: '#111827', buttonRadius: 8, texts: { ...PRICE_TEXT_DEFAULTS },
};
const OVERVIEW = {
  waitingTotal: 2, whatsappToSend: 0,
  waiting: [{ variantId: '10', productTitle: 'Cotton Kurta', variantTitle: 'M', count: 2, push: 0, email: 1, whatsapp: 1, since: new Date().toISOString(), basePrice: 1499, currencyCode: 'INR' }],
  last30: { sent: 4, clicked: 2, orders: 1, revenue: 1199 },
};

beforeEach(() => {
  jest.clearAllMocks();
  apiGet.mockImplementation((url) => Promise.resolve(
    url.endsWith('/overview') ? JSON.parse(JSON.stringify(OVERVIEW))
      : url.endsWith('/whatsapp') ? { toSend: [] }
        : { settings: JSON.parse(JSON.stringify(SETTINGS)) }
  ));
  apiSend.mockImplementation((url, method, body) => Promise.resolve({ settings: body.settings }));
});

async function renderScreen() {
  render(<BackInStockScreen shop={SHOP} kind="price" />);
  await screen.findByRole('switch', { name: 'Turn on Price drop' });
}

test('money formatting', () => {
  expect(shopMoney(1499, 'INR')).toBe('₹1,499');
  expect(shopMoney(19.5, 'USD')).toBe('$19.50');
});

test('loads from /api/price-drop; title, waiting list with the price at sign-up', async () => {
  await renderScreen();
  expect(apiGet).toHaveBeenCalledWith(`/api/price-drop/${SHOP}/config`);
  expect(apiGet).toHaveBeenCalledWith(`/api/price-drop/${SHOP}/overview`);
  expect(screen.getByRole('heading', { name: 'Price drop' })).toBeInTheDocument();
  const list = await screen.findByRole('table', { name: 'Waiting list' });
  expect(within(list).getByText('Price then')).toBeInTheDocument();
  expect(within(list).getByText('₹1,499')).toBeInTheDocument();
  expect(within(list).getByText('1 WhatsApp · 1 email')).toBeInTheDocument();
});

test('price-drop settings: minimum drop, no Replace Buy it now, no email wait; saved to /api/price-drop', async () => {
  await renderScreen();
  expect(screen.queryByRole('switch', { name: 'Replace Buy it now' })).toBeNull();
  expect(screen.queryByLabelText('Send email alerts after')).toBeNull();
  fireEvent.change(screen.getByLabelText('Minimum price drop'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Price line'), { target: { value: 'Today {price}' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalled());
  const [url, method, body] = apiSend.mock.calls[0];
  expect(url).toBe(`/api/price-drop/${SHOP}/config`);
  expect(method).toBe('PUT');
  expect(body.settings.minDropPercent).toBe(10);
  expect(body.settings.texts.boxTitle).toBe('Today {price}');
});

test('preview: in-stock product with Add to cart + Buy it now, "Now ₹1,499", messages with ₹1,199 (was ₹1,499)', async () => {
  await renderScreen();
  const box = screen.getByTestId('preview-box');
  expect(within(box).getByText('Add to cart')).toBeInTheDocument();
  expect(within(box).getByText('Buy it now')).toBeInTheDocument();
  expect(within(box).getByText('Now ₹1,499')).toBeInTheDocument();
  expect(within(box).getByText('Notify me if the price drops')).toBeInTheDocument();
  const msgs = screen.getByTestId('preview-messages');
  expect(within(msgs).getByText('Price drop! Cotton Kurta is now ₹1,199')).toBeInTheDocument();
  expect(within(msgs).getByText(/Cotton Kurta is now ₹1,199 \(was ₹1,499\)/)).toBeInTheDocument();
  expect(screen.getAllByText('Message when the price drops').length).toBeGreaterThanOrEqual(2); // section + preview
});

test('off state uses the Price drop words', async () => {
  apiGet.mockImplementation((url) => Promise.resolve(
    url.endsWith('/overview') ? OVERVIEW : url.endsWith('/whatsapp') ? { toSend: [] } : { settings: { ...SETTINGS, enabled: false } }
  ));
  await renderScreen();
  expect(screen.getByText('Price drop is off')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Turn on Price drop' })).toBeInTheDocument();
});

test('restock preview is unchanged by default (kind restock)', () => {
  render(<BackInStockPreview settings={{ ...SETTINGS, channels: { push: false, email: true } }} />);
  expect(document.querySelector('.bp-soldout')).not.toBeNull();
  expect(document.querySelector('.bp-addcart')).toBeNull();
});
