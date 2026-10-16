'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getMe, signOut } from '../../../lib/platformApi';
import { platformHref } from '../../../lib/platformPaths';
import { PlatformStaffContext } from '../../../lib/platformContext';

// NAV stores clean paths; hrefs are computed at render time by platformHref
// so they work correctly on both admin.* (clean URLs) and localhost / app.*
// (/platform prefix).
const NAV = [
  { label: 'Stores',          path: '/',         roles: ['owner', 'admin', 'support'] },
  { label: 'Finance',         path: '/finance',  roles: ['owner'] },
  { label: 'Staff and roles', path: '/staff',    roles: ['owner'] },
  { label: 'Audit log',       path: '/audit',    roles: ['owner', 'admin'] },
];

function NavLink({ href, label, current }) {
  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        current
          ? 'bg-[#E7E5FF] text-[#3730A3]'
          : 'text-[#5A6070] hover:bg-[#F3F4F7] hover:text-[#171A22]',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="flex min-h-screen bg-[#F6F7F9]">
      <div className="hidden w-56 flex-shrink-0 border-r border-[#E1E4EA] bg-white p-4 sm:block">
        <div className="mb-8 h-6 w-32 rounded bg-[#E1E4EA]" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 rounded-lg bg-[#E1E4EA]" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-8">
        <div className="h-8 w-48 rounded bg-[#E1E4EA]" />
      </div>
    </div>
  );
}

function SessionEnded({ onSignIn }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F6F7F9] gap-4">
      <p className="text-[#5A6070] text-sm">
        Your session ended. Sign in again.
      </p>
      <button
        onClick={onSignIn}
        className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
      >
        Sign in
      </button>
    </div>
  );
}

export default function PlatformShell({ children }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [staff,        setStaff]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    getMe()
      .then(data => { setStaff(data); setLoading(false); })
      .catch(err => {
        if (err.status === 401) {
          setSessionEnded(true);
          setLoading(false);
        } else {
          router.push(platformHref('/login'));
        }
      });
  }, [router]);

  if (loading) return <Skeleton />;

  if (sessionEnded) {
    return <SessionEnded onSignIn={() => router.push(platformHref('/login'))} />;
  }

  if (!staff) return null;

  const storesHref   = platformHref('/');
  const visibleNav   = NAV
    .filter(item => item.roles.includes(staff.role))
    .map(item => ({ ...item, href: platformHref(item.path) }));

  return (
    <PlatformStaffContext.Provider value={staff}>
    <div className="flex min-h-screen bg-[#F6F7F9]">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="flex w-full flex-col border-b border-[#E1E4EA] bg-white p-4 sm:h-screen sm:w-56 sm:flex-shrink-0 sm:border-b-0 sm:border-r sm:sticky sm:top-0">
        {/* Brand */}
        <div className="mb-6 hidden sm:block">
          <p className="text-xs font-bold tracking-widest text-[#4F46E5] uppercase">Platform Admin</p>
          <p className="mt-0.5 text-sm font-semibold text-[#171A22]">ShopiReachBoost AI</p>
        </div>

        {/* Nav */}
        <nav className="flex flex-row gap-1 sm:flex-col sm:flex-1">
          {visibleNav.map(item => (
            <NavLink
              key={item.path}
              href={item.href}
              label={item.label}
              current={
                pathname === item.href ||
                (item.href !== storesHref && pathname.startsWith(item.href + '/'))
              }
            />
          ))}
        </nav>

        {/* Staff info + sign-out */}
        <div className="mt-2 hidden border-t border-[#E1E4EA] pt-3 sm:block">
          <p className="truncate text-xs font-medium text-[#171A22]">{staff.name || staff.email}</p>
          <p className="mb-2 text-xs text-[#5A6070] capitalize">{staff.role}</p>
          <button
            onClick={signOut}
            className="w-full rounded-lg border border-[#E1E4EA] bg-white px-3 py-1.5 text-left text-xs font-medium text-[#5A6070] hover:bg-[#F3F4F7] hover:text-[#171A22] transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-6 sm:p-8">
        {children}
      </main>
    </div>
    </PlatformStaffContext.Provider>
  );
}
