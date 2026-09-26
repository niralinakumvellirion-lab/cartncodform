/**
 * Store-timezone helpers built on Intl.DateTimeFormat (no dependency).
 * Shared by the Brain (send time) and the weights job (hour buckets) so both
 * agree on what "hour 11" means: 11 o'clock on the STORE's wall clock, including
 * half-hour zones (+05:30, +05:45) and across DST.
 */

const DEFAULT_TZ = 'Asia/Kolkata';

// A usable IANA zone: the store's own, else the app default. An unknown string
// (Intl throws RangeError) also falls back to the default rather than to the
// server's own zone.
function resolveTz(tz) {
  const z = tz || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z });
    return z;
  } catch {
    return DEFAULT_TZ;
  }
}

// Wall-clock parts of `date` in `tz`.
function zonedParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const o = {};
  for (const p of f.formatToParts(date)) {
    if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
  }
  return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
}

// Store-local hour (0-23) of an instant.
function hourInTz(date, tz) {
  return zonedParts(date, resolveTz(tz)).h;
}

// Offset (ms) of `tz` from UTC at the instant `date`.
function tzOffsetMs(date, tz) {
  const p = zonedParts(date, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) -
    (date.getTime() - date.getUTCMilliseconds());
}

// The UTC instant at which the wall clock in `tz` reads y-mo-d h:mi. The second
// pass re-reads the offset at the first answer so a DST change between the
// guess and the result is settled correctly.
function zonedTimeToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  return new Date(guess - tzOffsetMs(new Date(first), tz));
}

// --- quiet hours ------------------------------------------------------------
// One definition, used by the Brain (choosing a send time) and the poller
// (deciding whether to send now), so the two can never disagree.

const DEFAULT_QUIET = { start: 22, end: 8 };

// The store's saved { start, end } (whole hours 0-23), else the default window.
// A missing or malformed value (non-integer / out of range) falls back per side.
function resolveQuietWindow(quietHours) {
  const ok = (v) => Number.isInteger(v) && v >= 0 && v <= 23;
  const q = quietHours || {};
  return {
    start: ok(q.start) ? q.start : DEFAULT_QUIET.start,
    end: ok(q.end) ? q.end : DEFAULT_QUIET.end,
  };
}

// Is `hour` inside the [start, end) quiet window? Handles a window that wraps
// past midnight (e.g. 22 -> 8); start === end means "no quiet hours".
function isQuietHour(hour, start, end) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

// Is `now` inside the store's quiet window, on the STORE's wall clock?
// `store` is any object with optional { timezone, quietHours }.
function isQuietNow(store, now = new Date()) {
  const s = store || {};
  const { start, end } = resolveQuietWindow(s.quietHours);
  return isQuietHour(hourInTz(now, s.timezone), start, end);
}

module.exports = {
  DEFAULT_TZ, DEFAULT_QUIET, resolveTz, zonedParts, hourInTz, tzOffsetMs, zonedTimeToUtc,
  resolveQuietWindow, isQuietHour, isQuietNow,
};
