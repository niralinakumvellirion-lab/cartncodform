'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'sent', label: 'Sent' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

// The 4 stats-row tiles. The GET /api/queue/:shop endpoint only returns a
// `total` scoped to whatever single `status` filter was requested — there
// is no aggregate "counts per status" field — so the stats row is built
// from 4 parallel calls to that same endpoint (one per status, reading
// only .total from each). Wasteful (each call also returns up to 20 full,
// profile-enriched job rows that this row never uses) but stays within
// the given backend contract, which this task presented as complete and
// did not ask to extend. See audits/phase2-queue-audit.txt.
const STATS_STATUSES = ['pending', 'sent', 'failed', 'cancelled'];

const STATUS_BADGE = {
  pending: { bg: '#fef3c7', color: '#d97706' },
  sent: { bg: '#dcfce7', color: '#16a34a' },
  failed: { bg: '#fee2e2', color: '#dc2626' },
  cancelled: { bg: '#f3f4f6', color: '#6b7280' },
  skipped: { bg: '#f3f4f6', color: '#6b7280' },
};

const CHANNEL_BADGE = {
  push: { bg: '#dbeafe', color: '#1d4ed8', label: 'Push' },
  email: { bg: '#ede9fe', color: '#6d28d9', label: 'Email' },
};

const GRID_COLS = '1.8fr 1.4fr 0.9fr 1.5fr 1fr 1.8fr';

function formatSignal(type) {
  if (!type) return '—';
  const s = String(type).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const datePart = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart}, ${timePart}`;
}

export default function QueueScreen({ shop }) {
  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const limit = 20;

  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [statusCounts, setStatusCounts] = useState({});
  const [statsLoading, setStatsLoading] = useState(true);

  const [actionLoading, setActionLoading] = useState(null);
  const [actionResults, setActionResults] = useState({});

  const [refreshKey, setRefreshKey] = useState(0);

  // FETCH LOGIC — job list. Fetch on mount + when statusFilter or page
  // changes; refreshKey also re-triggers this (Refresh button, and after
  // a successful send-now/cancel action).
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setLoading(true);
    apiGet(`/api/queue/${encodeURIComponent(shop)}?status=${encodeURIComponent(statusFilter)}&page=${page}`)
      .then((data) => {
        if (cancelled) return;
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setJobs([]);
        setTotal(0);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shop, statusFilter, page, refreshKey]);

  // Stats row — independent of statusFilter/page (it always shows all 4
  // counts at once), but still re-fetched on refreshKey.
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setStatsLoading(true);
    Promise.all(
      STATS_STATUSES.map((s) =>
        apiGet(`/api/queue/${encodeURIComponent(shop)}?status=${s}&page=0`).catch(() => null)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const counts = {};
        STATS_STATUSES.forEach((s, i) => {
          counts[s] = results[i]?.total ?? 0;
        });
        setStatusCounts(counts);
      })
      .finally(() => {
        if (cancelled) return;
        setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shop, refreshKey]);

  // Reset to page 0 whenever the status filter changes — otherwise
  // switching from a long list to a short one could land on an
  // out-of-range page with no rows.
  useEffect(() => {
    setPage(0);
  }, [statusFilter]);

  async function sendNowJob(jobId) {
    setActionLoading(jobId);
    try {
      await apiSend(`/api/queue/${encodeURIComponent(shop)}/${jobId}/send-now`, 'POST', {});
      setActionResults((prev) => ({ ...prev, [jobId]: { success: true, msg: 'Queued!' } }));
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionResults((prev) => ({ ...prev, [jobId]: { success: false, msg: 'Failed' } }));
    } finally {
      setActionLoading(null);
    }
  }

  async function cancelJob(jobId) {
    setActionLoading(jobId);
    try {
      await apiSend(`/api/queue/${encodeURIComponent(shop)}/${jobId}/cancel`, 'POST', {});
      setActionResults((prev) => ({ ...prev, [jobId]: { success: true, msg: 'Cancelled' } }));
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionResults((prev) => ({ ...prev, [jobId]: { success: false, msg: 'Failed' } }));
    } finally {
      setActionLoading(null);
    }
  }

  const from = total === 0 ? 0 : page * limit + 1;
  const to = Math.min((page + 1) * limit, total);

  return (
    <div
      style={{
        padding: isMobileView ? '0 12px 24px' : '0 24px 24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      {/* 1. HEADER */}
      <div style={{ marginBottom: '20px', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '0 0 6px' }}>
            Notification Queue
          </h1>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
            Manage scheduled and sent notifications
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
            background: '#fff', color: '#374151', fontSize: 13,
            fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36
              A9 9 0 0 0 20.49 15"/>
          </svg>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* 2. STATUS FILTER TABS */}
      <div style={{
        display: 'flex', gap: '8px', marginBottom: '16px',
        overflowX: 'auto', paddingBottom: '4px',
      }}>
        {STATUS_FILTERS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            style={{
              padding: '6px 14px', fontSize: '13px',
              fontWeight: statusFilter === tab.key ? '600' : '400',
              color: statusFilter === tab.key ? '#111827' : '#6b7280',
              background: statusFilter === tab.key ? '#fff' : 'transparent',
              border: '1px solid',
              borderColor: statusFilter === tab.key ? '#e5e7eb' : 'transparent',
              borderRadius: '20px', cursor: 'pointer',
              flexShrink: 0, whiteSpace: 'nowrap',
              boxShadow: statusFilter === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. STATS ROW */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {STATS_STATUSES.map((s) => {
          const badge = STATUS_BADGE[s];
          return (
            <div key={s} style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
              padding: 16,
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: badge.color }}>
                {statsLoading ? '...' : (statusCounts[s] ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                {formatSignal(s)}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. TABLE / CARD LIST */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
        overflow: 'hidden',
      }}>
        {/* Table header — desktop only */}
        {!isMobileView && (
          <div style={{
            display: 'grid', gridTemplateColumns: GRID_COLS,
            padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6',
          }}>
            {['Customer', 'Signal', 'Channel', 'Scheduled', 'Status', 'Actions'].map((h) => (
              <div key={h} style={{
                fontSize: '11px', fontWeight: '600', color: '#9ca3af',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>{h}</div>
            ))}
          </div>
        )}

        {/* Rows */}
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} style={{
              height: '60px', borderBottom: '1px solid #f3f4f6',
              display: 'flex', alignItems: 'center', padding: '0 16px',
            }}>
              <div style={{ width: '60%', height: '14px', background: '#f3f4f6', borderRadius: '4px' }} />
            </div>
          ))
        ) : jobs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            No jobs in the queue.
          </div>
        ) : (
          jobs.map((job, i) => {
            const email = job.email || 'Anonymous';
            const channelBadge = CHANNEL_BADGE[job.channel] || CHANNEL_BADGE.push;
            const statusBadge = STATUS_BADGE[job.status] || STATUS_BADGE.skipped;
            const isPending = job.status === 'pending';
            const isActing = actionLoading === job._id;
            const result = actionResults[job._id];

            const channelEl = (
              <span style={{
                display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                fontSize: '12px', fontWeight: '500',
                background: channelBadge.bg, color: channelBadge.color,
              }}>
                {channelBadge.label}
              </span>
            );

            const statusEl = (
              <span style={{
                display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                fontSize: '12px', fontWeight: '500',
                background: statusBadge.bg, color: statusBadge.color,
              }}>
                {formatSignal(job.status)}
              </span>
            );

            const actionsEl = isPending ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {result && (
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: result.success ? '#16a34a' : '#dc2626',
                  }}>
                    {result.msg}
                  </span>
                )}
                <button
                  onClick={() => sendNowJob(job._id)}
                  disabled={isActing}
                  style={{
                    padding: '5px 10px', fontSize: '11px', fontWeight: '600',
                    color: '#fff', background: isActing ? '#9ca3af' : '#4f46e5',
                    border: 'none', borderRadius: '6px',
                    cursor: isActing ? 'not-allowed' : 'pointer',
                  }}
                >
                  Send now
                </button>
                <button
                  onClick={() => cancelJob(job._id)}
                  disabled={isActing}
                  style={{
                    padding: '5px 10px', fontSize: '11px', fontWeight: '600',
                    color: '#dc2626', background: '#fff',
                    border: '1px solid #fecaca', borderRadius: '6px',
                    cursor: isActing ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: '#d1d5db' }}>—</span>
            );

            if (isMobileView) {
              return (
                <div key={job._id} style={{
                  padding: '14px 16px',
                  borderBottom: i < jobs.length - 1 ? '1px solid #f9fafb' : 'none',
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '6px',
                  }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                      {email}
                    </div>
                    {statusEl}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                    {formatSignal(job.signalType)} · {channelEl}
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '12px', color: '#9ca3af', marginBottom: '8px',
                  }}>
                    {formatDateTime(job.runAt)}
                  </div>
                  {actionsEl}
                </div>
              );
            }

            return (
              <div key={job._id} style={{
                display: 'grid', gridTemplateColumns: GRID_COLS,
                padding: '12px 16px', alignItems: 'center',
                borderBottom: i < jobs.length - 1 ? '1px solid #f9fafb' : 'none',
              }}>
                <div style={{ fontSize: '14px', color: '#111827' }}>{email}</div>
                <div style={{ fontSize: '13px', color: '#374151' }}>{formatSignal(job.signalType)}</div>
                <div>{channelEl}</div>
                <div style={{ fontSize: '13px', color: '#374151' }}>{formatDateTime(job.runAt)}</div>
                <div>{statusEl}</div>
                <div>{actionsEl}</div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. PAGINATION */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: '16px',
      }}>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>
          {total > 0 ? `Showing ${from}-${to} of ${total}` : 'Showing 0 of 0'}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            style={{
              padding: '6px 14px', fontSize: '13px', fontWeight: '600',
              color: page === 0 ? '#d1d5db' : '#374151',
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
              cursor: page === 0 || loading ? 'not-allowed' : 'pointer',
            }}
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={to >= total || loading}
            style={{
              padding: '6px 14px', fontSize: '13px', fontWeight: '600',
              color: to >= total ? '#d1d5db' : '#374151',
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
              cursor: to >= total || loading ? 'not-allowed' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
