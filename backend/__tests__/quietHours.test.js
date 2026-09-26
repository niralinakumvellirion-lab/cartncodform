/**
 * Quiet hours: one shared definition (utils/timezone.js) used by the Brain
 * when it picks a send time AND by the poller when it decides whether to send
 * now. Store timezone + the store's saved { start, end } window.
 */

jest.mock('../models/Profile');
jest.mock('../models/Signal');
jest.mock('../models/SignalConfig');
jest.mock('../models/ScheduledJob');
jest.mock('../models/Store');
jest.mock('../models/ShopWeights');
jest.mock('../models/AbandonedCustomer');

const { isQuietNow, resolveQuietWindow, isQuietHour, hourInTz } = require('../utils/timezone');
const { computeRunAt } = require('../services/brain');

const at = (iso) => new Date(iso);

describe('resolveQuietWindow', () => {
  test('no window saved -> the 22:00-08:00 default', () => {
    expect(resolveQuietWindow(undefined)).toEqual({ start: 22, end: 8 });
    expect(resolveQuietWindow({})).toEqual({ start: 22, end: 8 });
  });
  test('a saved window is used as-is, including 0', () => {
    expect(resolveQuietWindow({ start: 0, end: 6 })).toEqual({ start: 0, end: 6 });
  });
  test('malformed values fall back per side', () => {
    expect(resolveQuietWindow({ start: 'x', end: 30 })).toEqual({ start: 22, end: 8 });
    expect(resolveQuietWindow({ start: 23, end: null })).toEqual({ start: 23, end: 8 });
  });
});

describe('isQuietNow (what the poller uses)', () => {
  test('custom same-day window 13:00-15:00 in UTC', () => {
    const store = { timezone: 'UTC', quietHours: { start: 13, end: 15 } };
    expect(isQuietNow(store, at('2026-03-10T12:59:00Z'))).toBe(false);
    expect(isQuietNow(store, at('2026-03-10T13:00:00Z'))).toBe(true);
    expect(isQuietNow(store, at('2026-03-10T14:59:00Z'))).toBe(true);
    expect(isQuietNow(store, at('2026-03-10T15:00:00Z'))).toBe(false); // end is exclusive
  });

  test('a window that wraps past midnight (20:00-09:00)', () => {
    const store = { timezone: 'UTC', quietHours: { start: 20, end: 9 } };
    expect(isQuietNow(store, at('2026-03-10T19:59:00Z'))).toBe(false);
    expect(isQuietNow(store, at('2026-03-10T21:00:00Z'))).toBe(true);
    expect(isQuietNow(store, at('2026-03-10T23:30:00Z'))).toBe(true);
    expect(isQuietNow(store, at('2026-03-11T00:30:00Z'))).toBe(true);
    expect(isQuietNow(store, at('2026-03-11T08:59:00Z'))).toBe(true);
    expect(isQuietNow(store, at('2026-03-11T09:00:00Z'))).toBe(false);
  });

  test('a wider saved window really is honoured (old hardcoded 22-8 would have sent at 21:00)', () => {
    const store = { timezone: 'UTC', quietHours: { start: 20, end: 9 } };
    expect(isQuietNow(store, at('2026-03-10T21:00:00Z'))).toBe(true);
    expect(isQuietNow({ timezone: 'UTC' }, at('2026-03-10T21:00:00Z'))).toBe(false); // default window
  });

  test('no window saved -> the 22:00-08:00 default (unchanged behaviour)', () => {
    const store = { timezone: 'UTC' };
    expect(isQuietNow(store, at('2026-03-10T21:59:00Z'))).toBe(false);
    expect(isQuietNow(store, at('2026-03-10T22:00:00Z'))).toBe(true);
    expect(isQuietNow(store, at('2026-03-11T07:59:00Z'))).toBe(true);
    expect(isQuietNow(store, at('2026-03-11T08:00:00Z'))).toBe(false);
    // no store at all -> default zone (Kolkata) + default window: 02:00Z is 07:30 IST, quiet
    expect(isQuietNow(null, at('2026-03-11T02:00:00Z'))).toBe(true);
    expect(isQuietNow(null, at('2026-03-11T06:00:00Z'))).toBe(false); // 11:30 IST
  });

  test('non-UTC timezone: the window is on the STORE wall clock (Asia/Kolkata)', () => {
    const store = { timezone: 'Asia/Kolkata', quietHours: { start: 22, end: 8 } };
    // 16:30Z = 22:00 IST -> quiet; 16:29Z = 21:59 IST -> not
    expect(isQuietNow(store, at('2026-03-10T16:29:00Z'))).toBe(false);
    expect(isQuietNow(store, at('2026-03-10T16:30:00Z'))).toBe(true);
    // 02:29Z = 07:59 IST -> quiet; 02:30Z = 08:00 IST -> not
    expect(isQuietNow(store, at('2026-03-11T02:29:00Z'))).toBe(true);
    expect(isQuietNow(store, at('2026-03-11T02:30:00Z'))).toBe(false);
  });

  test('non-UTC timezone with a 45-minute offset (Asia/Kathmandu)', () => {
    const store = { timezone: 'Asia/Kathmandu', quietHours: { start: 22, end: 8 } };
    // 16:15Z = 22:00 NPT
    expect(isQuietNow(store, at('2026-03-10T16:14:00Z'))).toBe(false);
    expect(isQuietNow(store, at('2026-03-10T16:15:00Z'))).toBe(true);
  });
});

describe('Brain and poller agree (same source, same wrap logic)', () => {
  const cases = [
    { timezone: 'UTC', quietHours: { start: 13, end: 15 } },
    { timezone: 'UTC', quietHours: { start: 20, end: 9 } },
    { timezone: 'Asia/Kolkata', quietHours: { start: 22, end: 8 } },
    { timezone: 'Asia/Kathmandu', quietHours: { start: 21, end: 7 } },
    { timezone: 'America/New_York', quietHours: { start: 0, end: 6 } },
    { timezone: 'Asia/Kolkata' }, // no window saved
  ];

  test('a send time the Brain picks is never a time the poller would defer', () => {
    for (const store of cases) {
      const { start, end } = resolveQuietWindow(store.quietHours);
      for (let h = 0; h < 24; h++) {
        const now = at(`2026-03-10T${String(h).padStart(2, '0')}:20:00.000Z`);
        jest.useFakeTimers({
          now,
          doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
            'setTimeout', 'clearTimeout', 'queueMicrotask', 'performance', 'hrtime'],
        });
        const runAt = computeRunAt({ activeHours: [] }, start, end, store.timezone, null);
        jest.useRealTimers();
        expect(runAt.getTime()).toBeGreaterThan(now.getTime());
        expect(isQuietNow(store, runAt)).toBe(false);
        expect(isQuietHour(hourInTz(runAt, store.timezone), start, end)).toBe(false);
      }
    }
  });
});
