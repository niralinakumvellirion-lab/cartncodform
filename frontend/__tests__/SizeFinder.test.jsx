/**
 * Admin "Find my size" screen (jsdom + React Testing Library).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import SizeFinderScreen, { toUnit, fromUnit } from '../app/admin/screens/SizeFinder';

const SHOP = 'test.myshopify.com';
const SETTINGS = {
  enabled: false, productTag: '', buttonText: 'Find my size', accentColor: '#111827', unit: 'cm',
  charts: {
    women: [{ size: 'S', chest: 86, waist: 71, length: 105 }, { size: 'M', chest: 91, waist: 76, length: 106 }],
    men: [{ size: 'M', chest: 97, waist: 83, length: 73 }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  apiGet.mockResolvedValue({ settings: JSON.parse(JSON.stringify(SETTINGS)) });
  apiSend.mockImplementation((url, method, body) => Promise.resolve({ settings: body.settings }));
});

async function renderScreen() {
  render(<SizeFinderScreen shop={SHOP} />);
  await screen.findByRole('switch', { name: 'Turn on Find my size' });
}

async function saved() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
  const [url, method, body] = apiSend.mock.calls[0];
  expect(url).toBe(`/api/size-finder/${SHOP}/config`);
  expect(method).toBe('PUT');
  return body.settings;
}

describe('SizeFinder screen', () => {
  it('loads the settings for the shop', async () => {
    await renderScreen();
    expect(apiGet).toHaveBeenCalledWith(`/api/size-finder/${SHOP}/config`);
    expect(screen.getByLabelText('Row 2 size')).toHaveValue('M');
    expect(screen.getByLabelText('Row 2 Chest')).toHaveValue(91);
  });

  it('switch on, tag and button text are saved', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('switch', { name: 'Turn on Find my size' }));
    fireEvent.change(screen.getByLabelText('Product tag'), { target: { value: 'size-finder' } });
    fireEvent.change(screen.getByLabelText('Button text'), { target: { value: 'Which size am I?' } });
    const s = await saved();
    expect(s.enabled).toBe(true);
    expect(s.productTag).toBe('size-finder');
    expect(s.buttonText).toBe('Which size am I?');
    expect(await screen.findByText('✓ Saved')).toBeInTheDocument();
  });

  it('inches show converted values and are stored back in cm', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'in' }));
    expect(screen.getByLabelText('Row 2 Chest')).toHaveValue(35.8); // 91 cm
    fireEvent.change(screen.getByLabelText('Row 2 Chest'), { target: { value: '36' } });
    const s = await saved();
    expect(s.unit).toBe('in');
    expect(s.charts.women[1].chest).toBe(91.4);
  });

  it('switch to the men chart, add and remove sizes', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Men (1)' }));
    expect(screen.getByLabelText('Row 1 size')).toHaveValue('M');
    fireEvent.click(screen.getByRole('button', { name: '+ Add a size' }));
    fireEvent.change(screen.getByLabelText('Row 2 size'), { target: { value: 'L' } });
    fireEvent.change(screen.getByLabelText('Row 2 Chest'), { target: { value: '102' } });
    fireEvent.change(screen.getByLabelText('Row 2 Waist'), { target: { value: '88' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    const s = await saved();
    expect(s.charts.men).toEqual([{ size: 'L', chest: 102, waist: 88, length: '' }]);
  });

  it('shows the reason when saving fails', async () => {
    apiSend.mockRejectedValue(new Error('Row 1: chest must be 40–200 cm'));
    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Row 1: chest must be 40–200 cm');
  });

  it('unit helpers', () => {
    expect(toUnit(91, 'in')).toBe('35.8');
    expect(toUnit(91, 'cm')).toBe('91');
    expect(toUnit(0, 'cm')).toBe('');
    expect(fromUnit('36', 'in')).toBe(91.4);
    expect(fromUnit('', 'in')).toBe('');
  });
});

describe('live preview', () => {

  it('uses the unsaved button text, sizes and chart, and asks the backend for the size', async () => {
    apiSend.mockImplementation((url, method, body) =>
      url.endsWith('/preview')
        ? Promise.resolve({ size: 'M', outOfRange: false, reasons: [{ area: 'chest', status: 'right' }, { area: 'length', status: 'info', value: 106 }] })
        : Promise.resolve({ settings: body.settings }));
    await renderScreen();
    fireEvent.change(screen.getByLabelText('Button text'), { target: { value: 'Which size?' } });
    expect(screen.getByRole('button', { name: /Which size\?/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Example sizes')).toHaveTextContent('SM');

    // The preview panel starts open, on step 1
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Relaxed' }));
    fireEvent.click(screen.getByRole('button', { name: 'See my size' }));

    expect(await screen.findByLabelText('Recommended size')).toHaveTextContent('M');
    const [url, method, body] = apiSend.mock.calls[0];
    expect(url).toBe(`/api/size-finder/${SHOP}/preview`);
    expect(method).toBe('POST');
    expect(body.chart).toEqual(SETTINGS.charts.women);
    expect(body.answers).toEqual({ gender: 'women', heightCm: 162, weightKg: 60, shape: 'average', fit: 'relaxed' });
    expect(screen.getByText('Garment length 106 cm')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select size M' }));
    expect(screen.getByRole('button', { name: /Your size: M/ })).toBeInTheDocument();
  });

  it('editing the chart sends the new chart to the preview', async () => {
    apiSend.mockResolvedValue({ size: 'S', reasons: [] });
    await renderScreen();
    fireEvent.change(screen.getByLabelText('Row 1 Chest'), { target: { value: '88' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'See my size' }));
    await screen.findByLabelText('Recommended size');
    expect(apiSend.mock.calls[0][2].chart[0].chest).toBe(88);
  });

  it('height in feet, Women/Men choice, and an error from the backend', async () => {
    apiSend.mockRejectedValue(new Error('This size chart is empty'));
    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'ft' }));
    expect(screen.getByText('5′ 4″')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Men' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'See my size' }));
    expect(await screen.findByText('This size chart is empty')).toBeInTheDocument();
    expect(apiSend.mock.calls[0][2].answers.gender).toBe('men');
  });

  it('both charts empty → explains shoppers will not see the button', async () => {
    apiGet.mockResolvedValue({ settings: { ...SETTINGS, charts: { women: [], men: [] } } });
    render(<SizeFinderScreen shop={SHOP} />);
    expect(await screen.findByText(/Both size charts are empty/)).toBeInTheDocument();
  });
});

describe('preview design', () => {
  it('Desktop / Mobile switch, progress, option card hints, fit meter and close', async () => {
    apiSend.mockResolvedValue({ size: 'M', reasons: [{ area: 'chest', status: 'snug' }] });
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByRole('switch', { name: 'Turn on Find my size' });
    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(container.querySelector('.sfp-frame').className).toMatch(/is-mobile/);
    expect(container.querySelectorAll('.sfp-progress span.on')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: 'Broad' })).toHaveTextContent('BroadWider frame');
    fireEvent.click(screen.getByRole('button', { name: 'See my size' }));
    await screen.findByLabelText('Recommended size');
    expect(container.querySelector('.sfp-meter-bar span').style.left).toBe('18%'); // chest "snug"
    expect(screen.getByText('A little snug')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(container.querySelector('.sfp-panel')).toBeNull();
  });
});

describe('pinned preview', () => {
  const { fitScale } = require('../app/admin/screens/SizeFinder');
  it('fits: full size when it fits, zoomed out to the screen height when taller, never below 50%', () => {
    expect(fitScale(500, 900)).toBe(1);
    expect(fitScale(1068, 600)).toBe(0.532); // (600 - 32) / 1068
    expect(fitScale(3000, 600)).toBe(0.5);
    expect(fitScale(0, 600)).toBe(1);
  });
  it('the preview column has no scroll bar of its own', async () => {
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByRole('switch', { name: 'Turn on Find my size' });
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('');
    expect(css).toMatch(/\.sf-side\{position:sticky;top:16px/);
    expect(css).not.toMatch(/\.sf-side\{[^}]*overflow(-y)?:(auto|scroll)/);
    expect(container.querySelector('.sf-fit')).not.toBeNull();
  });
});
