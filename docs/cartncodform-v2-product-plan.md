# CartnCodForm v2 — From a feature list to a product

**Date:** 8 Sep 2026 · **Rev 2:** push + email only, WhatsApp/SMS deferred
**Repo state audited:** commit `151cf6f`

---

## Part 1 — Where we actually are

### What's real now (credit where due)

The infrastructure is solid. This is not the codebase from three weeks ago.

- Embedded in Shopify admin, session-token auth, IDOR regression tests, 42 tests passing
- GDPR compliance webhooks, billing state sync, CSP, CORS, no ScriptTags
- Scheduler with dedup, quiet hours, frequency cap, cancel-on-order
- Revenue attribution end to end
- Email channel with test-send
- COD form on App Proxy
- Storefront tracking: 10 event types with dwell and scroll depth

That is a real foundation. The plumbing works.

### Why it still doesn't feel like a product

You said it yourself: *"we just have made it, not made it something usable as a system."* That's exactly right, and there's a specific technical reason.

**There is no customer.**

Look at the data model:

| Table | Keyed by | Knows about |
|---|---|---|
| `AbandonedCustomer` | cart token | one cart |
| `CustomerPushSubscription` | FCM token | one browser |
| `StorefrontEvent` | session id | one visit |
| `CodOrder` | nothing | one order, with a phone number that links to nothing |
| `ScheduledJob` | cart token | one reminder |

Five tables, no join. Nowhere in the system is there a record that says *"this is Priya, she's visited four times, she looks at silk sarees under ₹3,000, she bought once by COD in July, her phone is +91…, she's reachable on push and email, and I last messaged her Tuesday."*

Klaviyo's entire product is that record. They call it the Profile. Every event attaches to a profile. Every flow reads a profile. Every segment is a query over profiles. The dashboard is a view of profiles. Take the profile away and Klaviyo is also five disconnected tables.

This is why:

- **The journey timeline feels pointless.** It's a log of a session, not a history of a person. A log you can't act on is just storage.
- **"1–2 notifications a day to keep customers connected" is impossible.** Connected to *whom*? Without identity across sessions you can't know who you've already messaged, what they care about, or whether they came back.
- **AI has nothing to think about.** A thinking engine needs a subject. "Here are 400 events" is not a subject. "Here is Priya" is.
- **The dashboard is three tables.** Abandoned Carts, COD Orders, Automations. There is no unit of analysis that a home screen could summarise, so there is no home screen.

### Second-order problems the audit surfaced

1. **Only `cart_abandon` works.** `browse_abandon`, `checkout_abandon` and `back_in_interest` are enum values that return `400 "coming soon"`. The scheduler fires off the carts webhook only. The behavioral data — dwell, scroll, product views, searches — is still consumed by nothing.

2. **Messages are written at schedule time, not send time.** `scheduleCartAbandonJobs` resolves title/body/image the moment the cart is created and freezes it into `payload`. A message sent 24 hours later has no idea what happened in those 24 hours — whether the shopper came back, viewed something else, or the product went out of stock.

3. **The push opt-in is a timed popup.** `popup_delay` seconds after page load, generic copy. This is the worst-converting opt-in pattern there is, and a denied native prompt is permanent for that browser. Your whole push channel depends on this one moment and it's currently thrown away.

4. **The COD phone number is orphaned.** Every COD order captures a verified mobile number — the single most reliable identifier for an Indian D2C customer. It's written to `CodOrder` and never referenced again. No link to a customer, no email field on the form, no channel record. Even without WhatsApp, that phone is how you merge an anonymous browser with a buyer.

5. **The Automations UI asks the merchant to write a 3-step sequence by hand.** A saree seller in Surat does not want to author delay/title/body for three steps. That's the old Klaviyo model, and even Klaviyo is moving away from it.

---

## Part 2 — What the product actually is

Not an abandoned-cart tool. Abandoned cart is one signal among a dozen.

**A retention engine for small Indian D2C stores — web push for anonymous visitors, email for the ones you've captured, identity anchored on the COD phone number, a decision engine that considers every visitor every day and messages them only when there's a reason, and AI that writes the message and explains the results to the merchant in plain language.**

WhatsApp and SMS are deferred. The architecture below does not depend on them — they were only ever channels. When they land, they slot into Layer 5 and nothing above it changes.

Positioned against the market:

| | Channel | Has a customer model | COD | AI | Price |
|---|---|---|---|---|---|
| Klaviyo | Email-first | Yes (Profile) | No | Copy + predictive | $20–400 |
| PushOwl | Push-only | No | No | Ads copy | $15–79 |
| BiteSpeed | WhatsApp-first | Lite | Yes | Some | $250+ |
| **CartnCodForm** | **Push + email** | **Yes** | **Yes — as identity** | **Copy + decisions + narration** | **₹799–1,499** |

The direct comparison is PushOwl. Same channels. The difference is that PushOwl fires rules; this decides per visitor. PushOwl has no idea a shopper dwelt 55 seconds on the price and scrolled no further. This does, and acts on it.

Nobody in that table has all four. The COD form is not a side feature — it's how you get the phone number that makes the rest possible.

### The test for "is it a product"

A merchant installs, sets a brand voice in two minutes, and does nothing for a week. They open the app and see:

> *This week I considered 1,240 customers, messaged 86, and 11 came back — ₹14,300 recovered. Silk sarees under ₹3,000 are your strongest re-engagement product. 40% of people who leave the Banarasi collection page stop at the price. Two customers who bought in July look ready to buy again; I'll reach them tomorrow evening.*

That's the product. If the dashboard can say that sentence truthfully, you've built it. If it shows tables, you haven't yet.

### One correction to the vision

"1–2 notifications a day" is the wrong target. Big brands send daily because they have thousands of SKUs and a content team. A 40-product store sending daily will be blocked at the browser level within a fortnight and lose the channel for good.

The right target: **consider every customer every day, message only when there's a reason.** Default cap one per day, three per week, and most days most customers get nothing. Connection comes from relevance, not frequency. That's what the engine below does.

---

## Part 3 — Architecture

Five layers. Each is a thing the current codebase does not have.

```
Storefront + Webhooks + COD form
        │
        ▼
┌───────────────────┐
│  1. PROFILE       │  Who is this person?  (identity resolution)
└────────┬──────────┘
         ▼
┌───────────────────┐
│  2. SIGNALS       │  What's true about them right now?  (deterministic)
└────────┬──────────┘
         ▼
┌───────────────────┐
│  3. BRAIN         │  Should we message them today? Which signal, which
│                   │  channel, what time?  (deterministic, explainable)
└────────┬──────────┘
         ▼
┌───────────────────┐
│  4. AI            │  What should the message say? What happened this
│                   │  week?  (LLM — copy and narration only)
└────────┬──────────┘
         ▼
┌───────────────────┐
│  5. CHANNELS      │  Push (anonymous) → Email (captured)   (both exist)
└────────┬──────────┘
         ▼
     Outcomes → back into Profile → Brain learns
```

### Layer 1 — Profile

One record per human. Identity resolution merges on, in priority order:
`customerId` → `email` → `phone` → `cartToken` → `ccfSessionId` → `pushToken`.

```
Profile {
  shopDomain
  identifiers:   { customerId, emails[], phones[], sessionIds[], cartTokens[], pushTokens[] }
  channels:      { push: {token, lastSeen, platform}, email: {address, consentAt} }
                 // whatsapp / sms added here later — nothing else changes
  stage:         visitor | browser | carter | buyer | repeat | lapsing | lost
  interests:     { [productId]: score }      // recency-weighted, decays daily
  collections:   { [handle]: score }
  priceBand:     { min, max, median }         // of products viewed and bought
  firstSeenAt, lastSeenAt, visitCount
  orders:        { count, ltv, lastOrderAt, lastProducts[], codCount, prepaidCount }
  activeHours:   [24]                         // histogram of when they visit
  timezone
  messages:      [{ sentAt, channel, signal, outcome }]   // last 20
  suppressed:    { until, reason }
}
```

Every webhook, every storefront event, every COD order, every push subscription upserts into this. A backfill script migrates the existing three tables. `AbandonedCustomer` becomes a *view* of profiles in stage `carter`, not a table.

### Layer 2 — Signals

Deterministic facts computed from the profile plus recent events. Recomputed on every event and nightly. Each has a strength 0–1 and an evidence list, so the brain and the merchant can both see *why*.

| Signal | Condition | Evidence you already collect |
|---|---|---|
| `cart_abandon` | cart, no checkout, 60 min | ✅ built |
| `checkout_abandon` | reached checkout, no order, 60 min | `reached_checkout` event |
| `browse_abandon` | product view, no cart, 30 min | `product_view` |
| `high_intent` | same product viewed 3+ times in 7 days, never carted | `product_view` counts |
| `price_hesitation` | dwell > 40s, scroll stopped 30–60%, no add-to-cart | `dwellSeconds`, `scrollDepth` |
| `price_drop` | product in `interests` dropped in price | `products/update` webhook |
| `back_in_stock` | product in `interests` went 0 → >0 inventory | `inventory_levels/update` |
| `replenishment_due` | bought consumable N days ago (merchant sets N per product) | `orders/create` |
| `post_purchase_d3` | ordered 3 days ago | `orders/create` |
| `lapsing` | buyer, no visit in 21 days | `lastSeenAt` |
| `winback` | buyer, no visit in 60 days | `lastSeenAt` |
| `cod_confirm` | COD order placed, unconfirmed | `CodOrder` |
| `cod_to_prepaid` | COD order, customer has prepaid history | `CodOrder` + `orders` |

Ship the first six plus `cod_confirm` and `cod_to_prepaid`. The `AutomationRule.trigger` enum goes away — rules subscribe to signals.

### Layer 3 — Brain

The daily decision engine. Replaces "webhook fires → blindly schedule three steps."

Runs nightly for every profile, and in real time for urgent signals (`cart_abandon`, `checkout_abandon`, `cod_confirm`).

For each profile with at least one active signal:

1. **Rank** signals by expected value = `strength × baseValue[signalType] × reachability[bestChannel] × shopConversionRate[signalType]`
2. **Fatigue check** — messaged in last 24h? skip. 3 in last 7 days? skip. Suppressed? skip.
3. **Pick one.** Only the top signal. Never two messages for two reasons on the same day.
4. **Pick channel** by signal and reachability: time-sensitive (`cart_abandon`, `price_drop`, `back_in_stock`) → push if token is live, else email; relationship (`post_purchase`, `lapsing`, `winback`, `replenishment`) → email if captured, else push. Push and email for the same signal are never both sent the same day.
5. **Pick send time** — peak of the profile's `activeHours` histogram; fall back to shop default; always inside quiet-hours rules.
6. **Schedule** a `ScheduledJob` carrying `profileId + signalType + productId` — **not** a resolved message.

At send time, the sender:
- re-checks the signal is still true (they didn't buy, product still in stock, price still dropped)
- re-checks fatigue
- asks Layer 4 for the copy
- sends, and logs outcome back to the profile

Everything in this layer is deterministic and inspectable. The merchant can see "Priya — high_intent on Banarasi Silk #412 (viewed 4× this week, 55s avg dwell) — push — 7:40pm — because she's usually here 7–9pm." No black box.

**Merchant controls** (Settings): daily cap per customer (default 1), weekly cap (3), quiet hours, channel priority, which signals are on, per-product replenishment days.

### Layer 4 — AI

Used narrowly, where it's actually better than rules, and cached hard so it costs nothing.

**a) Message copy.** `generateMessage({ signalType, product, profileSummary, brandVoice, channel })` → title + body. Cached by `(shop, signalType, productId, channel, voiceHash)`. That's one LLM call per product per signal per channel, *not* per customer. A 200-product store generates at most a few hundred messages total, ever, until the voice changes. Cost is negligible.

Brand voice is three settings: tone (warm / direct / playful), emoji on/off, language (English / Hindi / Hinglish / Gujarati). Two minutes to set. This is what makes the same signal read differently for a Surat saree store and a Bangalore sneaker store.

**b) Weekly narrative.** Aggregate numbers in → one paragraph out, in the merchant's language. Shown on Home, emailed Monday morning. This is the sentence in Part 2.

**c) Insights.** Rule-based anomaly detection (browse-abandon on product X up 3× week over week; 61% of collection-Y viewers stop scrolling before the product grid) → LLM writes one plain-English line each. Never more than three on Home at once.

**What AI does not do:** decide who gets messaged. That stays in Layer 3 where it's cheap, fast, explainable and testable.

### Layer 5 — Channels

Two channels for v1, both already built.

**Push is for reach.** It's the only channel that works for anonymous visitors, which is most of your traffic. Indian D2C traffic is overwhelmingly Android Chrome, where web push works without any install step — the one market where push-first is genuinely the right bet. The trade-off: tokens rotate, browsers clear site data, and Chrome revokes permission for sites that push without engagement. Push audiences leak. The brain's fatigue logic isn't a nicety here; it's what keeps the channel alive.

**Email is for durability.** Captured once, reachable for years. Lower open rates, no leak.

**So the engine has a standing job: convert push-only profiles into email-reachable ones.** Every high-value moment — a cart over the shop's median, a second visit, a COD order — is an opportunity to ask for an email with a reason. This is a signal (`email_capture_opportunity`) the brain schedules like any other, not a popup that fires blindly.

**Later:** WhatsApp via Meta Coexistence (seller keeps their own number) and SMS after TRAI DLT. Both slot in here as new channel adapters. The profile, signals and brain don't change.

---

## Part 4 — Storefront: fix the front door

The opt-in prompt is the single highest-leverage change on the whole list, and it's three days of work.

**Replace** the `popup_delay` timer with intent triggers, any one of which shows the prompt once:
- second product view in the session
- add to cart
- 45 seconds dwell on a product page
- exit intent on desktop

**Replace** the generic copy with a contextual reason:
- on a product page: *"Get alerted if {product} drops in price or is about to sell out"*
- on add to cart: *"We'll save your cart and remind you"*

**Two-step prompt.** Show your own soft UI first; call the native `Notification.requestPermission()` only when they tap yes. A native denial is permanent. A soft-UI dismissal is not.

**Capture identity opportunistically.** Add an optional email field to the COD form (*"Email for order updates"*). After push opt-in on a high-value cart: *"Also save this to your email?"* Every capture upserts the profile and merges it with the anonymous browsing history that came before it.

---

## Part 5 — Dashboard: the merchant's window into the brain

Rebuild around profiles and decisions, not tables. Seven screens.

**Home — "Today"**
- What the brain will do today: *"Reaching 23 customers — 9 cart reminders, 6 price-drop alerts, 4 winback, 4 COD confirms"*
- Yesterday: sent / delivered / clicked / converted / ₹ recovered
- Three insights, one line each
- This week's narrative paragraph

**Customers**
- Profile list: name or "Anonymous shopper", stage, top interest, reachable-on icons, last messaged, LTV
- Filters by stage and signal
- Click → **Profile page**: the existing journey timeline, now attached to a person, alongside interests, orders, messages sent and their outcomes, and any active signals with evidence

**Signals** (replaces "Automations")
- One toggle per signal type, with a one-line explanation and this shop's conversion rate for it
- Per-signal: channel preference override, max steps
- No step editor. The brain writes the steps.

**Messages**
- Every send: profile, signal, channel, copy, outcome, revenue

**Insights**
- Product table: views, unique viewers, avg dwell, avg scroll depth, cart rate, top exit point
- Collection table: same
- This is where dwell and scroll finally earn their keep

**COD**
- Keep the existing order list. Add: confirmation rate, prepaid-conversion rate, RTO saved

**Settings**
- Brand voice (three fields), caps, quiet hours, channel priority, replenishment days per product

---

## Part 6 — Build plan

Order matters. Profile first, because every layer above it depends on it.

| Phase | What | Time | Done when |
|---|---|---|---|
| **A** | Profile model + identity resolution + backfill script + all ingest paths upsert | 1 wk | Every event, cart, order and COD order lands on a profile. `AbandonedCustomer` is a query, not a table. |
| **B** | Signals: the first six + `cod_confirm` + `cod_to_prepaid`, recomputed on ingest and nightly | 1 wk | Profile page shows active signals with evidence |
| **C** | Brain: nightly + real-time ranking, fatigue, channel and time selection, send-time re-validation. Delete `AutomationRule.steps` editor and the `trigger` enum. | 1.5 wk | Merchant sets a voice, walks away 24h, and the Messages log shows sends with a reason for each |
| **D** | Storefront opt-in redesign + email field on COD form + `email_capture_opportunity` signal | 3 d | Opt-in rate measurably above the timer popup on the live store |
| **E** | AI: copy generation with cache, brand voice settings, weekly narrative, three insights | 1 wk | Home shows the narrative paragraph and it's true |
| **F** | Push hygiene: token refresh on every visit, dead-token pruning, per-shop engagement rate, Chrome-revocation guard (stop pushing to a token after N unclicked sends) | 3 d | Delivered rate stays above 85% on the live store over two weeks |
| **G** | Dashboard rebuild — seven screens, Polaris | 1.5 wk | Home / Customers / Profile / Signals / Messages / Insights / COD / Settings all live |
| **H** | Feedback loop: per-signal, per-channel, per-hour outcome rates feed back into brain weights | ongoing | Brain weights differ per shop after two weeks of data |

**Total: 7–8 weeks.** At the end of Phase C you already have something no competitor at your price point has. Phases D–G are what make it *feel* like a product.

### What to delete from the current codebase

- `AutomationRule.steps` and the manual step editor — the brain owns steps
- `AutomationRule.trigger` enum with its three dead values
- Payload resolution inside `scheduleCartAbandonJobs` — moves to send time
- `popup_delay` and the timer-based prompt
- `AbandonedCustomer` as a primary table — becomes a profile query
- The "Abandoned Carts" tab as the landing screen — becomes a filter on Customers

### What stays untouched

Session-token auth, GDPR webhooks, billing, HMAC, attribution join, FCM and Resend adapters, App Proxy, COD form backend, tests. All of it carries forward.

---

## Part 7 — What this is not

Not building, and not letting scope creep pull in:

- A visual flow builder
- Campaign blasts
- A drag-and-drop email editor
- WhatsApp or SMS in v1 — deferred, not cancelled. Meta Business verification is free and slow; worth starting the paperwork now so it's ready when you are.
- Segments as a merchant-facing concept — the brain segments implicitly
- Multi-store
- Anything an LLM does per-customer at send time — cost and latency kill that
