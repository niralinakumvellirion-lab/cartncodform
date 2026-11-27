/**
 * Admin "Find my size" screen (jsdom + React Testing Library).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import SizeFinderScreen, { toUnit, fromUnit } from '../app/admin/screens/SizeFinder';

const SHOP = 'test.myshopify.com';
const SETTINGS = {
  enabled: true, productTag: '', buttonText: 'Find my size', accentColor: '#111827', unit: 'cm',
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

// Open a step in the step bar (Size chart · Button · Shopper features · Words · Go live).
function goStep(name) {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));
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

  it('tag and button text are saved', async () => {
    await renderScreen();
    goStep('Go live');
    fireEvent.change(screen.getByLabelText('Product tag'), { target: { value: 'size-finder' } });
    goStep('Button');
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
    fireEvent.click(screen.getByRole('button', { name: 'Man (1)' }));
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
    const rows = Array.from(screen.getByTestId('preview-frame').querySelectorAll('.sfp-size')).map((r) => r.textContent);
    expect(rows).toEqual(['SFits close', 'MRecommended']);

    goStep('Button');
    fireEvent.change(screen.getByLabelText('Button text'), { target: { value: 'Which size?' } });
    expect(screen.getByTestId('preview-card')).toHaveTextContent('Which size?');
  });

  it('nothing inside the store frame can be clicked or typed in', async () => {
    await renderScreen();
    await screen.findByLabelText('Recommended size');
    goStep('Go live'); // both previews
    const frame = screen.getByTestId('preview-frame');
    expect(frame.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0);
    expect(frame).toHaveAttribute('inert');
    expect(screen.getByTestId('preview-card')).toHaveAttribute('inert');
    expect(screen.getByTestId('preview-card').querySelectorAll('button, input, a')).toHaveLength(0);
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
    fireEvent.click(screen.getByRole('button', { name: 'Man (1)' }));
    await waitFor(() => expect(previewCalls().at(-1)[2].answers).toMatchObject({ gender: 'men', heightCm: 175, weightKg: 72 }));
    expect(previewCalls().at(-1)[2].chart).toEqual(SETTINGS.charts.men);
    expect(within(screen.getByRole('group', { name: 'Sample shopper' })).getByRole('button', { name: 'Man' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the backend error in the result', async () => {
    apiSend.mockRejectedValue(new Error('This size chart is empty'));
    await renderScreen();
    expect(await screen.findByText('This size chart is empty')).toBeInTheDocument();
  });

  it('both charts empty → explains shoppers will not see the button', async () => {
    apiGet.mockResolvedValue({ settings: { ...SETTINGS, charts: { women: [], men: [] } } });
    render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByRole('tablist', { name: 'Set up steps' });
    goStep('Button');
    expect(await screen.findByText(/Both size charts are empty/)).toBeInTheDocument();
  });
});

describe('button on the product page', () => {
  it('button text and caption are edited in the admin, shown in the preview and saved', async () => {
    await renderScreen();
    goStep('Button');
    expect(screen.queryByLabelText('Card heading')).toBeNull(); // the reel-style button has no heading
    fireEvent.change(screen.getByLabelText('Caption under the button'), { target: { value: 'Answer 3 questions' } });
    fireEvent.change(screen.getByLabelText('Button text'), { target: { value: 'Check size' } });
    const card = screen.getByTestId('preview-card');
    expect(card.querySelector('.sfp-trigger')).toHaveTextContent('Check size');
    expect(card.querySelector('.sfp-caption')).toHaveTextContent('Answer 3 questions');
    const s = await saved();
    expect(s.cardText).toBe('Answer 3 questions');
    expect(s.buttonText).toBe('Check size');
  });

  it('empty fields show the default words in the preview', async () => {
    await renderScreen();
    goStep('Button');
    fireEvent.change(screen.getByLabelText('Button text'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Caption under the button'), { target: { value: '' } });
    const card = screen.getByTestId('preview-card');
    expect(card.querySelector('.sfp-trigger')).toHaveTextContent('Find my ideal size');
    expect(card.querySelector('.sfp-caption')).toHaveTextContent('3 quick questions · takes 20 seconds');
  });

  it('button style and corners: shown in the preview and saved', async () => {
    await renderScreen();
    goStep('Button');
    const cta = () => screen.getByTestId('preview-card').querySelector('.sfp-trigger');
    expect(cta().style.borderRadius).toBe('999px');
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    fireEvent.change(screen.getByLabelText('Button corner radius'), { target: { value: '8' } });
    expect(cta().className).toMatch(/is-outline/);
    expect(cta().style.borderRadius).toBe('8px');
    expect(screen.getByText('8 px')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Soft' }));
    expect(cta().className).toMatch(/is-soft/);
    const s = await saved();
    expect(s.buttonStyle).toBe('soft');
    expect(s.buttonRadius).toBe(8);
  });

  it('corner helpers', () => {
    const { radiusLabel, radiusValue } = require('../app/admin/screens/SizeFinder');
    expect(radiusLabel(0)).toBe('Square');
    expect(radiusLabel(undefined)).toBe('Round');
    expect(radiusLabel(30)).toBe('Round');
    expect(radiusValue('x')).toBe(24);
  });
});

describe('preview like the storefront "Try it on me" sheet', () => {
  it('two previews: the button, and the sheet with Base / Height & weight / Build / Creating / Result', async () => {
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByLabelText('Recommended size');
    goStep('Go live');
    expect(screen.getByText('Button on the product page', { selector: '.sfp-blocktitle' })).toBeInTheDocument();
    expect(screen.getByText('Size preview', { selector: '.sfp-blocktitle' })).toBeInTheDocument();
    const frame = () => screen.getByTestId('preview-frame');
    expect(frame()).toHaveTextContent('Find my size');
    expect(frame()).toHaveTextContent('Change my avatar');
    fireEvent.click(screen.getByRole('button', { name: 'Base' }));
    expect(frame()).toHaveTextContent('Choose your avatar base');
    expect(Array.from(container.querySelectorAll('.sfp-row .sfp-rlabel')).map((e) => e.textContent)).toEqual(['Man', 'Woman']);
    expect(container.querySelectorAll('.sfp-dot')).toHaveLength(4);
    expect(frame()).toHaveTextContent('Your data stays private and secure');
    fireEvent.click(screen.getByRole('button', { name: 'Height & weight' }));
    expect(frame()).toHaveTextContent('Enter your height and weight');
    expect(container.querySelector('.sfp-live')).toHaveTextContent('Likely size M');
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    expect(Array.from(container.querySelectorAll('.sfp-build b')).map((e) => e.textContent)).toEqual(['Slim', 'Athletic', 'Balanced', 'Broad']);
    expect(container.querySelector('.sfp-build.on')).toHaveTextContent('Balanced');
    fireEvent.click(screen.getByRole('button', { name: 'Creating' }));
    expect(frame()).toHaveTextContent('Creating your avatar');
    expect(container.querySelector('.sfp-pedestal')).not.toBeNull();
  });

  it('corners: number box and presets', async () => {
    await renderScreen();
    goStep('Button');
    fireEvent.change(screen.getByLabelText('Button corner radius in px'), { target: { value: '30' } });
    expect(screen.getByLabelText('Button corner radius in px')).toHaveValue(24);
    fireEvent.change(screen.getByLabelText('Button corner radius in px'), { target: { value: '10' } });
    expect(screen.getByTestId('preview-card').querySelector('.sfp-trigger').style.borderRadius).toBe('10px');
    expect(screen.getByLabelText('Button corner radius')).toHaveValue('10');
    fireEvent.click(screen.getByRole('button', { name: 'Square' }));
    expect(screen.getByTestId('preview-card').querySelector('.sfp-trigger').style.borderRadius).toBe('0px');
    const s = await saved();
    expect(s.buttonRadius).toBe(0);
  });
});

describe('size advisor words and options', () => {
  it('words are edited in the admin, shown in the preview (which jumps to that screen) and saved', async () => {
    await renderScreen();
    await screen.findByLabelText('Recommended size');
    const frame = () => screen.getByTestId('preview-frame');
    goStep('Words');
    fireEvent.focus(screen.getByLabelText('Man label'));
    fireEvent.change(screen.getByLabelText('Man label'), { target: { value: 'Gents' } });
    expect(frame()).toHaveTextContent('Gents');
    expect(screen.getByRole('tab', { name: /^Words/ })).toHaveAttribute('title', '1 changed');
    expect(screen.getByRole('tab', { name: /^Words/ })).toHaveTextContent('Edited');
    goStep('Size chart');
    expect(screen.getByRole('button', { name: 'Gents (1)' })).toBeInTheDocument(); // chart tab follows
    goStep('Words');
    fireEvent.focus(screen.getByLabelText('Step 3 heading'));
    fireEvent.change(screen.getByLabelText('Step 3 heading'), { target: { value: 'Your body type' } });
    expect(frame()).toHaveTextContent('Your body type');
    fireEvent.focus(screen.getByLabelText('Creating heading'));
    fireEvent.change(screen.getByLabelText('Creating heading'), { target: { value: 'Building you' } });
    expect(frame()).toHaveTextContent('Building you');
    fireEvent.focus(screen.getByLabelText('Add to cart button'));
    fireEvent.change(screen.getByLabelText('Add to cart button'), { target: { value: 'Buy {size} now' } });
    expect(frame()).toHaveTextContent('Buy M now');
    fireEvent.focus(screen.getByLabelText('Privacy note'));
    fireEvent.change(screen.getByLabelText('Privacy note'), { target: { value: 'Never shared' } });
    expect(frame()).toHaveTextContent('Never shared');
    const s = await saved();
    expect(s.texts).toMatchObject({ menLabel: 'Gents', step3Title: 'Your body type', creatingTitle: 'Building you', addToBagText: 'Buy {size} now', privacyText: 'Never shared' });
  });

  it('on/off parts hide them in the preview and are saved', async () => {
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByLabelText('Recommended size');
    goStep('Shopper features');
    expect(screen.getByRole('tab', { name: /^Shopper features/ })).toHaveAttribute('title', '4 of 4 on');
    expect(screen.getByRole('tab', { name: /^Shopper features/ })).toHaveTextContent('4/4');
    fireEvent.click(screen.getByRole('switch', { name: 'Show Likely size' }));
    expect(container.querySelector('.sfp-live')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Show Add to cart button' }));
    expect(screen.getByTestId('preview-frame')).toHaveTextContent('Select size M');
    const s = await saved();
    expect(s.options).toMatchObject({ liveEstimate: false, addToBag: false, rememberSize: true, sizeChart: true });
  });
});

describe('on / off', () => {
  it('Off: no settings and no preview, only a message; turning it on shows everything', async () => {
    apiGet.mockResolvedValue({ settings: { ...JSON.parse(JSON.stringify(SETTINGS)), enabled: false } });
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByText('Find my size is off');
    expect(screen.queryByRole('tablist', { name: 'Set up steps' })).toBeNull();
    expect(screen.queryByLabelText('Live preview')).toBeNull();
    expect(container.querySelector('.sf-side')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on Find my size' }));
    expect(screen.getByRole('tablist', { name: 'Set up steps' })).toBeInTheDocument();
    expect(screen.getByLabelText('Live preview')).toBeInTheDocument();
    const s = await saved();
    expect(s.enabled).toBe(true);
  });

  it('switching Off hides everything and saves enabled: false', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('switch', { name: 'Turn on Find my size' }));
    expect(screen.queryByRole('tablist', { name: 'Set up steps' })).toBeNull();
    expect(screen.queryByLabelText('Live preview')).toBeNull();
    const s = await saved();
    expect(s.enabled).toBe(false);
  });
});

describe('steps', () => {
  it('five tabs with a short badge and the full status on hover; one step open at a time; Next / back; the preview follows the step', async () => {
    await renderScreen();
    await screen.findByLabelText('Recommended size');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.querySelector('.sf-tabname').textContent)).toEqual(['Size chart', 'Button', 'Shopper features', 'Words', 'Go live']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveTextContent('Size chart3');
    expect(tabs[0]).toHaveAttribute('title', '3 sizes');
    expect(tabs[1]).toHaveAttribute('title', 'Outline · Round');
    expect(tabs[3]).toHaveAttribute('title', 'Default words');
    expect(tabs[3]).toHaveTextContent(/^Words$/);
    expect(tabs[4]).toHaveAttribute('title', 'All products with sizes');

    // Size chart → only the size preview
    expect(screen.getByRole('tabpanel', { name: 'Size chart' })).toBeInTheDocument();
    expect(screen.queryByTestId('preview-card')).toBeNull();
    expect(screen.getByTestId('preview-frame')).toBeInTheDocument();
    expect(screen.queryByLabelText('Button text')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next: Button →' }));
    expect(screen.getByRole('tabpanel', { name: 'Button' })).toBeInTheDocument();
    expect(screen.getByTestId('preview-card')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-frame')).toBeNull();
    expect(screen.getByText(/Showing the button you are editing/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show both' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '← Size chart' }));
    expect(screen.getByRole('tabpanel', { name: 'Size chart' })).toBeInTheDocument();

    goStep('Go live'); // both, plus where it shows and the theme block
    expect(screen.getByTestId('preview-card')).toBeInTheDocument();
    expect(screen.getByTestId('preview-frame')).toBeInTheDocument();
    expect(screen.getByLabelText('Product tag')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Next:/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Product tag'), { target: { value: 'sizes' } });
    expect(screen.getByRole('tab', { name: /^Go live/ })).toHaveAttribute('title', 'Tag: sizes');
  });

  it('Words: Reset to default words appears once a word is changed and puts them back', async () => {
    await renderScreen();
    goStep('Words');
    expect(screen.queryByRole('button', { name: 'Reset to default words' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Panel title'), { target: { value: 'Size help' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default words' }));
    expect(screen.getByLabelText('Panel title')).toHaveValue('Find my size');
    const s = await saved();
    expect(s.texts).toEqual({});
  });
});

describe('preview highlights the field being edited', () => {
  const lit = () => Array.from(document.querySelectorAll('.sfp .is-hl'));

  it('nothing at first; each field lights up its own part, with an "Editing" note', async () => {
    await renderScreen();
    await screen.findByLabelText('Recommended size');
    expect(lit()).toHaveLength(0);
    expect(screen.queryByTestId('preview-editing')).toBeNull();

    goStep('Button');
    fireEvent.focus(screen.getByLabelText('Caption under the button'));
    expect(lit().map((e) => e.className)).toEqual([expect.stringContaining('sfp-caption')]);
    expect(screen.getByTestId('preview-editing')).toHaveTextContent('Editing: Caption under the button');

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outline' }));
    expect(lit()).toHaveLength(1);
    expect(lit()[0].className).toContain('sfp-trigger');
    expect(screen.getByTestId('preview-editing')).toHaveTextContent('Button style');

    // Woman label → only the Woman row on the avatar base screen
    goStep('Words');
    fireEvent.focus(screen.getByLabelText('Woman label'));
    expect(lit()).toHaveLength(1);
    expect(lit()[0]).toHaveTextContent('Woman');
    fireEvent.focus(screen.getByLabelText('Man label'));
    expect(lit()[0]).toHaveTextContent('Man');

    fireEvent.focus(screen.getByLabelText('Step 2 heading'));
    expect(lit()[0].className).toContain('sfp-title');
    expect(lit()[0]).toHaveTextContent('Enter your height and weight');
  });

  it('switches and the size chart light up their parts and open the right screen', async () => {
    await renderScreen();
    await screen.findByLabelText('Recommended size');

    goStep('Shopper features');
    fireEvent.mouseDown(screen.getByRole('switch', { name: 'Show Remember my size' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Show Remember my size' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Show Remember my size' })); // back on
    expect(lit()[0].className).toContain('sfp-check');

    goStep('Size chart');
    fireEvent.focus(screen.getByLabelText('Row 1 Chest'));
    await screen.findByLabelText('Recommended size'); // jumped to the result
    expect(lit().map((e) => e.className.split(' ')[0])).toEqual(['sfp-sizes']);
    expect(screen.getByTestId('preview-editing')).toHaveTextContent('Size chart');

    fireEvent.mouseDown(screen.getByRole('button', { name: 'in' }));
    expect(lit().every((e) => e.className.includes('sfp-units'))).toBe(true);
    expect(lit()).toHaveLength(2);

    goStep('Go live');
    fireEvent.focus(screen.getByLabelText('Product tag')); // the whole product-page block
    expect(lit()[0].className).toContain('sfp-page');
  });
});

describe('preview design', () => {
  it('Desktop / Mobile, inches and pounds on the height & weight screen', async () => {
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByLabelText('Recommended size');
    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(container.querySelector('.sfp-stage').className).toMatch(/is-mobile/);
    fireEvent.click(screen.getByRole('button', { name: 'Height & weight' }));
    expect(Array.from(container.querySelectorAll('.sfp-fval')).map((e) => e.textContent)).toEqual(['162 cm', '60 kg']);
    fireEvent.click(screen.getByRole('button', { name: 'in' }));
    expect(Array.from(container.querySelectorAll('.sfp-fval')).map((e) => e.textContent)).toEqual(['5′ 4″', '132 lb']);
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

describe('dressed avatar in the preview', () => {
  it('the result avatar wears the sample kurta, with a "Wearing" chip for the size', async () => {
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByLabelText('Recommended size');
    const frame = screen.getByTestId('preview-frame');
    expect(frame.querySelector('.sfp-avatar .sfp-garment')).toHaveAttribute('data-kind', 'kurta');
    expect(frame.querySelector('.sfp-wearing')).toHaveTextContent('Wearing M');
    expect(container.querySelector('.sfp-wear')).toBeNull();
  });
});

describe('preview: sample shopper and device frames', () => {
  it('Woman / Man switch changes the sample shopper, the backend sample and the mannequin', async () => {
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByLabelText('Recommended size');
    const group = screen.getByRole('group', { name: 'Sample shopper' });
    expect(within(group).getByRole('button', { name: 'Woman' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.sfp-avatar svg')).toHaveAttribute('data-gender', 'women');
    fireEvent.click(within(group).getByRole('button', { name: 'Man' }));
    await waitFor(() => expect(apiSend.mock.calls.filter(([u]) => u.endsWith('/preview')).at(-1)[2].answers)
      .toMatchObject({ gender: 'men', heightCm: 175, weightKg: 72 }));
    expect(container.querySelector('.sfp-avatar svg')).toHaveAttribute('data-gender', 'men');
    expect(container.querySelector('.sfp-shopperstats')).toHaveTextContent('175 cm72 kgBalanced');
  });

  it('desktop shows a browser window with the store address; mobile a phone', async () => {
    const { container } = render(<SizeFinderScreen shop={SHOP} />);
    await screen.findByLabelText('Recommended size');
    expect(container.querySelector('.sfp-device.is-desktop .sfp-url')).toHaveTextContent('yourstore.com/products/cotton-kurta');
    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(container.querySelector('.sfp-device.is-mobile .sfp-phonebar')).not.toBeNull();
    expect(screen.getByTestId('preview-frame')).toHaveAttribute('inert');
  });
});
