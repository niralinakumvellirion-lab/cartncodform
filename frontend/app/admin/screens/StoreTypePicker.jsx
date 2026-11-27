'use client';

import { useMemo, useRef, useState } from 'react';

/**
 * "What does your store sell?" — the search at the top of the Find my size page.
 * The catalog (types + search words) comes from the backend (GET /api/size-finder/:shop/config → storeTypes).
 * Display + picking only; the chosen type is saved with the other settings.
 */

/** Matches for what the seller typed: each type once, best first, with the word that matched. */
export function searchStoreTypes(catalog, query) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q || !Array.isArray(catalog)) return [];
  const out = [];
  catalog.forEach((t) => {
    let best = null;
    [t.name.toLowerCase(), ...t.words].forEach((w) => {
      // 0 exact · 1 word starts with it · 2 word contains it · 3 the text contains the word ("silver rings for women")
      const rank = w === q ? 0 : w.startsWith(q) ? 1 : w.includes(q) ? 2 : (w.length > 2 && q.includes(w)) ? 3 : 9;
      if (rank < 9 && (!best || rank < best.rank)) best = { rank, word: w };
    });
    if (best) out.push({ type: t, word: best.word, rank: best.rank });
  });
  return out.sort((a, b) => a.rank - b.rank);
}

const PATHS = {
  clothing: <path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z" />,
  shoes: <><path d="M3 16.5V8.5c0-.8.7-1.5 1.5-1.5H7l2 3.5c.9 1.6 2.6 2.5 4.4 2.5H15l4 1.2c1.2.4 2 1.4 2 2.6v.7H3z" /><path d="M3 19h18" /></>,
  rings: <><circle cx="12" cy="14.5" r="6" /><path d="M9.5 8.8 8 5.5h8l-1.5 3.3" /><path d="M10 5.5 12 3l2 2.5" /></>,
  bangles: <><ellipse cx="12" cy="12" rx="8.5" ry="4.5" /><ellipse cx="12" cy="12" rx="5.5" ry="2.6" /></>,
  none: <><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M4 11h16M9 4h6l1 3H8z" /></>,
};
const TINTS = {
  clothing: ['#EEF2FF', '#4338CA'],
  shoes: ['#ECFDF5', '#047857'],
  rings: ['#FFF7ED', '#C2410C'],
  bangles: ['#FDF2F8', '#BE185D'],
  none: ['#F1F5F9', '#475569'],
};
export function TypeIcon({ id, size = 40 }) {
  const [bg, fg] = TINTS[id] || TINTS.none;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: size * 0.3, background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{PATHS[id] || PATHS.none}</svg>
    </span>
  );
}

const TRY = ['Kurta', 'Sneakers', 'Rings', 'Bangles', 'Mobile phones'];

export default function StoreTypePicker({ catalog, current, onPick, onCancel }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const matches = useMemo(() => searchStoreTypes(catalog, query), [catalog, query]);
  const typed = query.trim().length > 0;

  function choose(id) { onPick(id, query.trim()); }
  function onKey(e) {
    if (!matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(matches.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); choose(matches[Math.min(active, matches.length - 1)].type.id); }
  }

  return (
    <section className="stp" aria-label="What does your store sell?">
      <style>{CSS}</style>
      <div className="stp-hero">
        <span className="stp-badge">Step 1 · Set up for your store</span>
        <h2 className="stp-h">What does your store sell?</h2>
        <p className="stp-sub">Type a product or category. We&apos;ll set up Find my size with the right questions and size chart for it.</p>
        <div className="stp-searchwrap">
          <span className="stp-sicon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            className="stp-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKey}
            placeholder="e.g. kurtis, sneakers, silver rings, mobile covers"
            aria-label="Search what your store sells"
            role="combobox"
            aria-expanded={typed}
            aria-controls="stp-results"
            autoComplete="off"
            autoFocus
          />
          {typed && (
            <button type="button" className="stp-clear" aria-label="Clear search" onClick={() => { setQuery(''); if (inputRef.current) inputRef.current.focus(); }}>×</button>
          )}
        </div>

        {typed && (
          <div className="stp-results" id="stp-results" role="listbox" aria-label="Matches">
            {matches.length ? matches.map((m, i) => (
              <button
                key={m.type.id}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`stp-result${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(m.type.id)}
              >
                <TypeIcon id={m.type.id} size={38} />
                <span className="stp-rcopy"><b>{m.type.name}</b><small>{m.type.blurb}</small></span>
                <span className="stp-match">matches “{m.word}”</span>
              </button>
            )) : (
              <p className="stp-none">No match for “{query.trim()}”. Pick the closest one below.</p>
            )}
          </div>
        )}

        {!typed && (
          <p className="stp-try">
            Try:
            {TRY.map((w) => (
              <button key={w} type="button" className="stp-chip" onClick={() => { setQuery(w); setActive(0); }}>{w}</button>
            ))}
          </p>
        )}
      </div>

      <div className="stp-all">
        <p className="stp-alltitle">Or choose one</p>
        <div className="stp-grid">
          {(catalog || []).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`stp-card${current === t.id ? ' is-current' : ''}`}
              aria-pressed={current === t.id}
              onClick={() => choose(t.id)}
            >
              <TypeIcon id={t.id} size={36} />
              <span className="stp-rcopy"><b>{t.name}</b><small>{t.blurb}</small></span>
              {current === t.id && <span className="stp-cur">Current</span>}
            </button>
          ))}
        </div>
        {onCancel && <button type="button" className="stp-cancel" onClick={onCancel}>Cancel</button>}
      </div>
    </section>
  );
}

/** The chosen type at the top of the page, with Change. */
export function StoreTypeCard({ type, onChange }) {
  if (!type) return null;
  return (
    <section className="stp-chosen" aria-label="Your store type">
      <style>{CSS}</style>
      <TypeIcon id={type.id} size={36} />
      <span className="stp-rcopy">
        <small className="stp-k">Your store sells</small>
        <b>{type.name}</b>
        <small>{type.blurb}</small>
      </span>
      <button type="button" className="stp-change" onClick={onChange}>Change</button>
    </section>
  );
}

/** For stores whose products have no sizes: say so, and point at features that help them. */
export function NotNeededCard({ shop, query }) {
  const q = encodeURIComponent(shop || '');
  const links = [
    ['back-in-stock', 'Back in stock', 'Let shoppers ask to be told when a sold-out product returns.'],
    ['price-drop', 'Price drop', 'Tell interested shoppers when a price goes down.'],
    ['reviews', 'Reviews', 'Show product reviews and ask buyers for one.'],
  ];
  return (
    <section className="stp-nn" aria-label="Find my size isn't needed">
      <style>{CSS}</style>
      <TypeIcon id="none" size={52} />
      <h2 className="stp-h" style={{ fontSize: 18 }}>Find my size isn&apos;t needed for {query ? `“${query}”` : 'your products'}</h2>
      <p className="stp-sub">Products like electronics, beauty and home decor don&apos;t come in sizes, so shoppers won&apos;t see a size button. These features fit your store better:</p>
      <div className="stp-links">
        {links.map(([path, title, text]) => (
          <a key={path} className="stp-link" href={`/admin/${path}?shop=${q}`}>
            <b>{title}</b><small>{text}</small><span aria-hidden="true">→</span>
          </a>
        ))}
      </div>
    </section>
  );
}

const CSS = `
.stp,.stp-chosen,.stp-nn{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#303030}
.stp *,.stp-chosen *,.stp-nn *{box-sizing:border-box}
.stp{background:#fff;border:1px solid #E3E3E3;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.stp-hero{padding:28px 28px 22px;background:radial-gradient(120% 140% at 0% 0%,#EEF2FF 0,#fff 55%),#fff;border-bottom:1px solid #F0F0F0;position:relative}
.stp-badge{display:inline-flex;align-items:center;height:20px;font-size:12px;font-weight:550;color:#303030;background:#E3E3E3;border-radius:8px;padding:0 8px}
.stp-h{font-size:18px;line-height:26px;font-weight:650;margin:10px 0 2px;color:#303030;letter-spacing:-.01em}
.stp-sub{font-size:13.5px;color:#616161;margin:0 0 16px;max-width:560px;line-height:1.5}
.stp-searchwrap{position:relative;max-width:620px}
.stp-sicon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#6B7280;display:flex}
.stp-input{width:100%;height:48px;border:1.5px solid #D4D4D4;border-radius:12px;padding:0 44px;font-size:15px;color:#111;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:border-color .15s,box-shadow .15s}
.stp-input:focus{outline:none;border-color:#4F46E5;box-shadow:0 0 0 4px rgba(79,70,229,.14)}
.stp-input::-webkit-search-cancel-button{display:none}
.stp-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;border:0;background:#F1F1F1;color:#4B5563;font-size:17px;line-height:1;cursor:pointer}
.stp-results{max-width:620px;margin-top:8px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;box-shadow:0 12px 30px rgba(17,24,39,.10);padding:6px}
.stp-result{display:flex;align-items:center;gap:12px;width:100%;padding:10px;border:0;border-radius:9px;background:transparent;text-align:left;cursor:pointer;color:#111}
.stp-result.is-active{background:#F5F5FF}
.stp-rcopy{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.stp-rcopy b{font-size:13px;line-height:20px;font-weight:550;color:#303030}
.stp-rcopy small{font-size:13px;line-height:20px;color:#616161;font-weight:450}
.stp-match{font-size:11.5px;color:#4338CA;background:#EEF2FF;border-radius:999px;padding:3px 9px;white-space:nowrap}
.stp-none{font-size:13px;color:#6B7280;margin:0;padding:12px}
.stp-try{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;color:#6B7280;margin:12px 0 0}
.stp-chip{border:1px solid #E5E7EB;background:#fff;border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:500;color:#303030;cursor:pointer}
.stp-chip:hover{border-color:#9CA3AF}
.stp-all{padding:18px 28px 24px}
.stp-alltitle{font-size:13px;font-weight:650;color:#303030;margin:0 0 10px}
.stp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.stp-card{position:relative;display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #E5E7EB;border-radius:12px;background:#fff;text-align:left;cursor:pointer;transition:border-color .15s,box-shadow .15s}
.stp-card:hover{border-color:#A5B4FC;box-shadow:0 2px 8px rgba(79,70,229,.08)}
.stp-card.is-current{border-color:#4F46E5;box-shadow:0 0 0 1px #4F46E5}
.stp-cur{position:absolute;top:8px;right:8px;font-size:10.5px;font-weight:600;color:#4338CA;background:#EEF2FF;border-radius:999px;padding:2px 7px}
.stp-cancel{margin-top:14px;background:#fff;border:1px solid #D4D4D4;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:500;cursor:pointer}
.stp-chosen{display:flex;align-items:center;gap:12px;background:#fff;border-radius:12px;padding:12px 16px;box-shadow:0 1px 0 0 rgba(26,26,26,.07),inset 0 -1px 0 0 rgba(0,0,0,.08),inset 1px 0 0 0 rgba(0,0,0,.04),inset -1px 0 0 0 rgba(0,0,0,.04)}
.stp-chosen .stp-rcopy{gap:0}
.stp-chosen .stp-rcopy b{font-size:13px;font-weight:650;line-height:20px;color:#303030}
.stp-chosen .stp-rcopy small{font-size:13px;line-height:20px;color:#616161;font-weight:450}
.stp-k{font-size:12px!important;font-weight:450!important;color:#616161!important;text-transform:none;letter-spacing:0}
.stp-change{margin-left:auto;height:32px;background:#fff;border:0;border-radius:8px;padding:0 12px;font-size:13px;font-weight:550;color:#303030;cursor:pointer;font-family:inherit;box-shadow:0 1px 0 #E3E3E3,inset 0 -1px 0 #B5B5B5,0 0 0 1px #E3E3E3}
.stp-change:hover{background:#F7F7F7}
.stp-nn{background:#fff;border:1px solid #E3E3E3;border-radius:16px;padding:32px 28px;text-align:center;display:flex;flex-direction:column;align-items:center}
.stp-nn .stp-sub{margin:0 auto 18px}
.stp-links{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;width:100%;max-width:720px;text-align:left}
.stp-link{position:relative;display:flex;flex-direction:column;gap:3px;padding:14px 34px 14px 14px;border:1px solid #E5E7EB;border-radius:12px;text-decoration:none;color:#111;background:#FAFAFA;transition:border-color .15s,background .15s}
.stp-link:hover{border-color:#A5B4FC;background:#fff}
.stp-link b{font-size:14px;font-weight:600}
.stp-link small{font-size:12.5px;color:#6B7280;line-height:1.4}
.stp-link span{position:absolute;right:14px;top:14px;color:#4338CA;font-weight:600}
@media (max-width:640px){.stp-hero,.stp-all{padding-left:18px;padding-right:18px}.stp-match{display:none}}
`;
