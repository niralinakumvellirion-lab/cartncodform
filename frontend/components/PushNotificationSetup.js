'use client';
import { useState } from 'react';
import { requestNotificationPermission } from '../lib/firebase';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

// Turn a raw Firebase/SW/network error string into something a store owner can act on.
function friendlyError(raw) {
  const msg = String(raw || 'Unknown error');
  if (msg.includes('messaging/unsupported-browser')) return 'Browser not supported';
  if (msg.includes('messaging/permission-blocked') || msg.includes('permission-blocked')) {
    return 'Please allow notifications in browser settings';
  }
  if (/failed to register/i.test(msg)) {
    return 'Service worker failed — use Chrome/Edge browser';
  }
  return msg;
}

export default function PushNotificationSetup({ shopDomain }) {
  const [status, setStatus] = useState('idle'); // idle | loading | granted | error
  const [errorMsg, setErrorMsg] = useState('');

  async function handleEnable() {
    setStatus('loading');
    setErrorMsg('');
    try {
      const { token, error } = await requestNotificationPermission();

      if (!token) {
        console.error('[push] enable failed:', error);
        setErrorMsg(friendlyError(error));
        setStatus('error');
        return;
      }

      // Save token to backend
      const res = await fetch(`${BACKEND_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain, token }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Saving the token failed (${res.status}) ${body}`.trim());
      }

      setStatus('granted');
    } catch (err) {
      // Network failure here is usually the backend being unreachable.
      console.error('[push] enable error:', err);
      const raw =
        err instanceof TypeError
          ? `Cannot reach the backend at ${BACKEND_URL} — is it running? [${err.message}]`
          : err.message || String(err);
      setErrorMsg(friendlyError(raw));
      setStatus('error');
    }
  }

  if (status === 'granted') {
    return (
      <div className="text-green-600 text-sm font-medium">
        ✅ Push notifications enabled
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <button
          onClick={handleEnable}
          disabled={status === 'loading'}
          className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {status === 'loading' ? 'Enabling...' : '🔔 Enable Push Notifications'}
        </button>
        {status === 'error' && (
          <span className="text-red-500 text-sm">{errorMsg || 'Something went wrong'}</span>
        )}
      </div>
      {status === 'error' && errorMsg && (
        <span className="text-xs text-gray-400">
          Check the browser console for the full error.
        </span>
      )}
    </div>
  );
}
