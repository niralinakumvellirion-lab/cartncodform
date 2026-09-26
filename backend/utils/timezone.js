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

module.exports = { DEFAULT_TZ, resolveTz, zonedParts, hourInTz, tzOffsetMs, zonedTimeToUtc };
