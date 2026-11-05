/**
 * Prepaid offer settings (COD page, "Prepaid offer" tab): load, live preview, save, plan lock, numbers.
 * Mocks: __mocks__/api.js (apiGet, apiSend).
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import PrepaidOffer, { previewAmount, money } from '../app/admin/screens/PrepaidOffer';
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
  ...over,
});

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

  it('Free plan: switch locked, with a link to Plans', async () => {
    apiGet.mockResolvedValue(reply({ allowed: false, planName: 'Free' }));
    render(<PrepaidOffer shop={SHOP} />);
    expect(await screen.findByText(/included in the Starter plan and above/)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute('href', `/admin/plans?shop=${SHOP}&host=h`);
  });

  it('a load error is shown', async () => {
    apiGet.mockRejectedValue(new Error('Could not load the prepaid offer'));
    render(<PrepaidOffer shop={SHOP} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the prepaid offer');
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
