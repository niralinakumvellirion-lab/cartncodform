/**
 * PlanGate — shows "Start your free trial" until the store has an active plan.
 * Mocks: __mocks__/api.js (apiGet, apiSend), window.open.
 */
import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import PlanGate from '../app/admin/components/PlanGate';

const SHOP = 'gate.myshopify.com';

beforeEach(() => {
  jest.clearAllMocks();
  window.history.pushState({}, '', `/admin/dashboard?shop=${SHOP}`);
  window.open = jest.fn();
});

function renderGate() {
  return render(
    <PlanGate>
      <div>APP CONTENT</div>
    </PlanGate>
  );
}

describe('PlanGate', () => {
  it('shows the app when the store has access', async () => {
    apiGet.mockResolvedValue({ hasAccess: true, priceUsd: 10, trialDays: 30 });
    renderGate();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(`/api/billing/${SHOP}/status`));
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument();
    expect(screen.queryByText(/free trial/i)).not.toBeInTheDocument();
  });

  it('shows the trial screen with price and trial length when there is no access', async () => {
    apiGet.mockResolvedValue({ hasAccess: false, priceUsd: 10, trialDays: 30 });
    renderGate();
    expect(await screen.findByText('Start your 30-day free trial')).toBeInTheDocument();
    expect(screen.getByText(/Free for 30 days, then \$10\/month/)).toBeInTheDocument();
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument();
  });

  it('shows the trial screen when any API call reports plan-required', async () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    renderGate();
    act(() => {
      window.dispatchEvent(new Event('ccf:plan-required'));
    });
    expect(await screen.findByText('Start your 30-day free trial')).toBeInTheDocument();
  });

  it('fails open when the status check errors', async () => {
    apiGet.mockRejectedValue(new Error('network'));
    renderGate();
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument();
  });

  it('Start free trial opens Shopify approval page in the top window', async () => {
    apiGet.mockResolvedValue({ hasAccess: false });
    apiSend.mockResolvedValue({ confirmationUrl: 'https://shopify.test/confirm/9' });
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: 'Start free trial' }));
    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith(`/api/billing/${SHOP}/start`, 'POST', {})
    );
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith('https://shopify.test/confirm/9', '_top')
    );
  });

  it('shows an error and re-enables the button when starting fails', async () => {
    apiGet.mockResolvedValue({ hasAccess: false });
    apiSend.mockRejectedValue(new Error('Failed to start your free trial'));
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: 'Start free trial' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to start your free trial');
    expect(window.open).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start free trial' })).toBeEnabled();
  });
});
