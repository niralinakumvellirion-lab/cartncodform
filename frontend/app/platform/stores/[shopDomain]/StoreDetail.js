'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { platformFetch, platformFetchBlob } from '../../../../lib/platformApi';
import { platformHref } from '../../../../lib/platformPaths';
import { usePlatformStaff } from '../../../../lib/platformContext';
import {
  fmtNumber, fmtDeliveryRate, relativeTime, fmtDate,
  statusLabel, statusDotClass, auditActionLabel,
} from '../../../../lib/platformFmt';

// ── Shared atoms ──────────────────────────────────────────────────────────────

const PLAN_CHIP_CLASS = {
  pro:  'bg-[#E7E5FF] text-[#3730A3]',
  free: 'bg-[#EEF0F4] text-[#4A5060]',
};

function PlanChip({ plan }) {
  const cls = PLAN_CHIP_CLASS[plan] ?? PLAN_CHIP_CLASS.free;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {plan === 'pro' ? 'Pro' : 'Free'}
    </span>
  );
}

function StatusDot({ status }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDotClass(status)}`} />
      <span className="text-sm font-medium">{statusLabel(status)}</span>
    </span>
  );
}

function StatTile({ label, value, red }) {
  return (
    <div className="rounded-xl border border-[#E1E4EA] bg-white px-4 py-4">
      <p className="mb-1 text-xs font-medium text-[#5A6070]">{label}</p>
      <p className={`text-2xl font-extrabold tabular-nums ${red ? 'text-[#B3261E]' : 'text-[#171A22]'}`}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-40 flex-shrink-0 text-xs font-medium text-[#5A6070]">{label}</dt>
      <dd className="text-sm text-[#171A22]">{children}</dd>
    </div>
  );
}

function SkeletonBox({ h = 'h-4', w = 'w-32' }) {
  return <div className={`animate-pulse rounded bg-[#E1E4EA] ${h} ${w}`} />;
}

function ReachBadges({ reach }) {
  const items = [];
  if (reach?.email)    items.push({ label: 'Email',    cls: 'bg-[#EEF0F4] text-[#4A5060]' });
  if (reach?.push)     items.push({ label: 'Push',     cls: 'bg-[#E7E5FF] text-[#3730A3]' });
  if (reach?.whatsapp) items.push({ label: 'WhatsApp', cls: 'bg-[#D1FAE5] text-[#065F46]' });
  if (!items.length) return <span className="text-xs text-[#5A6070]">None</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {items.map(it => (
        <span key={it.label}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${it.cls}`}>{it.label}</span>
      ))}
    </span>
  );
}

// ── Modal (focus-trap) ────────────────────────────────────────────────────────

function Modal({ open, titleId, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;

    const getFocusable = () => Array.from(
      el.querySelectorAll(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])'
      )
    );

    // Defer to let React finish painting
    const t = setTimeout(() => getFocusable()[0]?.focus(), 16);

    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      {/* Dialog */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

// ── Suspend dialog ────────────────────────────────────────────────────────────

const REASON_LABELS = {
  spam:    'Spam complaints from shoppers',
  policy:  'Breaks platform rules',
  payment: 'Payment problem',
  request: 'Merchant asked to pause',
  other:   'Other',
};

function SuspendDialog({ open, store, onClose, onSuccess }) {
  const [reason,   setReason]   = useState('');
  const [note,     setNote]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  // Reset when dialog opens/closes
  useEffect(() => {
    if (open) { setReason(''); setNote(''); setConfirm(''); setError(null); }
  }, [open]);

  const canSubmit = reason !== '' && confirm === store?.shopDomain && !loading;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await platformFetch(
        `/api/platform/stores/${encodeURIComponent(store.shopDomain)}/suspend`,
        { method: 'POST', body: JSON.stringify({ reason, note: note.trim() }) }
      );
      onSuccess('suspend', null);
    } catch (err) {
      if (err.status === 409) {
        setError('This store is already suspended. Close this dialog — the page will refresh.');
        onSuccess('refetch', null); // silently refetch
      } else if (err.status === 403) {
        setError('Your role cannot do this.');
      } else if (err.status === 404) {
        setError('Store not found.');
      } else {
        setError(err.message || 'Failed to suspend store. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} titleId="suspend-title" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 id="suspend-title" className="text-xl font-extrabold text-[#171A22] mb-1">
          Suspend {store?.shopName || store?.shopDomain}?
        </h2>
        <p className="mb-4 text-sm font-mono text-[#5A6070]"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}>
          {store?.shopDomain}
        </p>

        {/* What happens box */}
        <div className="mb-5 rounded-lg bg-[#F3F4F7] px-4 py-3 text-sm text-[#5A6070] space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-[#5A6070] mb-2">What happens</p>
          <p>• All push, email and WhatsApp sending stops including the queue and automations.</p>
          <p>• The merchant sees 'Your account is paused. Contact support.' when they open the app.</p>
          <p>• Their shop keeps working (COD order form and push sign-up on their storefront stay on).</p>
          <p>• No data is deleted and the store can be turned back on at any time.</p>
        </div>

        {/* Reason */}
        <label className="block mb-3">
          <span className="block mb-1 text-sm font-semibold text-[#171A22]">Reason <span className="text-[#B3261E]">*</span></span>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
            className="w-full rounded-lg border border-[#E1E4EA] bg-white px-3 py-2 text-sm text-[#171A22] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
          >
            <option value="">Select a reason…</option>
            {Object.entries(REASON_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>

        {/* Note */}
        <label className="block mb-3">
          <span className="block mb-1 text-sm font-semibold text-[#171A22]">Note <span className="text-[#5A6070] font-normal">(optional)</span></span>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 500))}
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-[#E1E4EA] bg-white px-3 py-2 text-sm text-[#171A22] placeholder:text-[#5A6070] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] resize-none"
            placeholder="Any extra context for the record…"
          />
          <span className="text-xs text-[#5A6070]">{note.length}/500</span>
        </label>

        {/* Domain confirm */}
        <label className="block mb-4">
          <span className="block mb-1 text-sm font-semibold text-[#171A22]">
            Type the store domain to confirm
          </span>
          <input
            type="text"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={store?.shopDomain}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-[#E1E4EA] bg-white px-3 py-2 text-sm font-mono text-[#171A22] placeholder:text-[#5A6070] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          />
        </label>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-[#B3261E]">
            {error}
          </p>
        )}

        <p className="mb-4 text-xs text-[#5A6070]">
          Only Admin and Owner can suspend. Your name and the time are recorded.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-[#E1E4EA] px-4 py-2 text-sm font-semibold text-[#5A6070] hover:bg-[#F3F4F7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-h-[44px] rounded-lg bg-[#B3261E] px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B3261E]"
          >
            {loading ? 'Suspending…' : 'Suspend store'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Turn-on dialog ────────────────────────────────────────────────────────────

function TurnOnDialog({ open, store, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => { if (open) setError(null); }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await platformFetch(
        `/api/platform/stores/${encodeURIComponent(store.shopDomain)}/unsuspend`,
        { method: 'POST' }
      );
      onSuccess('unsuspend', result);
    } catch (err) {
      if (err.status === 409) {
        setError('This store is not currently suspended. Close this dialog — the page will refresh.');
        onSuccess('refetch', null);
      } else if (err.status === 403) {
        setError('Your role cannot do this.');
      } else if (err.status === 404) {
        setError('Store not found.');
      } else {
        setError(err.message || 'Failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} titleId="turnon-title" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 id="turnon-title" className="text-xl font-extrabold text-[#171A22] mb-1">
          Turn {store?.shopName || store?.shopDomain} back on?
        </h2>
        <p className="mb-4 text-sm font-mono text-[#5A6070]"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}>
          {store?.shopDomain}
        </p>

        <div className="mb-5 rounded-lg bg-[#F3F4F7] px-4 py-3 text-sm text-[#5A6070] space-y-1.5">
          <p>• Sending starts again.</p>
          <p>• Anything due while the store was suspended will <strong>not</strong> be sent.</p>
          <p>• Approved festival items that were already due move back to draft so the merchant can approve them again.</p>
          <p>• Queued sends that were already due are skipped.</p>
          <p>• Messages scheduled for the future are untouched.</p>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-[#B3261E]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-[#E1E4EA] px-4 py-2 text-sm font-semibold text-[#5A6070] hover:bg-[#F3F4F7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] rounded-lg bg-[#4F46E5] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
          >
            {loading ? 'Turning on…' : 'Turn store on'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }) {
  const refs = useRef([]);

  function handleKey(e, idx) {
    const n = tabs.length;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % n;
    if (e.key === 'ArrowLeft')  next = (idx - 1 + n) % n;
    if (e.key === 'Home')       next = 0;
    if (e.key === 'End')        next = n - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].key);
      refs.current[next]?.focus();
    }
  }

  return (
    <div role="tablist" aria-label="Store sections"
      className="flex gap-0 border-b border-[#E1E4EA] mb-6 overflow-x-auto">
      {tabs.map((t, i) => (
        <button
          key={t.key}
          ref={el => { refs.current[i] = el; }}
          role="tab"
          id={`tab-${t.key}`}
          aria-selected={active === t.key}
          aria-controls={`panel-${t.key}`}
          tabIndex={active === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}
          onKeyDown={e => handleKey(e, i)}
          className={[
            'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-1',
            active === t.key
              ? 'border-[#4F46E5] text-[#4F46E5]'
              : 'border-transparent text-[#5A6070] hover:border-[#E1E4EA] hover:text-[#171A22]',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ store }) {
  const s = store.stats;
  const storeStatus = store.suspended ? 'suspended' : store.needsReauth ? 'needs_reconnect' : 'active';

  return (
    <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-6">
        <StatTile label="Shoppers"         value={fmtNumber(s.profiles)} />
        <StatTile label="Push subscribers" value={fmtNumber(s.pushSubscribers)} />
        <StatTile label="Emails captured"  value={fmtNumber(s.emailsCaptured)} />
        <StatTile label="Sent 7 days"      value={fmtNumber(s.sent7d)} />
        <StatTile label="Failed 7 days"    value={fmtNumber(s.failed7d)} red />
        <StatTile label="Push delivery"    value={fmtDeliveryRate(s.pushDeliveryRate)} />
      </div>

      <div className="rounded-xl border border-[#E1E4EA] bg-white p-5">
        <h2 className="mb-4 text-sm font-extrabold text-[#171A22]">Store details</h2>
        <dl className="space-y-3">
          <DetailRow label="Owner contact">{store.ownerEmail || '—'}</DetailRow>
          <DetailRow label="Installed">
            <span title={fmtDate(store.installedAt)}>{relativeTime(store.installedAt)}</span>
          </DetailRow>
          <DetailRow label="Plan">
            <span className="capitalize">{store.plan}</span>
            {store.subscriptionStatus && (
              <span className="ml-2 text-[#5A6070]">({store.subscriptionStatus})</span>
            )}
          </DetailRow>
          <DetailRow label="Timezone">{store.timezone || '—'}</DetailRow>
          <DetailRow label="Last automation run">
            {store.lastSignalRunAt
              ? <span title={fmtDate(store.lastSignalRunAt)}>{relativeTime(store.lastSignalRunAt)}</span>
              : '—'}
          </DetailRow>
          <DetailRow label="Shopify connection">
            <StatusDot status={storeStatus} />
          </DetailRow>
        </dl>
        <p className="mt-4 text-xs text-[#5A6070]">
          Shopify access keys are never shown anywhere in this panel.
        </p>
      </div>

      <p className="mt-3 text-xs text-[#5A6070]">Stats cover the last 90 days.</p>
    </div>
  );
}

// ── Shoppers tab ──────────────────────────────────────────────────────────────

const SHOPPERS_LIMIT = 25;

function ShoppersTab({ shopDomain, staffRole }) {
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [page,         setPage]         = useState(0);
  const [reveals,      setReveals]      = useState({});
  const [revealErrors, setRevealErrors] = useState({});
  const timers = useRef({});

  const canReveal = staffRole === 'owner' || staffRole === 'admin';

  const clearAll = useCallback(() => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    setReveals({});
    setRevealErrors({});
  }, []);

  useEffect(() => { clearAll(); }, [page, clearAll]);
  useEffect(() => () => { clearAll(); }, [clearAll]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    platformFetch(
      `/api/platform/stores/${encodeURIComponent(shopDomain)}/shoppers?page=${page}&limit=${SHOPPERS_LIMIT}`
    )
      .then(d  => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message || 'Failed to load shoppers.'); setLoading(false); });
  }, [shopDomain, page]);

  async function handleReveal(profileId) {
    if (reveals[profileId]) {
      clearTimeout(timers.current[profileId]);
      delete timers.current[profileId];
      setReveals(r => { const n = { ...r }; delete n[profileId]; return n; });
      setRevealErrors(e => { const n = { ...e }; delete n[profileId]; return n; });
      return;
    }
    setRevealErrors(e => { const n = { ...e }; delete n[profileId]; return n; });
    try {
      const result = await platformFetch(
        `/api/platform/stores/${encodeURIComponent(shopDomain)}/shoppers/${profileId}/reveal`,
        { method: 'POST' }
      );
      setReveals(r => ({ ...r, [profileId]: result }));
      timers.current[profileId] = setTimeout(() => {
        setReveals(r => { const n = { ...r }; delete n[profileId]; return n; });
        delete timers.current[profileId];
      }, 60_000);
    } catch (e) {
      const msg = e.status === 429
        ? 'Too many reveals this hour. Try again later.'
        : (e.message || 'Reveal failed. Try again.');
      setRevealErrors(err => ({ ...err, [profileId]: msg }));
    }
  }

  const totalPages = data ? Math.ceil(data.total / SHOPPERS_LIMIT) : 1;
  const cols = canReveal ? 6 : 5;

  return (
    <div id="panel-shoppers" role="tabpanel" aria-labelledby="tab-shoppers">
      <div className="mb-4 rounded-lg border border-[#C98A0B] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
        Shopper contact details are masked. Only a partial email, partial phone, or anonymous ID is shown.
        Use Reveal to see the real contact — the action is logged to the audit trail.
      </div>
      {!canReveal && (
        <p className="mb-4 text-sm text-[#5A6070]">Your role cannot reveal contact details.</p>
      )}

      <div className="rounded-xl border border-[#E1E4EA] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E1E4EA] bg-[#F3F4F7]">
                {['Shopper', 'Stage', 'Orders', 'Reachable by', 'Last seen',
                  ...(canReveal ? [''] : [])].map(h => (
                  <th key={h} scope="col"
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-[#5A6070]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E4EA]">
              {loading && [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[...Array(cols)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-[#E1E4EA]" style={{ width: '60%' }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && error && (
                <tr><td colSpan={cols} className="px-4 py-8 text-center text-sm text-[#B3261E]">{error}</td></tr>
              )}
              {!loading && !error && data?.shoppers?.length === 0 && (
                <tr><td colSpan={cols} className="px-4 py-8 text-center text-sm text-[#5A6070]">No shoppers found.</td></tr>
              )}
              {!loading && !error && data?.shoppers?.map(sh => {
                const rev    = reveals[sh.id];
                const revErr = revealErrors[sh.id];
                return (
                  <tr key={sh.id} className="transition-colors hover:bg-[#F3F4F7]">
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                        {sh.contact}
                      </span>
                      {rev && (
                        <div className="mt-1 space-y-0.5 text-xs text-[#1F8A5B]">
                          {rev.email        && <div>✉ {rev.email}</div>}
                          {rev.phone        && <div>📞 {rev.phone}</div>}
                          {rev.whatsappPhone && <div>💬 {rev.whatsappPhone}</div>}
                          <div className="text-[#5A6070]">Revealed, saved in audit log</div>
                        </div>
                      )}
                      {revErr && <div className="mt-1 text-xs text-[#B3261E]">{revErr}</div>}
                    </td>
                    <td className="px-4 py-3 capitalize text-[#5A6070]">{sh.stage}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtNumber(sh.orders)}</td>
                    <td className="px-4 py-3"><ReachBadges reach={sh.reach} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#5A6070]" title={fmtDate(sh.lastSeenAt)}>
                      {relativeTime(sh.lastSeenAt)}
                    </td>
                    {canReveal && (
                      <td className="px-4 py-3">
                        <button onClick={() => handleReveal(sh.id)}
                          className="min-h-[36px] rounded-lg border border-[#E1E4EA] px-3 py-1 text-xs font-semibold text-[#4F46E5] hover:bg-[#F3F4F7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] transition-colors">
                          {rev ? 'Hide' : 'Reveal'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data && data.total > SHOPPERS_LIMIT && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E1E4EA] px-4 py-3">
            <p className="text-xs text-[#5A6070]">
              Page {page + 1} of {totalPages} · {fmtNumber(data.total)} shoppers
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

// ── Sends and errors tab ──────────────────────────────────────────────────────

function SendsTab({ failures }) {
  return (
    <div id="panel-sends" role="tabpanel" aria-labelledby="tab-sends">
      <p className="mb-4 text-sm text-[#5A6070]">
        Read only. You can see what failed and why, but you cannot send or approve anything for a merchant.
      </p>
      <div className="rounded-xl border border-[#E1E4EA] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E1E4EA] bg-[#F3F4F7]">
                {['When', 'Channel', 'Kind', 'Error'].map(h => (
                  <th key={h} scope="col"
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-[#5A6070]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E4EA]">
              {failures.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[#5A6070]">No failed sends in the last 7 days.</td></tr>
              ) : failures.map((f, i) => (
                <tr key={i} className="transition-colors hover:bg-[#F3F4F7]">
                  <td className="whitespace-nowrap px-4 py-3 text-[#5A6070]" title={fmtDate(f.at)}>{relativeTime(f.at)}</td>
                  <td className="px-4 py-3 capitalize">{f.channel || '—'}</td>
                  <td className="px-4 py-3 text-[#5A6070]">{f.origin || '—'}</td>
                  <td className="px-4 py-3 text-[#B3261E] max-w-xs break-words">{f.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

const HISTORY_LIMIT = 50;

function HistoryTab({ shopDomain }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(0);

  useEffect(() => {
    setLoading(true);
    platformFetch(
      `/api/platform/audit?shopDomain=${encodeURIComponent(shopDomain)}&page=${page}&limit=${HISTORY_LIMIT}`
    )
      .then(d  => { setData(d); setLoading(false); })
      .catch(e => {
        setError(e.status === 403 ? 'Your role cannot view the audit log.' : (e.message || 'Failed to load history.'));
        setLoading(false);
      });
  }, [shopDomain, page]);

  const totalPages = data ? Math.ceil(data.total / HISTORY_LIMIT) : 1;

  return (
    <div id="panel-history" role="tabpanel" aria-labelledby="tab-history">
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-4 rounded-lg border border-[#E1E4EA] bg-white px-4 py-3">
              <div className="h-4 w-28 rounded bg-[#E1E4EA]" />
              <div className="h-4 flex-1 rounded bg-[#E1E4EA]" />
              <div className="h-4 w-16 rounded bg-[#E1E4EA]" />
            </div>
          ))}
        </div>
      )}
      {!loading && error && <p className="text-sm text-[#B3261E]">{error}</p>}
      {!loading && !error && (
        <div className="space-y-1.5">
          {data?.logs?.length === 0 && (
            <p className="text-sm text-[#5A6070]">No audit events for this store.</p>
          )}
          {data?.logs?.map((log, i) => (
            <div key={i}
              className="flex flex-wrap items-baseline gap-2 rounded-lg border border-[#E1E4EA] bg-white px-4 py-3 text-sm">
              <span className="font-medium text-[#171A22]">{log.staffEmail}</span>
              <span className="text-[#5A6070]">{auditActionLabel(log.action)}</span>
              <span className="ml-auto whitespace-nowrap text-xs text-[#5A6070]"
                title={fmtDate(log.at)}>
                {relativeTime(log.at)}
              </span>
            </div>
          ))}
        </div>
      )}
      {data && data.total > HISTORY_LIMIT && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-[#5A6070]">Page {page + 1} of {totalPages}</p>
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
  );
}

// ── Store detail root ─────────────────────────────────────────────────────────

export default function StoreDetail({ shopDomain }) {
  const staff = usePlatformStaff();
  const [store,         setStore]         = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [storeError,    setStoreError]    = useState(null);
  const [activeTab,     setActiveTab]     = useState('overview');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError,   setReportError]   = useState(null);
  const [dialogOpen,    setDialogOpen]    = useState(null); // 'suspend' | 'unsuspend' | null
  const [successMsg,    setSuccessMsg]    = useState(null);

  const suspendBtnRef   = useRef(null);
  const unsuspendBtnRef = useRef(null);

  const refetchStore = useCallback(async () => {
    try {
      const d = await platformFetch(`/api/platform/stores/${encodeURIComponent(shopDomain)}`);
      setStore(d);
    } catch {}
  }, [shopDomain]);

  useEffect(() => {
    setLoading(true);
    setStoreError(null);
    platformFetch(`/api/platform/stores/${encodeURIComponent(shopDomain)}`)
      .then(d  => { setStore(d); setLoading(false); })
      .catch(e => { setStoreError(e); setLoading(false); });
  }, [shopDomain]);

  function closeDialog() {
    const wasOpen = dialogOpen;
    setDialogOpen(null);
    // Return focus to the button that opened the dialog
    setTimeout(() => {
      (wasOpen === 'suspend' ? suspendBtnRef : unsuspendBtnRef).current?.focus();
    }, 0);
  }

  // Called by both dialogs on success or on 409 (refetch only)
  function handleDialogSuccess(type, result) {
    if (type === 'refetch') {
      refetchStore();
      return;
    }
    closeDialog();
    if (type === 'suspend') {
      setSuccessMsg('Store suspended.');
    } else {
      const fd = result?.festivalDrafted ?? 0;
      const js = result?.jobsSkipped ?? 0;
      setSuccessMsg(
        `Store turned on. ${fd} festival item${fd === 1 ? '' : 's'} moved to draft and ${js} queued send${js === 1 ? '' : 's'} skipped.`
      );
    }
    refetchStore();
  }

  async function downloadReport() {
    setReportLoading(true);
    setReportError(null);
    try {
      const res      = await platformFetchBlob(`/api/platform/stores/${encodeURIComponent(shopDomain)}/report`);
      const disp     = res.headers.get('Content-Disposition') || '';
      const match    = disp.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `store-report-${shopDomain}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const blob     = await res.blob();
      const objUrl   = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      setReportError(e.message || 'Failed to download report.');
    } finally {
      setReportLoading(false);
    }
  }

  const canReport  = staff?.role === 'owner' || staff?.role === 'admin';
  const canSuspend = staff?.role === 'owner' || staff?.role === 'admin';
  const canHistory = staff?.role === 'owner' || staff?.role === 'admin';

  const allTabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'shoppers', label: 'Shoppers' },
    { key: 'sends',    label: 'Sends and errors' },
    { key: 'history',  label: 'History', ownerAdminOnly: true },
  ];
  const visibleTabs = allTabs.filter(t => !t.ownerAdminOnly || canHistory);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonBox h="h-6" w="w-48" />
        <SkeletonBox h="h-4" w="w-64" />
        <div className="flex gap-4 mt-6">
          {[...Array(4)].map((_, i) => <SkeletonBox key={i} h="h-9" w="w-28" />)}
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (storeError) {
    const is404 = storeError.status === 404;
    const is403 = storeError.status === 403;
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-lg font-semibold text-[#171A22]">
          {is404 ? 'Store not found.' : is403 ? 'Your role cannot do this.' : (storeError.message || 'Something went wrong.')}
        </p>
        <Link href={platformHref('/')}
          className="text-sm font-semibold text-[#4F46E5] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] rounded">
          ← Back to all stores
        </Link>
      </div>
    );
  }

  if (!store) return null;

  const storeStatus = store.suspended ? 'suspended' : store.needsReauth ? 'needs_reconnect' : 'active';

  // ── Main ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Back link */}
      <Link href={platformHref('/')}
        className="mb-4 inline-flex items-center text-xs font-semibold text-[#5A6070] hover:text-[#4F46E5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] rounded">
        ← All stores
      </Link>

      {/* Dismissible success banner */}
      {successMsg && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[#1F8A5B] bg-[#F0FFF8] px-4 py-3">
          <p className="text-sm text-[#1F8A5B] font-medium">{successMsg}</p>
          <button onClick={() => setSuccessMsg(null)} aria-label="Dismiss"
            className="flex-shrink-0 text-[#1F8A5B] hover:text-[#155C3E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] rounded">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-extrabold text-[#171A22]">{store.shopName || shopDomain}</h1>
            <PlanChip plan={store.plan} />
            <StatusDot status={storeStatus} />
          </div>
          <p className="text-sm text-[#5A6070]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            {store.shopDomain}
          </p>
        </div>

        {/* Action buttons (owner|admin only) */}
        {(canReport || canSuspend) && (
          <div className="flex flex-wrap items-center gap-2">
            {canSuspend && !store.suspended && (
              <button
                ref={suspendBtnRef}
                onClick={() => setDialogOpen('suspend')}
                className="min-h-[44px] rounded-lg border border-[#B3261E] px-4 py-2.5 text-sm font-semibold text-[#B3261E] hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B3261E] transition-colors"
              >
                Suspend store
              </button>
            )}
            {canSuspend && store.suspended && (
              <button
                ref={unsuspendBtnRef}
                onClick={() => setDialogOpen('unsuspend')}
                className="min-h-[44px] rounded-lg border border-[#E1E4EA] px-4 py-2.5 text-sm font-semibold text-[#5A6070] hover:bg-[#F3F4F7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] transition-colors"
              >
                Turn store on
              </button>
            )}
            {canReport && (
              <div className="flex flex-col items-end gap-1">
                <button onClick={downloadReport} disabled={reportLoading}
                  className="min-h-[44px] rounded-lg bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] transition-colors">
                  {reportLoading ? 'Preparing report…' : 'Download store report'}
                </button>
                {reportError && <p className="text-xs text-[#B3261E]">{reportError}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Suspended banner — overflow-wrap: anywhere prevents long notes from breaking layout */}
      {store.suspended && (
        <div className="mb-5 rounded-lg border border-[#B3261E] bg-[#FEF2F2] px-4 py-3 text-sm"
          style={{ overflowWrap: 'anywhere' }}>
          <p className="font-semibold text-[#B3261E] mb-1">This store is suspended.</p>
          {store.suspendedReason && (
            <p className="text-[#7F1D1D]">Reason: <span className="capitalize">{store.suspendedReason}</span></p>
          )}
          {store.suspendedNote && (
            <p className="text-[#7F1D1D]">Note: {store.suspendedNote}</p>
          )}
          {store.suspendedBy && store.suspendedAt && (
            <p className="mt-1 text-xs text-[#7F1D1D]">
              By {store.suspendedBy} · <span title={fmtDate(store.suspendedAt)}>{relativeTime(store.suspendedAt)}</span>
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <TabBar tabs={visibleTabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && <OverviewTab store={store} />}
      {activeTab === 'shoppers' && <ShoppersTab shopDomain={shopDomain} staffRole={staff?.role} />}
      {activeTab === 'sends'    && <SendsTab failures={store.recentFailures ?? []} />}
      {activeTab === 'history'  && canHistory && <HistoryTab shopDomain={shopDomain} />}

      {/* Dialogs */}
      <SuspendDialog
        open={dialogOpen === 'suspend'}
        store={store}
        onClose={closeDialog}
        onSuccess={handleDialogSuccess}
      />
      <TurnOnDialog
        open={dialogOpen === 'unsuspend'}
        store={store}
        onClose={closeDialog}
        onSuccess={handleDialogSuccess}
      />
    </div>
  );
}
