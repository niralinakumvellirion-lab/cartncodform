'use client';

import Link from 'next/link';

export default function Footer({ onOpenInstall }) {
  return (
    <footer className="bg-white border-t border-gray-100 pt-16 pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-gray-100">
          {/* Brand Col */}
          <div className="md:col-span-5 space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-md shadow-brand/20">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xl font-extrabold tracking-tight text-gray-900">
                ShopiReachBoost <span className="text-brand">AI</span>
              </span>
            </Link>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
              The autonomous retention engine built for Indian D2C Shopify stores. Web push, relationship email, verified COD phone identity, and AI decisions that convert.
            </p>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg w-fit">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Shopify App Bridge &amp; GDPR Compliant</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Navigation</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><a href="#features" className="hover:text-gray-900 transition">Features</a></li>
              <li><a href="#how-it-works" className="hover:text-gray-900 transition">How It Works</a></li>
              <li><a href="#calculator" className="hover:text-gray-900 transition">Revenue Calculator</a></li>
              <li><a href="#faq" className="hover:text-gray-900 transition">FAQ</a></li>
            </ul>
          </div>

          {/* Ecosystem Links */}
          <div className="md:col-span-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Ecosystem</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>
                <a
                  href="https://demostore.shopireachboost.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand transition flex items-center gap-1.5 text-emerald-600 font-semibold"
                >
                  <span>Explore Demo Store (demostore.shopireachboost.com)</span>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </li>
              <li>
                <button
                  onClick={onOpenInstall}
                  className="hover:text-brand transition text-left"
                >
                  Connect Your Shopify Store
                </button>
              </li>
              <li>
                <a
                  href="https://admin.shopify.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900 transition"
                >
                  Shopify Admin Login
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <p>© {new Date().getFullYear()} ShopiReachBoost AI. All rights reserved.</p>
          <p>Shopify is a trademark of Shopify Inc. ShopiReachBoost AI is an independent software application.</p>
        </div>
      </div>
    </footer>
  );
}
