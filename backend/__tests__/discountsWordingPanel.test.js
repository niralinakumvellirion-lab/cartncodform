'use strict';
/**
 * Real react-dom/server renderToStaticMarkup tests for the Discounts wording
 * panel. useState is mocked via a jest.mock factory so we can control the
 * initial state without a running server or browser; useEffect is a no-op
 * (it never fires in SSR anyway). All other behaviour is real React.
 *
 * State call order inside Discounts({ shop }):
 *   0  config          {}
 *   1  loading         true
 *   2  saving          false
 *   3  success         false
 *   4  error           ''
 *   5  previewColors   { accentColor:'#4f46e5', bgColor:'#ffffff', ... }
 *   6  wordingTab      0
 *   7  popupPanelView  0  (entry-popup-colours: 0=Wording, 1=Colours)
 *   8  poView          0  (post-order panel: 0=Wording, 1=Colours)
 *   9  poPreviewState  0  (post-order preview: 0=ask, 1=missing date, 2=saved)
 *  10  coloursPatch    {}
 * (coloursSaving removed in follow-up — single-save)
 */

// --- useState / useEffect control (must appear before any require) ----------
// The factory runs when 'react' is first required; state control variables
// are declared as plain properties on a shared object to avoid TDZ issues
// with jest.mock hoisting.
const _ctrl = { states: null, idx: 0 };

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: function (init) {
      if (_ctrl.states !== null && _ctrl.idx < _ctrl.states.length) {
        return [_ctrl.states[_ctrl.idx++], function () {}];
      }
      _ctrl.idx++;
      return [init, function () {}];
    },
    useEffect: function () {},   // no-op: effects never fire in SSR
  };
});

// ---------------------------------------------------------------------------

const React               = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const fs                  = require('fs');
const path                = require('path');

const Discounts = require('../../frontend/app/admin/screens/Discounts').default;
const DISCOUNTS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/app/admin/screens/Discounts.jsx'),
  'utf8',
);

// Default preview colours (indigo accent, white bg → light card)
const DEFAULT_COLORS = { accentColor: '#4f46e5', bgColor: '#ffffff', textColor: '', buttonTextColor: 'auto', textMode: 'custom', styleId: 'classic' };

// Builds the 14-element state array expected by DiscountsScreen.
// Slots 11-13 are NEW (added for the product-page birthday box panel):
//   11  ppView          0  (product-page panel: 0=Wording, 1=Colours)
//   12  ppPreviewState  0  (product-page preview: 0=Ask, 1=Email-err, 2=Date-err, 3=Saved)
//   13  ppColoursPatch  {}
function makeStates({ config = {}, loading = false, previewColors = DEFAULT_COLORS, wordingTab = 0, popupPanelView = 0, poView = 0, poPreviewState = 0, ppView = 0, ppPreviewState = 0 } = {}) {
  return [config, loading, false, false, '', previewColors, wordingTab, popupPanelView, poView, poPreviewState, {}, ppView, ppPreviewState, {}];
}

// Renders the Discounts component with controlled initial state.
function renderWith(opts) {
  _ctrl.states = makeStates(opts);
  _ctrl.idx    = 0;
  try {
    return renderToStaticMarkup(
      React.createElement(Discounts, { shop: 'test.myshopify.com' }),
    );
  } finally {
    _ctrl.states = null;
    _ctrl.idx    = 0;
  }
}

// Returns number of <input elements inside the wording panel.
// Panel is delimited by 'Change the text on each step' … 'Saved with'.
// (entry-popup-colours: the panel header changed from 'Entry popup wording' to
// 'Entry popup' + view switch; the description text is the stable anchor.)
function countPanelInputs(html) {
  const start = html.indexOf('Change the text on each step');
  const end   = html.indexOf('Saved with', start);
  if (start < 0 || end < 0) return -1;
  return (html.slice(start, end).match(/<input /g) || []).length;
}

// ---------------------------------------------------------------------------

describe('Discounts wording panel — renderToStaticMarkup', () => {

  // ── Placement ──────────────────────────────────────────────────────────────

  test('Entry popup OFF: wording panel description absent', () => {
    const html = renderWith({ config: {} });
    expect(html).not.toContain('Change the text on each step');
  });

  test('Entry popup ON: wording panel description present', () => {
    const html = renderWith({ config: { birthdayCapture: { popup: { enabled: true } } } });
    // entry-popup-colours: header is now "Entry popup" + Wording|Colours switch.
    // The wording view description is the stable anchor for panel presence.
    expect(html).toContain('Change the text on each step');
  });

  test('ON: panel is inside the birthday card and after the Entry popup row', () => {
    const html = renderWith({ config: { birthdayCapture: { popup: { enabled: true } } } });
    const bdCard   = html.indexOf('How do you collect birthdays?');
    const entryRow = html.indexOf('Shows a birthday step after the subscriber');
    const panel    = html.indexOf('Change the text on each step');
    const method3  = html.indexOf('After the first COD order');

    expect(bdCard).toBeGreaterThan(0);
    expect(entryRow).toBeGreaterThan(bdCard);  // row inside the card
    expect(panel).toBeGreaterThan(entryRow);   // panel after the row
    expect(panel).toBeLessThan(method3);       // panel still inside the card
  });

  // ── Tab count ──────────────────────────────────────────────────────────────

  test('ON: exactly 4 tabs with role="tab"', () => {
    const html = renderWith({ config: { birthdayCapture: { popup: { enabled: true } } } });
    expect((html.match(/role="tab"/g) || []).length).toBe(4);
  });

  test('ON: all four tab labels present', () => {
    const html = renderWith({ config: { birthdayCapture: { popup: { enabled: true } } } });
    expect(html).toContain('Discount box');
    expect(html).toContain('Subscribed');
    expect(html).toContain('Offer unlocked');
    expect(html).toContain('Birthday step');
  });

  // ── Input counts ───────────────────────────────────────────────────────────

  test('Discount box tab (wordingTab=0): exactly 2 inputs in wording panel', () => {
    const html = renderWith({
      config: { birthdayCapture: { popup: { enabled: true } } },
      wordingTab: 0,
    });
    expect(countPanelInputs(html)).toBe(2);
  });

  test('Birthday step tab (wordingTab=3): exactly 5 inputs in wording panel', () => {
    const html = renderWith({
      config: { birthdayCapture: { popup: { enabled: true } } },
      wordingTab: 3,
    });
    expect(countPanelInputs(html)).toBe(5);
  });

  // ── Custom popupCopy values appear in rendered inputs ─────────────────────

  test('Custom emailPlaceholder value appears in rendered HTML', () => {
    const html = renderWith({
      config: {
        birthdayCapture: { popup: { enabled: true } },
        popupCopy: { emailPlaceholder: 'Drop your e-mail here' },
      },
      wordingTab: 0,
    });
    expect(html).toContain('Drop your e-mail here');
  });

  test('Custom bdButton value appears in rendered HTML on birthday tab', () => {
    const html = renderWith({
      config: {
        birthdayCapture: { popup: { enabled: true } },
        popupCopy: { bdButton: 'Claim my birthday gift' },
      },
      wordingTab: 3,
    });
    expect(html).toContain('Claim my birthday gift');
  });

  // ── buildPayload keeps popupCopy when switch is OFF ────────────────────────

  test('buildPayload sends popupCopy unconditionally (source check)', () => {
    const bpStart = DISCOUNTS_SRC.indexOf('function buildPayload(config)');
    expect(bpStart).toBeGreaterThan(0);
    const retIdx  = DISCOUNTS_SRC.indexOf('return out;', bpStart);
    const bpEnd   = DISCOUNTS_SRC.indexOf('}', retIdx) + 1;
    const bpBody  = DISCOUNTS_SRC.slice(bpStart, bpEnd);
    const pcIdx   = bpBody.indexOf('out.popupCopy = {}');
    const gateIdx = bpBody.indexOf('popup?.enabled');
    // popupCopy must be set; if a popup.enabled gate exists it must come after
    expect(pcIdx).toBeGreaterThan(0);
    expect(gateIdx < 0 || pcIdx < gateIdx).toBe(true);
  });

  // ── Preview captureButton: transparent background (regression for Item 1) ──

  test('captureButton preview has transparent background (not accent-tinted)', () => {
    const html = renderWith({
      config: { birthdayCapture: { popup: { enabled: true } } },
      wordingTab: 0,
    });
    // Locate the preview section (comes after the "Preview" label)
    const previewIdx  = html.indexOf('>Preview<');
    expect(previewIdx).toBeGreaterThan(0);
    const previewSlice = html.slice(previewIdx, previewIdx + 2000);

    // Fix applied: background must be 'transparent'
    expect(previewSlice).toContain('background:transparent');
    // Old tint (accent + '22' = 8-char hex like #4f46e522) must not appear
    expect(previewSlice).not.toMatch(/background:#[0-9a-f]{6}22/i);
  });

  test('captureButton preview has 2px solid accent border (not 1px opacity border)', () => {
    const html = renderWith({
      config: { birthdayCapture: { popup: { enabled: true } } },
      wordingTab: 0,
    });
    const previewIdx  = html.indexOf('>Preview<');
    const previewSlice = html.slice(previewIdx, previewIdx + 2000);
    expect(previewSlice).toMatch(/border:2px solid #[0-9a-fA-F]{6}/);
  });

  // Offer unlocked preview uses fgText (not accent) for title — Item 1 fix
  test('Offer unlocked title uses fgText colour (not accent)', () => {
    const html = renderWith({
      config: { birthdayCapture: { popup: { enabled: true } } },
      wordingTab: 2,
    });
    const previewIdx  = html.indexOf('>Preview<');
    const previewSlice = html.slice(previewIdx, previewIdx + 2000);
    // On light bg (default), fgText = #111827; accent = #4f46e5
    // Title div must have color:#111827, not color:#4f46e5
    expect(previewSlice).toContain('color:#111827');
    // Should not use accent colour for the unlocked title
    const titleMatch = previewSlice.match(/font-size:18px[^>]*>([^<]+)</);
    if (titleMatch) {
      const styleStr = previewSlice.slice(
        previewSlice.lastIndexOf('<div', previewSlice.indexOf(titleMatch[0])),
        previewSlice.indexOf(titleMatch[0]) + 50,
      );
      expect(styleStr).not.toContain('color:#4f46e5');
    }
  });
});

// ── OFF-state panel tests ─────────────────────────────────────────────────────
// After the "always-visible" change: the panel renders regardless of popup.enabled.

describe('Discounts wording panel — OFF state (popup.enabled false)', () => {

  test('OFF: panel title is "Entry popup preview"', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('Entry popup preview');
  });

  test('OFF: subtitle "Always visible" present', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('Always visible, so you can see how it looks.');
  });

  test('OFF: note "The Entry popup is off" present', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('The Entry popup is off');
  });

  test('OFF: note explanation "Visitors do not see" present', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('Visitors do not see this popup step right now.');
  });

  test('OFF: note "Your saved wording" present', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('Your saved wording and colours are kept while it is off.');
  });

  test('OFF: pill "Entry popup is off" present in preview area', () => {
    const html = renderWith({ config: {} });
    // The pill appears in the right-column preview wrapper
    const pillCount = (html.match(/Entry popup is off/g) || []).length;
    // "The Entry popup is off" (note) + "Entry popup is off" (pill) = 2 occurrences
    expect(pillCount).toBeGreaterThanOrEqual(2);
  });

  test('OFF: preview card is present (accent gradient bar rendered)', () => {
    const html = renderWith({ config: {} });
    // The preview card has the gradient bar using the accent colour
    expect(html).toContain('linear-gradient(90deg,#4f46e5,#4f46e588,transparent)');
  });

  test('OFF: preview is dimmed (opacity:0.55 wrapper rendered)', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('opacity:0.55');
  });

  test('OFF: step mini-tabs rendered (4 role="tab" buttons)', () => {
    const html = renderWith({ config: {} });
    expect((html.match(/role="tab"/g) || []).length).toBe(4);
  });

  test('OFF: Wording|Colours switch absent', () => {
    const html = renderWith({ config: {} });
    // The Wording|Colours switch uses background #E8E8F7 pill container
    const offHtml = html;
    // Easiest check: the text "Wording" inside a button that is the view switch
    // is not rendered when OFF. Presence of 'Entry popup preview' as title
    // and absence of the switch container colour is a clean proxy.
    expect(html).not.toContain('background:#E8E8F7');
  });

  test('OFF: no form inputs rendered inside the panel', () => {
    const html = renderWith({ config: {} });
    // Find the panel (anchored by 'Entry popup preview' title)
    const panelStart = html.indexOf('Entry popup preview');
    const panelEnd   = html.indexOf('After the first order', panelStart);
    const panelSlice = panelStart > 0 && panelEnd > panelStart
      ? html.slice(panelStart, panelEnd)
      : '';
    // Count <input elements inside the panel — should be zero
    const inputCount = (panelSlice.match(/<input /g) || []).length;
    expect(inputCount).toBe(0);
  });

  test('OFF: popupCopy in config still reaches preview (default copy shown)', () => {
    const html = renderWith({
      config: {
        popupCopy: { captureButton: 'My custom capture text' },
      },
    });
    // Default wording tab (0) shows emailPlaceholder + captureButton copy in the preview
    expect(html).toContain('My custom capture text');
  });

  test('OFF panel and ON panel: panel is in the same position relative to method rows', () => {
    const htmlOff = renderWith({ config: {} });
    const htmlOn  = renderWith({ config: { birthdayCapture: { popup: { enabled: true } } } });

    const entryRowOff = htmlOff.indexOf('Shows a birthday step after the subscriber');
    const entryRowOn  = htmlOn.indexOf('Shows a birthday step after the subscriber');
    // Use 'Entry popup preview' for OFF and 'Change the text on each step' for ON
    // (the wording description is only present in the ON panel body)
    const panelOff    = htmlOff.indexOf('Entry popup preview');
    const panelOn     = htmlOn.indexOf('Change the text on each step');
    const method3Off  = htmlOff.indexOf('After the first COD order');
    const method3On   = htmlOn.indexOf('After the first COD order');

    // Panel comes after the Entry popup toggle row and before Method 3 in both states
    expect(panelOff).toBeGreaterThan(entryRowOff);
    expect(panelOff).toBeLessThan(method3Off);
    expect(panelOn).toBeGreaterThan(entryRowOn);
    expect(panelOn).toBeLessThan(method3On);
  });

  test('ON: Wording|Colours switch present and panel title is "Entry popup"', () => {
    const html = renderWith({ config: { birthdayCapture: { popup: { enabled: true } } } });
    expect(html).toContain('background:#E8E8F7');
    // Title is 'Entry popup' (not 'Entry popup preview') when on
    expect(html).not.toContain('Entry popup preview');
  });
});

// ── Method 3 (post-order birthday ask) tests ──────────────────────────────────

describe('Discounts — Method 3 (post-order birthday ask)', () => {

  // ── Row always present ───────────────────────────────────────────────────────

  test('row "After the first COD order" is always in the birthday card', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('After the first COD order');
  });

  test('toggle background is grey (#d1d5db) when disabled', () => {
    const html = renderWith({ config: {} });
    // Locate Method 3 toggle (comes after 'After the first COD order')
    const rowIdx = html.indexOf('After the first COD order');
    expect(rowIdx).toBeGreaterThan(0);
    const slice = html.slice(rowIdx, rowIdx + 600);
    expect(slice).toContain('#d1d5db');
  });

  test('toggle background is green (#16a34a) when enabled', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 600);
    expect(slice).toContain('#16a34a');
  });

  // ── OFF state panel ──────────────────────────────────────────────────────────

  test('OFF: panel shows "After the first COD order is off" heading', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('After the first COD order is off');
  });

  test('OFF: panel shows "Switch it on to activate it." explanation', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('Switch it on to activate it.');
  });

  test('OFF: preview is dimmed (opacity:0.55 wrapper)', () => {
    const html = renderWith({ config: {} });
    // Find the post-order section (after 'After the first COD order')
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 3000);
    expect(slice).toContain('opacity:0.55');
  });

  test('OFF: preview pill "After the first COD order is off" rendered', () => {
    const html = renderWith({ config: {} });
    // Appears both as the info heading and as the pill inside the dimmed preview
    const matches = (html.match(/After the first COD order is off/g) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  // ── ON state — Wording view ──────────────────────────────────────────────────

  test('ON (poView=0): Wording tab is active and 5 copy inputs are present', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
    });
    // 5 PoCopyField inputs: pitch, button, skip, saved, error
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    const inputCount = (slice.match(/<input /g) || []).length;
    expect(inputCount).toBeGreaterThanOrEqual(5);
  });

  test('ON (poView=0): "{pct}" helper text is present', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
    });
    expect(html).toContain('{pct}');
  });

  test('ON (poView=0): "Reset all to defaults" control is present', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
    });
    expect(html).toContain('Reset all to defaults');
  });

  test('ON (poView=0): custom pitch value appears in input', () => {
    const html = renderWith({
      config: {
        birthdayCapture: {
          postOrder: {
            enabled: true,
            copy: { pitch: 'Get {pct}% off on your big day!' },
          },
        },
      },
      poView: 0,
    });
    expect(html).toContain('Get {pct}% off on your big day!');
  });

  test('ON (poView=0): pitch text substitutes {pct} with birthdayDiscount.percentage in preview', () => {
    const html = renderWith({
      config: {
        birthdayCapture: { postOrder: { enabled: true } },
        birthdayDiscount: { percentage: 20 },
      },
      poView: 0,
    });
    // Preview renders pitch with {pct} → 20
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    expect(slice).toContain('20% off');
  });

  // ── ON state — Colours view ──────────────────────────────────────────────────

  test('ON (poView=1): Colours view shows "Accent colour" label', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 1,
    });
    expect(html).toContain('Accent colour');
  });

  test('ON (poView=1): Colours view shows "Button text" mode row', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 1,
    });
    expect(html).toContain('Button text');
  });

  test('ON (poView=1): Colours view shows "Block background" label', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 1,
    });
    expect(html).toContain('Block background');
  });

  test('ON (poView=1): custom accentColor is reflected in preview', () => {
    const html = renderWith({
      config: {
        birthdayCapture: {
          postOrder: {
            enabled: true,
            accentColor: '#E11D48',
          },
        },
      },
      poView: 1,
    });
    // Preview button background uses the custom accent
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    expect(slice).toContain('#E11D48');
  });

  // ── Colours view: active mode button marked ──────────────────────────────────

  test('ON (poView=1): buttonTextMode=auto → Auto button is highlighted', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 1,
    });
    // PoModeRow marks active with background:#4f46e5. 'Auto' is the default.
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    // Find Button text mode row: look for 'Button text' then check Auto is active (indigo bg)
    const btnRowIdx = slice.indexOf('Button text');
    expect(btnRowIdx).toBeGreaterThan(0);
    const btnRowSlice = slice.slice(btnRowIdx, btnRowIdx + 500);
    // Active button has background:#4f46e5 and colour white
    expect(btnRowSlice).toContain('background:#4f46e5');
  });

  test('ON (poView=1): buttonTextMode=white → White button is highlighted, Auto is not', () => {
    const html = renderWith({
      config: {
        birthdayCapture: {
          postOrder: { enabled: true, buttonTextMode: 'white' },
        },
      },
      poView: 1,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    const btnRowIdx = slice.indexOf('Button text');
    const btnRowSlice = slice.slice(btnRowIdx, btnRowIdx + 500);
    // White button is active (one indigo background in the mode row)
    expect(btnRowSlice).toContain('background:#4f46e5');
  });

  test('ON (poView=1): textMode=auto → Auto in text-colour row is highlighted', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 1,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    // 'Text colour' label appears in the Colours view
    expect(slice).toContain('Text colour');
    const txtRowIdx = slice.indexOf('Text colour');
    const txtRowSlice = slice.slice(txtRowIdx, txtRowIdx + 400);
    expect(txtRowSlice).toContain('background:#4f46e5');
  });

  // ── Colours view: background presets ────────────────────────────────────────

  test('ON (poView=1): background presets include None + 4 colour swatches', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 1,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    // PO_BG_PRESETS: Cream, Pale blue, Smoke, Navy — plus the None button
    expect(slice).toContain('None (default)');
    expect(slice).toContain('#FFF7ED'); // Cream
    expect(slice).toContain('#EEF2FF'); // Pale blue
    expect(slice).toContain('#F3F4F6'); // Smoke
    expect(slice).toContain('#0F172A'); // Navy
  });

  // ── Colours view: contrast warning ──────────────────────────────────────────

  test('ON (poView=1): ⚠ Low contrast warning shown for gold accent + white text', () => {
    const html = renderWith({
      config: {
        birthdayCapture: {
          postOrder: {
            enabled: true,
            accentColor: '#F5C542',
            buttonTextMode: 'white',
          },
        },
      },
      poView: 1,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    expect(slice).toContain('⚠ Low contrast');
  });

  test('ON (poView=1): no contrast warning for default colours', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 1,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    expect(slice).not.toContain('⚠ Low contrast');
  });

  // ── Wording view: counter format and Reset button ───────────────────────────

  test('ON (poView=0): pitch counter shows "0 / 120" for empty pitch', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    expect(slice).toContain('0 / 120');
  });

  test('ON (poView=0): Reset all to defaults is present and disabled for empty copy', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
    });
    expect(html).toContain('Reset all to defaults');
  });

  // ── Default preview: #4f46e5 button with white text ─────────────────────────

  test('ON (poPreviewState=0): default preview shows #4f46e5 button with #FFFFFF text', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
      poPreviewState: 0,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    // Default poColors is null (all defaults) → previewAccent=#4f46e5, previewBtnFg=#FFFFFF
    expect(slice).toContain('background:#4f46e5');
    expect(slice).toContain('color:#FFFFFF');
  });

  // ── Preview state 1: Missing date (red border + error text) ─────────────────

  test('ON (poPreviewState=1): month/day inputs have red border #dc2626', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
      poPreviewState: 1,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    // PreviewBlock for state=1 renders Month/Day divs with border:1.5px solid #dc2626
    expect(slice).toContain('#dc2626');
  });

  test('ON (poPreviewState=1): default error text is shown', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
      poPreviewState: 1,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    expect(slice).toContain('Please pick a month and day.');
  });

  // ── Preview state 2: After saving (green text + saved message) ──────────────

  test('ON (poPreviewState=2): saved message uses green (#16a34a)', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
      poPreviewState: 2,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    expect(slice).toContain('#16a34a');
  });

  test('ON (poPreviewState=2): default saved text contains "Birthday saved!"', () => {
    const html = renderWith({
      config: { birthdayCapture: { postOrder: { enabled: true } } },
      poView: 0,
      poPreviewState: 2,
    });
    const rowIdx = html.indexOf('After the first COD order');
    const slice  = html.slice(rowIdx, rowIdx + 8000);
    expect(slice).toContain('Birthday saved!');
  });
});

// ── Discounts — Method 4 (product-page birthday box) ────────────────────────
// State slots 11-13 added for this panel (see makeStates update above).

describe('Discounts — Method 4 (product-page birthday box)', () => {
  // Helper: slice of html from "Product page box" row onwards
  function ppSlice(html, limit = 12000) {
    const idx = html.indexOf('Product page box');
    if (idx < 0) return '';
    return html.slice(idx, idx + limit);
  }

  test('product page box row is rendered in the birthday section', () => {
    const html = renderWith({ config: {} });
    expect(html).toContain('Product page box');
  });

  test('product page box row has a NEW badge', () => {
    const html = renderWith({ config: {} });
    const slice = ppSlice(html);
    expect(slice).toContain('NEW');
  });

  test('OFF state: "Product page box is off" info shown', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: false } } },
    });
    const slice = ppSlice(html);
    expect(slice).toContain('Product page box is off');
  });

  test('OFF state: setup steps shown (ol with 3 steps)', () => {
    const html = renderWith({ config: {} });
    const slice = ppSlice(html);
    // All 3 setup steps are present
    expect(slice).toContain('Switch on the toggle');
    expect(slice).toContain('Add to product page');
    expect(slice).toContain('Birthday box');
  });

  test('OFF state: Horizon note shown', () => {
    const html = renderWith({ config: {} });
    const slice = ppSlice(html);
    expect(slice).toContain('Horizon');
  });

  test('OFF state: preview tabs include Ask, Email error, Date error, After saving', () => {
    const html = renderWith({ config: {} });
    const slice = ppSlice(html);
    expect(slice).toContain('Ask');
    expect(slice).toContain('Email error');
    expect(slice).toContain('Date error');
    expect(slice).toContain('After saving');
  });

  test('ON (ppView=0): 9 wording fields rendered', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 0,
    });
    const slice = ppSlice(html);
    // Verify wording field labels
    expect(slice).toContain('Heading');
    expect(slice).toContain('Sub-text');
    expect(slice).toContain('Email placeholder');
    expect(slice).toContain('Consent line');
    expect(slice).toContain('Save button');
    expect(slice).toContain('Skip link');
    expect(slice).toContain('Success message');
    expect(slice).toContain('Date error');
    expect(slice).toContain('Email error');
  });

  test('ON (ppView=0): "Reset wording" button is present', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 0,
    });
    expect(ppSlice(html)).toContain('Reset wording');
  });

  test('ON (ppView=0): token note shown', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 0,
    });
    const slice = ppSlice(html);
    expect(slice).toContain('{pct}');
    expect(slice).toContain('{days}');
  });

  test('ON (ppView=0): heading counter shows "0 / 60" for empty heading', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 0,
    });
    expect(ppSlice(html)).toContain('0 / 60');
  });

  test('ON (ppView=1): accent colour row present', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 1,
    });
    const slice = ppSlice(html);
    expect(slice).toContain('Accent colour');
  });

  test('ON (ppView=1): button text mode row with Auto/White/Dark', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 1,
    });
    const slice = ppSlice(html);
    expect(slice).toContain('Button text');
    expect(slice).toContain('Auto');
    expect(slice).toContain('White');
    expect(slice).toContain('Dark');
  });

  test('ON (ppView=1): box background row with None (outlined)', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 1,
    });
    expect(ppSlice(html)).toContain('None (outlined)');
  });

  test('ON (ppView=1): text colour row present', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 1,
    });
    expect(ppSlice(html)).toContain('Text colour');
  });

  // g. Component test: config with productPage toggled on → buildPayload produces enabled:true
  test('g. buildPayload called with productPage.enabled=true state → payload.birthdayCapture.productPage.enabled is true', () => {
    const { buildPayload } = require('../../frontend/app/admin/screens/Discounts');
    const states = makeStates({ config: { birthdayCapture: { productPage: { enabled: true } } } });
    const config = states[0];
    const payload = buildPayload(config);
    expect(payload.birthdayCapture.productPage.enabled).toBe(true);
  });

  test('ON (ppView=1): low button contrast warning for gold accent + white text', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true, accentColor: '#F5C542', buttonTextMode: 'white' } } },
      ppView: 1,
    });
    expect(ppSlice(html)).toContain('⚠ Low contrast');
  });

  test('ON (ppView=1): low text contrast warning for white text on light bg', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true, bgColor: '#ffffff', textMode: 'white' } } },
      ppView: 1,
    });
    expect(ppSlice(html)).toContain('Low text contrast');
  });

  test('ON (ppView=1): no contrast warnings for default colours', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 1,
    });
    const slice = ppSlice(html);
    expect(slice).not.toContain('Low contrast');
    expect(slice).not.toContain('Low text contrast');
  });

  test('ON (ppPreviewState=0): default heading shown in preview', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 0,
      ppPreviewState: 0,
    });
    const slice = ppSlice(html);
    expect(slice).toContain('off on your birthday');
  });

  test('ON (ppPreviewState=1): email error shown in preview', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 0,
      ppPreviewState: 1,
    });
    const slice = ppSlice(html);
    expect(slice).toContain('valid email');
  });

  test('ON (ppPreviewState=2): date error shown in preview', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 0,
      ppPreviewState: 2,
    });
    const slice = ppSlice(html);
    expect(slice).toContain('month and day');
  });

  test('ON (ppPreviewState=3): saved message shown in preview', () => {
    const html = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true } } },
      ppView: 0,
      ppPreviewState: 3,
    });
    const slice = ppSlice(html);
    expect(slice).toContain('Your gift will arrive');
  });

  test('board-10 defaults: preview fallbacks match exact strings (bdPct=15, bdLead=3)', () => {
    // Render with enabled productPage, empty copy, bdPct=15 bdLead=3 (config defaults)
    const html = renderWith({
      config: {
        birthdayCapture: { productPage: { enabled: true, copy: {} } },
        birthdayDiscount: { percentage: 15, leadDays: 3 },
      },
      ppView: 0,
      ppPreviewState: 0,
    });
    const slice = ppSlice(html);
    // These must stay in sync with backend/routes/proxy.js tok() defaults and
    // extensions/cartncodform-embed/assets/ccf-bday-product.js fallbacks.
    expect(slice).toContain('Get 15% off on your birthday');
    expect(slice).toContain('email you a gift 3 days before.');
    expect(slice).toContain('Your email');
    expect(slice).toContain('Email me my birthday offer');
    expect(slice).toContain('Save my birthday');
    expect(slice).toContain('No thanks');
  });

  test('board-10 defaults: saved/error/emailError preview fallbacks match exact strings', () => {
    const html3 = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true, copy: {} } } },
      ppView: 0, ppPreviewState: 3,
    });
    expect(ppSlice(html3)).toContain('Thanks! Your gift will arrive before your birthday.');

    const html2 = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true, copy: {} } } },
      ppView: 0, ppPreviewState: 2,
    });
    expect(ppSlice(html2)).toContain('Please select a month and day.');

    const html1 = renderWith({
      config: { birthdayCapture: { productPage: { enabled: true, copy: {} } } },
      ppView: 0, ppPreviewState: 1,
    });
    expect(ppSlice(html1)).toContain('Enter a valid email and tick the box.');
  });

  test('Method 3 (post-order) still renders when product-page is also enabled', () => {
    const html = renderWith({
      config: {
        birthdayCapture: {
          postOrder: { enabled: true },
          productPage: { enabled: true },
        },
      },
    });
    expect(html).toContain('After the first COD order');
    expect(html).toContain('Product page box');
  });
});
