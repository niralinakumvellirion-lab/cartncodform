/**
 * Dashboard "Money earned" card.
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { apiGet } from '../../../lib/api';
import MoneyCard, { money, monthKey } from '../app/admin/dashboard/MoneyCard';

const SHOP = 'test.myshopify.com';
const DATA = {
  month: '2026-11', currency: 'INR', total: 48250, orders: 37, sent: 420, prevTotal: 40889, changePct: 18,
  byFeature: [
    { key: 'cart', label: 'Cart reminders', revenue: 21400, orders: 16 },
    { key: 'back_in_stock', label: 'Back in stock', revenue: 12600, orders: 10 },
    { key: 'price_drop', label: 'Price drop', revenue: 8250, orders: 7 },
  ],
  plan: { id: 'starter', name: 'Starter', price: 9.99, currency: 'USD' },
  returnMultiple: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  apiGet.mockResolvedValue(DATA);
});

test('helpers', () => {
  expect(money(48250, 'INR')).toBe('₹48,250');
  expect(money(1199.5, 'INR')).toBe('₹1,199.50');
  expect(money(9.99, 'USD')).toBe('$9.99');
  expect(monthKey(0, new Date('2026-11-20T10:00:00Z'))).toBe('2026-11');
  expect(monthKey(-1, new Date('2026-01-05T10:00:00Z'))).toBe('2025-12');
});

test('shows the total, change, orders, feature split and plan', async () => {
  render(<MoneyCard shop={SHOP} />);
  expect(await screen.findByTestId('money-total')).toHaveTextContent('₹48,250');
  expect(apiGet).toHaveBeenCalledWith(`/api/money/${SHOP}?month=${monthKey(0)}`);
  expect(screen.getByTestId('money-change')).toHaveTextContent('↑ 18% vs last month');
  const line = screen.getByText((_, el) => el.tagName === 'P' && /^from /.test(el.textContent));
  expect(line).toHaveTextContent('from 37 orders · 420 messages sent');
  const list = screen.getByRole('list', { name: 'Money by feature' });
  expect(within(list).getByText('Cart reminders')).toBeInTheDocument();
  expect(within(list).getByText('₹12,600')).toBeInTheDocument();
  expect(within(list).getByText('7 orders')).toBeInTheDocument();
  expect(screen.getByText(/Your plan:/)).toHaveTextContent('Your plan: Starter · $9.99/month');
  expect(screen.queryByTestId('money-roi')).toBeNull(); // INR store
});

test('Last month asks for last month; down change shown in red words', async () => {
  render(<MoneyCard shop={SHOP} />);
  await screen.findByTestId('money-total');
  apiGet.mockResolvedValue({ ...DATA, changePct: -12 });
  fireEvent.click(screen.getByRole('button', { name: 'Last month' }));
  await waitFor(() => expect(apiGet).toHaveBeenLastCalledWith(`/api/money/${SHOP}?month=${monthKey(-1)}`));
  expect(await screen.findByTestId('money-change')).toHaveTextContent('↓ 12% vs last month');
});

test('USD store shows the return multiple', async () => {
  apiGet.mockResolvedValue({ ...DATA, currency: 'USD', total: 499.5, returnMultiple: 50 });
  render(<MoneyCard shop={SHOP} />);
  expect(await screen.findByTestId('money-roi')).toHaveTextContent('≈ 50× what you pay');
  expect(screen.getByTestId('money-total')).toHaveTextContent('$499.50');
});

test('no sales yet → friendly empty note; error → message', async () => {
  apiGet.mockResolvedValue({ ...DATA, total: 0, orders: 0, byFeature: [], changePct: null, currency: null });
  const { unmount } = render(<MoneyCard shop={SHOP} />);
  expect(await screen.findByText(/No tracked sales yet this month/)).toBeInTheDocument();
  expect(screen.getByTestId('money-total')).toHaveTextContent('₹0');
  unmount();
  apiGet.mockRejectedValue(new Error('Could not load the money earned'));
  render(<MoneyCard shop={SHOP} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the money earned');
});
