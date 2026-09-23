'use client';

export default function DemoStoreCallout() {
  return (
    <section id="demo-store" className="py-20 lg:py-28 bg-gradient-to-br from-gray-900 via-slate-900 to-indigo-950 text-white relative overflow-hidden">
      {/* Glow backgrounds */}
      <div className="absolute top-1/2 -left-20 -translate-y-1/2 h-96 w-96 rounded-full bg-brand/20 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-20 -translate-y-1/2 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Text */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Interactive Live Demo Available</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
              Test Drive the Entire Experience on Our{' '}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                Live Demo Store
              </span>
            </h2>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Don&apos;t just take our word for it. Visit our live demo Shopify storefront at{' '}
              <span className="font-mono text-white underline decoration-emerald-400 font-medium">demostore.shopireachboost.com</span>. Experience the real buyer journey, trigger behavioral push prompts, and submit a test COD order.
            </p>

            {/* Test steps checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <span className="text-lg">👀</span>
                <p className="mt-1.5 text-xs font-semibold text-white">Browse Products</p>
                <p className="text-[11px] text-slate-400">Test price hesitation &amp; browse dwell tracking</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <span className="text-lg">🔔</span>
                <p className="mt-1.5 text-xs font-semibold text-white">Opt-In for Web Push</p>
                <p className="text-[11px] text-slate-400">See high-converting 2-step soft prompt in action</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <span className="text-lg">📦</span>
                <p className="mt-1.5 text-xs font-semibold text-white">Try 1-Click COD</p>
                <p className="text-[11px] text-slate-400">Place an instant cash-on-delivery demo order</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <span className="text-lg">📊</span>
                <p className="mt-1.5 text-xs font-semibold text-white">Watch Identity Merge</p>
                <p className="text-[11px] text-slate-400">Your phone number becomes a customer profile</p>
              </div>
            </div>

            <div className="pt-4 flex flex-wrap items-center gap-4">
              <a
                href="https://demostore.shopireachboost.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-4 text-base font-bold text-gray-950 shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-400 hover:shadow-emerald-500/35 transition-all transform hover:-translate-y-0.5"
              >
                <span>Launch demostore.shopireachboost.com</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <span className="text-xs text-slate-400 font-mono">No credit card or registration required</span>
            </div>
          </div>

          {/* Right Visual Card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-md shadow-2xl relative">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-400/80" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-400/80" />
                </div>
                <span className="text-[11px] font-mono text-slate-300">demostore.shopireachboost.com</span>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-xl bg-slate-950/60 p-4 border border-white/10">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold text-white">🛍️ Saree &amp; Fashion Demo Store</span>
                    <span className="text-emerald-400 font-bold">Active Storefront</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Preloaded with popular Indian D2C products (Silk Sarees, Kurtas, Jewelry) and active ShopiReachBoost tracking scripts.
                  </p>
                </div>

                <div className="rounded-xl bg-emerald-500/10 p-4 border border-emerald-500/20 text-xs space-y-1.5">
                  <div className="text-emerald-300 font-semibold flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>Live Tracking Simulation Active</span>
                  </div>
                  <div className="text-slate-300 font-mono text-[11px]">• Page view logged: Banarasi Silk Saree</div>
                  <div className="text-slate-300 font-mono text-[11px]">• Scroll depth: 85% reached</div>
                  <div className="text-slate-300 font-mono text-[11px]">• Intent detected: Price hesitation (52s)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
