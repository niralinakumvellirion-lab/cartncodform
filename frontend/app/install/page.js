'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL } from '../../lib/api';

export default function InstallPage() {
  const [shop, setShop] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const domain = shop.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
      setError('Enter a valid domain like your-store.myshopify.com');
      return;
    }

    // Hand off to the backend to start Shopify OAuth.
    window.location.href = `${BACKEND_URL}/api/auth/install?shop=${encodeURIComponent(domain)}`;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-medium text-brand hover:underline">
          ← Back to home
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">Install CartnCodForm</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter your Shopify store domain to begin. You&apos;ll be redirected to Shopify to
          approve the required permissions
          (<span className="font-mono text-xs">read_orders, read_customers, write_customers</span>).
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="shop" className="block text-sm font-medium text-gray-700">
              Store domain
            </label>
            <input
              id="shop"
              type="text"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              placeholder="your-store.myshopify.com"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Connect with Shopify
          </button>
        </form>
      </div>
    </main>
  );
}
