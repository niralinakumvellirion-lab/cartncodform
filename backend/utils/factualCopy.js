'use strict';

/**
 * App Review 1.1.4 "Use only factual information": automatic messages must not claim things the app does
 * not know from store data. findUnbackedClaim() spots the usual invented claims in a piece of copy:
 *  - stock / scarcity:  "only 6 left", "selling fast", "before it sells out", "almost gone", "limited stock"
 *  - deadlines:         "ends tonight", "last chance", "24 hours only"
 *  - new products:      "new arrivals", "just dropped", "new collection", "we've added new products"
 *  - holding items:     "we saved it for you", "reserved for you", "your cart is saved"
 *  - social proof:      "12 people are viewing", "others bought"
 * A signal that IS about the fact may say it: back_in_stock may say "back in stock".
 * -> the matched phrase, or null when the copy is clean.
 */
const CLAIMS = [
  /\bonly\s+\d+\s+(?:left|remaining|in stock)\b/i,
  /\b(?:selling|going)\s+fast\b/i,
  /\b(?:sells?|sold)\s+out\b/i,
  /\bbefore\s+(?:it'?s|they'?re|they\s+are|it\s+is|stock)\s+(?:gone|runs?\s+out)\b/i,
  /\b(?:stock\s+runs?\s+out|running\s+out|almost\s+gone|few\s+left|last\s+few)\b/i,
  /\blimited\s+(?:stock|pieces|quantities|quantity|time|edition)\b/i,
  /\b(?:ends?|ending)\s+(?:tonight|today|soon|at\s+midnight)\b/i,
  /\blast\s+chance\b/i,
  /\b\d+\s+hours?\s+only\b/i,
  /\bnew\s+(?:arrivals?|collection|styles?|products?|stock|silks?)\b/i,
  /\bjust\s+(?:arrived|landed|in)\b/i,
  // "new collection just dropped" (a price that dropped is a fact the price_drop signal knows)
  /\b(?:collection|styles?|arrivals?|products?|range|line)\s+(?:has\s+|have\s+)?(?:just\s+)?dropped\b/i,
  /\bwe(?:'ve|\s+have)\s+added\b/i,
  /\bwe(?:'ve|\s+have)?\s+(?:saved|reserved|held|kept)\s+(?:it|them|this|your)\b/i,
  /\breserved\s+for\s+you\b/i,
  /\byour\s+(?:cart|order)\s+is\s+saved\b/i,
  /\b\d+\s+(?:people|others|shoppers|customers)\s+(?:are\s+)?(?:viewing|looking|bought|have\s+bought)\b/i,
];

const ALLOWED_BY_SIGNAL = {
  back_in_stock: [/\bback\s+in\s+stock\b/i],
};

function findUnbackedClaim(text, { signalType } = {}) {
  const s = String(text || '');
  if (!s) return null;
  for (const re of CLAIMS) {
    const m = s.match(re);
    if (!m) continue;
    const allowed = ALLOWED_BY_SIGNAL[signalType] || [];
    if (allowed.some((a) => a.test(m[0]))) continue;
    return m[0];
  }
  return null;
}

/** True when every given text (title, body, subject...) is free of invented claims. */
function isFactual(texts, opts) {
  return texts.every((t) => findUnbackedClaim(t, opts) === null);
}

module.exports = { findUnbackedClaim, isFactual, CLAIMS };
