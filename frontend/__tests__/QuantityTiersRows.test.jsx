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
    expect(withSingle[0]).toEqual({ qty: 1, percent: 0, badge: '', subtitle: 'Standard price' });
  });
});
