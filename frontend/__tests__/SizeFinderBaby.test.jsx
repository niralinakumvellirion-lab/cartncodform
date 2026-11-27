/**
 * Phase 11 — Find my size for baby & kids clothes (admin): search, 3-column chart, preview.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import SizeFinderScreen from '../app/admin/screens/SizeFinder';

const SHOP = 'test.myshopify.com';
const CATALOG = [
  { id: 'clothing', name: 'Clothing', blurb: 'Height, weight and build', words: ['clothing', 'kurta'] },
  { id: 'baby', name: 'Baby & kids clothes', blurb: 'Length, weight or age → Newborn, 0-3 M … 3-4 Y', words: ['baby clothes', 'onesie', 'romper', 'newborn'] },
  { id: 'none', name: 'Sizes not needed', blurb: 'Electronics', words: ['mobile'] },
];
const BABY = {
  title: 'Tell us about your baby', text: 'Length and weight give the best fit.', howTo: ['Lay flat.', 'Head to heel.', 'Recent weight.'],
  caption: 'Baby’s size in 20 seconds',
  length: { label: 'Length (head to heel)', min: 40, max: 120, step: 0.5, start: 68 },
  weight: { label: 'Weight', min: 1.5, max: 30, step: 0.1, start: 8 },
  age: { label: 'Age', min: 0, max: 72, step: 1, start: 6 },
  fit: { right: 'Fits now — within this size', grow: 'Room to grow — one size up', age: 'Based on age' },
};
const BABY_CHART = [
  { size: '0-3 M', maxLength: 62, maxWeight: 6, maxAge: 3 },
  { size: '3-6 M', maxLength: 68, maxWeight: 8, maxAge: 6 },
];
const BASE = {
  enabled: false, productTag: '', buttonText: 'Find my ideal size', accentColor: '#111827', unit: 'cm',
  charts: { women: [{ size: 'M', chest: 91, waist: 76, length: 106 }], men: [] }, measureCharts: {}, babyChart: BABY_CHART,
};
function load(settings) {
  apiGet.mockResolvedValue({ settings: JSON.parse(JSON.stringify({ ...BASE, ...settings })), storeTypes: CATALOG, measureTypes: {}, babyType: BABY });
}
beforeEach(() => {
  jest.clearAllMocks();
  apiSend.mockImplementation((url, method, body) =>
    Promise.resolve(url.endsWith('/preview') ? { size: '3-6 M', outOfRange: false, reasons: [{ area: 'fit', status: 'right', basis: 'measure' }] } : { settings: body.settings }));
});
async function savedSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(apiSend.mock.calls.some(([, m]) => m === 'PUT')).toBe(true));
  return apiSend.mock.calls.find(([, m]) => m === 'PUT')[2].settings;
}

describe('baby & kids clothes', () => {
  it('“onesie” finds Baby; picking it shows the baby chart (length, weight, age) and the baby caption', async () => {
    load({ storeType: '' });
    render(<SizeFinderScreen shop={SHOP} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search what your store sells' }), { target: { value: 'onesie' } });
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Matches' })).getByRole('option'));
    expect(await screen.findByRole('region', { name: 'Your store type' })).toHaveTextContent('Baby & kids clothes');
    const table = screen.getByRole('table', { name: 'Size chart' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(['Size', 'Up to length (cm)', 'Up to weight (kg)', 'Up to age (months)', '']);
    expect(screen.getByLabelText('Row 2 Up to weight (kg)')).toHaveValue(8);
    expect(screen.getByRole('tab', { name: /^Size chart/ })).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('tab', { name: /^Button/ }));
    expect(screen.getByLabelText('Caption under the button')).toHaveValue('Baby’s size in 20 seconds');
    expect(await savedSettings()).toMatchObject({ storeType: 'baby', enabled: true, cardText: 'Baby’s size in 20 seconds' });
  });

  it('edit, add and remove sizes; saved as babyChart', async () => {
    load({ storeType: 'baby', enabled: true });
    render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByRole('table', { name: 'Size chart' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add a size' }));
    fireEvent.change(screen.getByLabelText('Row 3 size'), { target: { value: '6-9 M' } });
    fireEvent.change(screen.getByLabelText('Row 3 Up to length (cm)'), { target: { value: '74' } });
    fireEvent.change(screen.getByLabelText('Row 3 Up to weight (kg)'), { target: { value: '9.5' } });
    fireEvent.change(screen.getByLabelText('Row 3 Up to age (months)'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    const s = await savedSettings();
    expect(s.babyChart).toEqual([BABY_CHART[1], { size: '6-9 M', maxLength: 74, maxWeight: 9.5, maxAge: 9 }]);
  });

  it('preview: sample baby sent to the backend; Measure screen with both ways and fit choice; Result with the fit line', async () => {
    load({ storeType: 'baby', enabled: true });
    render(<SizeFinderScreen shop={SHOP} />);
    const frame = await screen.findByTestId('preview-frame');
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith(`/api/size-finder/${SHOP}/preview`, 'POST', {
      storeType: 'baby', chart: BABY_CHART, answers: { mode: 'measure', lengthCm: 68, weightKg: 8 },
    }));
    expect(await within(frame).findByText('Fits now — within this size')).toBeInTheDocument();
    expect(within(frame).getByText('68 cm · 8 kg')).toBeInTheDocument();
    expect(within(frame).getByText('Cotton Baby Romper')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Preview screen' })).getByRole('button', { name: 'Measure' }));
    expect(within(frame).getByText('Tell us about your baby')).toBeInTheDocument();
    expect(within(frame).getByText('Age only')).toBeInTheDocument();
    expect(within(frame).getByText('Length (head to heel)')).toBeInTheDocument();
    expect(within(frame).getByText('Room to grow')).toBeInTheDocument();
    expect(screen.getByText(/Sample baby: 68 cm long, 8 kg/)).toBeInTheDocument();
  });
});
