/**
 * Phase 1 tier widget: quick styles, the Rows layout options, tier subtitles,
 * and the rows live preview (jsdom + React Testing Library).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { apiSend } from '../../../lib/api';
import QuantityTiers, { STYLE_PRESETS } from '../app/admin/screens/QuantityTiers';
import { buildRowOptions } from '../app/admin/screens/QuantityTiersPreview';

const SHOP = 'test.myshopify.com';

function renderTiers(qt) {
  render(
    <QuantityTiers
      shopDomain={SHOP}
      onSaveComplete={jest.fn()}
      config={{ quantityTiers: {
        enabled: true, heading: 'Buy more, save more', accentColor: '#4F46E5', layout: 'cards',
        tiers: [{ minQty: 2, percent: 10, badge: '' }, { minQty: 3, percent: 20, badge: 'Most popular' }],
        ...qt,
      } }}
    />
  );
}

async function savedBody() {
  apiSend.mockResolvedValue({ updated: true, synced: true });
  fireEvent.click(screen.getByRole('button', { name: 'Save and sync to Shopify' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
  return apiSend.mock.calls[0][2].quantityTiers;
}

beforeEach(() => jest.clearAllMocks());

describe('quick styles', () => {
  it('Classic rows switches to the rows layout and keeps the tiers', async () => {
    renderTiers();
    fireEvent.click(screen.getByRole('button', { name: 'Apply style Classic rows' }));
    expect(screen.getByRole('radio', { name: 'Rows' })).toBeChecked();
    expect(screen.getByLabelText('Label above the rows')).toHaveValue('Limited time offer');
    const body = await savedBody();
    expect(body.layout).toBe('rows');
    expect(body.accentColor).toBe('#111827');
    expect(body.showSingle).toBe(true);
    expect(body.tiers.map((t) => [t.minQty, t.percent, t.badge])).toEqual([[2, 10, ''], [3, 20, 'Most popular']]);
  });

  it('every preset has a valid hex colour and a known layout', () => {
    STYLE_PRESETS.forEach((p) => {
      expect(p.values.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(['rows', 'cards', 'list']).toContain(p.values.layout);
    });
  });
});

describe('rows options', () => {
  it('are hidden for cards and shown for rows', () => {
    renderTiers();
    expect(screen.queryByLabelText('Label above the rows')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Rows' }));
    expect(screen.getByLabelText('Label above the rows')).toBeInTheDocument();
    expect(screen.getByLabelText('Note under the rows')).toBeInTheDocument();
  });

  it('saves the wording, the three switches and tier subtitles', async () => {
    renderTiers({ layout: 'rows' });
    fireEvent.change(screen.getByLabelText('Label above the rows'), { target: { value: '  Bundle and save ' } });
    fireEvent.change(screen.getByLabelText('Note under the rows'), { target: { value: 'Free delivery' } });
    fireEvent.click(screen.getByLabelText(/crossed out/));
    fireEvent.change(screen.getByLabelText('Tier 1 subtitle'), { target: { value: 'Good deal' } });
    const body = await savedBody();
    expect(body.topLabel).toBe('Bundle and save');
    expect(body.footerNote).toBe('Free delivery');
    expect(body.showCompareAt).toBe(false);
    expect(body.showTotal).toBe(true);
    expect(body.showSingle).toBe(false);
    expect(body.tiers[0].subtitle).toBe('Good deal');
  });

  it('live preview draws rows with the struck price and total', () => {
    renderTiers({ layout: 'rows', showSingle: true, topLabel: 'Limited time offer' });
    expect(screen.getByText('Limited time offer')).toBeInTheDocument();
    expect(screen.getByText('Standard price')).toBeInTheDocument();
    expect(screen.getByText('10% OFF')).toBeInTheDocument();
    // 2 x ₹999 struck, Total line for the selected row
    expect(screen.getByText('₹1,998')).toBeInTheDocument();
    expect(screen.getByText(/^Total: /)).toBeInTheDocument();
  });
});

describe('buildRowOptions', () => {
  const tiers = [{ minQty: 2, percent: 10, badge: '' }, { minQty: 3, percent: 20, badge: 'Hot' }];

  it('adds the 1-item row only when asked and the first tier starts above 1', () => {
    expect(buildRowOptions(tiers, false)).toHaveLength(2);
    const withSingle = buildRowOptions(tiers, true);
    expect(withSingle).toHaveLength(3);
    expect(withSingle[0]).toEqual({ qty: 1, percent: 0, amount: 0, discounted: false, badge: '', subtitle: 'Standard price' });
  });
});

// ── Phase 2a: flat amount off ────────────────────────────────────────────────

describe('discount type', () => {
  it('switching to a flat amount changes the column, pre-fills amounts and saves them', async () => {
    renderTiers();
    expect(screen.getByRole('columnheader', { name: 'Discount (%)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Flat amount off the bundle' }));
    expect(screen.getByRole('columnheader', { name: 'Amount off' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tier 1 amount off')).toHaveValue(100);
    fireEvent.change(screen.getByLabelText('Tier 1 amount off'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Tier 2 amount off'), { target: { value: '450.5' } });
    const body = await savedBody();
    expect(body.discountType).toBe('amount');
    expect(body.tiers.map((t) => [t.minQty, t.amount])).toEqual([[2, 200], [3, 450.5]]);
    expect(body.tiers[0]).not.toHaveProperty('percent');
  });

  it('amounts must increase row by row (no save)', () => {
    renderTiers({ discountType: 'amount', tiers: [{ minQty: 2, percent: 0, amount: 300 }, { minQty: 3, percent: 0, amount: 300 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Save and sync to Shopify' }));
    expect(screen.getByText('Amounts off must strictly increase row by row')).toBeInTheDocument();
    expect(apiSend).not.toHaveBeenCalled();
  });

  it('percent save still sends percent tiers and the type', async () => {
    renderTiers();
    const body = await savedBody();
    expect(body.discountType).toBe('percent');
    expect(body.tiers[0]).toEqual({ minQty: 2, percent: 10, badge: '', subtitle: '' });
  });

  it('rows preview shows "SAVE ₹200" and the flat bundle price', () => {
    renderTiers({
      layout: 'rows', discountType: 'amount',
      tiers: [{ minQty: 2, percent: 0, amount: 200, badge: '' }, { minQty: 3, percent: 0, amount: 400, badge: '' }],
    });
    expect(screen.getByText('SAVE ₹200')).toBeInTheDocument();
    // 2 × ₹999 − ₹200 = ₹1,798
    expect(screen.getByText('₹1,798')).toBeInTheDocument();
  });
});

describe('bundleTotal / offLabel', () => {
  const { bundleTotal, offLabel } = require('../app/admin/screens/QuantityTiersPreview');
  it('matches the backend rule', () => {
    expect(bundleTotal(999, 2, { amount: 200 }, 'amount')).toBe(1798);
    expect(bundleTotal(50, 2, { amount: 500 }, 'amount')).toBe(0);
    expect(bundleTotal(999, 2, { percent: 10 }, 'percent')).toBe(1798.2);
    expect(bundleTotal(999, 1, null, 'amount')).toBe(999);
    expect(offLabel({ amount: 200 }, 'amount', '₹', false)).toBe('Save ₹200');
    expect(offLabel({ percent: 15 }, 'percent', '₹', true)).toBe('15% OFF');
  });
});

// ── Phase 2b: extra rewards ─────────────────────────────────────────────────

describe('extra rewards', () => {
  afterEach(() => { delete window.shopify; });

  it('free shipping + picked gift are saved on the tier', async () => {
    window.shopify = {
      resourcePicker: jest.fn().mockResolvedValue([{
        title: 'Ski Wax',
        images: [{ originalSrc: 'https://cdn.shopify.com/wax.png' }],
        variants: [{ id: 'gid://shopify/ProductVariant/555', title: 'Default Title' }],
      }]),
    };
    renderTiers();
    fireEvent.click(screen.getByLabelText('Tier 2 free shipping'));
    fireEvent.click(screen.getByRole('button', { name: 'Tier 2 add free gift' }));
    expect(await screen.findByText('Ski Wax')).toBeInTheDocument();
    expect(window.shopify.resourcePicker).toHaveBeenCalledWith(expect.objectContaining({ type: 'product', multiple: false }));
    const body = await savedBody();
    expect(body.tiers[0]).not.toHaveProperty('gift');
    expect(body.tiers[0]).not.toHaveProperty('freeShipping');
    expect(body.tiers[1].freeShipping).toBe(true);
    expect(body.tiers[1].gift).toEqual({ variantId: 'gid://shopify/ProductVariant/555', title: 'Ski Wax', image: 'https://cdn.shopify.com/wax.png' });
  });

  it('a gift can be removed', async () => {
    renderTiers({ tiers: [{ minQty: 2, percent: 10, badge: '', gift: { variantId: 'gid://shopify/ProductVariant/555', title: 'Ski Wax', image: '' } }] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove tier 1 gift' }));
    const body = await savedBody();
    expect(body.tiers[0]).not.toHaveProperty('gift');
  });

  it('outside Shopify admin the picker explains itself instead of failing', () => {
    renderTiers();
    fireEvent.click(screen.getByRole('button', { name: 'Tier 1 add free gift' }));
    return screen.findByText('The product picker opens inside Shopify admin only.');
  });

  it('preview lists the perks', () => {
    renderTiers({
      layout: 'rows',
      tiers: [{ minQty: 2, percent: 10, badge: '', freeShipping: true, gift: { variantId: 'gid://shopify/ProductVariant/555', title: 'Ski Wax', image: '' } }],
    });
    expect(screen.getByText('+ Free shipping · Free gift: Ski Wax')).toBeInTheDocument();
  });
});

describe('giftFromPick', () => {
  const { giftFromPick } = require('../app/admin/screens/QuantityTiers');
  it('adds the variant name for real variants and rejects bad picks', () => {
    expect(giftFromPick([{ title: 'Tee', variants: [{ id: 'gid://shopify/ProductVariant/9', title: 'Large', image: { url: 'https://x/y.png' } }] }]))
      .toEqual({ variantId: 'gid://shopify/ProductVariant/9', title: 'Tee – Large', image: 'https://x/y.png' });
    // Variant named like the product → no doubled name
    expect(giftFromPick([{ title: 'Selling Plans Ski Wax', variants: [{ id: 'gid://shopify/ProductVariant/7', title: 'Selling Plans Ski Wax' }] }]).title)
      .toBe('Selling Plans Ski Wax');
    expect(giftFromPick(undefined)).toBeNull();
    expect(giftFromPick([])).toBeNull();
    expect(giftFromPick([{ title: 'X', variants: [{ id: '9' }] }])).toBeNull();
  });
});

describe('preview rewards carry upward', () => {
  it('a higher tier lists the rewards set on a lower tier', () => {
    renderTiers({
      layout: 'cards',
      tiers: [
        { minQty: 2, percent: 10, badge: '' },
        { minQty: 3, percent: 15, badge: '', gift: { variantId: 'gid://shopify/ProductVariant/555', title: 'Ski Wax', image: '' } },
        { minQty: 4, percent: 25, badge: '' },
      ],
    });
    expect(screen.getAllByText('+ Free gift: Ski Wax')).toHaveLength(2);
  });
});

describe('colour / size per item (Phase 2c)', () => {
  it('checkbox is off by default and saves variantPicker', async () => {
    renderTiers();
    const box = screen.getByLabelText('Let shoppers choose colour and size for each item');
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    const body = await savedBody();
    expect(body.variantPicker).toBe(true);
  });
});

describe('combine with other discounts', () => {
  it('all off by default; ticked boxes are saved', async () => {
    renderTiers();
    const order = screen.getByLabelText('Order discounts');
    expect(order).not.toBeChecked();
    expect(screen.getByLabelText('Other product discounts')).not.toBeChecked();
    fireEvent.click(order);
    const body = await savedBody();
    expect(body.combinesWith).toEqual({ productDiscounts: false, orderDiscounts: true, shippingDiscounts: false });
  });

  it('shows the saved choice', () => {
    renderTiers({ combinesWith: { shippingDiscounts: true } });
    expect(screen.getByLabelText('Shipping discounts')).toBeChecked();
  });
});
