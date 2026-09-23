'use client';

import { useState } from 'react';

export default function HeroSection({ onOpenInstall }) {
  const [hoveredCard, setHoveredCard] = useState(null);

  return (
    <section className="relative overflow-hidden min-h-[calc(100vh-4rem)] flex items-center py-4 lg:py-6 bg-gradient-to-b from-emerald-50/60 via-indigo-50/20 to-white">
      {/* Ambient background glow */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[450px] bg-gradient-to-br from-emerald-200/30 via-indigo-200/20 to-purple-200/20 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        {/* 2-Column Hero Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-center">
          
          {/* ================= LEFT COLUMN ================= */}
          <div className="lg:col-span-5 space-y-4 text-left z-10">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/80 bg-white/90 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm backdrop-blur-sm">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Built for Indian D2C &amp; Shopify Brands</span>
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-[40px] xl:text-[46px] font-black tracking-tight text-gray-900 leading-[1.14]">
              Turn Every Order into a{' '}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-brand bg-clip-text text-transparent">
                Lifetime Customer
              </span>
            </h1>

            {/* Sub-headline */}
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-md">
              One AI-powered retention engine for Indian D2C stores. From high-converting web push and 1-click COD forms to relationship email and autonomous AI decisions, recover lost carts and drive lasting revenue.
            </p>

            {/* CTA Buttons */}
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                onClick={onOpenInstall}
                className="rounded-full bg-gray-950 px-7 py-3.5 text-sm sm:text-base font-bold text-white shadow-xl shadow-gray-950/20 hover:bg-gray-800 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                Sign up free
              </button>

              <a
                href="https://demostore.shopireachboost.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white/90 px-6 py-3.5 text-sm sm:text-base font-semibold text-gray-800 shadow-sm hover:bg-gray-50 hover:border-gray-400 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                <span>Watch live demo</span>
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            {/* Social Proof & Rating */}
            <div className="pt-3 border-t border-gray-200/70 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Loved by Shopify merchants everywhere
              </p>
              <div className="flex items-center gap-2.5 text-xs text-gray-600 flex-wrap">
                <div className="flex items-center gap-1 rounded bg-emerald-100/70 border border-emerald-200/80 px-1.5 py-0.5 font-bold text-emerald-900 text-[11px]">
                  <span>★</span>
                  <span>4.9 / 5</span>
                </div>
                <div className="flex text-amber-400 text-xs">
                  ★★★★★
                </div>
                <span className="text-[11px] text-gray-400">• 14-Day Free Trial • No Coding Required</span>
              </div>
            </div>
          </div>

          {/* ================= RIGHT COLUMN (BALANCED PROPORTIONS: ENLARGED DESKTOP + REFINED OFFSETS) ================= */}
          <div className="lg:col-span-7 relative w-full flex items-center justify-center">
            
            {/* Scaled Responsive Container - Perfectly balanced for all laptop & desktop screens */}
            <div className="relative w-full max-w-[740px] xl:max-w-[780px] h-[550px] xl:h-[570px] select-none scale-[0.76] sm:scale-[0.86] lg:scale-[0.92] xl:scale-100 origin-center transition-all duration-300">
              
              {/* 1. TOP PILL: RECOVERED SECTION (Positioned on the Left Side) */}
              <div className="absolute top-0 left-[110px] sm:left-[130px] rounded-full bg-white/95 px-3.5 py-1 text-[11px] font-bold text-gray-800 shadow-md border border-gray-200/90 flex items-center gap-2 animate-float-slow z-20">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span>₹48,250 Recovered This Month</span>
                <span className="text-emerald-600 font-bold">(+28%)</span>
              </div>

              {/* 2. CENTER BASE: PROMINENT BALANCED DESKTOP CANVAS */}
              <div 
                className={`absolute top-7 left-[55px] sm:left-[65px] w-[640px] xl:w-[680px] h-[425px] xl:h-[445px] rounded-2xl border border-gray-200/90 bg-white shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
                  hoveredCard ? 'opacity-90' : 'opacity-100'
                }`}
              >
                {/* Desktop Titlebar (macOS Style Window Controls + Store Breadcrumb) */}
                <div className="h-10 px-4 bg-gray-50/90 border-b border-gray-200/80 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 inline-block" />
                    <span className="ml-2.5 text-xs font-bold text-gray-700 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-emerald-600 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                      Shopify Admin • ShopiReachBoost AI
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-gray-600 bg-white border border-gray-200 px-2.5 py-0.5 rounded shadow-2xs">
                      October 2026
                    </span>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Sync
                    </span>
                  </div>
                </div>

                {/* Sub-Navigation Tabs Bar Across Full Desktop Width */}
                <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between text-xs flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded text-gray-500 font-medium hover:bg-gray-100 cursor-pointer">
                      📊 Overview
                    </span>
                    <span className="px-3 py-1 rounded-md bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/80 shadow-2xs">
                      📅 Queue Calendar
                    </span>
                    <span className="px-2.5 py-1 rounded text-gray-500 font-medium hover:bg-gray-100 cursor-pointer">
                      🔔 Push Rules
                    </span>
                    <span className="px-2.5 py-1 rounded text-gray-500 font-medium hover:bg-gray-100 cursor-pointer">
                      👥 Customers
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-bold text-gray-800">42 Scheduled Jobs</span>
                  </div>
                </div>

                {/* Main Content Workspace (Festival Calendar & Active Queue) */}
                <div className="flex-1 p-4 flex flex-col justify-between overflow-hidden">
                  {/* Festival Badges Header */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Campaign Queue &amp; Automation Calendar</h3>
                        <p className="text-xs text-gray-500">Auto-timed Indian festival triggers based on customer peak active hours</p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg">
                        <span>98.4% Delivery</span>
                      </div>
                    </div>

                    {/* Festival Pills Row */}
                    <div className="flex items-center gap-2 text-[10px] font-semibold mb-2.5">
                      <span className="rounded-lg bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 flex items-center gap-1.5">
                        🪷 Navratri Rush <span className="font-bold text-amber-700">(8 Jobs)</span>
                      </span>
                      <span className="rounded-lg bg-orange-50 text-orange-900 border border-orange-200 px-2.5 py-1 flex items-center gap-1.5">
                        🪔 Diwali Mega Sale <span className="font-bold text-orange-700">(14 Queued)</span>
                      </span>
                      <span className="rounded-lg bg-purple-50 text-purple-900 border border-purple-200 px-2.5 py-1 flex items-center gap-1.5">
                        🪙 Dhanteras Flash <span className="font-bold text-purple-700">(9 Jobs)</span>
                      </span>
                    </div>

                    {/* Generous 2-Row Calendar Grid (Mon 5 - Sun 18) */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-2.5">
                      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                      </div>
                      <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
                        {[
                          { d: 5, label: '3 Jobs' },
                          { d: 6, today: true, label: '⚡ 12 Active' },
                          { d: 7, fest: '🪷', label: '8 Queued' },
                          { d: 8, label: '5 Jobs' },
                          { d: 9, label: '4 Jobs' },
                          { d: 10, label: '6 Jobs' },
                          { d: 11, fest: '🪔', label: '14 Queued' },
                          { d: 12, label: '7 Jobs' },
                          { d: 13, label: '5 Jobs' },
                          { d: 14, fest: '🪙', label: '9 Jobs' },
                          { d: 15, label: '4 Jobs' },
                          { d: 16, label: '3 Jobs' },
                          { d: 17, label: '5 Jobs' },
                          { d: 18, label: '6 Jobs' },
                        ].map((day, idx) => (
                          <div
                            key={idx}
                            className={`rounded-lg py-1.5 px-1 flex flex-col items-center justify-between text-[11px] min-h-[44px] transition-all ${
                              day.today
                                ? 'bg-brand text-white shadow-sm font-bold'
                                : day.fest
                                ? 'bg-amber-50 border border-amber-200 text-amber-900 font-medium'
                                : 'bg-white border border-gray-100 text-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-0.5 font-bold">
                              <span>{day.d}</span>
                              {day.fest && <span className="text-[10px]">{day.fest}</span>}
                            </div>
                            <span className={`text-[8px] truncate px-1 rounded ${
                              day.today ? 'bg-white/20 text-white font-bold' : 'text-gray-500'
                            }`}>
                              {day.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quiet Hours & Auto-Send Ticker */}
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className="flex h-2 w-2 rounded-full bg-brand flex-shrink-0 animate-ping" />
                      <span className="text-gray-800 font-medium truncate">
                        Next Automated Push: 8:30 PM (Customer Peak Active Hour)
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-brand uppercase ml-2 flex-shrink-0 bg-white/90 px-2 py-0.5 rounded-md border border-indigo-200">
                      Quiet Hours: OK
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. TOP-RIGHT CARD: CUSTOMER DATA (Overlapping top-right of Desktop) */}
              <div 
                onMouseEnter={() => setHoveredCard('customer')}
                onMouseLeave={() => setHoveredCard(null)}
                className="absolute top-1 -right-3 sm:-right-4 w-[220px] rounded-2xl bg-white p-3.5 shadow-2xl border border-gray-200 animate-float-slow z-20 transition-all duration-300 hover:scale-105 cursor-pointer"
              >
                <div className="flex items-center justify-between text-[10px] text-gray-400 pb-1.5 border-b border-gray-100">
                  <span className="font-bold uppercase tracking-wider text-gray-700">Customer Data</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                    Very Loyal
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-brand to-purple-600 text-white font-bold flex items-center justify-center text-xs shadow-sm flex-shrink-0">
                    P
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-gray-900 truncate">Priya Sharma</h4>
                    <p className="text-[10px] text-emerald-600 font-bold">₹4,890 LTV • 3 Orders</p>
                  </div>
                </div>

                <div className="mt-2.5 space-y-1.5 text-[9px] text-gray-600 bg-gray-50 p-2 rounded-xl border border-gray-100 font-mono">
                  <div className="flex items-center justify-between">
                    <span>📱 COD Phone:</span>
                    <span className="font-bold text-gray-900">+91 98201... ✓</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>🔔 Web Push:</span>
                    <span className="text-emerald-700 font-bold">Active (FCM)</span>
                  </div>
                </div>
              </div>

              {/* 4. WHITE THEME MOBILE PHONE (Positioned Slightly Downward per user request) */}
              <div 
                onMouseEnter={() => setHoveredCard('mobile')}
                onMouseLeave={() => setHoveredCard(null)}
                className="absolute top-[170px] sm:top-[175px] left-[15px] sm:left-[25px] w-[165px] h-[325px] rounded-[32px] bg-white text-slate-800 p-2 shadow-2xl shadow-slate-400/25 border-[4.5px] border-slate-200/90 animate-float-delayed z-20 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
              >
                {/* Dynamic Island Notch & Speaker */}
                <div className="flex items-center justify-between px-1.5 pt-0.5 pb-1">
                  <span className="text-[8px] font-bold text-slate-800">9:41</span>
                  <div className="h-2.5 w-12 rounded-full bg-slate-200 border border-slate-300 mx-auto" />
                  <div className="flex items-center gap-0.5 text-[8px] text-slate-700">
                    <span className="text-[7px] font-semibold">5G</span>
                    <span className="h-1.5 w-2.5 rounded-2xs border border-slate-400 inline-block bg-emerald-500" />
                  </div>
                </div>

                {/* White Theme Mobile Screen Viewport */}
                <div className="rounded-[24px] bg-gradient-to-b from-slate-50 via-white to-slate-100/90 p-2.5 h-[277px] flex flex-col justify-between border border-slate-200/70 shadow-inner relative overflow-hidden">
                  {/* Lockscreen Clock */}
                  <div className="text-center pt-2">
                    <div className="text-2xl font-light text-slate-900 tracking-tight leading-none">9:41</div>
                    <div className="text-[9px] text-slate-500 mt-1">Tuesday, October 6</div>
                  </div>

                  {/* Clean Mobile Storefront / Cart Card in Phone Screen */}
                  <div className="my-auto bg-white/95 rounded-xl p-2 border border-slate-200/80 shadow-xs flex items-center gap-2 text-left">
                    <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-sm flex-shrink-0">
                      🛍️
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[8px] font-bold text-slate-800 truncate">Cart Saved</div>
                      <div className="text-[7px] text-emerald-700 font-semibold">1 item waiting</div>
                    </div>
                  </div>

                  {/* Bottom Lockscreen Shortcuts & Home Bar */}
                  <div>
                    <div className="flex items-center justify-between px-2 pb-1.5 text-slate-600">
                      <div className="h-5 w-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] shadow-2xs">
                        🔦
                      </div>
                      <div className="h-5 w-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] shadow-2xs">
                        📷
                      </div>
                    </div>
                    <div className="h-0.5 w-14 rounded-full bg-slate-300 mx-auto" />
                  </div>
                </div>
              </div>

              {/* 5. "NORMAL NOTIFICATION IN MOBILE" (Moved Downward with Mobile Section) */}
              <div 
                className="absolute top-[195px] sm:top-[200px] -left-8 sm:-left-6 w-[155px] rounded-xl bg-white/95 text-slate-900 p-2.5 shadow-2xl border border-gray-200/90 animate-float-slow z-30 transition-all duration-300 hover:scale-105 cursor-pointer"
              >
                <div className="flex items-center justify-between text-[7px] text-slate-400 mb-1">
                  <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded bg-brand text-white font-bold flex items-center justify-center text-[7px]">
                      S
                    </span>
                    <span className="font-bold text-slate-800">Your Store</span>
                  </div>
                  <span className="rounded bg-gray-100 text-gray-600 px-1 py-0.2 font-semibold text-[7px]">
                    Normal Notification
                  </span>
                </div>
                <p className="text-[9px] font-bold text-slate-900 leading-tight">
                  Cart Reminder: Items in cart! 🛍️
                </p>
                <p className="text-[8px] text-slate-500 mt-0.5 leading-snug">
                  Your selected saree is reserved for 2 hours.
                </p>
              </div>

              {/* 6. "IMAGE NOTIFICATION IN MOBILE" (Moved Downward with Mobile Section) */}
              <div 
                className="absolute top-[305px] sm:top-[310px] left-[110px] sm:left-[120px] w-[220px] rounded-xl bg-white text-slate-900 p-2.5 shadow-2xl border border-emerald-400/80 ring-2 ring-emerald-400/20 animate-float-delayed z-30 transition-all duration-300 hover:scale-105 cursor-pointer"
              >
                <div className="flex items-center justify-between text-[7px] text-slate-400 mb-1">
                  <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded bg-brand text-white font-bold flex items-center justify-center text-[7px]">
                      S
                    </span>
                    <span className="font-bold text-slate-800">Your Store</span>
                    <span className="rounded bg-emerald-100 text-emerald-800 px-1 py-0.2 font-bold text-[7px]">
                      Image Notification
                    </span>
                  </div>
                  <span className="text-emerald-600 font-bold">now</span>
                </div>

                {/* Product Thumbnail + Copy */}
                <div className="flex gap-2 items-center">
                  <div className="h-10 w-10 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-gray-100 shadow-inner relative">
                    <img
                      src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=200&q=80"
                      alt="Banarasi Silk Saree"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 right-0 bg-brand text-[7px] font-bold text-white px-0.5">
                      -10%
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold text-slate-900 truncate">
                      Banarasi Royal Silk Saree 🌸
                    </p>
                    <p className="text-[8px] text-emerald-700 font-bold">
                      ₹2,499 <span className="text-slate-400 line-through text-[7px] font-normal">₹2,799</span>
                    </p>
                    <p className="text-[7px] text-slate-500 truncate">
                      10% festive coupon pre-applied
                    </p>
                  </div>
                </div>

                {/* CTA Button */}
                <button className="w-full mt-1.5 rounded-lg bg-brand py-1 text-center text-[8px] font-bold text-white shadow-xs hover:bg-brand-dark transition">
                  Checkout Now →
                </button>
              </div>

              {/* 7. "DESKTOP NOTIFICATION" (Shifted toward the Right Side per user request) */}
              <div 
                onMouseEnter={() => setHoveredCard('desktop-notification')}
                onMouseLeave={() => setHoveredCard(null)}
                className="absolute top-[290px] sm:top-[295px] right-[-30px] sm:right-[-50px] xl:right-[-70px] w-[245px] rounded-2xl bg-white p-2.5 shadow-2xl border border-gray-200 animate-float-slow z-20 transition-all duration-300 hover:scale-105 cursor-pointer"
              >
                <div className="flex items-center justify-between text-[8px] text-gray-400 pb-1 mb-1.5 border-b border-gray-100">
                  <span className="font-bold text-gray-800">desktop notification</span>
                  <span>Chrome • now</span>
                </div>

                {/* Square Image Box on Left + Content on Right */}
                <div className="flex gap-2 items-center">
                  <div className="h-11 w-11 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200 shadow-inner relative">
                    <img
                      src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=200&q=80"
                      alt="Banarasi Silk Saree"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 right-0 bg-brand text-[7px] font-bold text-white px-0.5">
                      -₹300
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-[7px] font-extrabold text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded">
                      PRICE DROP ALERT 📉
                    </span>
                    <p className="text-[10px] font-bold text-gray-900 truncate mt-0.5">
                      Banarasi Silk Saree
                    </p>
                    <p className="text-[9px] text-gray-600">
                      Dropped to <span className="font-bold text-emerald-700">₹2,499</span>
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <button className="flex-1 rounded-lg bg-emerald-600 py-1 text-center text-[9px] font-bold text-white hover:bg-emerald-700 transition">
                    Claim Discount ↗
                  </button>
                  <button className="rounded-lg border border-gray-200 px-2 py-1 text-[9px] font-medium text-gray-500 hover:bg-gray-50 transition">
                    Dismiss
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
