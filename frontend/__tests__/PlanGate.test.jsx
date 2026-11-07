/**
 * PlanGate — never blocks the app (no subscription = Free plan). Shows a banner while a plan limit is
 * reached, linking to the Plans page. Mocks: __mocks__/api.js (apiGet).
 */
import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import PlanGate, { limitMessage, CHECK_TIMEOUT_MS } from '../app/admin/components/PlanGate';

const SHOP = 'gate.myshopify.com';

const PLANS = [
  { id: 'free', name: 'Free', price: 0, limits: { codOrders: 50, subscribers: 500, messages: 500 }, aiCopy: false, prioritySupport: false },
  { id: 'starter', name: 'Starter', price: 9.99, limits: { codOrders: 500, subscribers: 5000, messages: 5000 }, aiCopy: false, prioritySupport: false },
  { id: 'growth', name: 'Growth', price: 24.99, limits: { codOrders: null, subscribers: 25000, messages: 25000 }, aiCopy: true, prioritySupport: false },
  { id: 'pro', name: 'Pro', price: 49, limits: { codOrders: null, subscribers: null, messages: null }, aiCopy: true, prioritySupport: true },
];
const UPGRADE = 'https://admin.shopify.com/store/gate/charges/cartncod-form/pricing_plans';
const choosing = (over = {}) => ({ plan: PLANS[0], reached: [], needsPlanChoice: true, trialDays: 30, plans: PLANS, upgradeUrl: UPGRADE, ...over });
const appBox = () => screen.getByText('APP CONTENT').parentElement;

beforeEach(() => {
  jest.clearAllMocks();
  window.open = jest.fn();
  window.history.pushState({}, '', `/admin/dashboard?shop=${SHOP}&host=abc`);
});

afterEach(() => jest.useRealTimers());

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

  it.each(['plan_handle=starter', 'charge_id=123'])('back from Shopify\'s plan page (%s) → the plan is re-checked with Shopify (refresh=1)', async (param) => {
    window.history.pushState({}, '', `/admin?shop=${SHOP}&host=abc&${param}`);
    apiGet.mockResolvedValue({ plan: { name: 'Starter' }, reached: [] });
    renderGate();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(`/api/billing/${SHOP}/usage?refresh=1`));
  });

  it('while the check runs the page loads but stays hidden (no dashboard flash before "Choose your plan")', async () => {
    let answer;
    apiGet.mockReturnValue(new Promise((r) => { answer = r; }));
    renderGate();
    expect(appBox()).toHaveStyle({ visibility: 'hidden' });
    await act(async () => { answer({ reached: [], needsPlanChoice: false }); });
    expect(appBox()).not.toHaveStyle({ visibility: 'hidden' });
  });

  it('a slow check never blocks: the page shows after the time limit', () => {
    jest.useFakeTimers();
    apiGet.mockReturnValue(new Promise(() => {}));
    renderGate();
    expect(appBox()).toHaveStyle({ visibility: 'hidden' });
    act(() => { jest.advanceTimersByTime(CHECK_TIMEOUT_MS); });
    expect(appBox()).not.toHaveStyle({ visibility: 'hidden' });
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

describe('Choose your plan (after an install or reinstall)', () => {
  it('shows the plans with the free trial instead of the app', async () => {
    apiGet.mockResolvedValue(choosing());
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Choose your plan' })).toBeInTheDocument();
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText(/Every paid plan starts with a 30-day free trial/)).toBeInTheDocument();
    expect(screen.getAllByText('30-day free trial')).toHaveLength(3);
    expect(screen.getByText('Free forever')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Start free trial' })).toHaveLength(3);
  });

  it('Start free trial opens Shopify plan page in the top window', async () => {
    apiGet.mockResolvedValue(choosing());
    renderGate();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Start free trial' }))[1]);
    expect(window.open).toHaveBeenCalledWith(UPGRADE, '_top');
  });

  it('Continue with Free saves the choice and shows the app', async () => {
    apiGet.mockResolvedValue(choosing());
    apiSend.mockResolvedValue({ ok: true, needsPlanChoice: false });
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Free' }));
    expect(await screen.findByText('APP CONTENT')).toBeInTheDocument();
    expect(apiSend).toHaveBeenCalledWith(`/api/billing/${SHOP}/choose-free`, 'POST', {});
    expect(screen.queryByRole('heading', { name: 'Choose your plan' })).not.toBeInTheDocument();
  });

  it('a failed save says so and lets the merchant try again', async () => {
    apiGet.mockResolvedValue(choosing());
    apiSend.mockRejectedValue(new Error('Could not save your plan choice'));
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Free' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your plan choice');
    expect(screen.getByRole('button', { name: 'Continue with Free' })).toBeEnabled();
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument();
  });

  it('not shown when no choice is needed', async () => {
    apiGet.mockResolvedValue(choosing({ needsPlanChoice: false }));
    renderGate();
    await waitFor(() => expect(appBox()).not.toHaveStyle({ visibility: 'hidden' }));
    expect(screen.queryByRole('heading', { name: 'Choose your plan' })).not.toBeInTheDocument();
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
