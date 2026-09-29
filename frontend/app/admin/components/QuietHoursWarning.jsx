'use client';
import { useState, useEffect } from 'react';
import { apiGet } from '../../../lib/api';

// ---------------------------------------------------------------------------
// Quiet-hours logic — a MIRROR of backend/utils/timezone.js
// (DEFAULT_TZ, resolveTz, hourInTz, zonedParts, tzOffsetMs, zonedTimeToUtc,
// resolveQuietWindow, isQuietHour). The backend cannot be imported into the
// browser bundle, so these must be kept EXACTLY in sync with it: the Brain
// and the poller use the same rules, and this warning — plus the Schedule
// Date & Time inputs in QueueScreen.jsx / DashboardScreen.jsx, which import
// formatLocalDateTimeInput from here — must agree with them.
// ---------------------------------------------------------------------------
const DEFAULT_TZ = 'Asia/Kolkata';

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

function hourInTz(date, tz) {
  return zonedParts(date, resolveTz(tz)).h;
}

// Offset (ms) of `tz` from UTC at the instant `date`.
function tzOffsetMs(date, tz) {
  const p = zonedParts(date, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) -
    (date.getTime() - date.getUTCMilliseconds());
}

// The UTC instant at which the wall clock in `tz` reads y-mo-d h:mi. Second
// pass re-reads the offset at the first answer so a DST change between the
// guess and the result is settled correctly.
function zonedTimeToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  return new Date(guess - tzOffsetMs(new Date(first), tz));
}

function resolveQuietWindow(quietHours) {
  const ok = (v) => Number.isInteger(v) && v >= 0 && v <= 23;
  const q = quietHours || {};
  return { start: ok(q.start) ? q.start : 22, end: ok(q.end) ? q.end : 8 };
}

function isQuietHour(hour, start, end) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

const pad = (n) => String(n).padStart(2, '0');
const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// The instant a schedule field value will become. Both festival editors show
// and send the value as "YYYY-MM-DDTHH:mm" (no zone) — that string is the
// STORE's wall-clock time (a merchant entering 19:31 means 19:31 in the
// store's own timezone, not UTC and not the browser's/server's local zone),
// so it's converted via zonedTimeToUtc using the store's real timezone. A
// value that already came from the database is a full ISO string and needs
// no conversion.
function scheduleInstant(value, tz) {
  if (!value) return null;
  const s = String(value);
  const m = LOCAL_INPUT_RE.exec(s);
  if (m) {
    return zonedTimeToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], resolveTz(tz));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Formats a schedule field's underlying value for the <input
// type="datetime-local"> that displays/edits it, in the STORE's timezone —
// never UTC, never the browser's local zone. A raw "YYYY-MM-DDTHH:mm" value
// (what the input itself just produced, or what a merchant is mid-typing) is
// already store-local by construction and is returned unchanged; a full ISO
// string (an existing item's value from the database) is reformatted into
// the store's wall-clock y-mo-d h:mi. Exported for QueueScreen.jsx and
// DashboardScreen.jsx's Schedule Date & Time inputs.
export function formatLocalDateTimeInput(value, tz) {
  if (!value) return '';
  const s = String(value);
  if (LOCAL_INPUT_RE.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const p = zonedParts(d, resolveTz(tz));
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

// Loads the store's saved quiet window + timezone. `ready` stays false until
// the settings request succeeds, so nothing is ever shown from guessed values.
export function useQuietHoursSettings(shop) {
  const [settings, setSettings] = useState({ ready: false, quietHours: null, timezone: null });
  useEffect(() => {
    if (!shop) return undefined;
    let cancelled = false;
    apiGet(`/api/profiles/${encodeURIComponent(shop)}/settings`)
      .then((data) => {
        if (cancelled) return;
        setSettings({ ready: true, quietHours: data?.quietHours || {}, timezone: data?.timezone || null });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [shop]);
  return settings;
}

// Amber, non-blocking note under a schedule field. Renders nothing unless the
// settings have loaded AND the chosen time really is inside the quiet window.
export default function QuietHoursWarning({ value, settings }) {
  if (!settings || !settings.ready) return null;
  const tz = resolveTz(settings.timezone);
  const when = scheduleInstant(value, tz);
  if (!when) return null;
  const { start, end } = resolveQuietWindow(settings.quietHours);
  const storeHour = hourInTz(when, tz);
  if (!isQuietHour(storeHour, start, end)) return null;
  const storeTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(when);
  return (
    <div role="status" style={{ marginTop: 6, padding: '8px 10px', borderRadius: 8,
      background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: 12, lineHeight: 1.4 }}>
      This is inside your quiet hours ({pad(start)}:00–{pad(end)}:00). Customers will still receive it.
      <div style={{ opacity: 0.8, marginTop: 2 }}>Store time: {storeTime} ({tz})</div>
    </div>
  );
}
