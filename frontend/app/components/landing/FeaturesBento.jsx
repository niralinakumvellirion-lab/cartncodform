'use client';

export default function FeaturesBento() {
  return (
    <section id="features" className="py-20 lg:py-32 bg-gray-50/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-brand">Architected For Retention</h2>
          <p className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            Five Intelligent Layers Working in Harmony
          </p>
          <p className="mt-4 text-base text-gray-600">
            From anonymous browser clicks to high-LTV repeat buyers, ShopiReachBoost AI handles the entire lifecycle without requiring hours of manual campaign setup.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Card 1: Large Identity Profile (7 cols) */}
          <div className="md:col-span-7 rounded-3xl border border-gray-200 bg-white p-7 sm:p-9 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-brand text-lg font-bold">
                  👤
                </span>
                <span className="text-[11px] font-semibold text-brand bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Layer 1: Identity
                </span>
              </div>
              <h3 className="mt-6 text-xl sm:text-2xl font-bold text-gray-900">
                The Unified Customer Profile
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Connects fragmented touchpoints into a single human record. An anonymous session is unified with a push subscription, a cart token, and the mobile number verified during a COD order.
              </p>
            </div>

            {/* Profile simulation visual */}
            <div className="mt-6 rounded-2xl bg-gray-50 border border-gray-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-brand to-purple-500 text-white font-bold flex items-center justify-center text-xs">
                    P
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-900">Priya Sharma</span>
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Repeat Buyer</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-700">₹4,890 LTV</span>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
                <span className="rounded-md bg-white border border-gray-200 px-2 py-0.5 text-gray-600 font-mono">📱 +91 98201... (COD)</span>
                <span className="rounded-md bg-white border border-gray-200 px-2 py-0.5 text-gray-600 font-mono">🔔 FCM Push Active</span>
                <span className="rounded-md bg-white border border-gray-200 px-2 py-0.5 text-gray-600 font-mono">✉️ priya@...</span>
                <span className="rounded-md bg-white border border-gray-200 px-2 py-0.5 text-gray-600 font-mono">3 Visits • Banarasi Saree</span>
              </div>
            </div>
          </div>

          {/* Card 2: 12 Intent Signals (5 cols) */}
          <div className="md:col-span-5 rounded-3xl border border-gray-200 bg-white p-7 sm:p-9 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 text-lg font-bold">
                  ⚡
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Layer 2: Signals
                </span>
              </div>
              <h3 className="mt-6 text-xl sm:text-2xl font-bold text-gray-900">
                12 Behavioral Intent Signals
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Replaces dumb abandoned cart timers with deep behavioral signals tracked in real-time on your Shopify storefront.
              </p>
            </div>

            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 p-2.5 text-xs">
                <span className="font-semibold text-gray-800">⏱️ Price Hesitation</span>
                <span className="text-gray-500 font-mono">Dwell &gt; 45s on price</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 p-2.5 text-xs">
                <span className="font-semibold text-gray-800">👀 Browse Abandonment</span>
                <span className="text-gray-500 font-mono">High scroll &amp; exit intent</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 p-2.5 text-xs">
                <span className="font-semibold text-gray-800">🔄 COD to Prepaid</span>
                <span className="text-gray-500 font-mono">Pre-shipment incentive</span>
              </div>
            </div>
          </div>

          {/* Card 3: The Autonomous Brain (5 cols) */}
          <div className="md:col-span-5 rounded-3xl border border-gray-200 bg-white p-7 sm:p-9 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 text-lg font-bold">
                  🧠
                </span>
                <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Layer 3: The Brain
                </span>
              </div>
              <h3 className="mt-6 text-xl sm:text-2xl font-bold text-gray-900">
                Autonomous Decision Brain
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Considers every customer every single day, but messages only when there's genuine reason. Enforces quiet hours (10 PM – 8 AM) and strict fatigue limits.
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-purple-100 bg-purple-50/50 p-4 text-xs space-y-2">
              <div className="flex items-center justify-between text-purple-900 font-semibold">
                <span>Fatigue Cap:</span>
                <span className="font-mono">Max 3 / week per shopper</span>
              </div>
              <div className="flex items-center justify-between text-purple-900 font-semibold">
                <span>Channel Switch:</span>
                <span className="font-mono">Push (Anon) → Email (Captured)</span>
              </div>
              <div className="flex items-center justify-between text-purple-900 font-semibold">
                <span>Send Time:</span>
                <span className="font-mono">Shopper&apos;s peak active hour</span>
              </div>
            </div>
          </div>

          {/* Card 4: 1-Click COD Form (4 cols) */}
          <div className="md:col-span-4 rounded-3xl border border-gray-200 bg-white p-7 sm:p-9 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 text-lg font-bold">
                  📦
                </span>
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Layer 4: COD Form
                </span>
              </div>
              <h3 className="mt-6 text-xl sm:text-2xl font-bold text-gray-900">
                1-Click COD Checkout
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Frictionless Cash-on-Delivery form embedded straight into your Shopify product pages. Validates Indian pincodes and slashes RTO by capturing real phone numbers.
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-xs text-amber-900 space-y-1">
              <div className="font-bold">✓ Indian Pincode Auto-Complete</div>
              <div className="font-bold">✓ Phone Number Identity Link</div>
              <div className="font-bold">✓ Anti-RTO Order Confirmation</div>
            </div>
          </div>

          {/* Card 5: Brand Voice & AI Copy (3 cols) */}
          <div className="md:col-span-3 rounded-3xl border border-gray-200 bg-white p-7 sm:p-9 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600 text-lg font-bold">
                  ✍️
                </span>
                <span className="text-[11px] font-semibold text-pink-700 bg-pink-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Layer 5: AI Voice
                </span>
              </div>
              <h3 className="mt-6 text-xl font-bold text-gray-900">
                Brand Voice AI
              </h3>
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                Sets your tone (luxury, warm, playful), language, and emoji style in 2 minutes. Pre-cached per product to ensure zero hallucination and rapid delivery.
              </p>
            </div>

            <div className="mt-6 rounded-lg bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-600">
              <span className="font-semibold text-gray-800">Zero send-time LLM cost:</span> Messages resolve dynamically from cached embeddings.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
