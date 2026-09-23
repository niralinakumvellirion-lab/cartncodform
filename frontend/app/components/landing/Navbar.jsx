'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Navbar({ onOpenInstall }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md transition-all">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand to-indigo-500 text-white shadow-md shadow-brand/20 group-hover:scale-105 transition-transform">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-extrabold tracking-tight text-gray-900 flex items-center gap-1.5">
                ShopiReachBoost <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-xs font-bold text-brand">AI</span>
              </span>
              <span className="text-[10px] font-semibold text-gray-400 tracking-wider uppercase">Shopify Retention Engine</span>
            </div>
          </Link>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-600">
          <a href="#interactive-demo" className="hover:text-brand transition font-semibold text-brand flex items-center gap-1.5">
            <span>✨</span>
            <span>Interactive Demo</span>
          </a>
          <a href="#features" className="hover:text-gray-900 transition">Features</a>
          <a href="#how-it-works" className="hover:text-gray-900 transition">How It Works</a>
          <a href="#demo-store" className="hover:text-gray-900 transition flex items-center gap-1 text-emerald-600 font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live Demo Store
          </a>
          <a href="#calculator" className="hover:text-gray-900 transition">ROI Calculator</a>
          <a href="#faq" className="hover:text-gray-900 transition">FAQ</a>
        </nav>

        {/* Right Action Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <a
            href="https://demostore.shopireachboost.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition"
          >
            <span>Demo Store</span>
            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button
            onClick={onOpenInstall}
            className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand/25 hover:bg-brand-dark transition"
          >
            Connect Store
          </button>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 pt-3 pb-6 space-y-3">
          <a
            href="#interactive-demo"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-semibold text-brand hover:bg-indigo-50"
          >
            ✨ Interactive Demo
          </a>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
          >
            How It Works
          </a>
          <a
            href="#demo-store"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-semibold text-emerald-600 hover:bg-emerald-50"
          >
            Live Demo Store ↗
          </a>
          <a
            href="#calculator"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
          >
            ROI Calculator
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
          >
            FAQ
          </a>

          <div className="pt-4 border-t border-gray-100 flex flex-col gap-2.5">
            <a
              href="https://demostore.shopireachboost.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center rounded-lg border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Explore Demo Store ↗
            </a>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenInstall();
              }}
              className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/20 hover:bg-brand-dark"
            >
              Connect Store Free
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
