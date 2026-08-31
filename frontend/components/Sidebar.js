'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar({ stores = [] }) {
  const pathname = usePathname();

  const linkClass = (active) =>
    `block rounded-lg px-3 py-2 text-sm font-medium transition ${
      active
        ? 'bg-white/10 text-white'
        : 'text-gray-400 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <aside className="flex w-64 flex-col bg-sidebar px-4 py-6 text-white">
      <Link href="/" className="px-3 text-lg font-bold tracking-tight">
        Cart<span className="text-brand">n</span>CodForm
      </Link>

      <nav className="mt-8 space-y-1">
        <Link href="/dashboard" className={linkClass(pathname === '/dashboard')}>
          All Stores
        </Link>
        <Link href="/install" className={linkClass(pathname === '/install')}>
          + Connect Store
        </Link>
      </nav>

      {stores.length > 0 && (
        <div className="mt-8">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Stores
          </p>
          <nav className="mt-2 space-y-1">
            {stores.map((s) => {
              const href = `/dashboard/${encodeURIComponent(s.shopDomain)}`;
              return (
                <Link key={s.shopDomain} href={href} className={linkClass(pathname === href)}>
                  <span className="block truncate">{s.shopDomain}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <div className="mt-auto px-3 pt-8 text-xs text-gray-600">
        © {new Date().getFullYear()} CartnCodForm
      </div>
    </aside>
  );
}
