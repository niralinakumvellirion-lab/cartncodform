/**
 * PlanGate — never blocks the app (no subscription = Free plan). Shows a banner while a plan limit is
 * reached, linking to the Plans page. Mocks: __mocks__/api.js (apiGet).
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { apiGet } from '../../../lib/api';
import PlanGate, { limitMessage } from '../app/admin/components/PlanGate';

const SHOP = 'gate.myshopify.com';

beforeEach(() => {
  jest.clearAllMocks();
  window.history.pushState({}, '', `/admin/dashboard?shop=${SHOP}&host=abc`);
});

function renderGate() {
  return render(
    <PlanGate>
      <div>APP CONTENT</div>
    </PlanGate>
  );
}

describe('PlanGate', () => {
  it('shows the app with no banner when no limit is reached', async () => {
    apiGet.mockResolvedValue({ plan: { name: 'Free' }, reached: [] });
    renderGate();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(`/api/billing/${SHOP}/usage`));
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('never blocks: the app shows even before the plan check answers', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    renderGate();
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument();
  });

  it('a reached limit shows a banner above the app with a link to Plans (keeping shop and host)', async () => {
    apiGet.mockResolvedValue({ plan: { name: 'Free' }, reached: ['codOrders'] });
    renderGate();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'You have reached a limit of the Free plan: the COD form is paused.'
    );
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute('href', `/admin/plans?shop=${SHOP}&host=abc`);
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument();
  });

  it('no banner on the Plans page itself, and no extra request there', async () => {
    window.history.pushState({}, '', `/admin/plans?shop=${SHOP}`);
    apiGet.mockResolvedValue({ plan: { name: 'Free' }, reached: ['codOrders'] });
    renderGate();
    await act(async () => {});
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('fails quietly when the check errors', async () => {
    apiGet.mockRejectedValue(new Error('network'));
    renderGate();
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('the old plan-required event no longer hides the app', async () => {
    apiGet.mockResolvedValue({ reached: [] });
    renderGate();
    act(() => { window.dispatchEvent(new Event('ccf:plan-required')); });
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument();
  });
});

describe('limitMessage', () => {
  it('lists every paused feature in plain words', () => {
    expect(limitMessage('Starter', ['codOrders', 'subscribers', 'messages'])).toBe(
      'You have reached a limit of the Starter plan: the COD form is paused, new push sign-ups are paused and automated messages are paused.'
    );
    expect(limitMessage('Free', [])).toBe('');
    expect(limitMessage('Free', ['unknown'])).toBe('');
  });
});
