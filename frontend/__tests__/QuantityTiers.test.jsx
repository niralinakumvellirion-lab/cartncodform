/**
 * Quantity tiers section of the Discounts screen: the on/off switch must be obvious,
 * and saving must send the chosen state (jsdom + React Testing Library).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { apiSend } from '../../../lib/api';
import QuantityTiers from '../app/admin/screens/QuantityTiers';

const SHOP = 'test.myshopify.com';

function renderTiers(enabled) {
  const onSaveComplete = jest.fn();
  render(
    <QuantityTiers
      shopDomain={SHOP}
      onSaveComplete={onSaveComplete}
      config={{ quantityTiers: { enabled, heading: 'Buy more, save more', accentColor: '#4F46E5', layout: 'cards', tiers: [{ minQty: 2, percent: 10, badge: '' }] } }}
    />
  );
  return { onSaveComplete };
}

const sw = () => screen.getByRole('switch', { name: 'Enable quantity tiers' });

beforeEach(() => jest.clearAllMocks());

describe('on/off switch', () => {
  it('shows the word Off beside the switch and a warning that shoppers see nothing', () => {
    renderTiers(false);
    expect(sw()).toHaveAttribute('aria-checked', 'false');
    expect(sw().previousElementSibling).toHaveTextContent('Off');
    expect(screen.getByRole('status')).toHaveTextContent('do not see the discount cards');
  });

  it('shows On and no warning when it is on', () => {
    renderTiers(true);
    expect(sw()).toHaveAttribute('aria-checked', 'true');
    expect(sw().previousElementSibling).toHaveTextContent('On');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('turning it on swaps the word and removes the warning', () => {
    renderTiers(false);
    fireEvent.click(sw());
    expect(sw().previousElementSibling).toHaveTextContent('On');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is a plain button, so it never submits a form', () => {
    renderTiers(false);
    expect(sw()).toHaveAttribute('type', 'button');
  });
});

describe('saving', () => {
  it('sends enabled: true after switching on, and shows Synced', async () => {
    apiSend.mockResolvedValue({ updated: true, synced: true, config: { quantityTiers: { enabled: true } } });
    const { onSaveComplete } = renderTiers(false);
    fireEvent.click(sw());
    fireEvent.click(screen.getByRole('button', { name: 'Save and sync to Shopify' }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
    const [url, method, body] = apiSend.mock.calls[0];
    expect(url).toBe(`/api/discounts/${SHOP}/config`);
    expect(method).toBe('PATCH');
    expect(body.quantityTiers.enabled).toBe(true);
    expect(await screen.findByText('✓ Synced to Shopify')).toBeInTheDocument();
    expect(onSaveComplete).toHaveBeenCalled();
  });

  it('shows the reason when the Shopify sync fails', async () => {
    apiSend.mockResolvedValue({ updated: true, synced: false, syncError: 'Token expired' });
    renderTiers(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save and sync to Shopify' }));
    expect(await screen.findByText(/Shopify sync failed: Token expired/)).toBeInTheDocument();
  });
});
