# CartnCodForm — Chat Handover v2

Date: 8 September 2026
Replaces CHAT_HANDOVER.md (2 Sep), which describes an older multi-store / Google-login version. That description is no longer accurate.

## How to use this file

Paste this whole file into a new Claude chat (or add it as Project knowledge together with `cartncodform-v2-product-plan.md` and `cartncodform-v2-prototype.jsx`). Then ask, one phase at a time:

> "Generate the Claude Code prompt for Phase A."

Claude chat should produce a Claude Code prompt following the contract in the last section. Paste that into Claude Code in the repo. When Claude Code finishes, paste its `audit.txt` back into the chat before asking for the next phase.

---

## What we're building

A retention engine for small Indian D2C Shopify stores. Web push for anonymous visitors, email for captured ones, a decision engine that looks at every visitor every day and messages them only when there's a reason, and AI that writes the message and explains results to the merchant in plain language. COD order form included, and the COD phone number is used as an identity anchor.

Embedded in Shopify admin. Single store per install. No WhatsApp or SMS in this version (deferred, not cancelled).

The product test: a merchant installs, sets a voice in two minutes, does nothing for a week, and opens the app to a truthful paragraph like — *"This week I looked at 1,240 customers, messaged 86, and 11 came back — ₹14,300 recovered. Silk sarees under ₹3,000 are your strongest re-engagement product."*

The prototype (`cartncodform-v2-prototype.jsx`) is the target UI. Build to it.

## Live environment

- Repo: https://github.com/niralinakumvellirion-lab/cartncodform
- Backend: Express + MongoDB Atlas on Render — https://cartncodform-backend.onrender.com
- Admin: Next.js 14 App Router on Vercel, embedded via App Bridge, Polaris components
- Push: Firebase FCM · Email: Resend
- Dev store: cartncod-form.myshopify.com · Design-partner store: the owner's live store
- Local path: D:\cartncodform\

## What exists today (commit 151cf6f) — do not rebuild these

- Embedded shell, session-token auth (`backend/middleware/requireOwner.js`), IDOR tests, 42 tests passing
- GDPR compliance webhooks, billing state sync, CSP, product-image cache
- Storefront App Embed block (`extensions/cartncodform-embed/blocks/push-notifications.liquid`) — 10 event types: `page_view, product_view, collection_view, search, add_to_cart, remove_from_cart, cart_update, cart_view, reached_checkout, page_exit` (with `dwellSeconds`, `scrollDepth`)
- Push: FCM subscribe/send, service worker, dedup
- Email: Resend adapter + test-send (`backend/utils/email.js`)
- Scheduler: `backend/utils/automationEngine.js` + poller in `server.js` (30s). Dedup, quiet hours (hard-coded 22–08), frequency cap (hard-coded 3/24h), cancel-on-order. **Only `cart_abandon` fires.**
- Revenue attribution: `PushClick` model, cart-attribute stamp, order-side join, stats bar
- COD form on App Proxy, `CodOrder` model, COD tab with confirm/cancel
- Admin (`frontend/app/admin/page.js`, 1,127 lines): three tabs — Abandoned Carts, COD Orders, Automations (manual step editor)
- Journey timeline per session, shown in a modal

## Why it isn't a product yet (the diagnosis driving every phase)

There is no customer entity. `AbandonedCustomer` is keyed by cart token, `CustomerPushSubscription` by FCM token, `StorefrontEvent` by session, `CodOrder` by nothing. No join. So the timeline is a log nobody can act on, the behavioral data is consumed by nothing, and AI has no subject to reason about.

Second-order: only one trigger works; message copy is frozen at schedule time (`payload` written when the cart is created, blind to what happens after); the push prompt is a `popup_delay` timer with generic copy; the COD phone links to nothing.

## Architecture — five layers

```
Storefront + Webhooks + COD form
   → 1. PROFILE    one record per human; identity resolution
   → 2. SIGNALS    deterministic facts with strength + evidence
   → 3. BRAIN      per profile per day: pick one signal, one channel, one time
   → 4. AI         copy (cached per product), weekly narrative, insights
   → 5. CHANNELS   push (anonymous) → email (captured)
   outcomes write back to profile → brain weights adjust per shop
```

Full spec with field lists, signal definitions and the ranking formula is in `cartncodform-v2-product-plan.md`. Claude chat should read that before writing any phase prompt.

### Key models (summary — full fields in the plan)

- **Profile** — `identifiers {customerId, emails[], phones[], sessionIds[], cartTokens[], pushTokens[]}`, `channels {push, email}`, `stage`, `interests {productId: score}` (daily decay), `activeHours[24]`, `orders {count, ltv, lastOrderAt, codCount, prepaidCount}`, `messages[]` (last 20), `suppressed`. Merge priority: customerId → email → phone → cartToken → ccfSessionId → pushToken.
- **Signal** — `profileId, type, strength 0–1, evidence[], productId?, expiresAt`. Recomputed on ingest and nightly.
- **SignalConfig** (replaces `AutomationRule`) — per shop per signal type: `enabled, channelOverride, maxSteps`.
- **ScheduledJob** — keep, but carry `profileId + signalType + productId`, **not** resolved copy. Copy resolved at send time.
- **Store** additions — `voice {tone, emoji, lang, signOff}`, `caps {perDay, perWeek}`, `quietHours`, `onboarding {steps[]}`, `timezone`.

### Signals to ship (12)

`cart_abandon` (exists) · `checkout_abandon` · `browse_abandon` · `high_intent` · `price_hesitation` · `price_drop` · `back_in_stock` · `post_purchase_d3` · `lapsing` · `winback` · `email_capture` · `cod_to_prepaid`

`price_drop` needs `products/update`; `back_in_stock` needs `inventory_levels/update` + `read_inventory` scope. Batch both into one scope change.

## Phases

Work strictly in order. One phase per Claude Code prompt. Branch per phase, PR per phase.

| Phase | Build | Done when |
|---|---|---|
| **A** | `Profile` model, identity resolution service, backfill script from existing tables, every ingest path (events, carts, checkouts, orders, COD, push subscribe) upserts a profile | Every event/cart/order/COD order lands on a profile. `AbandonedCustomer` reads become profile queries. Tests for merge priority. |
| **B** | `Signal` model + `signalEngine.js` computing the first six + `cod_to_prepaid` + `email_capture`; runs on ingest and nightly | Profile API returns active signals with evidence. Tests per signal condition. |
| **C** | `brain.js`: rank → fatigue → pick one → channel → send time → schedule. Send-time re-validation in the poller. Delete `AutomationRule.steps` editor and `trigger` enum; add `SignalConfig`. Move caps/quiet hours to `Store`. | Set a voice, walk away 24h, Messages log shows sends each with a stored reason. Tests for ranking and fatigue. |
| **D** | Storefront: replace timer with intent triggers (2nd product view / add to cart / 45s dwell / exit intent), two-step soft prompt, contextual copy; log prompt-shown vs accepted. Email field on COD form. | Opt-in rate is tracked and visible; measurably above baseline on the live store. |
| **E** | AI: `generateCopy()` with cache keyed `(shop, signal, product, channel, voiceHash)`; brand voice in Settings; weekly narrative; three rule-based insights narrated by LLM | Today shows the narrative and it's derivable from real numbers. Cache hit rate logged. |
| **F** | Push hygiene: prune tokens on FCM `UNREGISTERED`, stop-after-N-unopened, per-shop delivered rate | Delivered rate stays ≥85% over two weeks on the live store. |
| **G** | Admin rebuild to the prototype: Onboarding, Today, Customers, Profile, What to act on, Messages, Insights, COD (+stats), Settings. Polaris. | Every screen in the prototype exists and reads real data. |
| **H** | Feedback loop: per-signal / per-channel / per-hour outcome rates into brain weights | Brain weights differ per shop after two weeks. |

## Hard rules for every prompt

- **Never break existing tests.** Run `npm test` in `backend/` before and after. Add tests for new logic.
- **Session-token auth on every new `/api` route.** Use `requireAuth` + `requireStoreOwner`. Never scope by email.
- **No PII in logs.** Never `console.log` a webhook body, a profile, or an email/phone.
- **Business logic lives in `backend/`.** The admin is a thin client. No decisions in React.
- **No `localStorage` on the admin side.** Storefront `localStorage` is fine (first-party).
- **LLM calls are cached and never per-customer at send time.** One call per (shop, signal, product, channel, voice).
- **Copy resolves at send time, not schedule time.**
- **Polaris for every admin screen.** Match the prototype.
- **Don't add scope creep.** No flow builder, campaigns, email editor, segments UI, multi-store, WhatsApp, SMS.
- **Audit files go in `/audits/`**, not repo root. Move the existing `*_AUDIT.txt` files there in Phase A.

## Owner tasks (not for Claude Code)

- Apply for **Shopify Protected Customer Data** access — Partner Dashboard → app → API access. Required for any non-dev store and for submission. No stated turnaround. Do this now.
- Get an **LLM API key** (Anthropic / OpenAI / Gemini) before Phase E. Add as `LLM_API_KEY` in Render.
- **Resend** will exceed the free tier (3,000/mo total) once relationship emails go out. Budget the next tier.
- Move Render and Atlas off free tiers before the brain runs for real merchants; the poller can't cold-start.

---

## Contract for Claude Code prompts

Every prompt Claude chat generates must follow this shape. Claude Code reads `CLAUDE.md` in the repo root for the same rules.

1. **Pre-work audit, read-only.** List the files the phase touches. Capture them verbatim with line numbers into `/audits/PHASE_<X>_PRE_AUDIT.txt`. No modifications in this step.
2. **Scope statement.** Exactly what this phase adds, changes, deletes. Reference the "Done when" line. Anything not listed is out of scope.
3. **Branch.** `git checkout -b phase-<x>-<slug>`.
4. **Implementation steps** in order, file by file, with the model/route/function names from this document. Prefer editing existing files over creating parallel ones.
5. **Tests.** New Jest tests for the phase's logic. `npm test` must pass.
6. **Verification steps** the owner can run on the dev store to confirm "Done when".
7. **Self-audit.** Write `/audits/PHASE_<X>_AUDIT.txt`: files changed with line ranges, what was deleted, test results verbatim, anything out of scope that was noticed but not touched, open questions. Then stop. Do not start the next phase.

Prompts should be specific enough that Claude Code doesn't need to guess a name, and short enough to read in two minutes. If the phase is too big for one prompt, split it into A1/A2 and say so.
