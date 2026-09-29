'use client';

import { useState, useEffect } from 'react';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Formats a raw "YYYY-MM-DDTHH:mm" string for the preview list without ever
// constructing a Date — these are local values the merchant picked (or the
// range generated); parsing them as a Date would risk reinterpreting them in
// the browser's own timezone for no reason, since the preview only needs the
// digits that are already right there.
function shortDateLabel(localDateTimeStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(localDateTimeStr || '');
  if (!m) return '';
  return `${MONTH_ABBR[(+m[2]) - 1]} ${+m[3]}`;
}

/**
 * "Schedule multiple dates" control — shared by DashboardScreen.jsx's
 * festival editor (creating new items) and QueueScreen.jsx's edit modal
 * (adding dates to an existing item's group). See audits/
 * multi-date-festival-audit.txt design (a) and audits/queue-multi-date-
 * audit.txt for how each caller wires the result into its own save call.
 *
 * Off by default. The caller keeps rendering its own single date input as
 * always (untouched) and passes its current value in as `firstDate` —
 * that's individual mode's date #1. This component owns only the "add
 * more dates" state; remounting it (give it a `key` tied to whatever
 * identifies the thing being edited/created) resets it cleanly, which is
 * how both callers reset between items instead of an imperative API.
 *
 * Calls onDatesChange(dates) on every change: null while the toggle is
 * off (caller should submit `firstDate` alone, today's single-date
 * shape), or the resolved array of "YYYY-MM-DDTHH:mm" strings while on
 * (possibly empty — the caller is expected to block submission on an
 * empty array, same as the zero-date validation below shows inline).
 */
export default function MultiDateScheduler({
  firstDate, timezone, onDatesChange,
  individualHint = 'The date above is the first notification. Add as many more as you need.',
}) {
  const [multiDateMode, setMultiDateMode] = useState(false);
  const [multiDateSubMode, setMultiDateSubMode] = useState('individual'); // 'individual' | 'range'
  // Individual mode: firstDate is the first date; these are the rest.
  const [extraDates, setExtraDates] = useState([]);
  // Range mode: date-only start/end, a shared time-of-day, and the
  // interval in days between occurrences.
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeTime, setRangeTime] = useState('09:00');
  const [rangeIntervalDays, setRangeIntervalDays] = useState(1);

  // The resolved list of dates that will actually be submitted when
  // multiDateMode is on. Individual mode: firstDate plus every non-empty
  // extra row. Range mode: every rangeStart..rangeEnd date (inclusive)
  // stepped by rangeIntervalDays, at the shared rangeTime — empty if the
  // range/interval produces nothing (end before start, or an interval too
  // long), which the UI below blocks submission on.
  function computeMultiDates() {
    if (multiDateSubMode === 'individual') {
      return [firstDate, ...extraDates].filter(Boolean);
    }
    if (!rangeStart || !rangeEnd || !rangeTime) return [];
    const interval = Math.max(1, parseInt(rangeIntervalDays, 10) || 0);
    const start = new Date(`${rangeStart}T00:00:00`);
    const end = new Date(`${rangeEnd}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const dates = [];
    const cur = new Date(start);
    while (cur <= end) {
      const y = cur.getFullYear();
      const mo = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      dates.push(`${y}-${mo}-${d}T${rangeTime}`);
      cur.setDate(cur.getDate() + interval);
    }
    return dates;
  }

  const multiDatePreview = multiDateMode ? computeMultiDates() : [];
  const multiDateEmpty = multiDateMode && multiDatePreview.length === 0;

  // Notify the caller on every change — deliberately re-runs on every
  // relevant keystroke rather than only on submit, since the caller needs
  // multiDateEmpty's live value to gate its own save button.
  useEffect(() => {
    onDatesChange(multiDateMode ? multiDatePreview : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiDateMode, multiDateSubMode, firstDate, JSON.stringify(extraDates), rangeStart, rangeEnd, rangeTime, rangeIntervalDays]);

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setMultiDateMode(v => !v)}
        style={{
          background: 'none', border: 'none', padding: 0,
          color: '#4f46e5', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', textDecoration: 'underline',
        }}
      >
        {multiDateMode ? '− Schedule a single date instead' : '+ Schedule multiple dates'}
      </button>

      {multiDateMode && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 8,
          border: '1px solid #e5e7eb', background: '#fafafa',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {[['individual', 'Individual dates'], ['range', 'Start / end / every N days']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMultiDateSubMode(key)}
                style={{
                  borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: 'none',
                  background: multiDateSubMode === key ? '#4f46e5' : '#fff',
                  color: multiDateSubMode === key ? '#fff' : '#6b7280',
                }}
              >{label}</button>
            ))}
          </div>

          {multiDateSubMode === 'individual' ? (
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                {individualHint}
              </div>
              {extraDates.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    type="datetime-local"
                    value={d || ''}
                    onChange={e => setExtraDates(prev => prev.map((v, vi) => vi === i ? e.target.value : v))}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7,
                             border: '1px solid #e5e7eb', fontSize: 12, boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setExtraDates(prev => prev.filter((_, vi) => vi !== i))}
                    style={{
                      padding: '0 10px', borderRadius: 7, border: '1px solid #e5e7eb',
                      background: '#fff', color: '#dc2626', fontSize: 12, cursor: 'pointer',
                    }}
                    aria-label="Remove date"
                  >×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setExtraDates(prev => [...prev, ''])}
                style={{
                  padding: '6px 12px', borderRadius: 7, border: '1px dashed #d1d5db',
                  background: '#fff', color: '#4f46e5', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >+ Add date</button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Start</div>
                  <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7,
                             border: '1px solid #e5e7eb', fontSize: 12, boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>End</div>
                  <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7,
                             border: '1px solid #e5e7eb', fontSize: 12, boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, minWidth: 90 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Time ({timezone || 'Asia/Kolkata'})</div>
                  <input type="time" value={rangeTime} onChange={e => setRangeTime(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7,
                             border: '1px solid #e5e7eb', fontSize: 12, boxSizing: 'border-box' }} />
                </div>
              </div>
              {/* Interval sits with the end date, not before it — it has
                  nothing to apply to until both ends of the range exist. */}
              {rangeEnd && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#374151' }}>Every</span>
                  <input
                    type="number" min="1" value={rangeIntervalDays}
                    onChange={e => setRangeIntervalDays(e.target.value)}
                    style={{ width: 56, padding: '6px 8px', borderRadius: 7,
                             border: '1px solid #e5e7eb', fontSize: 12, boxSizing: 'border-box' }}
                  />
                  <span style={{ fontSize: 12, color: '#374151' }}>day(s)</span>
                </div>
              )}
            </div>
          )}

          {/* Live preview — exactly what will be created. */}
          {multiDateEmpty ? (
            <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>
              This produces no dates — check the start, end and interval.
            </div>
          ) : multiDatePreview.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#374151' }}>
              {multiDatePreview.length} notification{multiDatePreview.length !== 1 ? 's' : ''}:{' '}
              {multiDatePreview.map(shortDateLabel).join(', ')}
              {multiDatePreview.length > 10 && (
                <div style={{ marginTop: 4, color: '#d97706' }}>
                  That's {multiDatePreview.length} notifications — double check that's what you want.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
