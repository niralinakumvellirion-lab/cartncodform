import Link from 'next/link';
import { BACKEND_URL } from '../../lib/api';

async function getStores() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/stores`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return { stores: await res.json(), error: null };
  } catch (err) {
    return { stores: [], error: err.message };
  }
}

export default async function DashboardOverview() {
  const { stores, error } = await getStores();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Stores</h1>
          <p className="mt-1 text-sm text-gray-500">
            Overview of every connected Shopify store.
          </p>
        </div>
        <Link
          href="/install"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Connect Store
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Could not reach the backend at <span className="font-mono">{BACKEND_URL}</span>. ({error})
        </div>
      )}

      {stores.length === 0 && !error && (
        <div className="mt-10 rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No stores connected yet.</p>
          <Link
            href="/install"
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Connect your first store
          </Link>
        </div>
      )}

      {stores.length > 0 && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
