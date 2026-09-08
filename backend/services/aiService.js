const crypto = require('crypto');
const CopyCache = require('../models/CopyCache');
const { buildCacheKey } = CopyCache;

/**
 * Layer 4 — AI. Narrow, cached use of the Anthropic API for:
 *   - generateCopy()             message title/body/subject (cached 24h)
 *   - generateWeeklyNarrative()  one paragraph for the merchant
 *   - generateInsights()         one sentence per deterministic insight
 *
 * Raw fetch — the `anthropic` SDK is NOT installed. If LLM_API_KEY is unset,
 * every function returns a graceful fallback and NEVER throws (the poller
 * depends on this).
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';

const SYSTEM_PROMPT =
  "You are a retention copywriter for an Indian D2C Shopify store. " +
  "Write in the store's voice. Be concise, warm, and direct. " +
  'Never mention competitor brands. Never make up discounts or ' +
  "promises the store hasn't offered. Output only valid JSON.";

const FALLBACK_PUSH = {
  title: 'You left something behind',
  body: 'Come back and complete your order.',
};
const FALLBACK_EMAIL = {
  subject: 'We saved your cart',
  body: 'Hi,\n\nYou left items in your cart. Come back anytime.\n\nThanks',
};

function hasKey() {
  return Boolean(process.env.LLM_API_KEY);
}

async function anthropic(userPrompt, { maxTokens = 500, system = null } = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.LLM_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${data && data.error && data.error.message}`);
  }
  const text = (data && data.content && data.content[0] && data.content[0].text) || '';
  const promptTokens = (data && data.usage && data.usage.input_tokens) || 0;
  return { text, promptTokens };
}

// Pull the first {...} block out of a possibly fenced / prose-wrapped reply.
function parseJsonBlock(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
}

// ---------------------------------------------------------------------------
// generateCopy
// ---------------------------------------------------------------------------
async function generateCopy(store, signalType, product, channel) {
  const fallback = channel === 'email' ? FALLBACK_EMAIL : FALLBACK_PUSH;
  const shopDomain = (store && store.shopDomain) || '';
  const voice = (store && store.voice) || {};
  const productId = product && product.productId ? String(product.productId) : null;

  const voiceHash = crypto.createHash('md5').update(JSON.stringify(voice)).digest('hex');
  const cacheKey = buildCacheKey(shopDomain, signalType, productId, channel, voiceHash);

  // 1. cache
  try {
    const hit = await CopyCache.findOne({ cacheKey });
    if (hit) {
      console.log(`[ai] cache hit for ${cacheKey.slice(0, 8)}`);
      return { title: hit.title || '', body: hit.body || '', subject: hit.subject || '' };
    }
  } catch (err) {
    console.warn('[ai] cache lookup failed:', err.message);
  }

  // 2. no key -> fallback (do not touch the API)
  if (!hasKey()) {
    return { title: fallback.title || '', body: fallback.body || '', subject: fallback.subject || '' };
  }

  // 3. build the prompt + call
  const priceStr = product && product.price ? String(product.price) : '';
  const productLabel = (product && product.title) || 'their cart';
  const userPrompt =
    `Store voice: ${JSON.stringify(voice)}\n` +
    `Signal: ${signalType}\n` +
    `Product: ${productLabel} — ₹${priceStr}\n` +
    `Channel: ${channel}\n\n` +
    (channel === 'push'
      ? `Write a web push notification:\n` +
        `- title: max 50 chars\n` +
        `- body: max 90 chars\n` +
        `- Use emoji if store.voice.emoji is true\n` +
        `- End with store.voice.signOff if set`
      : `Write a re-engagement email:\n` +
        `- subject: max 60 chars\n` +
        `- body: 2–3 short paragraphs, plain text, no HTML\n` +
        `- Warm opening, clear CTA ("Return to your cart" or similar)\n` +
        `- End with store.voice.signOff`) +
    `\n\nRespond ONLY with JSON: ` +
    (channel === 'push'
      ? '{"title":"...","body":"..."}'
      : '{"subject":"...","body":"..."}');

  let parsed;
  let promptTokens = 0;
  try {
    const out = await anthropic(userPrompt, { maxTokens: 500, system: SYSTEM_PROMPT });
    promptTokens = out.promptTokens;
    parsed = parseJsonBlock(out.text);
  } catch (err) {
    console.warn(`[ai] generateCopy failed (${signalType}/${channel}):`, err.message);
    return { title: fallback.title || '', body: fallback.body || '', subject: fallback.subject || '' };
  }

  const result = {
    title: parsed.title || fallback.title || '',
    body: parsed.body || fallback.body || '',
    subject: parsed.subject || fallback.subject || '',
  };

  // 4. cache it
  try {
    await CopyCache.create({
      shopDomain,
      cacheKey,
      signalType,
      channel,
      title: result.title,
      body: result.body,
      subject: result.subject,
      promptTokens,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  } catch (err) {
    if (!err || err.code !== 11000) console.warn('[ai] cache save failed:', err.message);
  }

  console.log(`[ai] generated copy for ${signalType}/${channel}, tokens=${promptTokens}`);
  return result;
}

// ---------------------------------------------------------------------------
// generateWeeklyNarrative
// ---------------------------------------------------------------------------
function ruleBasedNarrative(stats) {
  return (
    `This week: ${stats.messagesSent} messages sent to ${stats.profilesLookedAt} ` +
    `customers. ${stats.conversions} conversions, ₹${stats.revenueRecovered} recovered.`
  );
}

async function generateWeeklyNarrative(shopDomain, stats) {
  if (!hasKey()) return ruleBasedNarrative(stats);

  try {
    const prompt =
      'Write one paragraph (3–4 sentences) summarising this week\'s retention ' +
      'performance for an Indian D2C merchant. Be specific, honest, and ' +
      "encouraging. Use the merchant's perspective ('your store', 'your " +
      "customers'). No bullet points. Plain text only.\n\n" +
      JSON.stringify(stats);
    const out = await anthropic(prompt, { maxTokens: 400 });
    return (out.text || '').trim() || ruleBasedNarrative(stats);
  } catch (err) {
    console.warn('[ai] generateWeeklyNarrative failed:', err.message);
    return ruleBasedNarrative(stats);
  }
}

// ---------------------------------------------------------------------------
// generateInsights
// ---------------------------------------------------------------------------
async function generateInsights(shopDomain, rawInsights) {
  const list = Array.isArray(rawInsights) ? rawInsights : [];
  const fallback = list.map((i) => i.evidence);

  if (!hasKey() || list.length === 0) return fallback;

  try {
    const prompt =
      'Rewrite each of the following retention insights as ONE short, ' +
      'merchant-friendly sentence. Keep the same order and count. ' +
      'Respond ONLY with a JSON array of strings.\n\n' +
      JSON.stringify(list);
    const out = await anthropic(prompt, { maxTokens: 400 });
    const arr = JSON.parse((out.text.match(/\[[\s\S]*\]/) || [out.text])[0]);
    if (Array.isArray(arr) && arr.length === list.length) {
      return arr.map((s) => String(s));
    }
    return fallback;
  } catch (err) {
    console.warn('[ai] generateInsights failed:', err.message);
    return fallback;
  }
}

module.exports = { generateCopy, generateWeeklyNarrative, generateInsights };
