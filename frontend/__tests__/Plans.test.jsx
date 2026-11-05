/**
 * Plans screen: current plan, usage bars, four plan cards; every plan button opens Shopify's plan page.
 * Mocks: __mocks__/api.js (apiGet), window.open.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { apiGet } from '../../../lib/api';
import Plans, { planFeatures, priceLabel, tierFromHandle, POPPINS_HREF } from '../app/admin/screens/Plans';

const SHOP = 'plans.myshopify.com';
const UPGRADE = 'https://admin.shopify.com/store/plans/charges/cartncod-form/pricing_plans';

const PLANS = [
  { id: 'free', name: 'Free', price: 0, limits: { codOrders: 50, subscribers: 500, messages: 500 }, aiCopy: false, prioritySupport: false },
  { id: 'starter', name: 'Starter', price: 9.99, limits: { codOrders: 500, subscribers: 5000, messages: 5000 }, aiCopy: false, prioritySupport: false },
  { id: 'growth', name: 'Growth', price: 24.99, limits: { codOrders: null, subscribers: 25000, messages: 25000 }, aiCopy: true, prioritySupport: false },
  { id: 'pro', name: 'Pro', price: 49, limits: { codOrders: null, subscribers: null, messages: null }, aiCopy: true, prioritySupport: true },
];

function reply(over = {}) {
  return {
    tier: 'free',
    plan: PLANS[0],
    usage: { codOrders: { used: 12, limit: 50 }, subscribers: { used: 40, limit: 500 }, messages: { used: 0, limit: 500 } },
    reached: [],
    resetsAt: '2026-12-01T00:00:00.000Z',
    plans: PLANS,
    upgradeUrl: UPGRADE,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.open = jest.fn();
  window.history.pushState({}, '', `/admin/plans?shop=${SHOP}`);
});

describe('Plans screen', () => {
  it('asks for fresh usage (refresh=1) and shows the current plan with usage', async () => {
    apiGet.mockResolvedValue(reply());
    render(<Plans shop={SHOP} />);
    expect(await screen.findByRole('heading', { name: /Free\s*\$0\/month/ })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith(`/api/billing/${SHOP}/usage?refresh=1`);
    expect(screen.getByText('12 of 50')).toBeInTheDocument();
    expect(screen.getByText('40 of 500')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'COD orders this month' })).toHaveAttribute('aria-valuenow', '12');
    expect(screen.getByText(/resets on December 1/)).toBeInTheDocument();
  });

  it('four plan cards with prices; the current one is disabled, higher ones say Upgrade', async () => {
    apiGet.mockResolvedValue(reply({ tier: 'starter', plan: PLANS[1] }));
    render(<Plans shop={SHOP} />);
    const starter = await screen.findByRole('region', { name: 'Starter plan' });
    expect(within(starter).getByText('$9.99')).toBeInTheDocument();
    expect(within(starter).getByRole('button', { name: 'Current plan' })).toBeDisabled();
    expect(within(screen.getByRole('region', { name: 'Free plan' })).getByRole('button', { name: 'Switch to Free' })).toBeEnabled();
    expect(within(screen.getByRole('region', { name: 'Growth plan' })).getByRole('button', { name: 'Upgrade to Growth' })).toBeEnabled();
    expect(within(screen.getByRole('region', { name: 'Pro plan' })).getByText('$49')).toBeInTheDocument();
  });

  it('a plan button opens Shopify plan page in the top window', async () => {
    apiGet.mockResolvedValue(reply());
    render(<Plans shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Pro' }));
    expect(window.open).toHaveBeenCalledWith(UPGRADE, '_top');
  });

  it('a reached limit is called out, with what is paused', async () => {
    apiGet.mockResolvedValue(reply({
      usage: { codOrders: { used: 50, limit: 50 }, subscribers: { used: 40, limit: 500 }, messages: { used: 0, limit: 500 } },
      reached: ['codOrders'],
    }));
    render(<Plans shop={SHOP} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The COD form is paused');
    expect(screen.getByText('Limit reached')).toBeInTheDocument();
  });

  it('unlimited usage shows the count and "Unlimited", with no bar', async () => {
    apiGet.mockResolvedValue(reply({
      tier: 'pro', plan: PLANS[3],
      usage: { codOrders: { used: 1234, limit: null }, subscribers: { used: 9, limit: null }, messages: { used: 3, limit: null } },
    }));
    render(<Plans shop={SHOP} />);
    expect(await screen.findByText('1,234 · Unlimited')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('an error shows a message and Try again loads again', async () => {
    apiGet.mockRejectedValueOnce(new Error('Could not load your plan usage')).mockResolvedValueOnce(reply());
    render(<Plans shop={SHOP} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your plan usage');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('12 of 50')).toBeInTheDocument();
  });
});

describe('design', () => {
  it('uses Poppins: the font is loaded once and set on the page', async () => {
    apiGet.mockResolvedValue(reply());
    const { unmount } = render(<Plans shop={SHOP} />);
    const heading = await screen.findByRole('heading', { name: 'Plans and usage' });
    expect(heading.closest('div[style*="font-family"]')).toHaveStyle({ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" });
    unmount();
    render(<Plans shop={SHOP} />);
    await screen.findByRole('heading', { name: 'Plans and usage' });
    const links = document.querySelectorAll('link[data-ccf-poppins]');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', POPPINS_HREF);
  });

  it('Change plan opens Shopify plan page; cards show who each plan is for; usage shows % used', async () => {
    apiGet.mockResolvedValue(reply());
    render(<Plans shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change plan' }));
    expect(window.open).toHaveBeenCalledWith(UPGRADE, '_top');
    expect(within(screen.getByRole('region', { name: 'Growth plan' })).getByText('For brands growing every month')).toBeInTheDocument();
    expect(screen.getByText('24% used')).toBeInTheDocument();
    expect(screen.getByText('Billed securely by Shopify')).toBeInTheDocument();
  });
});

describe('free trial on the plan cards', () => {
  it('on Free, paid cards show the trial; on a paid plan they do not', async () => {
    apiGet.mockResolvedValueOnce(reply({ trialDays: 30 }));
    const { unmount } = render(<Plans shop={SHOP} />);
    expect(await screen.findAllByText('30-day free trial')).toHaveLength(3);
    unmount();
    apiGet.mockResolvedValueOnce(reply({ tier: 'starter', plan: PLANS[1], trialDays: 30 }));
    render(<Plans shop={SHOP} />);
    await screen.findByRole('region', { name: 'Starter plan' });
    expect(screen.queryByText('30-day free trial')).not.toBeInTheDocument();
  });
});

describe('back from Shopify plan page (plan_handle in the link)', () => {
  it('the chosen plan is confirmed → "Your Growth plan is active"', async () => {
    window.history.pushState({}, '', `/admin/plans?shop=${SHOP}&plan_handle=growth`);
    apiGet.mockResolvedValue(reply({ tier: 'growth', plan: PLANS[2] }));
    render(<Plans shop={SHOP} />);
    expect(await screen.findByText('Your Growth plan is active.')).toBeInTheDocument();
  });

  it('not confirmed yet → says so, and Check again asks Shopify again', async () => {
    window.history.pushState({}, '', `/admin/plans?shop=${SHOP}&plan_handle=growth`);
    apiGet.mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply({ tier: 'growth', plan: PLANS[2] }));
    render(<Plans shop={SHOP} />);
    expect(await screen.findByText(/Shopify has not confirmed your new plan yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('Your Growth plan is active.')).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet).toHaveBeenLastCalledWith(`/api/billing/${SHOP}/usage?refresh=1`);
  });

  it('no plan_handle → no message', async () => {
    apiGet.mockResolvedValue(reply());
    render(<Plans shop={SHOP} />);
    await screen.findByText('12 of 50');
    expect(screen.queryByText(/plan is active|not confirmed/)).not.toBeInTheDocument();
  });

  it('reads the plan word from a handle', () => {
    expect(['growth', 'shopireach-starter', 'PRO', 'free', 'production', 'basic'].map(tierFromHandle))
      .toEqual(['growth', 'starter', 'pro', 'free', null, null]);
  });
});

describe('plan card text', () => {
  it('limits, reviews, AI copy and support', () => {
    expect(planFeatures(PLANS[0])).toEqual(['50 COD orders / month', '500 push subscribers', '500 automated messages / month', 'Product reviews']);
    expect(planFeatures(PLANS[3])).toEqual(['Unlimited COD orders', 'Unlimited push subscribers', 'Unlimited automated messages', 'Product reviews', 'AI-written messages', 'Priority support']);
    expect(planFeatures(PLANS[2])).toContain('25,000 push subscribers');
  });

  it('prices', () => {
    expect([priceLabel(0), priceLabel(9.99), priceLabel(49)]).toEqual(['$0', '$9.99', '$49']);
  });
});
