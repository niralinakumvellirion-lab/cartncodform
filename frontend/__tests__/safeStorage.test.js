/**
 * safeStorage: browser storage that never throws (Shopify admin iframe, incognito).
 * Also guards that the admin entry files do not call localStorage directly.
 */
import { getItem, setItem, _clearMemory } from '../lib/safeStorage';

const fs = require('fs');
const path = require('path');

beforeEach(() => {
  _clearMemory();
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe('safeStorage with working localStorage', () => {
  it('stores and reads a value', () => {
    setItem('k', 'v');
    expect(getItem('k')).toBe('v');
    expect(window.localStorage.getItem('k')).toBe('v');
  });

  it('returns null for a missing key', () => {
    expect(getItem('missing')).toBeNull();
  });
});

describe('safeStorage when storage is blocked (throws)', () => {
  function blockStorage() {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
  }

  it('getItem does not throw and returns null', () => {
    blockStorage();
    expect(() => getItem('ccf_onboarded')).not.toThrow();
    expect(getItem('ccf_onboarded')).toBeNull();
  });

  it('setItem does not throw and the value is kept in memory', () => {
    blockStorage();
    expect(() => setItem('ccf_onboarded', 'true')).not.toThrow();
    expect(getItem('ccf_onboarded')).toBe('true');
  });
});

describe('admin entry files keep the setup checklist on the server, not in browser storage', () => {
  const files = ['../app/admin/page.js', '../app/admin/screens/Onboarding.jsx'];
  for (const rel of files) {
    it(`${rel} uses no browser storage for the checklist`, () => {
      const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
      expect(src).not.toMatch(/localStorage\.(get|set)Item/);
      expect(src).not.toMatch(/ccf_onboarded|ccf_step_/);
      expect(src).toContain('onboardingApi');
    });
  }
});
