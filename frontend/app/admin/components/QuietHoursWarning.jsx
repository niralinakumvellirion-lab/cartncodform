'use client';
import { useState, useEffect } from 'react';
import { apiGet } from '../../../lib/api';

// ---------------------------------------------------------------------------
// Quiet-hours logic — a MIRROR of backend/utils/timezone.js
// (DEFAULT_TZ, resolveTz, hourInTz, resolveQuietWindow, isQuietHour).
// The backend cannot be imported into the browser bundle, so these must be
// kept EXACTLY in sync with it: the Brain and the poller use the same rules,
// and this warning must agree with them.
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

function hourInTz(date, tz) {
  const h = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: resolveTz(tz), hourCycle: 'h23', hour: 'numeric' }).format(date),
    10
  );
  return h % 24;
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

// The instant a schedule field value will become. Both festival editors show
// and send the value as "YYYY-MM-DDTHH:mm" (no zone) which the backend parses
// with `new Date(str)` — server-local time, i.e. UTC on Render — while a value
// that came from the database is a full ISO string. Mirror exactly that.
function scheduleInstant(value) {
  if (!value) return null;
  const s = String(value);
  const d = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
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
  const when = scheduleInstant(value);
  if (!when) return null;
  const tz = resolveTz(settings.timezone);
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
