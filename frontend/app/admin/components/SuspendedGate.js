'use client';

import { useState, useEffect, useRef } from 'react';

// No support email exists in the codebase. This constant is the single place
// to update it when a real address is confirmed.
// The domain matches notifications@shopireachboost.com already in use.
const SUPPORT_EMAIL = 'support@shopireachboost.com';

export default function SuspendedGate({ children }) {
  const [suspended, setSuspended] = useState(false);
  const headingRef = useRef(null);

  useEffect(() => {
    function onSuspended() {
      setSuspended(true);
    }
    window.addEventListener('ccf:store-suspended', onSuspended);
    return () => window.removeEventListener('ccf:store-suspended', onSuspended);
  }, []);

  // Move focus to the heading when the paused page appears so screen readers
  // announce the role="alert" immediately.
  useEffect(() => {
    if (suspended && headingRef.current) {
      headingRef.current.focus();
    }
  }, [suspended]);

  if (!suspended) {
    // No extra wrapper — renders children exactly as the layout did before.
    return <>{children}</>;
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F1F0EF',
      padding: '1rem',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '2.5rem 2rem',
        maxWidth: '440px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
      }}>
        {/* Pause icon — two vertical bars inside an indigo circle */}
        <svg
          aria-hidden="true"
          width="56"
          height="56"
          viewBox="0 0 56 56"
          fill="none"
          style={{ marginBottom: '1.25rem' }}
        >
          <circle cx="28" cy="28" r="28" fill="#EEF2FF" />
          <rect x="18" y="17" width="8" height="22" rx="2.5" fill="#4F46E5" />
          <rect x="30" y="17" width="8" height="22" rx="2.5" fill="#4F46E5" />
        </svg>

        <div role="alert">
          <h1
            ref={headingRef}
            tabIndex={-1}
            style={{
              fontSize: '1.25rem',
              fontWeight: '700',
              color: '#202223',
              margin: '0 0 0.875rem',
              outline: 'none',
            }}
          >
            Your account is paused
          </h1>
        </div>

        <p style={{
          color: '#6D7175',
          fontSize: '0.9375rem',
          lineHeight: '1.6',
          margin: '0 0 0.625rem',
        }}>
          Sending is stopped for your store while it is paused. Your shop,
          checkout and cash-on-delivery form are not affected.
        </p>

        <p style={{
          color: '#6D7175',
          fontSize: '0.9375rem',
          lineHeight: '1.6',
          margin: '0 0 2rem',
        }}>
          To turn it back on, contact support.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            style={{
              display: 'block',
              backgroundColor: '#4F46E5',
              color: '#ffffff',
              padding: '0.8125rem 1.5rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '0.9375rem',
            }}
          >
            Contact support
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #C9CCCF',
              color: '#6D7175',
              padding: '0.8125rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.9375rem',
              fontFamily: 'inherit',
            }}
          >
            Check again
          </button>
        </div>
      </div>
    </div>
  );
}
