'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthed } from '../lib/auth';

/**
 * Wraps dashboard content. If the visitor has not entered the PIN
 * (localStorage "cartncodform_auth" !== "true"), redirect them to /login.
 */
export default function AuthGuard({ children }) {
  const router = useRouter();
  const [status, setStatus] = useState('checking'); // checking | allowed

  useEffect(() => {
    if (isAuthed()) {
      setStatus('allowed');
    } else {
      router.replace('/login');
    }
  }, [router]);

  if (status !== 'allowed') {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <p className="text-sm text-gray-500">Checking access…</p>
      </div>
    );
  }

  return children;
}
