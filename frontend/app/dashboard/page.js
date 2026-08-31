'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { BACKEND_URL } from '../../lib/api';

export default function DashboardOverview() {
  const { data: session } = useSession();
  const email = session?.user?.email || '';

  const [stores, setStores] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${BACKEND_URL}/api/stores?email=${encodeURIComponent(email)}`, {
      cache: 'no-store',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) {
          setStores(Array.isArray(d) ? d : []);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

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
          Could not reach the backend at <span className="font-mono">{BACKEND_URL}</span>. ({error})
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
            <Link
              key={store.shopDomain}
              href={`/dashboard/${encodeURIComponent(store.shopDomain)}`}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-brand hover:shadow"
            >
              <p className="truncate text-sm font-semibold text-gray-900">{store.shopDomain}</p>
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
          ))}
        </div>
      )}
    </div>
  );
}
