'use client';

import { useState, useEffect, useRef } from 'react';

const SCENARIOS = [
  {
    id: 'mobile',
    title: 'Mobile Push & Rich Media',
    badge: 'Storefront Opt-in & Push',
    icon: '📱',
    desc: 'Watch standard text alerts smoothly upgrade to rich visual cards with high-res product photos, dynamic prices, and 1-click checkout.',
  },
  {
    id: 'calendar',
    title: 'Shopify Admin Queue Calendar',
    badge: 'Merchant Dispatch Center',
    icon: '📅',
    desc: 'Visual monthly calendar with upcoming Indian festival triggers, scheduled intent reminders, and automated quiet-hour dispatching.',
  },
  {
    id: 'desktop',
    title: 'Desktop Web Push',
    badge: 'Multi-Device Reach',
    icon: '🖥️',
    desc: 'Native browser alerts trigger when shoppers switch tabs or show exit intent, bringing them back with price drops and cart incentives.',
  },
  {
    id: 'brain',
    title: '12 Intent Signals & AI Brain',
    badge: 'Autonomous Decision Engine',
    icon: '⚡',
    desc: 'Dwell time and scroll tracking detect price hesitation and browse drops, triggering messages only when purchase intent is high.',
  },
  {
    id: 'cod',
    title: '1-Click COD & Identity Join',
    badge: 'Customer Profile Resolution',
    icon: '📦',
    desc: 'Instant COD form captures verified mobile numbers, linking previously anonymous sessions into a persistent, high-value customer profile.',
  },
];

export default function AnimatedShowcase({ onOpenInstall }) {
  const [activeTab, setActiveTab] = useState('mobile');
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  // Mobile scenario specific sub-state: standard vs rich
  const [mobileRichMode, setMobileRichMode] = useState(false);

  // Desktop hover state
  const [desktopHovered, setDesktopHovered] = useState(false);

  // Calendar popover state
  const [activeCalendarItem, setActiveCalendarItem] = useState(null);

  // Intent telemetry state
  const [dwellCounter, setDwellCounter] = useState(15);
  const [intentFired, setIntentFired] = useState(false);

  // Auto-cycling timer
  useEffect(() => {
    if (isPaused) return;

    const interval = 70; // 70ms tick * 100 steps = 7000ms (7s per slide)
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          // Advance to next tab
          const currentIndex = SCENARIOS.findIndex((s) => s.id === activeTab);
          const nextIndex = (currentIndex + 1) % SCENARIOS.length;
          setActiveTab(SCENARIOS[nextIndex].id);
          return 0;
        }
        return prev + 1;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [activeTab, isPaused]);

  // Mobile scenario automated stage transition: standard -> rich -> repeat
  useEffect(() => {
    if (activeTab !== 'mobile') return;
    setMobileRichMode(false);
    const stageTimer = setTimeout(() => {
      setMobileRichMode(true);
    }, 2400);

    return () => clearTimeout(stageTimer);
  }, [activeTab]);

  // Dwell counter animation for Intent scenario
  useEffect(() => {
    if (activeTab !== 'brain') return;
    setDwellCounter(15);
    setIntentFired(false);

    const step1 = setTimeout(() => setDwellCounter(32), 1200);
    const step2 = setTimeout(() => {
      setDwellCounter(48);
      setIntentFired(true);
    }, 2600);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
    };
  }, [activeTab]);

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    setProgress(0);
  };

  return (
    <section id="interactive-demo" className="py-20 lg:py-32 bg-slate-950 text-white relative overflow-hidden">
      {/* Dynamic ambient lights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand/15 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold text-indigo-300">
            <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
            <span>Interactive Feature Theater</span>
          </div>

          <h2 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            See ShopiReachBoost AI in{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-emerald-400 bg-clip-text text-transparent">
              Live Motion
            </span>
          </h2>

          <p className="mt-4 text-base sm:text-lg text-slate-400">
            Explore how our multi-channel retention platform engages shoppers on mobile, desktop, and inside the Shopify merchant queue.
          </p>
        </div>

        {/* Scenario Navigation Tabs */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          {SCENARIOS.map((scenario) => {
            const isActive = activeTab === scenario.id;
            return (
              <button
                key={scenario.id}
                onClick={() => handleSelectTab(scenario.id)}
                className={`relative flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-semibold transition-all duration-200 border ${
                  isActive
                    ? 'border-brand bg-brand/20 text-white shadow-lg shadow-brand/20'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="text-base">{scenario.icon}</span>
                <span>{scenario.title}</span>

                {/* Progress bar line on active tab */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-brand to-emerald-400 rounded-full overflow-hidden"
                  >
                    <span
                      className="block h-full bg-white transition-all duration-75"
                      style={{ width: `${progress}%` }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Main Animation Stage */}
        <div
          className="mt-10 rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-6 sm:p-10 transition-all"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Active Scenario Explainer Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-white/10 gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                <span>Scenario:</span>
                <span className="bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  {SCENARIOS.find((s) => s.id === activeTab)?.badge}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mt-1">
                {SCENARIOS.find((s) => s.id === activeTab)?.title}
              </h3>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                {SCENARIOS.find((s) => s.id === activeTab)?.desc}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                {isPaused ? 'Auto-play paused' : 'Auto-advancing (7s)'}
              </span>
            </div>
          </div>

          {/* Interactive Screen Display Area */}
          <div className="mt-8 min-h-[460px] flex items-center justify-center">
            {/* 1. SCENARIO: MOBILE PHONE NOTIFICATION */}
            {activeTab === 'mobile' && (
              <div className="w-full max-w-md mx-auto animate-fadeIn">
                {/* Phone Mockup Frame */}
                <div className="relative mx-auto rounded-[44px] border-[10px] border-slate-800 bg-slate-950 p-4 shadow-2xl ring-1 ring-white/20">
                  {/* Dynamic Island / Speaker Notch */}
                  <div className="mx-auto h-6 w-32 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-between px-3 mb-4">
                    <span className="h-2 w-2 rounded-full bg-slate-800" />
                    <span className="h-2.5 w-2.5 rounded-full bg-brand/60" />
                  </div>

                  {/* Status Bar */}
                  <div className="flex items-center justify-between px-3 text-[11px] font-semibold text-slate-400 mb-6">
                    <span>9:41 AM</span>
                    <div className="flex items-center gap-1.5">
                      <span>5G</span>
                      <span className="h-2.5 w-4 rounded-sm border border-slate-400 inline-block p-0.5">
                        <span className="block h-full w-2.5 bg-emerald-400 rounded-2xs" />
                      </span>
                    </div>
                  </div>

                  {/* Lockscreen / Storefront Ambient Backdrop */}
                  <div className="rounded-3xl bg-gradient-to-b from-indigo-950/40 to-slate-900/80 p-4 border border-white/5 space-y-4 min-h-[340px] flex flex-col justify-start relative overflow-hidden">
                    {/* Mode Toggle inside the phone */}
                    <div className="flex items-center justify-between bg-black/40 rounded-xl p-1.5 border border-white/10 text-xs">
                      <button
                        onClick={() => setMobileRichMode(false)}
                        className={`flex-1 rounded-lg py-1.5 text-center font-medium transition ${
                          !mobileRichMode ? 'bg-brand text-white shadow-sm' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        1. Standard Alert
                      </button>
                      <button
                        onClick={() => setMobileRichMode(true)}
                        className={`flex-1 rounded-lg py-1.5 text-center font-medium transition ${
                          mobileRichMode ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        2. Rich Media (Product)
                      </button>
                    </div>

                    {/* Notification Alert Box */}
                    {!mobileRichMode ? (
                      /* STAGE 1: Standard Push Notification */
                      <div className="animate-fadeIn rounded-2xl bg-white/95 text-slate-900 p-4 shadow-xl border border-white/20 transform transition-all hover:scale-[1.02]">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand text-white font-bold text-[10px]">
                              SRB
                            </span>
                            <span className="font-bold text-slate-800">Your Store Name</span>
                          </div>
                          <span className="text-[10px] text-slate-400">now</span>
                        </div>
                        <p className="text-xs font-bold text-slate-900">
                          Items waiting in your cart! 🛍️
                        </p>
                        <p className="text-[11px] text-slate-600 mt-1">
                          You left the Pure Banarasi Silk Saree behind. Complete order before reserve expires.
                        </p>
                        <div className="mt-2 text-[10px] font-semibold text-brand flex items-center gap-1">
                          <span>Auto-transitioning to rich preview...</span>
                          <span className="animate-pulse">✨</span>
                        </div>
                      </div>
                    ) : (
                      /* STAGE 2: Expanded Rich Media Notification with Product Preview */
                      <div className="animate-fadeIn rounded-2xl bg-white text-slate-900 p-4 shadow-2xl border border-emerald-400/40 transform transition-all hover:scale-[1.02]">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand text-white font-bold text-[10px]">
                              SRB
                            </span>
                            <span className="font-bold text-slate-800">Your Store Name</span>
                            <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                              Rich Media
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">now</span>
                        </div>

                        {/* Rich Product Image Thumbnail + Copy */}
                        <div className="flex gap-3 items-center">
                          <div className="h-16 w-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-gray-200 shadow-inner relative group">
                            {/* Product preview image */}
                            <img
                              src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=300&q=80"
                              alt="Banarasi Silk Saree"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                            />
                            <span className="absolute bottom-0 right-0 bg-brand text-[9px] font-bold text-white px-1 rounded-tl">
                              -10%
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              Banarasi Royal Silk Saree 🌸
                            </p>
                            <p className="text-[11px] text-emerald-700 font-bold mt-0.5">
                              ₹2,499 <span className="text-slate-400 line-through text-[10px] font-normal">₹2,799</span>
                            </p>
                            <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                              Priya, your 10% festive coupon is pre-applied!
                            </p>
                          </div>
                        </div>

                        {/* Interactive CTAs */}
                        <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                          <button className="rounded-lg bg-brand py-1.5 text-center text-xs font-bold text-white shadow-sm hover:bg-brand-dark transition">
                            Checkout Now →
                          </button>
                          <button className="rounded-lg border border-gray-200 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-gray-50 transition">
                            Save Item
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Explainer Pill */}
                    <div className="mt-auto text-center">
                      <span className="text-[11px] text-slate-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                        {mobileRichMode ? '✨ 4x Higher CTR with Rich Product Thumbnails' : 'Standard Web Push notification'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. SCENARIO: SHOPIFY ADMIN QUEUE CALENDAR */}
            {activeTab === 'calendar' && (
              <div className="w-full max-w-4xl mx-auto animate-fadeIn">
                {/* Admin Screen Header */}
                <div className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-brand/20 text-brand flex items-center justify-center font-bold text-sm">
                        📅
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Campaign &amp; Intent Queue Calendar</h4>
                        <p className="text-xs text-slate-400">Synced with Indian Festival Radar + Real-Time Signal Engine</p>
                      </div>
                    </div>

                    {/* Stats Tiles */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1 font-semibold text-amber-300">
                        42 Pending
                      </span>
                      <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 font-semibold text-emerald-300">
                        18 Sent Today
                      </span>
                      <span className="rounded-lg bg-brand/20 border border-brand/30 px-3 py-1 font-semibold text-indigo-300">
                        98.4% Delivery
                      </span>
                    </div>
                  </div>

                  {/* Calendar Grid Representation (Replicating MonthCalendar style) */}
                  <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <div key={d} className="py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-white/5 rounded-md">
                        {d}
                      </div>
                    ))}

                    {/* Calendar cells with realistic Indian D2C festival & trigger data */}
                    {[
                      { day: 28, outside: true },
                      { day: 29, outside: true },
                      { day: 30, outside: true },
                      { day: 1, outside: false, jobs: 3 },
                      { day: 2, outside: false, festival: { name: 'Gandhi Jayanti', emoji: '🕊️' }, jobs: 2 },
                      { day: 3, outside: false, jobs: 5 },
                      { day: 4, outside: false, jobs: 4 },
                      { day: 5, outside: false, jobs: 6 },
                      { day: 6, outside: false, festival: { name: 'Navratri Start', emoji: '🪷' }, jobs: 12, highlight: true },
                      { day: 7, outside: false, jobs: 8 },
                      { day: 8, outside: false, jobs: 7 },
                      { day: 9, outside: false, jobs: 6 },
                      { day: 10, outside: false, jobs: 5 },
                      { day: 11, outside: false, jobs: 9 },
                    ].map((cell, idx) => {
                      const isToday = cell.day === 6 && !cell.outside;
                      return (
                        <div
                          key={idx}
                          onMouseEnter={() => {
                            if (cell.jobs) {
                              setActiveCalendarItem({
                                day: cell.day,
                                festival: cell.festival?.name,
                                jobs: cell.jobs,
                              });
                            }
                          }}
                          className={`min-h-[76px] rounded-xl p-2 text-left relative transition-all border ${
                            cell.outside
                              ? 'bg-slate-900/40 border-white/5 opacity-40'
                              : isToday
                              ? 'bg-indigo-950/70 border-brand ring-1 ring-brand shadow-lg'
                              : 'bg-slate-900/90 border-white/10 hover:border-white/30 hover:bg-slate-800/80 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isToday ? 'text-brand' : 'text-slate-300'}`}>
                              {cell.day}
                            </span>
                            {cell.festival && (
                              <span className="text-[10px] text-amber-300 bg-amber-500/20 px-1 rounded truncate max-w-[55px]">
                                {cell.festival.emoji}
                              </span>
                            )}
                          </div>

                          {cell.festival && (
                            <div className="mt-1 text-[9px] font-bold text-amber-300 truncate">
                              {cell.festival.name}
                            </div>
                          )}

                          {cell.jobs && (
                            <div className="mt-1.5 space-y-1">
                              <span className="block truncate rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300 border border-emerald-500/30">
                                ⚡ {cell.jobs} Triggers Queued
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Hover Inspector Card */}
                  <div className="mt-4 rounded-xl bg-slate-900 border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-slate-300">
                        {activeCalendarItem ? (
                          <>
                            <strong className="text-white">Day {activeCalendarItem.day}:</strong>{' '}
                            {activeCalendarItem.festival ? `${activeCalendarItem.festival} Special Campaign • ` : ''}
                            <span className="text-emerald-400 font-semibold">{activeCalendarItem.jobs} automated intent triggers</span> scheduled.
                          </>
                        ) : (
                          'Hover over any calendar cell to inspect scheduled jobs, festivals, and audience batches.'
                        )}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">Enforcing Quiet Hours: 10 PM – 8 AM</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. SCENARIO: DESKTOP WEB PUSH */}
            {activeTab === 'desktop' && (
              <div className="w-full max-w-3xl mx-auto animate-fadeIn">
                {/* Desktop Monitor Frame */}
                <div className="rounded-2xl border border-white/15 bg-slate-900 p-4 sm:p-6 shadow-2xl relative">
                  {/* Browser Bar */}
                  <div className="flex items-center justify-between pb-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-red-500/80 inline-block" />
                      <span className="h-3 w-3 rounded-full bg-yellow-500/80 inline-block" />
                      <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block" />
                    </div>
                    <div className="rounded-lg bg-black/40 border border-white/10 px-6 py-1 text-xs font-mono text-slate-300">
                      https://demostore.shopireachboost.com/products/kurtas
                    </div>
                    <span className="text-xs text-slate-500">Chrome / macOS</span>
                  </div>

                  {/* Browser Viewport Simulation */}
                  <div className="mt-4 rounded-xl bg-slate-950 p-6 relative min-h-[300px] overflow-hidden border border-white/5 flex flex-col justify-between">
                    {/* Simulated website background elements */}
                    <div className="space-y-3 opacity-25 pointer-events-none">
                      <div className="h-6 w-48 bg-white/20 rounded" />
                      <div className="grid grid-cols-3 gap-4">
                        <div className="h-28 bg-white/10 rounded-xl" />
                        <div className="h-28 bg-white/10 rounded-xl" />
                        <div className="h-28 bg-white/10 rounded-xl" />
                      </div>
                    </div>

                    {/* Pop-up Desktop Web Push Alert (Top Right) */}
                    <div
                      onMouseEnter={() => setDesktopHovered(true)}
                      onMouseLeave={() => setDesktopHovered(false)}
                      className={`absolute top-6 right-6 max-w-sm rounded-2xl bg-white text-slate-900 p-4 shadow-2xl border border-indigo-200 transition-all duration-300 transform ${
                        desktopHovered ? 'scale-105 shadow-brand/30 border-brand' : 'scale-100'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-sm shadow-md flex-shrink-0">
                          SRB
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-semibold text-slate-700">ShopiReachBoost Store</span>
                            <span>Google Chrome</span>
                          </div>
                          <h5 className="text-xs font-bold text-slate-900 mt-1">
                            Price Drop Alert: Pashmina Shawl 📉
                          </h5>
                          <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                            The item you viewed dropped from ₹1,800 to ₹1,499. Click to auto-claim this discount!
                          </p>

                          <div className="mt-3 flex items-center gap-2">
                            <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition">
                              Claim Discount ↗
                            </button>
                            <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-gray-100 transition">
                              Later
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Info bar at bottom of desktop */}
                    <div className="text-xs text-slate-400 flex items-center justify-between pt-4 border-t border-white/5">
                      <span>🔔 Reaches visitors even when they have left the tab or closed the browser</span>
                      <span className="text-emerald-400 font-semibold">Zero Per-Message Cost</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. SCENARIO: 12 INTENT SIGNALS & BRAIN */}
            {activeTab === 'brain' && (
              <div className="w-full max-w-4xl mx-auto animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  {/* Left: Live Visitor Telemetry */}
                  <div className="md:col-span-6 rounded-2xl border border-white/10 bg-slate-950 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">Live Visitor Telemetry</span>
                      <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                        Listening
                      </span>
                    </div>

                    {/* Dwell counter visual */}
                    <div className="rounded-xl bg-white/5 p-4 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>Price Component Dwell:</span>
                        <span className="font-mono text-base font-bold text-amber-400">{dwellCounter}s</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-brand to-emerald-400 h-full transition-all duration-700"
                          style={{ width: `${Math.min(100, (dwellCounter / 45) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">Trigger threshold: 45 seconds continuous dwell</span>
                    </div>

                    {/* Signal Box */}
                    <div className={`rounded-xl p-4 border transition-all ${
                      intentFired
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-white/5 border-white/10 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">⚡ Signal: price_hesitation</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          intentFired ? 'bg-emerald-400 text-slate-950' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {intentFired ? 'CONFIDENCE: 92%' : 'CALCULATING...'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-2">
                        {intentFired
                          ? 'Shopper is highly interested but hesitating at ₹2,499. Brain initiates targeted offer.'
                          : 'Shopper browsing Banarasi Silk Saree collection...'}
                      </p>
                    </div>
                  </div>

                  {/* Right: The Brain Evaluation Rules */}
                  <div className="md:col-span-6 rounded-2xl border border-white/10 bg-slate-900 p-6 space-y-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-300">The Brain Safety Checks</span>

                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold">✓</span>
                        <div>
                          <p className="font-semibold text-white">Quiet Hours Filter</p>
                          <p className="text-[11px] text-slate-400">Current time 8:30 PM (Allowed: 8:00 AM – 10:00 PM)</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold">✓</span>
                        <div>
                          <p className="font-semibold text-white">Fatigue Cap (Max 3 / Week)</p>
                          <p className="text-[11px] text-slate-400">Shopper has received 1 message this week. No spam guaranteed.</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold">✓</span>
                        <div>
                          <p className="font-semibold text-white">Optimal Channel &amp; Copy</p>
                          <p className="text-[11px] text-slate-400">Picked FCM Web Push. Pre-cached brand voice applied.</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-purple-500/10 p-3 text-xs text-purple-200 border border-purple-500/20">
                      <strong>Result:</strong> Job queued in ScheduledJobs table with send-time revalidation.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 5. SCENARIO: 1-CLICK COD & IDENTITY JOIN */}
            {activeTab === 'cod' && (
              <div className="w-full max-w-4xl mx-auto animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  {/* Left: Product Page COD Form */}
                  <div className="md:col-span-5 rounded-2xl border border-white/10 bg-slate-950 p-5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                      <span className="font-bold text-white">1-Click Cash on Delivery</span>
                      <span className="text-amber-400 font-semibold">Storefront Widget</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <label className="text-[11px] text-slate-400">Full Name</label>
                        <div className="rounded-lg bg-slate-900 border border-white/10 px-3 py-1.5 text-white font-medium">
                          Priya Sharma
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400">Mobile Number (Identity Anchor)</label>
                        <div className="rounded-lg bg-slate-900 border border-brand/50 px-3 py-1.5 text-emerald-400 font-mono font-bold flex items-center justify-between">
                          <span>+91 98201 44521</span>
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">Verified</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400">Pincode &amp; City</label>
                        <div className="rounded-lg bg-slate-900 border border-white/10 px-3 py-1.5 text-slate-300 font-medium">
                          400001, Mumbai (Valid Pincode ✓)
                        </div>
                      </div>

                      <button className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 mt-2 transition text-xs shadow-md">
                        Complete Cash on Delivery Order →
                      </button>
                    </div>
                  </div>

                  {/* Middle Arrow Connector */}
                  <div className="hidden md:flex md:col-span-2 flex-col items-center justify-center text-center">
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Join</span>
                    <span className="text-2xl text-brand animate-pulse">➡️</span>
                    <span className="text-[10px] text-slate-400 font-mono mt-1">Identity Engine</span>
                  </div>

                  {/* Right: Resolved Unified Customer Profile */}
                  <div className="md:col-span-5 rounded-2xl border border-white/10 bg-slate-900 p-5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                      <span className="font-bold text-white">Unified Customer Profile</span>
                      <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                        Merged
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between p-2 rounded-lg bg-white/5">
                        <span className="text-slate-400">Customer Stage:</span>
                        <span className="font-bold text-emerald-400">First-Time Buyer → Repeat</span>
                      </div>
                      <div className="flex justify-between p-2 rounded-lg bg-white/5">
                        <span className="text-slate-400">Identity Anchor:</span>
                        <span className="font-mono text-white font-bold">+91 98201 44521</span>
                      </div>
                      <div className="flex justify-between p-2 rounded-lg bg-white/5">
                        <span className="text-slate-400">Merged Channels:</span>
                        <span className="text-indigo-300 font-semibold">Push Token + COD Phone</span>
                      </div>
                      <div className="flex justify-between p-2 rounded-lg bg-white/5">
                        <span className="text-slate-400">Lifetime Value (LTV):</span>
                        <span className="font-bold text-white">₹2,499</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 pt-1">
                      Now Priya can be re-engaged with custom notifications whenever new sarees in her preferred price tier arrive.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Interactive CTA Bar */}
          <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400 text-center sm:text-left">
              Want to see this running live on your Shopify store? Setup takes under 60 seconds.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://demostore.shopireachboost.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition"
              >
                Test on demostore.shopireachboost.com ↗
              </a>
              <button
                onClick={onOpenInstall}
                className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand/30 hover:bg-brand-dark transition"
              >
                Connect Store Free
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
