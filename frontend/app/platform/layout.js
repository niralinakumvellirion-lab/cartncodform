/**
 * Root layout for /platform/* pages.
 * - Loads Manrope and JetBrains Mono via Google Fonts (no next/font — the
 *   project does not use it elsewhere).
 * - No App Bridge, no Shopify scripts.
 */

export default function PlatformLayout({ children }) {
  return (
    <>
      {/* Google Fonts — Manrope (UI) + JetBrains Mono (code/mono spans) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line react/no-unknown-property */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .platform-root { font-family: 'Manrope', sans-serif; }
        .platform-mono  { font-family: 'JetBrains Mono', monospace; }
      `}</style>
      <div className="platform-root min-h-screen bg-[#12151C] text-white">
        {children}
      </div>
    </>
  );
}
