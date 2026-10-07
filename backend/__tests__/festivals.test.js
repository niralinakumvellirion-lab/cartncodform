'use strict';
const { upcomingFestival, storeTodayYmd } = require('../utils/festivals');

const LIST = [
  { name: 'Navratri', date: '2026-10-11' },
  { name: 'Dussehra', date: '2026-10-20' },
  { name: 'Diwali',   date: '2026-10-29' },
];

describe('upcomingFestival', () => {
  test('returns null when list is empty', () => {
    expect(upcomingFestival('2026-10-05', [])).toBeNull();
  });

  test('returns null when todayYmd is null/undefined', () => {
    expect(upcomingFestival(null, LIST)).toBeNull();
  });

  test('returns the festival on the same day (daysAway = 0)', () => {
    const r = upcomingFestival('2026-10-11', LIST);
    expect(r).not.toBeNull();
    expect(r.name).toBe('Navratri');
    expect(r.daysAway).toBe(0);
  });

  test('returns the next festival when today is one day before (daysAway = 1)', () => {
    const r = upcomingFestival('2026-10-10', LIST);
    expect(r).not.toBeNull();
    expect(r.name).toBe('Navratri');
    expect(r.daysAway).toBe(1);
  });

  test('skips past festivals', () => {
    const r = upcomingFestival('2026-10-12', LIST);
    expect(r).not.toBeNull();
    expect(r.name).toBe('Dussehra');
  });

  test('returns null when all festivals are in the past', () => {
    expect(upcomingFestival('2026-10-30', LIST)).toBeNull();
  });

  test('daysAway is correct for a multi-day gap', () => {
    const r = upcomingFestival('2026-10-05', LIST);
    expect(r.daysAway).toBe(6); // Oct 5 -> Oct 11 = 6 days
  });

  test('returns the soonest festival when several are upcoming', () => {
    const r = upcomingFestival('2026-10-09', LIST);
    expect(r.name).toBe('Navratri');
  });

  test('list need not be pre-sorted', () => {
    const shuffled = [LIST[2], LIST[0], LIST[1]];
    const r = upcomingFestival('2026-10-05', shuffled);
    expect(r.name).toBe('Navratri');
  });
});

describe('storeTodayYmd', () => {
  test('returns a YYYY-MM-DD string', () => {
    const y = storeTodayYmd('Asia/Kolkata');
    expect(y).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('2026-10-06 20:00 UTC is already 2026-10-07 in Asia/Kolkata (+05:30)', () => {
    // Mock Date to a specific UTC instant
    const orig = global.Date;
    const fakeNow = new Date('2026-10-06T20:00:00.000Z');
    jest.spyOn(global, 'Date').mockImplementation((...args) => {
      if (args.length === 0) return fakeNow;
      return new orig(...args);
    });
    global.Date.UTC = orig.UTC;
    // storeTodayYmd calls new Date() internally via zonedParts
    try {
      const result = storeTodayYmd('Asia/Kolkata');
      expect(result).toBe('2026-10-07');
    } finally {
      jest.restoreAllMocks();
    }
  });

  test('falls back gracefully on unknown timezone', () => {
    const y = storeTodayYmd('Mars/OlympusMons');
    expect(y).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
