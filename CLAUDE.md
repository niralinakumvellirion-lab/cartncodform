# CLAUDE.md — CartnCodForm

Claude Code reads this automatically. Keep it short and current.

## What this is
Embedded Shopify app. Retention engine for small Indian D2C stores: web push + email, per-visitor decision engine, AI-written copy, COD order form. Single store per install. No WhatsApp/SMS in this version.

Product plan: `docs/cartncodform-v2-product-plan.md`. Target UI: `docs/cartncodform-v2-prototype.jsx`. Handover for chat: `CHAT_HANDOVER_V2.md`.

## Stack
- `backend/` — Express, Mongoose, MongoDB Atlas. Deployed on Render. Poller for scheduled jobs runs inside `server.js`.
- `frontend/` — Next.js 14 App Router, Polaris, App Bridge. Deployed on Vercel. Admin lives at `app/admin/`. `app/page.js` is the marketing site, leave it alone.
- `extensions/cartncodform-embed/` — theme App Embed block. Storefront tracking + push prompt.
- Push: FCM. Email: Resend. Tests: Jest in `backend/__tests__/`.

## Rules
- Run `cd backend && npm test` before and after every change. Never leave tests failing. Add tests for new logic.
- Every new `/api` route uses `requireAuth` + `requireStoreOwner` from `backend/middleware/`. Scope by `shopDomain`, never by email.
- Never log PII: no webhook bodies, profiles, emails, phones in `console.log`.
- Business logic in `backend/`. React components fetch and render only.
- No `localStorage` in the admin (iframe). Storefront `localStorage` is fine.
- LLM calls go through `backend/utils/ai.js`, are cached in Mongo, and are never made per-customer at send time.
- Message copy resolves in the poller at send time, not when the job is scheduled.
- Admin UI is Polaris. Match the prototype screens.
- One phase per prompt. Branch `phase-<x>-<slug>`. Don't start the next phase.
- Audit files go in `/audits/`. Pre-audit before edits, self-audit after. Stop after writing the self-audit.

## Out of scope — do not add
Flow builder · campaigns · email editor · segments UI · multi-store · WhatsApp · SMS · ScriptTags · NextAuth

## Key files
- `backend/routes/webhooks.js` — all Shopify webhooks, HMAC verified
- `backend/utils/automationEngine.js` — scheduling (being replaced by `brain.js` in Phase C)
- `backend/server.js` — app setup + job poller
- `backend/models/` — one file per model
- `frontend/app/admin/page.js` — current admin (being split per screen in Phase G)
- `frontend/lib/api.js` — session-token fetch helper; use it for every admin call
- `extensions/cartncodform-embed/blocks/push-notifications.liquid` — storefront tracking + prompt
