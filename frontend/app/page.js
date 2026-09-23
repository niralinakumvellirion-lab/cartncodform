'use client';

import { useState } from 'react';
import Navbar from './components/landing/Navbar';
import HeroSection from './components/landing/HeroSection';
import AnimatedShowcase from './components/landing/AnimatedShowcase';
import ProblemSolutionSection from './components/landing/ProblemSolutionSection';
import FeaturesBento from './components/landing/FeaturesBento';
import DemoStoreCallout from './components/landing/DemoStoreCallout';
import RoiCalculator from './components/landing/RoiCalculator';
import FaqSection from './components/landing/FaqSection';
import Footer from './components/landing/Footer';
import InstallModal from './components/landing/InstallModal';

export default function LandingPage() {
  const [installModalOpen, setInstallModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 selection:bg-brand selection:text-white">
      {/* Navigation */}
      <Navbar onOpenInstall={() => setInstallModalOpen(true)} />

      <main>
        {/* Hero Section */}
        <HeroSection onOpenInstall={() => setInstallModalOpen(true)} />

        {/* Professional Animated Feature Showcase Section */}
        <AnimatedShowcase onOpenInstall={() => setInstallModalOpen(true)} />

        {/* Problem vs Solution Comparison */}
        <ProblemSolutionSection />

        {/* 5-Layer Bento Grid Features */}
        <FeaturesBento />

        {/* Spotlight on demostore.shopireachboost.com */}
        <DemoStoreCallout />

        {/* Interactive ROI & Revenue Recovery Calculator */}
        <RoiCalculator onOpenInstall={() => setInstallModalOpen(true)} />

        {/* FAQ Accordion */}
        <FaqSection />

        {/* Closing High-Impact CTA Banner */}
        <section className="py-20 lg:py-28 bg-gradient-to-r from-brand via-indigo-600 to-purple-700 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_50%)] pointer-events-none" />
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
              Ready to Stop Losing Carts &amp; Multiply Repeat Purchases?
            </h2>
            <p className="mt-5 text-base sm:text-lg text-indigo-100 max-w-2xl mx-auto leading-relaxed">
              Install ShopiReachBoost AI on your Shopify store in under 60 seconds. Zero liquid code edits. 14-day free trial.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setInstallModalOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-white px-8 py-4 text-base font-extrabold text-brand shadow-xl hover:bg-gray-50 transition transform hover:-translate-y-0.5"
              >
                Connect Your Store Free →
              </button>

              <a
                href="https://demostore.shopireachboost.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-7 py-4 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/20 transition"
              >
                <span>Browse Live Demo Store</span>
                <svg className="h-4 w-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            <p className="mt-5 text-xs text-indigo-200">
              No credit card required • GDPR compliant • 100% money-back satisfaction guarantee
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <Footer onOpenInstall={() => setInstallModalOpen(true)} />

      {/* Store Connect Modal */}
      <InstallModal
        isOpen={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
      />
    </div>
  );
}
