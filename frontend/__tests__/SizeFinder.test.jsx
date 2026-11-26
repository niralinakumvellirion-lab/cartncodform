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
  apiSend.mockImplementation((url, method, body) =>
    Promise.resolve(url.endsWith('/preview') ? { size: 'M', reasons: [] } : { settings: body.settings }));
});

async function renderScreen() {
  render(<SizeFinderScreen shop={SHOP} />);
  await screen.findByRole('switch', { name: 'Turn on Find my size' });
}

async function saved() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  // The preview also calls apiSend (POST …/preview); the save is the PUT.
  await waitFor(() => expect(apiSend.mock.calls.some(([, m]) => m === 'PUT')).toBe(true));
  const [url, method, body] = apiSend.mock.calls.find(([, m]) => m === 'PUT');
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
    apiSend.mockImplementation((url) => (url.endsWith('/preview')
      ? Promise.resolve({ size: 'M', reasons: [] })
      : Promise.reject(new Error('Row 1: chest must be 40–200 cm'))));
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

describe('live preview (view only)', () => {
  const previewCalls = () => apiSend.mock.calls.filter(([url]) => url.endsWith('/preview'));

  it('works out the sample shopper size by itself and shows the unsaved button text', async () => {
    apiSend.mockImplementation((url, method, body) =>
      url.endsWith('/preview')
        ? Promise.resolve({ size: 'M', outOfRange: false, reasons: [{ area: 'chest', status: 'right' }, { area: 'length', status: 'info', value: 106 }] })
        : Promise.resolve({ settings: body.settings }));
    await renderScreen();
    expect(await screen.findByLabelText('Recommended size')).toHaveTextContent('M');
    const [url, method, body] = previewCalls()[0];
    expect(url).toBe(`/api/size-finder/${SHOP}/preview`);
    expect(method).toBe('POST');
    expect(body.chart).toEqual(SETTINGS.charts.women);
    expect(body.answers).toEqual({ gender: 'women', heightCm: 162, weightKg: 60, shape: 'average', fit: 'regular' });
    expect(screen.getByText('Garment length 106 cm')).toBeInTheDocument();
    expect(screen.getByLabelText('Example sizes').querySelector('.on')).toHaveTextContent('M');

    fireEvent.change(screen.getByLabelText('Button text'), { target: { value: 'Which size?' } });
    expect(screen.getByTestId('preview-frame')).toHaveTextContent('Which size?');
  });

  it('nothing inside the store frame can be clicked or typed in', async () => {
    await renderScreen();
    await screen.findByLabelText('Recommended size');
    const frame = screen.getByTestId('preview-frame');
    expect(frame.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0);
    expect(frame.querySelector('.sfp-static')).toHaveAttribute('inert');
  });

  it('editing the chart updates the preview result', async () => {
    await renderScreen();
    await screen.findByLabelText('Recommended size');
    fireEvent.change(screen.getByLabelText('Row 1 Chest'), { target: { value: '88' } });
    await waitFor(() => expect(previewCalls().at(-1)[2].chart[0].chest).toBe(88));
  });

  it('follows the chart editor: Men tab → men chart and men sample shopper', async () => {
    await renderScreen();
    await screen.findByLabelText('Recommended size');
    fireEvent.click(screen.getByRole('button', { name: 'Men (1)' }));
    await waitFor(() => expect(previewCalls().at(-1)[2].answers).toMatchObject({ gender: 'men', heightCm: 175, weightKg: 72 }));
    expect(previewCalls().at(-1)[2].chart).toEqual(SETTINGS.charts.men);
    expect(screen.getByText(/Sample shopper: Men/)).toBeInTheDocument();
  });

  it('shows the backend error in the result', async () => {
    apiSend.mockRejectedValue(new Error('This size chart is empty'));
    await renderScreen();
    expect(await screen.findByText('This size chart is empty')).toBeInTheDocument();
  });

  it('both charts empty → explains shoppers will not see the button', async () => {
    apiGet.mockResolvedValue({ settings: { ...SETTINGS, charts: { women: [], men: [] } } });
    render(<SizeFinderScreen shop={SHOP} />);
    expect(await screen.findByText(/Both size charts are empty/)).toBeInTheDocument();
  });
});

describe('preview design', () => {
  it('view tabs, Desktop / Mobile, progress, inches, fit meter', async () => {
    apiSend.mockResolvedValue({ size: 'M', reasons: [{ area: 'chest', status: 'snug' }] });
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByRole('switch', { name: 'Turn on Find my size' });
    await screen.findByLabelText('Recommended size');
    expect(container.querySelector('.sfp-meter-bar span').style.left).toBe('18%'); // chest "snug"
    expect(screen.getByText('A little snug')).toBeInTheDocument();
    expect(container.querySelectorAll('.sfp-progress span.on')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(container.querySelector('.sfp-frame').className).toMatch(/is-mobile/);

    fireEvent.click(screen.getByRole('button', { name: 'Step 1' }));
    expect(container.querySelectorAll('.sfp-progress span.on')).toHaveLength(1);
    expect(screen.getByTestId('preview-frame')).toHaveTextContent('162 cm');
    fireEvent.click(screen.getByRole('button', { name: 'in' }));
    expect(screen.getByTestId('preview-frame')).toHaveTextContent('5′ 4″');

    fireEvent.click(screen.getByRole('button', { name: 'Step 2' }));
    expect(screen.getByTestId('preview-frame')).toHaveTextContent('BroadWider frame');
    expect(container.querySelector('.sfp-cards > span.on')).toHaveTextContent('Average');
  });
});

describe('pinned preview', () => {
  const { fitScale } = require('../app/admin/screens/SizeFinder');
  it('fits: full size when it fits, zoomed out to the screen height when taller, never below 85%', () => {
    expect(fitScale(500, 900)).toBe(1);
    expect(fitScale(620, 600)).toBe(0.916); // (600 - 32) / 620
    expect(fitScale(3000, 600)).toBe(0.85);
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
