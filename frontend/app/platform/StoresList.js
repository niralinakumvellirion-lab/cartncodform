'use client';

import { useState, useEffect, useRef } from 'react';
import { platformFetch } from '../../lib/platformApi';
import Link from 'next/link';
import { platformHref } from '../../lib/platformPaths';
import { fmtNumber, relativeTime, fmtDate, statusLabel, statusDotClass } from '../../lib/platformFmt';

const LIMIT = 25;

const PLAN_CHIP_CLASS = {
  pro:  'bg-[#E7E5FF] text-[#3730A3]',
  free: 'bg-[#EEF0F4] text-[#4A5060]',
};

const FILTER_CHIPS = [
  { key: 'all',             label: 'All',             queryKey: null,       queryVal: null },
  { key: 'pro',             label: 'Pro',             queryKey: 'plan',     queryVal: 'pro' },
  { key: 'free',            label: 'Free',            queryKey: 'plan',     queryVal: 'free' },
  { key: 'needs_reconnect', label: 'Needs reconnect', queryKey: 'status',   queryVal: 'needs_reconnect' },
  { key: 'suspended',       label: 'Suspended',       queryKey: 'status',   queryVal: 'suspended' },
];

function PlanChip({ plan }) {
  const cls = PLAN_CHIP_CLASS[plan] ?? PLAN_CHIP_CLASS.free;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {plan === 'pro' ? 'Pro' : 'Free'}
    </span>
  );
}

function StatusCell({ status }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDotClass(status)}`} />
      <span>{statusLabel(status)}</span>
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[55, 40, 35, 20, 20, 20, 30, 12].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-[#E1E4EA]" style={{ width: `${w}%` }} />
        </td>
      ))}
    </tr>
  );
}

export default function StoresList() {
  const [summary,  setSummary]  = useState(null);
  const [chip,     setChip]     = useState('all');
  const [rawSearch,setRawSearch]= useState('');
  const [search,   setSearch]   = useState('');   // debounced
  const [page,     setPage]     = useState(0);
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState(null);
  const debounce = useRef(null);

  // Load summary once (tiles + chip counts)
  useEffect(() => {
    platformFetch('/api/platform/stores/summary').then(setSummary).catch(() => {});
  }, []);

  // Debounce: update `search` 300 ms after user stops typing; reset page.
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setSearch(rawSearch);
      setPage(0);
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [rawSearch]);

  // Reload whenever chip, debounced search, or page changes.
  useEffect(() => {
    setLoading(true);
    setLoadErr(null);
    const active = FILTER_CHIPS.find(c => c.key === chip);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (active?.queryKey) params.set(active.queryKey, active.queryVal);
    if (search.trim())    params.set('search', search.trim());
    platformFetch(`/api/platform/stores?${params}`)
      .then(d  => { setData(d);                setLoading(false); })
      .catch(e => { setLoadErr(e.message || 'Failed to load stores.'); setLoading(false); });
  }, [chip, search, page]);

  function handleChip(key) {
    setChip(key);
    setPage(0);
  }

  const chipCounts = summary ? {
    all:             summary.total,
    pro:             summary.pro,
    free:            summary.total - summary.pro,
    needs_reconnect: summary.needsReconnect,
    suspended:       summary.suspended,
  } : {};

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  return (
    <div>
      {/* Page header */}
      <h1 className="text-2xl font-extrabold text-[#171A22] mb-1">Stores</h1>
      <p className="text-sm text-[#5A6070] mb-6 max-w-2xl">
        Every merchant that installed ShopiReachBoost AI. Open a store to see its numbers and help it.
        Shopper contact details stay hidden unless you reveal them.
      </p>

      {/* Summary tiles */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          {[
            { label: 'Stores installed', value: summary.total },
            { label: 'On Pro plan',      value: summary.pro },
            { label: 'Need reconnect',   value: summary.needsReconnect },
            { label: 'Suspended',        value: summary.suspended },
          ].map(t => (
            <div key={t.label} className="rounded-xl border border-[#E1E4EA] bg-white px-4 py-4">
              <p className="mb-1 text-xs font-medium text-[#5A6070]">{t.label}</p>
              <p className="text-2xl font-extrabold tabular-nums text-[#171A22]">{fmtNumber(t.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter chips + search row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by plan or status">
          {FILTER_CHIPS.map(c => {
            const cnt   = chipCounts[c.key] ?? null;
            const active = chip === c.key;
            return (
              <button
                key={c.key}
                onClick={() => handleChip(c.key)}
                aria-pressed={active}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]',
                  active
                    ? 'border-[#4F46E5] bg-[#4F46E5] text-white'
                    : 'border-[#E1E4EA] bg-white text-[#5A6070] hover:border-[#4F46E5] hover:text-[#4F46E5]',
                ].join(' ')}
              >
                {c.label}{cnt != null ? ` (${fmtNumber(cnt)})` : ''}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          placeholder="Search name or domain…"
          value={rawSearch}
          onChange={e => setRawSearch(e.target.value)}
          aria-label="Search stores"
          className="ml-auto w-full rounded-lg border border-[#E1E4EA] bg-white px-3 py-1.5 text-sm text-[#171A22] placeholder:text-[#5A6070] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] sm:w-60"
        />
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-[#E1E4EA] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E1E4EA] bg-[#F3F4F7]">
                {['Store', 'Plan', 'Status', 'Shoppers', 'Sent 7d', 'Failed 7d', 'Last active', ''].map(h => (
                  <th key={h} scope="col"
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-[#5A6070]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E4EA]">
              {loading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

              {!loading && loadErr && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center">
                    <p className="mb-3 text-sm text-[#B3261E]">{loadErr}</p>
                    <button
                      onClick={() => {
                        setLoading(true);
                        setLoadErr(null);
                        const active = FILTER_CHIPS.find(c => c.key === chip);
                        const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
                        if (active?.queryKey) params.set(active.queryKey, active.queryVal);
                        if (search.trim())    params.set('search', search.trim());
                        platformFetch(`/api/platform/stores?${params}`)
                          .then(d  => { setData(d); setLoading(false); })
                          .catch(e => { setLoadErr(e.message || 'Failed.'); setLoading(false); });
                      }}
                      className="min-h-[44px] rounded-lg bg-[#4F46E5] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              )}

              {!loading && !loadErr && data?.stores?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-[#5A6070]">
                    No store matches. Try another filter or search.
                  </td>
                </tr>
              )}

              {!loading && !loadErr && data?.stores?.map(s => (
                <tr key={s.shopDomain} className="transition-colors hover:bg-[#F3F4F7]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#171A22]">{s.shopName || '—'}</p>
                    <p className="text-xs text-[#5A6070]"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      {s.shopDomain}
                    </p>
                  </td>
                  <td className="px-4 py-3"><PlanChip plan={s.plan} /></td>
                  <td className="px-4 py-3 text-sm"><StatusCell status={s.status} /></td>
                  <td className="px-4 py-3 tabular-nums text-right text-[#171A22]">{fmtNumber(s.shoppers)}</td>
                  <td className="px-4 py-3 tabular-nums text-right text-[#171A22]">{fmtNumber(s.sent7d)}</td>
                  <td className={[
                    'px-4 py-3 tabular-nums text-right',
                    s.failed7d >= 10 ? 'font-bold text-[#B3261E]' : 'text-[#171A22]',
                  ].join(' ')}>
                    {fmtNumber(s.failed7d)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-[#5A6070]"
                    title={fmtDate(s.lastActive)}>
                    {relativeTime(s.lastActive)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={platformHref('/stores/' + encodeURIComponent(s.shopDomain))}
                      className="rounded text-xs font-semibold text-[#4F46E5] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > LIMIT && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E1E4EA] px-4 py-3">
            <p className="text-xs text-[#5A6070]">
              Page {page + 1} of {totalPages} · {fmtNumber(data.total)} stores
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-[#E1E4EA] px-3 py-1.5 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border border-[#E1E4EA] px-3 py-1.5 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-[#5A6070]">Counts cover the last 90 days of records.</p>
    </div>
  );
}
