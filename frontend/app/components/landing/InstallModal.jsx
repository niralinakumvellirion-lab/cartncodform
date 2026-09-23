'use client';

import { useState } from 'react';

export default function InstallModal({ isOpen, onClose }) {
  const [storeDomain, setStoreDomain] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleInstall = (e) => {
    e.preventDefault();
    setError('');

    let cleaned = storeDomain.trim().toLowerCase();
    cleaned = cleaned.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    if (!cleaned) {
      setError('Please enter your Shopify store URL.');
      return;
    }

    if (!cleaned.includes('.')) {
      cleaned = `${cleaned}.myshopify.com`;
    }

    if (!cleaned.endsWith('.myshopify.com')) {
      setError('Please enter a valid myshopify.com domain (e.g., yourstore.myshopify.com).');
      return;
    }

    setLoading(true);
    // Point to backend auth endpoint with shop query param
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.shopireachboost.com';
    window.location.href = `${backendUrl}/api/auth?shop=${encodeURIComponent(cleaned)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white p-7 shadow-2xl transition-all border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          aria-label="Close modal"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-brand">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Connect Your Shopify Store</h3>
            <p className="text-xs text-gray-500">14-day free trial • 60-second setup • No code required</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleInstall} className="mt-6 space-y-4">
          <div>
            <label htmlFor="store-domain" className="block text-sm font-medium text-gray-700">
              Your Shopify Store Domain
            </label>
            <div className="relative mt-2 rounded-lg shadow-sm">
              <input
                id="store-domain"
                type="text"
                value={storeDomain}
                onChange={(e) => setStoreDomain(e.target.value)}
                placeholder="brand-name.myshopify.com"
                className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
                autoFocus
                disabled={loading}
              />
            </div>
            {error && <p className="mt-2 text-xs text-red-600 font-medium">{error}</p>}
            <p className="mt-1.5 text-xs text-gray-400">
              Tip: You can just type <span className="font-mono text-gray-600">brand-name</span> and we'll append <span className="font-mono text-gray-600">.myshopify.com</span>.
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 p-4 border border-gray-100 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <svg className="h-4 w-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Instant theme app embed (1-click enable)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <svg className="h-4 w-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Safe GDPR compliance & protected customer data</span>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/25 hover:bg-brand-dark transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  Connecting...
                </>
              ) : (
                'Connect Store →'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
