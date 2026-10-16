'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { loginWithGoogle, getMe } from '../../../lib/platformApi';
import { platformHref } from '../../../lib/platformPaths';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

const ERRORS = {
  403: 'This Google account is not on the staff list. Ask the owner to add you.',
  503: 'Sign-in is not set up yet.',
  429: 'Too many attempts. Wait a minute and try again.',
  0:   'Could not reach the server. Try again.',
};

function errorMessage(err) {
  if (ERRORS[err.status]) return ERRORS[err.status];
  return err.message || 'Sign-in failed. Try again.';
}

export default function LoginClient() {
  const router    = useRouter();
  const btnRef    = useRef(null);
  const [msg, setMsg]         = useState('');
  const [loading, setLoading] = useState(true); // checking existing session

  // If already signed in, skip the login page.
  useEffect(() => {
    getMe()
      .then(() => router.replace(platformHref('/')))
      .catch(() => setLoading(false)); // not signed in — show form
  }, [router]);

  function onGoogleScript() {
    if (!CLIENT_ID || !window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id:       CLIENT_ID,
      callback:        handleCredential,
      auto_select:     false,
      cancel_on_tap_outside: true,
    });
    if (btnRef.current) {
      window.google.accounts.id.renderButton(btnRef.current, {
        theme:  'outline',
        size:   'large',
        width:  320,
        shape:  'rectangular',
        text:   'signin_with',
      });
    }
  }

  async function handleCredential(response) {
    setMsg('');
    try {
      await loginWithGoogle(response.credential);
      router.push(platformHref('/'));
    } catch (err) {
      setMsg(errorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E1E4EA] border-t-[#4F46E5]" />
      </div>
    );
  }

  return (
    <>
      {CLIENT_ID && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={onGoogleScript}
        />
      )}

      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F6F7F9] px-4">
        {/* Card */}
        <div className="w-full max-w-sm rounded-2xl bg-white px-8 py-10 shadow-sm border border-[#E1E4EA] text-gray-900">

          {/* Brand + chip */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <span className="text-xs font-bold tracking-widest text-indigo-600 uppercase bg-indigo-50 rounded-full px-3 py-1">
              Platform Admin
            </span>
            <p className="text-sm font-semibold text-gray-500">ShopiReachBoost AI</p>
          </div>

          {/* Title */}
          <h1 className="mb-2 text-center text-2xl font-extrabold tracking-tight">
            Staff sign-in
          </h1>

          {/* Reassurance lines */}
          <ul className="mb-8 space-y-1.5 text-sm text-gray-500 text-center">
            <li>Internal access — not a customer-facing page</li>
            <li>Your account must be on the approved staff list</li>
            <li>All actions are logged and audited</li>
          </ul>

          {/* Google button / misconfigured state */}
          {CLIENT_ID ? (
            <div className="flex justify-center">
              <div ref={btnRef} />
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center text-sm text-amber-700">
              Sign-in is not configured.
            </p>
          )}

          {/* Error message */}
          {msg && (
            <p className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-center text-sm text-red-700">
              {msg}
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-xs text-[#5A6070]">admin.shopireachboost.com</p>
      </div>
    </>
  );
}
