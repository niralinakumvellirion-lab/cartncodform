'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar({ stores = [], isOpen = false, onClose = () => {} }) {
  const pathname = usePathname();

  const linkClass = (active) =>
    `block rounded-lg px-3 py-2 text-sm font-medium transition ${
      active
        ? 'bg-white/10 text-white'
        : 'text-gray-400 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <>
      {/* Mobile backdrop — only rendered while the drawer is open on small screens */}
      {isOpen && (
        <div
          onClick={onClose}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto bg-sidebar px-4 py-6 text-white transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <Link
            href="/"
            onClick={onClose}
            className="px-3 text-lg font-bold tracking-tight"
          >
            Cart<span className="text-brand">n</span>CodForm
          </Link>
          {/* Close button — mobile only */}
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg px-2 py-1 text-2xl leading-none text-gray-400 hover:bg-white/10 hover:text-white lg:hidden"
          >
            &times;
          </button>
        </div>

        <nav className="mt-8 space-y-1">
          <Link
            href="/dashboard"
            onClick={onClose}
            className={linkClass(pathname === '/dashboard')}
          >
            All Stores
          </Link>
          <Link
            href="/install"
            onClick={onClose}
            className={linkClass(pathname === '/install')}
          >
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
                  <Link
                    key={s.shopDomain}
                    href={href}
                    onClick={onClose}
                    className={linkClass(pathname === href)}
                  >
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
    </>
  );
}
