'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getMe, signOut } from '../../../lib/platformApi';

const NAV = [
  { label: 'Stores',          href: '/platform',       roles: ['owner', 'admin', 'support'] },
  { label: 'Staff and roles', href: '/platform/staff', roles: ['owner'] },
  { label: 'Audit log',       href: '/platform/audit', roles: ['owner', 'admin'] },
];

function NavLink({ href, label, current }) {
  return (
    <a
      href={href}
      className={[
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        current
          ? 'bg-white/10 text-white'
          : 'text-white/60 hover:bg-white/5 hover:text-white',
      ].join(' ')}
    >
      {label}
    </a>
  );
}

function Skeleton() {
  return (
    <div className="flex min-h-screen bg-[#12151C]">
      {/* Sidebar skeleton */}
      <div className="hidden w-56 flex-shrink-0 border-r border-white/10 p-4 sm:block">
        <div className="mb-8 h-6 w-32 rounded bg-white/10" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 rounded-lg bg-white/5" />
          ))}
        </div>
      </div>
      {/* Content skeleton */}
      <div className="flex-1 p-8">
        <div className="h-8 w-48 rounded bg-white/10" />
      </div>
    </div>
  );
}

function SessionEnded({ onSignIn }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#12151C] gap-4">
      <p className="text-white/70 text-sm">
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
          // Any other error (no token, 403, network): go to login
          router.push('/platform/login');
        }
      });
  }, [router]);

  if (loading) return <Skeleton />;

  if (sessionEnded) {
    return <SessionEnded onSignIn={() => router.push('/platform/login')} />;
  }

  if (!staff) return null;

  const visibleNav = NAV.filter(item => item.roles.includes(staff.role));

  return (
    <div className="flex min-h-screen bg-[#12151C]">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="flex w-full flex-col border-b border-white/10 p-4 sm:h-screen sm:w-56 sm:flex-shrink-0 sm:border-b-0 sm:border-r sm:sticky sm:top-0">
        {/* Brand */}
        <div className="mb-6 hidden sm:block">
          <p className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Platform Admin</p>
          <p className="mt-0.5 text-sm font-semibold text-white/80">ShopiReachBoost AI</p>
        </div>

        {/* Nav */}
        <nav className="flex flex-row gap-1 sm:flex-col sm:flex-1">
          {visibleNav.map(item => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              current={pathname === item.href || (item.href !== '/platform' && pathname.startsWith(item.href))}
            />
          ))}
        </nav>

        {/* Staff info + sign-out */}
        <div className="mt-2 hidden border-t border-white/10 pt-3 sm:block">
          <p className="truncate text-xs font-medium text-white/70">{staff.name || staff.email}</p>
          <p className="mb-2 text-xs text-white/40 capitalize">{staff.role}</p>
          <button
            onClick={signOut}
            className="w-full rounded-lg bg-white/5 px-3 py-1.5 text-left text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
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
  );
}
