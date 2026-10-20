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
 *   5  previewColors   { accentColor:'#4f46e5', bgColor:'#ffffff' }
 *   6  wordingTab      0
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
const DEFAULT_COLORS = { accentColor: '#4f46e5', bgColor: '#ffffff' };

// Builds the 7-element state array expected by DiscountsScreen.
function makeStates({ config = {}, loading = false, previewColors = DEFAULT_COLORS, wordingTab = 0 } = {}) {
  return [config, loading, false, false, '', previewColors, wordingTab];
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
// Panel is delimited by 'Entry popup wording' … 'Saved with'.
function countPanelInputs(html) {
  const start = html.indexOf('Entry popup wording');
  const end   = html.indexOf('Saved with', start);
  if (start < 0 || end < 0) return -1;
  return (html.slice(start, end).match(/<input /g) || []).length;
}

// ---------------------------------------------------------------------------

describe('Discounts wording panel — renderToStaticMarkup', () => {

  // ── Placement ──────────────────────────────────────────────────────────────

  test('Entry popup OFF: "Entry popup wording" absent', () => {
    const html = renderWith({ config: {} });
    expect(html).not.toContain('Entry popup wording');
  });

  test('Entry popup ON: "Entry popup wording" present', () => {
    const html = renderWith({ config: { birthdayCapture: { popup: { enabled: true } } } });
    expect(html).toContain('Entry popup wording');
  });

  test('ON: panel is inside the birthday card and after the Entry popup row', () => {
    const html = renderWith({ config: { birthdayCapture: { popup: { enabled: true } } } });
    const bdCard   = html.indexOf('How do you collect birthdays?');
    const entryRow = html.indexOf('Shows a birthday step after the subscriber');
    const panel    = html.indexOf('Entry popup wording');
    const method3  = html.indexOf('After the first order');

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
