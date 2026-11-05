/**
 * Prepaid offer settings (COD page, "Prepaid offer" tab): load, live preview, save, plan lock, numbers.
 * Mocks: __mocks__/api.js (apiGet, apiSend).
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import PrepaidOffer, { previewAmount, money, explainSaving, hasChanges } from '../app/admin/screens/PrepaidOffer';
import CodHome from '../app/admin/screens/CodHome';

jest.mock('../app/admin/screens/CodOrders', () => () => <div>ORDERS LIST</div>);

const SHOP = 'pp.myshopify.com';
const SETTINGS = { enabled: false, discountType: 'percent', value: 5, maxDiscount: 100, minOrder: 0, heading: 'Pay online and save', buttonText: 'Pay online', accentColor: '#4F46E5' };
const reply = (over = {}) => ({
  settings: SETTINGS,
  stats: { offersTaken: 12, prepaidOrders: 7, usedWithCod: 1, discountGiven: 350, prepaidRevenue: 6643.5 },
  allowed: true,
  planName: 'Starter',
  upgradeUrl: 'https://admin.shopify.com/store/pp/charges/cartncod-form/pricing_plans',
  upgradePlan: { id: 'starter', name: 'Starter', price: 9.99, limits: { codOrders: 500, subscribers: 5000, messages: 5000 }, aiCopy: false, prepaidOffer: true, prioritySupport: false },
  trialDays: 30,
  ...over,
});
const FREE = { allowed: false, planName: 'Free' };

beforeEach(() => {
  jest.clearAllMocks();
  window.history.pushState({}, '', `/admin/cod?shop=${SHOP}&host=h`);
});

describe('Prepaid offer screen', () => {
  it('loads the settings and this month numbers (money in whole rupees on the cards)', async () => {
    apiGet.mockResolvedValue(reply());
    render(<PrepaidOffer shop={SHOP} />);
    expect(await screen.findByText('Prepaid orders')).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith(`/api/prepaid-offer/${SHOP}`);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('₹6,644')).toBeInTheDocument();
    expect(screen.getByText('₹350')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('the status pill says when the offer is live', async () => {
    apiGet.mockResolvedValue(reply({ settings: { ...SETTINGS, enabled: true } }));
    render(<PrepaidOffer shop={SHOP} />);
    expect(await screen.findByText('Live on COD form')).toBeInTheDocument();
  });

  it('the preview matches the COD form: 5% of ₹999 → "Save ₹49.95", button ₹949.05 with ₹999 struck out', async () => {
    apiGet.mockResolvedValue(reply());
    render(<PrepaidOffer shop={SHOP} />);
    const offer = await screen.findByTestId('preview-offer');
    expect(offer).toHaveTextContent('Save ₹49.95');
    expect(offer).toHaveTextContent('Pay online · ₹949.05');
    expect(within(offer).getByText('₹999', { selector: 's' })).toBeInTheDocument();
    expect(offer).toHaveTextContent('Secure checkout by Shopify');

    fireEvent.click(screen.getByLabelText(/Fixed amount/));
    expect(screen.getByLabelText('Discount (₹)')).toHaveValue(50);
    fireEvent.change(screen.getByLabelText('Discount (₹)'), { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'Save with UPI' } });
    expect(screen.getByTestId('preview-offer')).toHaveTextContent('Save with UPI');
    expect(screen.getByTestId('preview-offer')).toHaveTextContent('Save ₹75');
    expect(screen.queryByLabelText(/Maximum discount/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Percentage'));
    expect(screen.getByLabelText('Discount (%)')).toHaveValue(5);
  });

  it('only the preview sticks while the page scrolls; the column runs the full height; tips sit under the settings', async () => {
    apiGet.mockResolvedValue(reply());
    render(<PrepaidOffer shop={SHOP} />);
    const sticky = await screen.findByTestId('preview-sticky');
    expect(sticky).toHaveStyle({ position: 'sticky', top: '16px' });
    expect(within(sticky).getByTestId('preview-offer')).toBeInTheDocument();
    const column = screen.getByRole('complementary', { name: 'Preview' });
    expect(column).toHaveStyle({ alignSelf: 'stretch' });
    expect(column).not.toHaveStyle({ position: 'sticky' });
    expect(within(column).queryByText('How the code works')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Good to know')).toHaveTextContent('How the code works');
  });

  it('a minimum above the sample order hides the offer in the preview and says why', async () => {
    apiGet.mockResolvedValue(reply());
    render(<PrepaidOffer shop={SHOP} />);
    fireEvent.change(await screen.findByLabelText(/Minimum order/), { target: { value: '1500' } });
    expect(screen.queryByTestId('preview-offer')).not.toBeInTheDocument();
    expect(screen.getByText(/below your minimum of ₹1,500/)).toBeInTheDocument();
  });

  it('Save sends the whole form with numbers, and shows Saved', async () => {
    apiGet.mockResolvedValue(reply());
    apiSend.mockResolvedValue(reply({ settings: { ...SETTINGS, enabled: true, value: 8 } }));
    render(<PrepaidOffer shop={SHOP} />);
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(apiSend).toHaveBeenCalledWith(`/api/prepaid-offer/${SHOP}`, 'PUT', { ...SETTINGS, enabled: true, value: 8 });
  });

  it('a refused save shows the reason', async () => {
    apiGet.mockResolvedValue(reply());
    apiSend.mockRejectedValue(new Error('The discount must be a whole number from 1 to 50%.'));
    render(<PrepaidOffer shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('1 to 50%');
  });


  it('a load error is shown', async () => {
    apiGet.mockRejectedValue(new Error('Could not load the prepaid offer'));
    render(<PrepaidOffer shop={SHOP} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the prepaid offer');
  });
});

describe('Free plan: locked view and upgrade popup', () => {
  beforeEach(() => { window.open = jest.fn(); });
  const dialog = () => screen.queryByRole('dialog', { name: 'Unlock the Prepaid offer' });

  it('the upgrade popup opens straight away, with the plan that includes the offer and its free trial', async () => {
    apiGet.mockResolvedValue(reply(FREE));
    render(<PrepaidOffer shop={SHOP} />);
    const d = await screen.findByRole('dialog', { name: 'Unlock the Prepaid offer' });
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d).toHaveTextContent('You are on the Free plan.');
    expect(within(d).getByText('$9.99')).toBeInTheDocument();
    expect(within(d).getByText('Prepaid offer on the COD form')).toBeInTheDocument();
    expect(within(d).getByText('500 COD orders / month')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Start 30-day free trial' })).toHaveFocus();
  });

  it('the popup button opens Shopify plan page in the top window', async () => {
    apiGet.mockResolvedValue(reply(FREE));
    render(<PrepaidOffer shop={SHOP} />);
    const d = await screen.findByRole('dialog', { name: 'Unlock the Prepaid offer' });
    fireEvent.click(within(d).getByRole('button', { name: 'Start 30-day free trial' }));
    expect(window.open).toHaveBeenCalledWith(reply().upgradeUrl, '_top');
  });

  it('closes with Maybe later, the × button, Escape and a click outside; "See what is included" opens it again', async () => {
    apiGet.mockResolvedValue(reply(FREE));
    render(<PrepaidOffer shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Maybe later' }));
    expect(dialog()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See what is included' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dialog()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See what is included' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dialog()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See what is included' }));
    fireEvent.mouseDown(dialog().parentElement);
    expect(dialog()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See what is included' }));
    fireEvent.mouseDown(dialog());
    expect(dialog()).toBeInTheDocument();
  });

  it('the page explains the offer, shows a locked preview, and has no settings to change', async () => {
    apiGet.mockResolvedValue(reply(FREE));
    render(<PrepaidOffer shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Maybe later' }));
    expect(screen.getByRole('heading', { name: 'Turn COD orders into prepaid orders' })).toBeInTheDocument();
    const locked = screen.getByRole('img', { name: 'Locked preview' });
    expect(locked).toHaveTextContent('Unlocks on Starter ($9.99/month)');
    expect(locked).toHaveTextContent('Pay online and save');
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Available on Starter and above');
    expect(screen.getByRole('status')).toHaveTextContent('Every paid plan starts with a 30-day free trial.');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    // Both page buttons open Shopify's plan page: "Upgrade plan" (title bar) and the card's trial button.
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start 30-day free trial' }));
    expect(window.open).toHaveBeenCalledTimes(2);
    expect(window.open).toHaveBeenLastCalledWith(reply().upgradeUrl, '_top');
    expect(screen.getByRole('link', { name: 'Compare plans' })).toHaveAttribute('href', `/admin/plans?shop=${SHOP}&host=h`);
  });

  it('without a trial: the popup says Upgrade now and the card says Upgrade to unlock', async () => {
    apiGet.mockResolvedValue(reply({ ...FREE, trialDays: 0 }));
    render(<PrepaidOffer shop={SHOP} />);
    expect(await screen.findByRole('button', { name: 'Upgrade to unlock' })).toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('free trial');
    expect(await screen.findByRole('button', { name: 'Upgrade now' })).toBeInTheDocument();
  });

  it('on a paid plan there is no popup and no lock', async () => {
    apiGet.mockResolvedValue(reply());
    render(<PrepaidOffer shop={SHOP} />);
    await screen.findByText('Prepaid orders');
    expect(dialog()).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Locked preview' })).not.toBeInTheDocument();
  });
});

describe('every change shows in the preview before saving', () => {
  it('a bigger sample order makes the maximum visible, and changing the maximum changes the preview', async () => {
    apiGet.mockResolvedValue(reply());
    render(<PrepaidOffer shop={SHOP} />);
    expect(await screen.findByTestId('preview-explain')).toHaveTextContent('5% of ₹999 = ₹49.95 off.');
    fireEvent.change(screen.getByLabelText('Sample order amount'), { target: { value: '3000' } });
    expect(screen.getByTestId('preview-offer')).toHaveTextContent('Save ₹100');
    expect(screen.getByTestId('preview-explain')).toHaveTextContent('5% of ₹3,000 is ₹150, limited to your maximum of ₹100.');
    fireEvent.change(screen.getByLabelText(/Maximum discount/), { target: { value: '60' } });
    expect(screen.getByTestId('preview-offer')).toHaveTextContent('Save ₹60');
    expect(screen.getByTestId('preview-offer')).toHaveTextContent('Pay online · ₹2,940');
    expect(apiSend).not.toHaveBeenCalled();
  });

  it('a minimum order above the sample amount says so; lowering it brings the offer back', async () => {
    apiGet.mockResolvedValue(reply());
    render(<PrepaidOffer shop={SHOP} />);
    fireEvent.change(await screen.findByLabelText(/Minimum order/), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Sample order amount'), { target: { value: '400' } });
    expect(screen.queryByTestId('preview-offer')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-explain')).toHaveTextContent('A ₹400 order is below your minimum of ₹500');
    fireEvent.change(screen.getByLabelText(/Minimum order/), { target: { value: '300' } });
    expect(screen.getByTestId('preview-offer')).toHaveTextContent('Save ₹20');
  });

  it('an unfinished colour code keeps the last colour and says what to type; a full one shows at once', async () => {
    apiGet.mockResolvedValue(reply());
    render(<PrepaidOffer shop={SHOP} />);
    const code = await screen.findByLabelText('Button colour code');
    const button = () => screen.getByTestId('preview-offer').querySelector('s').parentElement;
    fireEvent.change(code, { target: { value: '#12' } });
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Type a full colour code, like #4F46E5.')).toBeInTheDocument();
    expect(button()).toHaveStyle({ background: '#4F46E5' });
    fireEvent.change(code, { target: { value: '#16A34A' } });
    expect(code).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText(/Type a full colour code/)).not.toBeInTheDocument();
    expect(button()).toHaveStyle({ background: '#16A34A' });
  });

  it('"Unsaved changes" shows after an edit and goes after saving; the status follows what is saved', async () => {
    apiGet.mockResolvedValue(reply());
    apiSend.mockResolvedValue(reply({ settings: { ...SETTINGS, enabled: true } }));
    render(<PrepaidOffer shop={SHOP} />);
    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
    expect(screen.getByText('Live on COD form')).toBeInTheDocument();
  });

  it('helpers: changes compare numbers typed as text; the saving explained for each case', () => {
    expect(hasChanges({ ...SETTINGS, value: '5' }, SETTINGS)).toBe(false);
    expect(hasChanges({ ...SETTINGS, value: '6' }, SETTINGS)).toBe(true);
    expect(hasChanges({ ...SETTINGS, heading: 'x' }, SETTINGS)).toBe(true);
    const fixed = { ...SETTINGS, discountType: 'fixed', value: 50 };
    expect(explainSaving(fixed, 999)).toBe('₹50 off every order.');
    expect(explainSaving({ ...fixed, minOrder: 500 }, 999)).toBe('₹50 off every order of ₹500 or more.');
    expect(explainSaving({ ...fixed, value: 2000 }, 999)).toMatch(/would cover this whole ₹999 order/);
  });
});

describe('Cash on delivery page tabs: lock badge', () => {
  it('Free plan: the Prepaid offer tab carries a lock badge naming the plan; the data is loaded once', async () => {
    apiGet.mockResolvedValue(reply(FREE));
    render(<CodHome shop={SHOP} />);
    expect(await screen.findByLabelText('Locked: Starter plan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Prepaid offer/ }));
    expect(await screen.findByRole('dialog', { name: 'Unlock the Prepaid offer' })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('paid plan: no badge', async () => {
    apiGet.mockResolvedValue(reply());
    render(<CodHome shop={SHOP} />);
    await screen.findByText('ORDERS LIST');
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByLabelText(/Locked:/)).not.toBeInTheDocument();
  });
});

describe('Cash on delivery page tabs', () => {
  it('orders first; the Prepaid offer tab opens the settings', async () => {
    apiGet.mockResolvedValue(reply());
    render(<CodHome shop={SHOP} />);
    expect(screen.getByText('ORDERS LIST')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Prepaid offer' }));
    expect(await screen.findByText('Prepaid orders')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prepaid offer' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Prepaid offer' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('preview maths (same rule as the server)', () => {
  const pct = { discountType: 'percent', value: 5, maxDiscount: 100, minOrder: 0 };
  it('cap, minimum, whole-order and money format', () => {
    expect(previewAmount(pct, 999)).toBe(49.95);
    expect(previewAmount(pct, 5000)).toBe(100);
    expect(previewAmount({ ...pct, minOrder: 1000 }, 999)).toBe(0);
    expect(previewAmount({ discountType: 'fixed', value: 50 }, 50)).toBe(0);
    expect([money(50), money(949.05), money(6643.5)]).toEqual(['₹50', '₹949.05', '₹6,643.50']);
  });
});
