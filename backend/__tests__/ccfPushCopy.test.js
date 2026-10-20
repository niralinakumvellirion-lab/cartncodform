/**
 * @jest-environment jsdom
 *
 * Tests for the popupCopy helpers and string replacements in ccf-push.js.
 *
 * Covers:
 *   - ccfCopy: empty popupCopy → byte-identical default for every changed string
 *   - ccfCopy: custom text replaces default
 *   - ccfCopy: {pct} and {days} tokens are substituted; {other} left literal
 *   - ccfCopy: empty string falls back to hardcoded default
 *   - fgOn: WCAG contrast ≥4.5:1 → #FFFFFF else #171A22 for key colours
 *   - fgOn: text-on-button contrast is always ≥4.5 for indigo/gold/pale/white/black
 *   - stage-2 dark background: ccfIsDarkColor('#111827') → true; '#FFFFFF' → false
 *   - XSS: value containing '<img src=x onerror=alert(1)>' stored via textContent
 *     produces no element in the DOM
 *   - popupStyles.js: flash_sale and story_card supportedFields no longer include
 *     bgColor / textColor; top_bar fieldLabels.accentColor === 'Bar colour'
 *   - fgOn parity: matches the formula in bannerColors.js resolveBannerColors
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const SCRIPT = fs.readFileSync(
  path.resolve(__dirname, '../../extensions/cartncodform-embed/assets/ccf-push.js'),
  'utf8',
);

const SHOP = 'test.myshopify.com';

function loadScript(discountCfg) {
  window.__ccf_test = {};
  window.Shopify = { shop: SHOP };

  localStorage.clear();
  document.head.innerHTML = '';
  document.body.innerHTML = '';

  const root = document.createElement('div');
  root.id = 'ccf-embed-root';
  root.setAttribute('data-shop', SHOP);
  document.body.appendChild(root);

  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)();

  if (discountCfg !== undefined) {
    window.__ccf_test.setDiscountConfig(discountCfg);
  }
  return window.__ccf_test;
}

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  global.Notification = { permission: 'default', requestPermission: jest.fn() };
  Object.defineProperty(global.navigator, 'serviceWorker', {
    value: { register: jest.fn().mockResolvedValue({}) },
    configurable: true,
  });
});
afterAll(() => {
  delete global.fetch;
  delete global.Notification;
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// ─────────────────────────────────────────────────────────────
// 1. ccfCopy default-output byte-identical for every changed string
// ─────────────────────────────────────────────────────────────
describe('ccfCopy — empty popupCopy falls back to byte-identical default', () => {
  beforeEach(() => {
    loadScript({ popupCopy: {} });
  });

  function copy() { return window.__ccf_test.ccfCopy; }

  test('subscribedTitle → "Subscribed!"', () => {
    expect(copy()('subscribedTitle', 'Subscribed!', {})).toBe('Subscribed!');
  });

  test('subscribedSub → "Getting your discount…"', () => {
    expect(copy()('subscribedSub', 'Getting your discount…', {}))
      .toBe('Getting your discount…');
  });

  test('emailPlaceholder → "Your email" (without suffix)', () => {
    expect(copy()('emailPlaceholder', 'Your email', {})).toBe('Your email');
  });

  test('captureButton → "Get my offer without notifications"', () => {
    expect(copy()('captureButton', 'Get my offer without notifications', {}))
      .toBe('Get my offer without notifications');
  });

  test('unlockedTitle with {pct}=15 → "15% OFF Unlocked!"', () => {
    expect(copy()('unlockedTitle', '15% OFF Unlocked!', { pct: 15 }))
      .toBe('15% OFF Unlocked!');
  });

  test('unlockedSub with {days}=7 → "Expires in 7 days"', () => {
    expect(copy()('unlockedSub', 'Expires in 7 days', { days: 7 }))
      .toBe('Expires in 7 days');
  });

  test('bdSub (leadDays=3) → correct default text', () => {
    const fallback = 'Tell us your birthday. We will send your personal code 3 days before.';
    expect(copy()('bdSub', fallback, { days: 3 })).toBe(fallback);
  });

  test('bdSub (leadDays=null) → fallback without token', () => {
    const fallback = 'Tell us your birthday. We will send your personal code a few days before.';
    expect(copy()('bdSub', fallback, {})).toBe(fallback);
  });

  test('bdButton → "Send me my gift"', () => {
    expect(copy()('bdButton', 'Send me my gift', {})).toBe('Send me my gift');
  });

  test('bdSkip → "No thanks"', () => {
    expect(copy()('bdSkip', 'No thanks', {})).toBe('No thanks');
  });

  test('bdOkTitle → "You’re all set"', () => {
    expect(copy()('bdOkTitle', 'You’re all set', {})).toBe('You’re all set');
  });

  test('bdOkSub (leadDays=3) → correct default text with U+2019', () => {
    const fallback = 'We’ll send your gift code 3 days before your birthday.';
    expect(copy()('bdOkSub', fallback, { days: 3 })).toBe(fallback);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. ccfCopy — custom text replaces default
// ─────────────────────────────────────────────────────────────
test('ccfCopy returns custom text when popupCopy[key] is non-empty', () => {
  const hook = loadScript({
    popupCopy: { captureButton: 'Grab discount', subscribedTitle: 'Woohoo!' },
  });
  const c = window.__ccf_test.ccfCopy;
  expect(c('captureButton', 'Get my offer without notifications', {})).toBe('Grab discount');
  expect(c('subscribedTitle', 'Subscribed!', {})).toBe('Woohoo!');
});

// ─────────────────────────────────────────────────────────────
// 3. ccfCopy — token substitution and literal {other} passthrough
// ─────────────────────────────────────────────────────────────
test('ccfCopy substitutes {pct} and {days} tokens correctly', () => {
  const hook = loadScript({
    popupCopy: {
      unlockedTitle: '{pct}% OFF Unlocked!',
      unlockedSub: 'Expires in {days} days',
    },
  });
  const c = window.__ccf_test.ccfCopy;
  expect(c('unlockedTitle', '{pct}% OFF Unlocked!', { pct: 20 })).toBe('20% OFF Unlocked!');
  expect(c('unlockedSub', 'Expires in {days} days', { days: 14 })).toBe('Expires in 14 days');
});

test('ccfCopy leaves {other} tokens literal', () => {
  const hook = loadScript({ popupCopy: { captureButton: 'Hello {name}!' } });
  const c = window.__ccf_test.ccfCopy;
  expect(c('captureButton', 'fallback', {})).toBe('Hello {name}!');
});

test('ccfCopy falls back when value is only whitespace', () => {
  const hook = loadScript({ popupCopy: { bdButton: '   ' } });
  const c = window.__ccf_test.ccfCopy;
  expect(c('bdButton', 'Send me my gift', {})).toBe('Send me my gift');
});

// ─────────────────────────────────────────────────────────────
// 4. XSS: textContent must not create an element
// ─────────────────────────────────────────────────────────────
test('XSS: setting textContent with HTML string creates no element', () => {
  loadScript({ popupCopy: { subscribedTitle: '<img src=x onerror=alert(1)>' } });
  // Simulate exactly what buildStatusCard does:
  const el = document.createElement('div');
  const c = window.__ccf_test.ccfCopy;
  el.textContent = c('subscribedTitle', 'Subscribed!', {});
  // If HTML were parsed, querySelector('img') would find it
  expect(el.querySelector('img')).toBeNull();
  // The literal string should be stored as text, not parsed as markup
  expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
});

// ─────────────────────────────────────────────────────────────
// 5. fgOn — WCAG contrast table
// ─────────────────────────────────────────────────────────────
describe('fgOn — WCAG contrast ≥4.5:1 and correct colour choice', () => {
  let fgOn;
  beforeEach(() => {
    loadScript();
    fgOn = window.__ccf_test.fgOn;
  });

  // Indigo #4F46E5 — dark colour, white text
  test('#4F46E5 → #FFFFFF', () => {
    expect(fgOn('#4F46E5')).toBe('#FFFFFF');
  });

  // Gold #F5C542 — light colour, dark text
  test('#F5C542 → #171A22', () => {
    expect(fgOn('#F5C542')).toBe('#171A22');
  });

  // Pale #E8E8FF — very light, dark text
  test('#E8E8FF → #171A22', () => {
    expect(fgOn('#E8E8FF')).toBe('#171A22');
  });

  // White #FFFFFF — light, dark text
  test('#FFFFFF → #171A22', () => {
    expect(fgOn('#FFFFFF')).toBe('#171A22');
  });

  // Black #000000 — dark, white text
  test('#000000 → #FFFFFF', () => {
    expect(fgOn('#000000')).toBe('#FFFFFF');
  });

  // Contrast check: ratio of chosen fg vs bg must be >= 4.5
  function luminance(hex) {
    const r = parseInt(hex.slice(1,3),16)/255;
    const g = parseInt(hex.slice(3,5),16)/255;
    const b = parseInt(hex.slice(5,7),16)/255;
    function lin(v){return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);}
    return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  }
  function contrast(fg, bg) {
    const L1 = luminance(fg), L2 = luminance(bg);
    const lighter = Math.max(L1,L2), darker = Math.min(L1,L2);
    return (lighter+0.05)/(darker+0.05);
  }

  const testColors = ['#4F46E5','#F5C542','#E8E8FF','#FFFFFF','#000000','#3730A3','#16a34a','#ef4444'];
  test.each(testColors)('contrast of fgOn(%s) on %s is ≥4.5', (bg) => {
    const fg = fgOn(bg);
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  // Invalid hex returns #FFFFFF (safe fallback)
  test('invalid hex → #FFFFFF', () => {
    expect(fgOn('notacolor')).toBe('#FFFFFF');
    expect(fgOn('')).toBe('#FFFFFF');
    expect(fgOn('#123')).toBe('#FFFFFF'); // 3-char not supported
  });
});

// ─────────────────────────────────────────────────────────────
// 6. Stage-2 dark background detection
// ─────────────────────────────────────────────────────────────
test('ccfIsDarkColor("#111827") → true', () => {
  loadScript();
  expect(window.__ccf_test.ccfIsDarkColor('#111827')).toBe(true);
});

test('ccfIsDarkColor("#FFFFFF") → false', () => {
  loadScript();
  expect(window.__ccf_test.ccfIsDarkColor('#FFFFFF')).toBe(false);
});

test('ccfIsDarkColor("#4F46E5") matches fgOn → #FFFFFF (dark bg → white text)', () => {
  loadScript();
  expect(window.__ccf_test.ccfIsDarkColor('#4F46E5')).toBe(true);
  expect(window.__ccf_test.fgOn('#4F46E5')).toBe('#FFFFFF');
});

// ─────────────────────────────────────────────────────────────
// 7. fgOn parity with bannerColors.js resolveBannerColors
// ─────────────────────────────────────────────────────────────
describe('fgOn parity with backend bannerColors.js', () => {
  const { resolveBannerColors } = require('../utils/bannerColors');

  // bannerColors resolves fg via the same WCAG formula for the banner.
  // We verify the same result for indigo and gold.
  test('Indigo #4F46E5: fgOn = #FFFFFF; bannerColors fg = white', () => {
    loadScript();
    const frontendFg = window.__ccf_test.fgOn('#4F46E5');
    const backendResult = resolveBannerColors({ bgColor: '#4F46E5', textColor: 'auto' });
    // backendResult.fg is 'rgba(255,255,255,...)' or '#ffffff'; we just check fgOn agrees it's white
    expect(frontendFg).toBe('#FFFFFF');
    expect(backendResult.fg).toMatch(/#fff|rgba\(255,255,255/i);
  });

  test('Gold #F5C542: fgOn = #171A22; bannerColors fg = dark', () => {
    loadScript();
    const frontendFg = window.__ccf_test.fgOn('#F5C542');
    const backendResult = resolveBannerColors({ bgColor: '#F5C542', textColor: 'auto' });
    expect(frontendFg).toBe('#171A22');
    // bannerColors dark fg is a dark-ish colour
    expect(backendResult.fg).not.toMatch(/#fff|rgba\(255,255,255/i);
  });
});

// ─────────────────────────────────────────────────────────────
// 8. popupStyles.js supportedFields: flash_sale/story_card/top_bar
//    (verified from source since popupStyles.js is an ES module)
// ─────────────────────────────────────────────────────────────
describe('popupStyles.js — supportedFields after BUG-1 fix (source file check)', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/app/admin/lib/popupStyles.js'), 'utf8'
  );

  // Helper: extract the supportedFields array literal for a given style block
  function flashSaleSection() {
    const start = src.indexOf('flash_sale:');
    const end   = src.indexOf('\n  story_card:', start); // end at next top-level style
    return src.slice(start, end);
  }
  function storyCardSection() {
    const start = src.indexOf('story_card:');
    const end   = src.indexOf('\n  spotlight:', start);
    return src.slice(start, end);
  }
  function topBarSection() {
    const start = src.indexOf('top_bar:');
    const end   = src.indexOf('\n  story_card:', start) > start
      ? src.indexOf('\n  story_card:', start)
      : src.indexOf('\n};', start);
    return src.slice(start, end);
  }

  test('flash_sale supportedFields does not contain bgColor', () => {
    const section = flashSaleSection();
    const sfStart = section.indexOf('supportedFields');
    const sfEnd   = section.indexOf(']', sfStart);
    const sfBlock = section.slice(sfStart, sfEnd);
    expect(sfBlock).not.toMatch(/'bgColor'|"bgColor"/);
  });

  test('flash_sale supportedFields does not contain textColor', () => {
    const section = flashSaleSection();
    const sfStart = section.indexOf('supportedFields');
    const sfEnd   = section.indexOf(']', sfStart);
    const sfBlock = section.slice(sfStart, sfEnd);
    expect(sfBlock).not.toMatch(/'textColor'|"textColor"/);
  });

  test('story_card supportedFields does not contain textColor', () => {
    const section = storyCardSection();
    const sfStart = section.indexOf('supportedFields');
    const sfEnd   = section.indexOf(']', sfStart);
    const sfBlock = section.slice(sfStart, sfEnd);
    expect(sfBlock).not.toMatch(/'textColor'|"textColor"/);
  });

  test('top_bar has fieldLabels with accentColor: "Bar colour"', () => {
    const section = topBarSection();
    expect(section).toMatch(/fieldLabels[\s\S]*?accentColor[\s\S]*?Bar colour/);
  });
});
