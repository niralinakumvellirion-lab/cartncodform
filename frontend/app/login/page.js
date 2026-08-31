'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { checkPin, isAuthed, setAuthed } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  // Already signed in? Skip the form.
  useEffect(() => {
    if (isAuthed()) router.replace('/dashboard');
  }, [router]);

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!/^\d{4}$/.test(pin)) {
      setError('Enter your 4-digit PIN.');
      return;
    }

    if (checkPin(pin)) {
      setAuthed(true);
      router.replace('/dashboard');
    } else {
      setError('Incorrect PIN. Please try again.');
      setPin('');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-medium text-brand hover:underline">
          ← Back to home
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">Owner Login</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter the 4-digit PIN to access the dashboard.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="pin" className="block text-sm font-medium text-gray-700">
              PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.5em] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Unlock Dashboard
          </button>
        </form>
      </div>
    </main>
  );
}
