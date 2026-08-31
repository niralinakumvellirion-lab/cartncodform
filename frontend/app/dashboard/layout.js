'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { BACKEND_URL } from '../../lib/api';

export default function DashboardLayout({ children }) {
  const [stores, setStores] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load the store list for the sidebar (was a server fetch; now client-side
  // so the layout can hold the mobile-drawer state).
  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/stores`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled) setStores(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setStores([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar
        stores={stores}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with hamburger — hidden on lg+ */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xl leading-none text-gray-700 hover:bg-gray-50"
          >
            ☰
          </button>
          <span className="text-base font-bold tracking-tight text-gray-900">
            Cart<span className="text-brand">n</span>CodForm
          </span>
        </div>

        <main className="flex min-w-0 flex-1 flex-col bg-white px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <AuthGuard>{children}</AuthGuard>
        </main>
      </div>
    </div>
  );
}
