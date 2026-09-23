'use client';

import { useState } from 'react';

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);

  const faqs = [
    {
      q: 'How does ShopiReachBoost AI connect to my Shopify store?',
      a: 'Connecting takes under 60 seconds. Simply click "Connect Store", approve the Shopify OAuth screen, and toggle on our Theme App Embed in your Shopify theme customizer with one click. There is no manual Liquid or JavaScript code editing required.',
    },
    {
      q: 'Will the tracking script slow down my store or impact Core Web Vitals?',
      a: 'No. Our storefront script is lightweight, completely asynchronous, and executes passive event listeners. It runs independently of your primary rendering pipeline and has zero negative impact on your Lighthouse scores or Core Web Vitals.',
    },
    {
      q: 'Why focus on Web Push & Relationship Email rather than WhatsApp blasting?',
      a: 'WhatsApp blasts cost ₹1–2 per message, annoy shoppers, and often result in WhatsApp account suspensions. Web push reaches anonymous desktop and mobile visitors with zero per-message cost, while relationship emails capture high-intent buyers. It protects your brand reputation while dramatically lowering customer acquisition and re-engagement costs.',
    },
    {
      q: 'How does the COD phone number link to anonymous visitors?',
      a: 'When an anonymous shopper visits your store, we establish a secure first-party session. When that shopper places a Cash-on-Delivery order via our 1-click form or standard checkout, our identity engine joins the verified mobile phone number with the browsing history, carts, and push token into a single unified Customer Profile.',
    },
    {
      q: 'Can I customize the notification copy and brand voice?',
      a: 'Yes. In the Settings tab of your admin dashboard, you can define your brand voice (Luxury, Warm, Playful, or Direct), preferred language, emoji frequency, and custom sign-offs. Our AI writes copy tailored specifically to your voice and caches it per product to prevent hallucinations.',
    },
    {
      q: 'Is there a free trial?',
      a: 'Yes! Every store gets a 14-day full-featured free trial. You can install the app, test real behavioral triggers, experience the live recovery engine, and review the AI weekly narrative completely risk-free.',
    },
  ];

  return (
    <section id="faq" className="py-20 lg:py-28 bg-gray-50/60 border-b border-gray-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-xs font-bold uppercase tracking-widest text-brand">Answers &amp; Details</h2>
          <p className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            Frequently Asked Questions
          </p>
          <p className="mt-4 text-base text-gray-600">
            Everything you need to know about setting up ShopiReachBoost AI on your Shopify store.
          </p>
        </div>

        <div className="mt-12 space-y-3.5">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? -1 : idx)}
                  className="flex w-full items-center justify-between p-5 sm:p-6 text-left"
                >
                  <span className="text-base font-bold text-gray-900 pr-4">
                    {faq.q}
                  </span>
                  <span className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                    <svg
                      className={`h-4 w-4 transform transition-transform ${isOpen ? 'rotate-180 text-brand' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-6 pt-1 text-sm leading-relaxed text-gray-600 border-t border-gray-50 animate-fadeIn">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
