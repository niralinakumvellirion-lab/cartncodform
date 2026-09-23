'use client';

export default function ProblemSolutionSection() {
  const comparisons = [
    {
      problemTitle: 'Blind Timed Popups',
      problemDesc: 'Showing push prompts 5 seconds after landing causes 95% of visitors to click "Block", permanently losing the communication channel.',
      solutionTitle: 'Intent-Triggered Soft Prompts',
      solutionDesc: 'Triggers on real interest: 2nd product view, 45s dwell time, or add-to-cart. Soft prompt explains value first, achieving 3x higher opt-in rates.',
      icon: '🎯',
    },
    {
      problemTitle: 'Orphaned COD Phone Numbers',
      problemDesc: 'Stores collect thousands of phone numbers through COD orders that sit unused in spreadsheets, never connecting to web browsing sessions.',
      solutionTitle: 'COD Identity Resolution',
      solutionDesc: 'Uses verified COD mobile numbers as an identity anchor to link anonymous browsing history, push tokens, and carts into one unified customer profile.',
      icon: '🔗',
    },
    {
      problemTitle: 'Aggressive WhatsApp Spam & Fatigue',
      problemDesc: 'Blasting daily promotions on WhatsApp annoys buyers, leads to phone number bans, and costs ₹1–2 per message with zero buyer context.',
      solutionTitle: 'Autonomous Brain & Quiet Hours',
      solutionDesc: 'Evaluates every visitor daily, but only sends when high-intent signals match. Strict frequency caps (max 3/week) and quiet hours protect your brand.',
      icon: '🧠',
    },
    {
      problemTitle: 'Friction-Heavy Multi-Step Checkout',
      problemDesc: 'Forcing Indian shoppers through 4 pages of checkout fields for Cash on Delivery results in high drop-off and unverified addresses.',
      solutionTitle: 'Frictionless 1-Click COD Form',
      solutionDesc: 'Embeds directly on product pages. Captures address, validates pin code, and offers instant incentives to convert COD orders into prepaid.',
      icon: '📦',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 lg:py-28 bg-white border-y border-gray-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-brand">The Modern Retention Paradigm</h2>
          <p className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            Why Generic Cart Apps &amp; WhatsApp Blasts Fall Short
          </p>
          <p className="mt-4 text-base text-gray-600">
            Most Shopify stores treat retention as scheduled timers and daily spam. ShopiReachBoost AI transforms your store into an intelligent, visitor-aware retention engine.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
          {comparisons.map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
            >
              <div className="flex items-center gap-3 mb-6">
                <span className="text-2xl">{item.icon}</span>
                <h3 className="text-lg font-bold text-gray-900">{item.solutionTitle}</h3>
              </div>

              <div className="space-y-4">
                {/* Problem Box */}
                <div className="rounded-xl bg-red-50/60 p-4 border border-red-100">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-700 uppercase tracking-wider">
                    <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>The Old Way: {item.problemTitle}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-red-900/80 leading-relaxed">
                    {item.problemDesc}
                  </p>
                </div>

                {/* Solution Box */}
                <div className="rounded-xl bg-emerald-50/70 p-4 border border-emerald-100">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>The ShopiReachBoost Way</span>
                  </div>
                  <p className="mt-1.5 text-xs text-emerald-950 leading-relaxed font-medium">
                    {item.solutionDesc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
