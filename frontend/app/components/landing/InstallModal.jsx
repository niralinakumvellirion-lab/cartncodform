'use client';

// Installs start only from the Shopify App Store. This popup deliberately has
// no store-address field: Shopify does not allow asking merchants to type their
// myshopify.com address to install an app.
export default function InstallModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white p-7 shadow-2xl transition-all border border-gray-100"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-modal-title"
      >
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          aria-label="Close modal"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-brand">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 id="install-modal-title" className="text-xl font-bold text-gray-900">
              Install from the Shopify App Store
            </h3>
            <p className="text-xs text-gray-500">30-day free trial • All features included • No code required</p>
          </div>
        </div>

        <ol className="mt-6 space-y-3 text-sm text-gray-700">
          <li>1. Open the Shopify App Store from your Shopify admin.</li>
          <li>2. Search for <span className="font-semibold">ShopiReachBoost AI</span>.</li>
          <li>3. Press <span className="font-semibold">Install</span> and approve the permissions.</li>
        </ol>

        <div className="mt-6 flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
          >
            Close
          </button>
          <a
            href="https://apps.shopify.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/25 hover:bg-brand-dark transition"
          >
            Open Shopify App Store →
          </a>
        </div>
      </div>
    </div>
  );
}
