'use client';

import { useState, useEffect, useCallback } from 'react';
import { platformFetch } from '../../../lib/platformApi';
import { relativeTime, fmtDate, auditActionLabel } from '../../../lib/platformFmt';
import { usePlatformStaff } from '../../../lib/platformContext';

const AUDIT_LIMIT = 50;

const ACTION_OPTS = [
  ['',                  '(All actions)'],
  ['login',             'Signed in'],
  ['login_refused',     'Sign-in refused'],
  ['store_opened',      'Opened a store'],
  ['shoppers_listed',   'Viewed shoppers'],
  ['shopper_revealed',  'Revealed shopper contact'],
  ['store_report',      'Downloaded report'],
  ['store_suspended',   'Suspended a store'],
  ['store_unsuspended', 'Unsuspended a store'],
  ['staff_added',       'Added staff'],
  ['staff_role_changed','Changed staff role'],
  ['staff_deactivated', 'Deactivated staff'],
  ['staff_reactivated', 'Reactivated staff'],
];

const ROLE_CHIP = {
  owner:   'bg-[#FEF3C7] text-[#92400E]',
  admin:   'bg-[#E7E5FF] text-[#3730A3]',
  support: 'bg-[#EEF0F4] text-[#4A5060]',
};
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', support: 'Support' };

export default function AuditScreen() {
  const me = usePlatformStaff();
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [page,     setPage]     = useState(0);

  // Filters
  const [domainInput,   setDomainInput]   = useState('');
  const [filterDomain,  setFilterDomain]  = useState('');
  const [filterAction,  setFilterAction]  = useState('');

  const isAllowed = me?.role === 'owner' || me?.role === 'admin';

  const load = useCallback(() => {
    if (!isAllowed) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page:  String(page),
      limit: String(AUDIT_LIMIT),
    });
    if (filterDomain) params.set('shopDomain', filterDomain);
    if (filterAction) params.set('action',     filterAction);
    platformFetch(`/api/platform/audit?${params}`)
      .then(d  => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message || 'Failed to load audit log.'); setLoading(false); });
  }, [isAllowed, page, filterDomain, filterAction]);

  useEffect(() => { load(); }, [load]);

  function applyDomainFilter() {
    const v = domainInput.trim().toLowerCase();
    if (v === filterDomain) return;
    setPage(0);
    setFilterDomain(v);
  }

  function clearDomainFilter() {
    setDomainInput('');
    setPage(0);
    setFilterDomain('');
  }

  const totalPages = data ? Math.ceil(data.total / AUDIT_LIMIT) : 1;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (!meLoaded) {
    return (
      <div>
        <div className="animate-pulse mb-6 space-y-2">
          <div className="h-7 w-32 rounded bg-[#E1E4EA]" />
          <div className="h-4 w-72 rounded bg-[#E1E4EA]" />
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-[#E1E4EA]" />
      </div>
    );
  }

  // ── Not allowed ───────────────────────────────────────────────────────────

  if (!isAllowed) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold text-[#171A22] mb-2">Audit log</h1>
        <p className="text-sm text-[#5A6070]">Your role cannot read the audit log.</p>
      </div>
    );
  }

  // ── Allowed ───────────────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-[#171A22] mb-1">Audit log</h1>
      <p className="text-sm text-[#5A6070] mb-6">
        Every action that a staff member takes in this panel.
      </p>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-4">
        {/* Domain filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-domain" className="text-xs font-semibold text-[#171A22]">
            Store domain
          </label>
          <div className="flex gap-1">
            <input
              id="audit-domain"
              type="text"
              value={domainInput}
              onChange={e => setDomainInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyDomainFilter(); }}
              placeholder="example.myshopify.com"
              className="w-52 rounded-lg border border-[#E1E4EA] px-3 py-2 text-sm text-[#171A22] placeholder:text-[#5A6070] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            />
            <button onClick={applyDomainFilter}
              className="rounded-lg border border-[#E1E4EA] px-3 py-2 text-sm font-semibold text-[#5A6070] hover:bg-[#F3F4F7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
              Filter
            </button>
            {filterDomain && (
              <button onClick={clearDomainFilter} aria-label="Clear domain filter"
                className="rounded-lg border border-[#E1E4EA] px-3 py-2 text-sm text-[#5A6070] hover:bg-[#F3F4F7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Action filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-action" className="text-xs font-semibold text-[#171A22]">
            Action
          </label>
          <select
            id="audit-action"
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(0); }}
            className="rounded-lg border border-[#E1E4EA] bg-white px-3 py-2 text-sm text-[#171A22] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
          >
            {ACTION_OPTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#E1E4EA] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E1E4EA] bg-[#F3F4F7]">
                {['When', 'Staff member', 'Role', 'Action', 'Store'].map(h => (
                  <th key={h} scope="col"
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-[#5A6070]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E4EA]">
              {loading && [...Array(8)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[28, 44, 20, 60, 48].map((w, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-[#E1E4EA]" style={{ width: `${w}%` }} />
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && error && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <p className="mb-3 text-sm text-[#B3261E]">{error}</p>
                    <button onClick={load}
                      className="rounded-lg border border-[#E1E4EA] px-4 py-2 text-sm font-semibold text-[#5A6070] hover:bg-[#F3F4F7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
                      Retry
                    </button>
                  </td>
                </tr>
              )}

              {!loading && !error && data?.logs?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#5A6070]">
                    {filterDomain || filterAction ? 'No events match these filters.' : 'No audit events yet.'}
                  </td>
                </tr>
              )}

              {!loading && !error && data?.logs?.map((log, i) => {
                const label = auditActionLabel(log.action);
                const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
                return (
                  <tr key={i} className="transition-colors hover:bg-[#F3F4F7]">
                    {/* When */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[#5A6070]"
                      title={fmtDate(log.at)}>
                      {relativeTime(log.at)}
                    </td>

                    {/* Staff member */}
                    <td className="px-4 py-3 text-[#171A22] max-w-[16rem] truncate">
                      {log.staffEmail}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_CHIP[log.staffRole] ?? ROLE_CHIP.support}`}>
                        {ROLE_LABEL[log.staffRole] ?? log.staffRole}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-[#171A22]">
                      {displayLabel}
                      {log.action === 'store_suspended' && log.meta?.reason && (
                        <span className="ml-1.5 text-xs text-[#5A6070]">({log.meta.reason})</span>
                      )}
                    </td>

                    {/* Store */}
                    <td className="px-4 py-3">
                      {log.shopDomain ? (
                        <span className="text-xs text-[#171A22]"
                          style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                          {log.shopDomain}
                        </span>
                      ) : (
                        <span className="text-[#5A6070]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && !error && data && data.total > AUDIT_LIMIT && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E1E4EA] px-4 py-3">
            <p className="text-xs text-[#5A6070]">
              Page {page + 1} of {totalPages} · {data.total.toLocaleString()} events
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="rounded-lg border border-[#E1E4EA] px-3 py-1.5 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
                ← Previous
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="rounded-lg border border-[#E1E4EA] px-3 py-1.5 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
