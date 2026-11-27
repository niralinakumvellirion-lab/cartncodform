/**
 * Phase 8 — Find my size for every kind of store: the "What does your store sell?" search,
 * shoes / rings / bangles settings and preview, and "not needed" stores.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import SizeFinderScreen from '../app/admin/screens/SizeFinder';
import { searchStoreTypes } from '../app/admin/screens/StoreTypePicker';

const SHOP = 'test.myshopify.com';
const CATALOG = [
  { id: 'clothing', name: 'Clothing', blurb: 'Height, weight and build → S, M, L, XL', words: ['clothing', 'kurta', 'saree', 't-shirt'] },
  { id: 'shoes', name: 'Shoes & footwear', blurb: 'Foot length → UK / India shoe size', words: ['shoes', 'sneakers', 'sandals'] },
  { id: 'rings', name: 'Rings', blurb: 'Finger size → Indian ring size', words: ['rings', 'ring', 'jewellery'] },
  { id: 'bangles', name: 'Bangles & bracelets', blurb: 'Hand width → bangle size', words: ['bangles', 'kada', 'jewellery'] },
  { id: 'none', name: 'Sizes not needed', blurb: 'Electronics, beauty, home', words: ['electronics', 'mobile', 'phone'] },
];
const SHOES = {
  value: 'Foot length', unit: 'cm', min: 18, max: 33, step: 0.1, start: 25,
  title: 'Measure your foot', text: 'Stand on paper.', howTo: ['One', 'Two', 'Three'],
  caption: 'Measure your foot · takes 30 seconds', fit: { right: 'True to size', roomy: 'A little extra room' },
};
const MEASURE_TYPES = {
  shoes: SHOES,
  rings: { ...SHOES, value: 'Finger size (around)', unit: 'mm', min: 40, max: 76, start: 52, title: 'Measure your finger', alt: { label: 'A ring that fits' } },
  bangles: { ...SHOES, value: 'Hand width', unit: 'mm', min: 48, max: 80, start: 60, title: 'Measure your hand' },
};
const BASE = {
  enabled: false, productTag: '', buttonText: 'Find my ideal size', accentColor: '#111827', unit: 'cm',
  charts: { women: [{ size: 'M', chest: 91, waist: 76, length: 106 }], men: [] },
  measureCharts: {
    shoes: [{ size: '7', value: 25.4 }, { size: '8', value: 26.2 }],
    rings: [{ size: '12', value: 52 }],
    bangles: [{ size: '2.4', value: 57.2 }, { size: '2.6', value: 60.3 }],
  },
};

function load(settings) {
  apiGet.mockResolvedValue({ settings: JSON.parse(JSON.stringify({ ...BASE, ...settings })), storeTypes: CATALOG, measureTypes: MEASURE_TYPES });
}
beforeEach(() => {
  jest.clearAllMocks();
  apiSend.mockImplementation((url, method, body) =>
    Promise.resolve(url.endsWith('/preview') ? { size: body.storeType ? '7' : 'M', outOfRange: false, reasons: [{ area: 'fit', status: 'right' }] } : { settings: body.settings }));
});
async function savedSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(apiSend.mock.calls.some(([, m]) => m === 'PUT')).toBe(true));
  return apiSend.mock.calls.find(([, m]) => m === 'PUT')[2].settings;
}

describe('searchStoreTypes', () => {
  it('finds by word, best match first, each type once; jewellery → rings and bangles', () => {
    expect(searchStoreTypes(CATALOG, 'sneak').map((m) => m.type.id)).toEqual(['shoes']);
    expect(searchStoreTypes(CATALOG, 'Jewellery').map((m) => m.type.id)).toEqual(['rings', 'bangles']);
    expect(searchStoreTypes(CATALOG, 'silver rings for women')[0]).toMatchObject({ word: 'rings' });
    expect(searchStoreTypes(CATALOG, 'kurta')[0]).toMatchObject({ type: { id: 'clothing' }, word: 'kurta', rank: 0 });
    expect(searchStoreTypes(CATALOG, 'zzz')).toEqual([]);
    expect(searchStoreTypes(CATALOG, '  ')).toEqual([]);
  });
});

describe('first visit: search what the store sells', () => {
  it('a new store sees only the search; typing shows matches; picking shows that type’s settings', async () => {
    load({ storeType: '' });
    render(<SizeFinderScreen shop={SHOP} />);
    const input = await screen.findByRole('combobox', { name: 'Search what your store sells' });
    expect(screen.queryByRole('switch', { name: 'Turn on Find my size' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    fireEvent.change(input, { target: { value: 'sneak' } });
    const list = screen.getByRole('listbox', { name: 'Matches' });
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    expect(within(list).getByText('matches “sneakers”')).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('option'));

    expect(await screen.findByRole('region', { name: 'Your store type' })).toHaveTextContent('Shoes & footwear');
    expect(screen.getByRole('switch', { name: 'Turn on Find my size' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Row 1 Foot length')).toHaveValue(25.4);
    expect(screen.getByRole('region', { name: 'Size chart' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /^Button/ }));
    expect(screen.getByLabelText('Caption under the button')).toHaveValue('Measure your foot · takes 30 seconds');
    const s = await savedSettings();
    expect(s).toMatchObject({ storeType: 'shoes', enabled: true });
  });

  it('Enter picks the highlighted match; no match says so and the cards still work', async () => {
    load({ storeType: '' });
    render(<SizeFinderScreen shop={SHOP} />);
    const input = await screen.findByRole('combobox', { name: 'Search what your store sells' });
    fireEvent.change(input, { target: { value: 'qwerty' } });
    expect(screen.getByText(/No match for “qwerty”/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'jewellery' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('region', { name: 'Your store type' })).toHaveTextContent('Bangles & bracelets');
  });

  it('electronics → “not needed” card with links to other features; saved as none and off', async () => {
    load({ storeType: '' });
    render(<SizeFinderScreen shop={SHOP} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search what your store sells' }), { target: { value: 'mobile' } });
    fireEvent.click(screen.getByRole('option'));
    const card = await screen.findByRole('region', { name: "Find my size isn't needed" });
    expect(card).toHaveTextContent("Find my size isn't needed for “mobile”");
    expect(within(card).getByRole('link', { name: /Back in stock/ })).toHaveAttribute('href', `/admin/back-in-stock?shop=${encodeURIComponent(SHOP)}`);
    expect(screen.queryByRole('switch', { name: 'Turn on Find my size' })).toBeNull();
    expect(screen.queryByTestId('preview-frame')).toBeNull();
    expect(await savedSettings()).toMatchObject({ storeType: 'none', enabled: false });
  });
});

describe('change the store type', () => {
  it('Change opens the search with the current type marked; Cancel goes back', async () => {
    load({ storeType: 'clothing', enabled: true });
    render(<SizeFinderScreen shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
    expect(screen.getByRole('button', { name: /Clothing/, pressed: true })).toHaveTextContent('Current');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('region', { name: 'Your store type' })).toHaveTextContent('Clothing');
    expect(screen.getByLabelText('Row 1 Chest')).toHaveValue(91);
  });

  it('settings saved before store types (no type) are clothing', async () => {
    load({ storeType: undefined, enabled: true });
    render(<SizeFinderScreen shop={SHOP} />);
    expect(await screen.findByRole('region', { name: 'Your store type' })).toHaveTextContent('Clothing');
  });
});

describe('measure types', () => {
  it('rings: edit the chart (mm), add and remove sizes, saved under measureCharts.rings', async () => {
    load({ storeType: 'rings', enabled: true });
    render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByRole('region', { name: 'Size chart' });
    expect(screen.getByText('Finger size (around) (mm)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Add a size' }));
    fireEvent.change(screen.getByLabelText('Row 2 size'), { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText('Row 2 Finger size (around)'), { target: { value: '53' } });
    const s = await savedSettings();
    expect(s.measureCharts.rings).toEqual([{ size: '12', value: 52 }, { size: '13', value: 53 }]);
    expect(s.storeType).toBe('rings');
  });

  it('preview: Measure + Result screens, the type’s words, its caption, and the backend size for the sample', async () => {
    load({ storeType: 'shoes', enabled: true });
    render(<SizeFinderScreen shop={SHOP} />);
    const frame = await screen.findByTestId('preview-frame');
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith(`/api/size-finder/${SHOP}/preview`, 'POST', {
      storeType: 'shoes', chart: BASE.measureCharts.shoes, value: 25,
    }));
    const views = screen.getByRole('group', { name: 'Preview screen' });
    expect(within(views).getAllByRole('button').map((b) => b.textContent)).toEqual(['Measure', 'Result']);
    expect(await within(frame).findByText(/Best match/)).toBeInTheDocument();
    expect(within(frame).getByText('True to size')).toBeInTheDocument();
    fireEvent.click(within(views).getByRole('button', { name: 'Measure' }));
    expect(within(frame).getByText('Measure your foot')).toBeInTheDocument();
    expect(within(frame).getByText('How to measure')).toBeInTheDocument();
    expect(within(frame).getByText('25 cm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /^Button/ }));
    expect(screen.getByTestId('preview-card')).toHaveTextContent('Measure your foot · takes 30 seconds');
  });
});

describe('shoes preview', () => {
  it('the result shows the sample shoe with "Wearing" and a toe-room meter', async () => {
    load({ storeType: 'shoes', enabled: true });
    render(<SizeFinderScreen shop={SHOP} />);
    const frame = await screen.findByTestId('preview-frame');
    await within(frame).findByText(/Best match/);
    expect(frame.querySelector('.sfp-pvis.is-shoe .sfp-shoe')).toHaveAttribute('data-kind', 'sneaker');
    expect(frame.querySelector('.sfp-wearing')).toHaveTextContent('Wearing 7');
    expect(frame.querySelector('.sfp-toe')).toHaveTextContent('0.4 cm toe room — just right');
  });
});

describe('rings preview', () => {
  it('the result shows the sample ring on a finger with "Wearing" and a fit meter', async () => {
    load({ storeType: 'rings', enabled: true });
    apiSend.mockImplementation((url, method, body) =>
      Promise.resolve(url.endsWith('/preview') ? { size: '12', outOfRange: false, reasons: [{ area: 'fit', status: 'right' }] } : { settings: body.settings }));
    render(<SizeFinderScreen shop={SHOP} />);
    const frame = await screen.findByTestId('preview-frame');
    await within(frame).findByText(/Best match/);
    expect(frame.querySelector('.sfp-pvis.is-ring .sfp-ring')).toHaveAttribute('data-kind', 'solitaire');
    expect(frame.querySelector('.sfp-wearing')).toHaveTextContent('Wearing 12');
    expect(frame.querySelector('.sfp-toe')).toHaveTextContent('Exact fit — comfortable');
  });
});

describe('bangles preview', () => {
  it('the result shows the sample bangle set on a wrist with "Wearing" and a fit meter', async () => {
    load({ storeType: 'bangles', enabled: true });
    apiSend.mockImplementation((url, method, body) =>
      Promise.resolve(url.endsWith('/preview') ? { size: '2.6', outOfRange: false, reasons: [{ area: 'fit', status: 'right' }] } : { settings: body.settings }));
    render(<SizeFinderScreen shop={SHOP} />);
    const frame = await screen.findByTestId('preview-frame');
    await within(frame).findByText(/Best match/);
    expect(frame.querySelector('.sfp-pvis.is-bangle .sfp-bangle')).toHaveAttribute('data-kind', 'set');
    expect(frame.querySelector('.sfp-wearing')).toHaveTextContent('Wearing 2.6');
    expect(frame.querySelector('.sfp-toe')).toHaveTextContent('0.3 mm room — slides on, sits well');
  });
});
