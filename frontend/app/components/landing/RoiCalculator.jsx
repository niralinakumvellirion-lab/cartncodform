'use client';

import { useState } from 'react';

export default function RoiCalculator({ onOpenInstall }) {
  const [visitors, setVisitors] = useState(12000);
  const [aov, setAov] = useState(1800);

  // Calculation logic
  // ~5% add to cart rate
  const cartsCreated = Math.round(visitors * 0.05);
  // ~70% cart abandonment
  const abandonedCarts = Math.round(cartsCreated * 0.7);
  // Intent recoveries (price hesitation + cart drop-off via Push & Email) ~ 12% recovery
  const recoveredOrders = Math.max(1, Math.round(abandonedCarts * 0.12));
  // Additional recovered browse & hesitation orders
  const browseRecoveries = Math.max(1, Math.round(visitors * 0.0035));
  const totalRecoveredOrders = recoveredOrders + browseRecoveries;
  const monthlyRevenue = totalRecoveredOrders * aov;
  const annualRevenue = monthlyRevenue * 12;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <section id="calculator" className="py-20 lg:py-28 bg-white border-b border-gray-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-brand">Interactive Revenue Calculator</h2>
          <p className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            See How Much Revenue You&apos;re Leaving on the Table
          </p>
          <p className="mt-4 text-base text-gray-600">
            Adjust your store&apos;s monthly visitors and average order value (AOV) to calculate the estimated revenue ShopiReachBoost AI can recover each month.
          </p>
        </div>

        <div className="mt-14 max-w-4xl mx-auto rounded-3xl border border-gray-200 bg-gray-50/60 p-6 sm:p-10 shadow-lg">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Sliders Input */}
            <div className="lg:col-span-7 space-y-8">
              {/* Visitors Slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="visitors-slider" className="text-sm font-bold text-gray-800">
                    Monthly Store Visitors
                  </label>
                  <span className="font-mono text-base font-extrabold text-brand bg-indigo-50 px-3 py-1 rounded-lg">
                    {visitors.toLocaleString('en-IN')} visitors
                  </span>
                </div>
                <input
                  id="visitors-slider"
                  type="range"
                  min="2000"
                  max="100000"
                  step="1000"
                  value={visitors}
                  onChange={(e) => setVisitors(Number(e.target.value))}
                  className="w-full h-2.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>2,000/mo</span>
                  <span>50,000/mo</span>
                  <span>100,000+/mo</span>
                </div>
              </div>

              {/* AOV Slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="aov-slider" className="text-sm font-bold text-gray-800">
                    Average Order Value (AOV)
                  </label>
                  <span className="font-mono text-base font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg">
                    {formatCurrency(aov)}
                  </span>
                </div>
                <input
                  id="aov-slider"
                  type="range"
                  min="500"
                  max="10000"
                  step="100"
                  value={aov}
                  onChange={(e) => setAov(Number(e.target.value))}
                  className="w-full h-2.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>₹500</span>
                  <span>₹5,000</span>
                  <span>₹10,000+</span>
                </div>
              </div>

              {/* Breakdown details */}
              <div className="rounded-2xl bg-white p-4 border border-gray-200 space-y-2 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Estimated Abandoned Carts / Mo:</span>
                  <span className="font-semibold text-gray-900">{abandonedCarts.toLocaleString('en-IN')} carts</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Projected Recovered Orders:</span>
                  <span className="font-bold text-emerald-600">+{totalRecoveredOrders} orders / month</span>
                </div>
              </div>
            </div>

            {/* Results Card */}
            <div className="lg:col-span-5 rounded-2xl bg-gradient-to-br from-brand to-indigo-700 p-6 sm:p-7 text-white shadow-xl flex flex-col justify-between h-full">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-200">
                  Projected Extra Revenue
                </span>
                <div className="mt-3">
                  <div className="text-3xl sm:text-4xl font-black tracking-tight">
                    {formatCurrency(monthlyRevenue)}
                  </div>
                  <span className="text-xs text-indigo-100 font-medium">per month</span>
                </div>

                <div className="mt-5 pt-5 border-t border-indigo-500/50">
                  <div className="text-xs text-indigo-200 font-semibold">Annual Projected Growth</div>
                  <div className="text-xl font-bold mt-1 text-emerald-300">
                    {formatCurrency(annualRevenue)} / year
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4">
                <button
                  onClick={onOpenInstall}
                  className="w-full rounded-xl bg-white py-3.5 px-4 text-sm font-bold text-brand shadow-lg hover:bg-gray-50 transition transform hover:-translate-y-0.5 text-center"
                >
                  Start Recovering This Revenue →
                </button>
                <p className="mt-2 text-center text-[10px] text-indigo-200">
                  Based on conservative 12% recovery benchmark
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
