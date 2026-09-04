'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiGet, apiSend } from '../../lib/api';

export default function DashboardOverview() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || '';

  const [stores, setStores] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const loadStores = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    try {
      const d = await apiGet('/api/stores');
      setStores(Array.isArray(d) ? d : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  async function handleDisconnect(shopDomain) {
    const ok = window.confirm(
      'Are you sure you want to disconnect this store? All data will be deleted.'
    );
    if (!ok) return;

    setBusy(shopDomain);
    setError(null);
    try {
      await apiSend(`/api/stores/${encodeURIComponent(shopDomain)}`, 'DELETE', {});
      setStores((prev) => prev.filter((s) => s.shopDomain !== shopDomain));
      loadStores();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Your Stores</h1>
          <p className="mt-1 text-sm text-gray-500">
            {email ? `Stores connected to ${email}` : 'Stores connected to your account.'}
          </p>
        </div>
        <Link
          href="/install"
          className="w-full rounded-lg bg-brand px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-dark sm:w-auto"
        >
          Connect Store
        </Link>
      </div>

      {loading && (
        <p className="mt-8 text-sm text-gray-500">Loading your stores…</p>
      )}

      {error && !loading && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      )}

      {!loading && !error && stores.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No stores connected to this account yet.</p>
          <Link
            href="/install"
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Connect your first store
          </Link>
        </div>
      )}

      {!loading && stores.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {stores.map((store) => (
            <div
              key={store.shopDomain}
              className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-brand hover:shadow"
            >
              <button
                onClick={() => handleDisconnect(store.shopDomain)}
                disabled={busy === store.shopDomain}
                title="Disconnect store — deletes all its data"
                className="absolute right-3 top-3 rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy === store.shopDomain ? '…' : 'Disconnect'}
              </button>

              <Link
                href={`/dashboard/${encodeURIComponent(store.shopDomain)}`}
                className="block"
              >
                <p className="truncate pr-24 text-sm font-semibold text-gray-900">
                  {store.shopDomain}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Installed{' '}
                  {store.installedAt
                    ? new Date(store.installedAt).toLocaleDateString()
                    : '—'}
                </p>
                <div className="mt-4 flex gap-4">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {store.abandonedCount ?? 0}
                    </p>
                    <p className="text-xs text-gray-500">Abandoned</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{store.codCount ?? 0}</p>
                    <p className="text-xs text-gray-500">COD orders</p>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
