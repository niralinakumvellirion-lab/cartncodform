'use client';

import { useState, useEffect } from 'react';
import { usePlatformStaff } from '../../../lib/platformContext';
import {
  getFinanceSummary,
  getFinanceActivity,
  getFinanceStores,
  patchFinanceInternal,
} from '../../../lib/platformApi';
import {
  fmtMoney,
  fmtSignedMoney,
  fmtMonthLabel,
  fmtShortDate,
} from '../../../lib/financeFormat';

const LIMIT = 25;

const TABS = [
  { key: 'paying',   label: 'Paying',   countKey: 'paying',   dateHeader: 'ACTIVE SINCE' },
  { key: 'trial',    label: 'In trial', countKey: 'trial',    dateHeader: 'TRIAL ENDS' },
  { key: 'lapsed',   label: 'Lapsed',   countKey: 'lapsed30', dateHeader: 'CHANGED ON' },
  { key: 'excluded', label: 'Left out', countKey: 'excluded', dateHeader: 'REASON' },
];

const RANGE_OPTS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
];

const KIND_CHIP = {
  trial:  'bg-[#E7E5FF] text-[#3730A3]',
  paying: 'bg-[#D1FAE5] text-[#065F46]',
  lost:   'bg-[#FDECEA] text-[#B3261E]',
};
const KIND_LABEL = { trial: 'Trial started', paying: 'Became paying', lost: 'Cancelled / left' };

// ── Section skeleton ─────────────────────────────────────────────────────────

function SectionSkeleton({ rows = 3 }) {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 w-40 rounded bg-[#E1E4EA]" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 rounded bg-[#E1E4EA]" />
      ))}
    </div>
  );
}

function ErrorBox({ msg, onRetry }) {
  return (
    <div className="rounded-xl border border-[#E1E4EA] bg-white px-5 py-6 text-center">
      <p className="mb-3 text-sm text-[#B3261E]">{msg || 'Failed to load.'}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="rounded-lg border border-[#E1E4EA] px-4 py-2 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, hint, loading }) {
  return (
    <div className="rounded-xl border border-[#E1E4EA] bg-white p-5">
      <p className="text-xs font-semibold tracking-wide text-[#5A6070] uppercase mb-1">{label}</p>
      {loading
        ? <div className="animate-pulse h-8 w-24 rounded bg-[#E1E4EA]" />
        : <p className="text-2xl font-extrabold text-[#171A22]">{value}</p>
      }
      <p className="mt-1 text-xs text-[#5A6070]">{hint}</p>
    </div>
  );
}

// ── MRR bar chart ─────────────────────────────────────────────────────────────

function MrrChart({ months }) {
  const maxVal = Math.max(0, ...months.filter(m => m.mrrUsd !== null).map(m => m.mrrUsd));
  const BAR_H = 80;

  return (
    <div className="flex items-end gap-2 h-28 pt-1">
      {months.map(m => (
        <div key={m.month} className="flex-1 flex flex-col items-center gap-1 justify-end min-w-0">
          {m.mrrUsd === null ? (
            <div className="flex-1 flex items-end justify-center w-full">
              <span className="text-[9px] text-[#5A6070] text-center leading-tight">No record</span>
            </div>
          ) : (
            <div className="flex-1 flex items-end w-full">
              <div
                className={`w-full rounded-t transition-all ${m.current ? 'bg-[#4F46E5]' : 'bg-[#A5B4FC]'}`}
                style={{ height: maxVal > 0 ? Math.max(3, Math.round((m.mrrUsd / maxVal) * BAR_H)) + 'px' : '3px' }}
                title={`${fmtMonthLabel(m.month)}: ${fmtMoney(m.mrrUsd)}`}
              />
            </div>
          )}
          <div className="text-[9px] text-[#5A6070] text-center leading-tight w-full truncate px-0.5">
            {fmtMonthLabel(m.month)}
            {m.current && <span className="block">(so far)</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Plan split bar ────────────────────────────────────────────────────────────

function PlanSplit({ counts }) {
  const total = (counts.paying || 0) + (counts.trial || 0) + (counts.free || 0);
  if (!total) return <p className="text-sm text-[#5A6070]">No stores recorded yet.</p>;
  const pPaying = ((counts.paying || 0) / total) * 100;
  const pTrial  = ((counts.trial  || 0) / total) * 100;
  const pFree   = ((counts.free   || 0) / total) * 100;
  return (
    <div className="space-y-2">
      <div className="flex h-4 rounded-full overflow-hidden gap-px">
        {pPaying > 0 && <div className="bg-[#4F46E5]" style={{ width: pPaying + '%' }} title={`Paying: ${counts.paying}`} />}
        {pTrial  > 0 && <div className="bg-[#A5B4FC]" style={{ width: pTrial  + '%' }} title={`In trial: ${counts.trial}`} />}
        {pFree   > 0 && <div className="bg-[#E1E4EA]" style={{ width: pFree   + '%' }} title={`Free: ${counts.free}`} />}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-[#5A6070]">
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#4F46E5] mr-1" />Pro paying: {counts.paying}</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#A5B4FC] mr-1" />Pro in trial: {counts.trial}</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#E1E4EA] mr-1" />Free: {counts.free}</span>
      </div>
      {counts.excluded > 0 && (
        <p className="text-xs text-[#5A6070]">Left out: {counts.excluded} test or internal store{counts.excluded !== 1 ? 's' : ''}.</p>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FinanceScreen() {
  const me = usePlatformStaff();
  const [tz] = useState(() => -new Date().getTimezoneOffset());

  // Summary
  const [summary,        setSummary]        = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError,   setSummaryError]   = useState(null);

  // Activity
  const [range,           setRange]           = useState('today');
  const [activity,        setActivity]        = useState(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError,   setActivityError]   = useState(null);

  // Stores
  const [activeTab,      setActiveTab]      = useState('paying');
  const [storesPage,     setStoresPage]     = useState(0);
  const [storesData,     setStoresData]     = useState(null);
  const [storesLoading,  setStoresLoading]  = useState(true);
  const [storesError,    setStoresError]    = useState(null);

  // Mark internal
  const [pendingInternal, setPendingInternal] = useState(null);
  const [internalErrors,  setInternalErrors]  = useState({});

  const isOwner = me?.role === 'owner';

  function loadSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    getFinanceSummary(tz)
      .then(d  => { setSummary(d);  setSummaryLoading(false); })
      .catch(e => { setSummaryError(e.message || 'Failed to load summary.'); setSummaryLoading(false); });
  }

  function loadActivity(r) {
    setActivityLoading(true);
    setActivityError(null);
    getFinanceActivity(r, tz)
      .then(d  => { setActivity(d);  setActivityLoading(false); })
      .catch(e => { setActivityError(e.message || 'Failed to load activity.'); setActivityLoading(false); });
  }

  function loadStores(group, page) {
    setStoresLoading(true);
    setStoresError(null);
    getFinanceStores(group, page, LIMIT)
      .then(d  => { setStoresData(d);  setStoresLoading(false); })
      .catch(e => { setStoresError(e.message || 'Failed to load stores.'); setStoresLoading(false); });
  }

  // On mount: all 3 in parallel
  useEffect(() => {
    if (!isOwner) return;
    loadSummary();
    loadActivity('today');
    loadStores('paying', 0);
  }, [isOwner]); // eslint-disable-line

  // Range change: refetch only activity
  useEffect(() => {
    if (!isOwner) return;
    loadActivity(range);
  }, [range]); // eslint-disable-line

  // Tab / page change: refetch only stores
  useEffect(() => {
    if (!isOwner) return;
    loadStores(activeTab, storesPage);
  }, [activeTab, storesPage]); // eslint-disable-line

  async function handleMarkInternal(shopDomain, internal) {
    setPendingInternal(shopDomain);
    setInternalErrors(prev => { const n = { ...prev }; delete n[shopDomain]; return n; });
    try {
      await patchFinanceInternal(shopDomain, internal);
      loadSummary();
      loadStores(activeTab, storesPage);
    } catch (e) {
      setInternalErrors(prev => ({ ...prev, [shopDomain]: e.message || 'Failed.' }));
    } finally {
      setPendingInternal(null);
    }
  }

  // ── Owner only guard ────────────────────────────────────────────────────────

  if (!me) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-[#E1E4EA]" />
        <div className="h-4 w-96 rounded bg-[#E1E4EA]" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-xl bg-[#E1E4EA]" />)}
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold text-[#171A22] mb-2">Finance</h1>
        <p className="text-sm text-[#5A6070]">This page is for the platform owner only.</p>
      </div>
    );
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────

  const tabCounts = summary ? {
    paying:   summary.counts.paying,
    trial:    summary.counts.trial,
    lapsed30: summary.counts.lapsed30,
    excluded: summary.counts.excluded,
  } : null;

  const activeTabDef = TABS.find(t => t.key === activeTab) || TABS[0];
  const totalPages = storesData ? Math.ceil(storesData.total / LIMIT) : 1;

  // range label for empty state text
  const rangeLabel = { today: 'today', week: 'in the last 7 days', month: 'in the last 30 days' }[range] || '';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-5xl">

      {/* Title */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-extrabold text-[#171A22]">Finance</h1>
          <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold tracking-widest text-[#92400E] uppercase">Owner only</span>
        </div>
        <p className="text-sm text-[#5A6070]">
          Who is on which plan, and what that is worth each month. Stores are counted once, at the Pro price
          of {summary ? fmtMoney(summary.priceUsd) : '$9.99'} every 30 days.
        </p>
      </div>

      {/* Notice banner */}
      <div className="rounded-xl border border-[#E1E4EA] bg-[#FFFBEA] px-5 py-4 text-sm text-[#92400E]">
        <strong>Estimates, not your payout.</strong> These numbers come from subscription records, before
        Shopify&#39;s revenue share and fees. For money actually received, use the Shopify Partner
        dashboard. Test stores and stores you mark internal are left out.
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Estimated MRR"
          value={summary ? fmtMoney(summary.estimatedMrrUsd) : '—'}
          hint="Paying stores only. Trials not included."
          loading={summaryLoading}
        />
        <KpiCard
          label="Paying stores"
          value={summary ? summary.counts.paying : '—'}
          hint="Pro and billed past the trial."
          loading={summaryLoading}
        />
        <KpiCard
          label="In 7-day trial"
          value={summary ? summary.counts.trial : '—'}
          hint={
            summary
              ? summary.counts.trial > 0
                ? `Would add ${fmtMoney(summary.counts.trial * (summary.priceUsd || 9.99))} a month if they stay.`
                : 'No trials running.'
              : ''
          }
          loading={summaryLoading}
        />
        <KpiCard
          label="Lapsed (30 days)"
          value={summary ? summary.counts.lapsed30 : '—'}
          hint="Cancelled, frozen, expired or declined."
          loading={summaryLoading}
        />
      </div>
      {!summaryLoading && summaryError && <ErrorBox msg={summaryError} onRetry={loadSummary} />}

      {/* Plan activity */}
      <div className="rounded-xl border border-[#E1E4EA] bg-white p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-base font-bold text-[#171A22]">Plan activity</h2>
          <div className="flex gap-1">
            {RANGE_OPTS.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  range === r.key
                    ? 'bg-[#4F46E5] text-white'
                    : 'bg-[#F3F4F7] text-[#5A6070] hover:bg-[#E1E4EA]',
                ].join(' ')}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {activityLoading && <SectionSkeleton rows={4} />}
        {!activityLoading && activityError && <ErrorBox msg={activityError} onRetry={() => loadActivity(range)} />}
        {!activityLoading && !activityError && activity && (
          <>
            {/* Mini counts */}
            <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-4">
              {[
                { label: 'Trials started',          val: activity.counts.trials },
                { label: 'Became paying',            val: activity.counts.paying },
                { label: 'Lost (cancel or left)',    val: activity.counts.lost },
                { label: 'MRR change',
                  val: fmtSignedMoney(activity.netMrrUsd),
                  color: activity.netMrrUsd > 0 ? '#065F46' : activity.netMrrUsd < 0 ? '#B3261E' : '#5A6070' },
              ].map(({ label, val, color }) => (
                <div key={label} className="rounded-lg border border-[#E1E4EA] bg-[#F6F7F9] px-3 py-2">
                  <p className="text-[10px] font-semibold tracking-wide text-[#5A6070] uppercase mb-0.5">{label}</p>
                  <p className="text-lg font-extrabold" style={{ color: color || '#171A22' }}>{val}</p>
                </div>
              ))}
            </div>

            {/* Activity table */}
            <div className="rounded-lg border border-[#E1E4EA] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-[#F3F4F7] border-b border-[#E1E4EA]">
                      {['When', 'Store', 'What happened', 'MRR'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[#5A6070] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E1E4EA]">
                    {activity.events.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-[#5A6070]">
                          No plan changes {rangeLabel}.
                        </td>
                      </tr>
                    )}
                    {activity.events.map((ev, i) => (
                      <tr key={i} className="hover:bg-[#F6F7F9]">
                        <td className="px-4 py-2.5 text-xs text-[#5A6070] whitespace-nowrap">{fmtShortDate(ev.at)}</td>
                        <td className="px-4 py-2.5 text-xs">
                          <p className="font-medium text-[#171A22]">{ev.shopName}</p>
                          <p className="text-[#5A6070]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{ev.shopDomain}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_CHIP[ev.kind] || ''}`}>
                            {KIND_LABEL[ev.kind] || ev.kind}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
                          style={{ color: ev.amountUsd > 0 ? '#065F46' : ev.amountUsd < 0 ? '#B3261E' : '#5A6070' }}>
                          {ev.amountUsd === 0 ? '—' : fmtSignedMoney(ev.amountUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footnote */}
            <p className="mt-3 text-xs text-[#5A6070]">
              {summary && (
                summary.recordingSince
                  ? <>Counted from the day recording was switched on ({fmtShortDate(summary.recordingSince)}). Purchases before that day cannot be counted; those stores only show their current plan.</>
                  : <>No subscription events have been recorded yet.</>
              )}
            </p>
          </>
        )}
      </div>

      {/* MRR by month */}
      <div className="rounded-xl border border-[#E1E4EA] bg-white p-5">
        <h2 className="text-base font-bold text-[#171A22] mb-4">Estimated MRR by month</h2>
        {summaryLoading && <SectionSkeleton rows={2} />}
        {!summaryLoading && summaryError && <ErrorBox msg={summaryError} onRetry={loadSummary} />}
        {!summaryLoading && !summaryError && summary && (
          <>
            <MrrChart months={summary.months} />
            <p className="mt-3 text-xs text-[#5A6070]">
              History starts on the day plan recording is switched on. Earlier months cannot be recovered,
              so they show as &quot;No record&quot;. Each new month fills in by itself.
            </p>
          </>
        )}
      </div>

      {/* Plan split */}
      <div className="rounded-xl border border-[#E1E4EA] bg-white p-5">
        <h2 className="text-base font-bold text-[#171A22] mb-4">Plan split</h2>
        {summaryLoading && <SectionSkeleton rows={1} />}
        {!summaryLoading && !summaryError && summary && <PlanSplit counts={summary.counts} />}
        {!summaryLoading && summaryError && <ErrorBox msg={summaryError} onRetry={loadSummary} />}
      </div>

      {/* Stores tabs */}
      <div className="rounded-xl border border-[#E1E4EA] bg-white">
        {/* Tab bar */}
        <div className="flex border-b border-[#E1E4EA] px-4 gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const count = tabCounts ? tabCounts[tab.countKey] : null;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setStoresPage(0); }}
                className={[
                  'shrink-0 py-3 px-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-[#4F46E5] text-[#4F46E5]'
                    : 'border-transparent text-[#5A6070] hover:text-[#171A22]',
                ].join(' ')}
              >
                {tab.label}
                {count != null && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${isActive ? 'bg-[#E7E5FF] text-[#3730A3]' : 'bg-[#F3F4F7] text-[#5A6070]'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="p-4">
          {storesLoading && <SectionSkeleton rows={4} />}
          {!storesLoading && storesError && <ErrorBox msg={storesError} onRetry={() => loadStores(activeTab, storesPage)} />}
          {!storesLoading && !storesError && storesData && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E1E4EA]">
                    {['STORE', 'STATUS', activeTabDef.dateHeader, 'PER MONTH', 'COUNT IN REVENUE', ''].map(h => (
                      <th key={h} className="pb-2 pr-4 text-left text-xs font-semibold text-[#5A6070] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E1E4EA]">
                  {storesData.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-[#5A6070]">No stores in this group.</td>
                    </tr>
                  )}
                  {storesData.rows.map(row => {
                    const isPending = pendingInternal === row.shopDomain;
                    const rowErr    = internalErrors[row.shopDomain];
                    return (
                      <tr key={row.shopDomain} className="hover:bg-[#F6F7F9]">
                        {/* Store */}
                        <td className="py-2.5 pr-4">
                          <p className="font-medium text-[#171A22]">{row.shopName}</p>
                          <p className="text-xs text-[#5A6070]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{row.shopDomain}</p>
                        </td>
                        {/* Status */}
                        <td className="py-2.5 pr-4 text-xs text-[#5A6070] whitespace-nowrap">{row.status}</td>
                        {/* Date or reason */}
                        <td className="py-2.5 pr-4 text-xs text-[#5A6070] whitespace-nowrap">
                          {activeTab === 'excluded'
                            ? <span>{row.date}</span>
                            : <span>{row.approx && <span title="Approximate date">{'~'}</span>}{fmtShortDate(row.date)}</span>
                          }
                        </td>
                        {/* Per month */}
                        <td className="py-2.5 pr-4 text-xs font-semibold text-[#171A22] whitespace-nowrap">
                          {row.valueUsd > 0 ? fmtMoney(row.valueUsd) : '—'}
                        </td>
                        {/* Count in revenue */}
                        <td className="py-2.5 pr-4 text-xs whitespace-nowrap">
                          {row.valueUsd > 0
                            ? <span className="text-[#065F46] font-semibold">Yes</span>
                            : <span className="text-[#5A6070]">No</span>}
                        </td>
                        {/* Mark internal button */}
                        <td className="py-2.5 text-right whitespace-nowrap">
                          {row.isTest ? (
                            <span className="text-xs text-[#5A6070] italic">Shopify test store, locked</span>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                onClick={() => handleMarkInternal(row.shopDomain, !row.isInternal)}
                                disabled={isPending}
                                className="rounded-lg border border-[#E1E4EA] px-3 py-1 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                {isPending ? 'Saving…' : row.isInternal ? 'Count again' : 'Mark internal'}
                              </button>
                              {rowErr && <p className="text-[10px] text-[#B3261E]">{rowErr}</p>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!storesLoading && !storesError && storesData && storesData.total > LIMIT && (
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#E1E4EA] pt-3">
              <p className="text-xs text-[#5A6070]">Page {storesPage + 1} of {totalPages} · {storesData.total} stores</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setStoresPage(p => Math.max(0, p - 1))}
                  disabled={storesPage === 0}
                  className="rounded-lg border border-[#E1E4EA] px-3 py-1.5 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => setStoresPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={storesPage >= totalPages - 1}
                  className="rounded-lg border border-[#E1E4EA] px-3 py-1.5 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footnote */}
        <div className="border-t border-[#E1E4EA] px-4 py-3">
          <p className="text-xs text-[#5A6070]">
            Marking a store internal is saved in the audit log with your name and the time. It can be undone at any time.
          </p>
        </div>
      </div>

    </div>
  );
}
