'use strict';

/**
 * Pure aggregation — no DB calls.
 * `now` is always injected so the module is fully testable.
 *
 * CURRENT state (plan, isTest, isInternal, subscriptionStatus) comes from
 * Store documents. HISTORY and dates come from SubscriptionEvent documents.
 *
 * LIMITATION (deleted stores): For shops that have SubscriptionEvents but no
 * corresponding Store document, exclusion falls back to event.isTest only.
 * event.isInternal does not exist, so deleted stores are never excluded for
 * being internal — even if they were previously marked internal.
 */

const { PLAN_PRICE, TRIAL_DAYS } = require('./billing');
const PLAN_CURRENCY = 'USD';

const MS_PER_DAY = 86400000;
const TRIAL_MS   = TRIAL_DAYS * MS_PER_DAY;

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupEventsByShop(events) {
  const map = new Map();
  for (const ev of events) {
    if (!map.has(ev.shopDomain)) map.set(ev.shopDomain, []);
    map.get(ev.shopDomain).push(ev);
  }
  for (const [, arr] of map) {
    arr.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  }
  return map;
}

// Deduplicate a sorted event list: skip events that do not change (toPlan, shopifyStatus).
function dedupeTransitions(sortedEvents) {
  const out = [];
  let lastKey = null;
  for (const ev of sortedEvents) {
    const key = `${ev.toPlan ?? ''}|${(ev.shopifyStatus ?? '').toUpperCase()}`;
    if (key !== lastKey) {
      out.push(ev);
      lastKey = key;
    }
  }
  return out;
}

/**
 * Replay deduplicated events up to (and including) time T.
 * Returns the store's plan state at T and the last relevant events.
 *
 * APPROXIMATION for re-subscribe: if a store ends, then re-subscribes
 * (another 'activated'), trialEndsAt is taken from the latest activated event.
 * If the re-subscription itself had a fresh trial, this is correct. If Shopify
 * did not grant a new trial on re-subscribe, trialEndsAt from the event would
 * already reflect 0 trial days and would be in the past — so paying would be
 * computed correctly. This is not approximated further.
 */
function shopStateAt(dedupedEvents, T) {
  let plan = 'free';
  let trialEndsAt = null;  // null = no active trial (paying if Pro, or never set)
  let approx = false;
  let shopifyStatus = null;
  let latestActivated = null;  // most recent activated or baseline event
  let latestEnded = null;      // most recent ended/uninstalled event

  for (const ev of dedupedEvents) {
    if (new Date(ev.occurredAt) > T) break;

    plan = ev.toPlan ?? plan;
    shopifyStatus = ev.shopifyStatus ? ev.shopifyStatus.toUpperCase() : shopifyStatus;

    if (ev.eventType === 'activated') {
      trialEndsAt = ev.trialEndsAt ? new Date(ev.trialEndsAt) : null;
      approx = false;
      latestActivated = ev;
    } else if (ev.eventType === 'baseline') {
      // baseline sets state; approxSince + TRIAL_DAYS is the approximate trial end.
      if (ev.approxSince) {
        trialEndsAt = new Date(new Date(ev.approxSince).getTime() + TRIAL_MS);
        approx = true;
      } else {
        trialEndsAt = null;
        approx = false;
      }
      latestActivated = ev;
    } else if (ev.eventType === 'ended' || ev.eventType === 'uninstalled') {
      trialEndsAt = null;
      approx = false;
      latestEnded = ev;
      latestActivated = null;
    }
  }

  return { plan, trialEndsAt, approx, shopifyStatus, latestActivated, latestEnded };
}

function isExcluded(store) {
  return !!(store && (store.isTest || store.isInternal));
}

// ── Summary ───────────────────────────────────────────────────────────────────

/**
 * computeSummary({ stores, events, now, tzOffsetMinutes })
 *
 * stores: Store documents (lean)
 * events: SubscriptionEvent documents (lean), all shops
 * now: Date
 * tzOffsetMinutes: default 330 (IST)
 *
 * Returns:
 *   { priceUsd, currency, estimatedMrrUsd,
 *     counts:{paying,trial,lapsed30,free,excluded},
 *     recordingSince, months }
 *
 * recordingSince: date of earliest SubscriptionEvent, or null if no events exist.
 *
 * Monthly MRR note: months are computed by replaying events only. Pro stores
 * with no events (approx) appear in counts.trial/paying but NOT in monthly MRR —
 * consistent with "Do not invent history."
 */
function computeSummary({ stores, events, now = new Date(), tzOffsetMinutes = 330 }) {
  const eventsByShop = groupEventsByShop(events);
  let paying = 0, trial = 0, lapsed30 = 0, free = 0, excluded = 0;

  let recordingSince = null;
  for (const ev of events) {
    const d = new Date(ev.occurredAt);
    if (!recordingSince || d < recordingSince) recordingSince = d;
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);

  for (const store of stores) {
    if (isExcluded(store)) { excluded++; continue; }

    const shopEvents = dedupeTransitions(eventsByShop.get(store.shopDomain) || []);

    if (store.plan === 'pro') {
      // Find the most recent activated/baseline event
      let latestActivated = null;
      for (let i = shopEvents.length - 1; i >= 0; i--) {
        const e = shopEvents[i];
        if (e.eventType === 'activated' || e.eventType === 'baseline') {
          latestActivated = e;
          break;
        }
      }

      let inTrial;
      if (latestActivated) {
        if (latestActivated.eventType === 'activated' && latestActivated.trialEndsAt) {
          inTrial = new Date(latestActivated.trialEndsAt) > now;
        } else if (latestActivated.eventType === 'baseline' && latestActivated.approxSince) {
          const trialEnd = new Date(new Date(latestActivated.approxSince).getTime() + TRIAL_MS);
          inTrial = trialEnd > now;
        } else {
          inTrial = false;
        }
      } else {
        // Pro store with no events — use planUpdatedAt (approx)
        const since = store.planUpdatedAt ? new Date(store.planUpdatedAt) : now;
        inTrial = (since.getTime() + TRIAL_MS) > now.getTime();
      }

      if (inTrial) trial++; else paying++;
    } else {
      // Free — check lapsed
      const nonBaseline = shopEvents.filter(e => e.eventType !== 'baseline');
      const latest = nonBaseline[nonBaseline.length - 1];
      if (latest && latest.eventType === 'ended' &&
          new Date(latest.occurredAt) > thirtyDaysAgo) {
        lapsed30++;
      }
      free++;
    }
  }

  const months = _computeMonthlyMrr({ stores, events, eventsByShop, now });

  return {
    priceUsd: PLAN_PRICE,
    currency: PLAN_CURRENCY,
    estimatedMrrUsd: paying * PLAN_PRICE,
    counts: { paying, trial, lapsed30, free, excluded },
    recordingSince,
    months,
  };
}

// ── Monthly MRR ───────────────────────────────────────────────────────────────

function _computeMonthlyMrr({ stores, events, eventsByShop, now }) {
  // First recorded event month
  let firstEventDate = null;
  for (const ev of events) {
    const d = new Date(ev.occurredAt);
    if (!firstEventDate || d < firstEventDate) firstEventDate = d;
  }

  const storeMap = new Map(stores.map(s => [s.shopDomain, s]));

  // Build list of last 6 months (oldest → newest) relative to `now` (UTC months)
  const monthDefs = [];
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(now);
    ref.setUTCDate(1);
    ref.setUTCMonth(ref.getUTCMonth() - i);
    const year = ref.getUTCFullYear();
    const month = ref.getUTCMonth(); // 0-indexed
    const isCurrent = i === 0;
    monthDefs.push({ year, month, isCurrent });
  }

  return monthDefs.map(({ year, month, isCurrent }) => {
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    // No events at all → null
    if (!firstEventDate) return { month: monthKey, mrrUsd: null, current: isCurrent };

    // Month before first event → null
    const firstYear  = firstEventDate.getUTCFullYear();
    const firstMonth = firstEventDate.getUTCMonth();
    if (year < firstYear || (year === firstYear && month < firstMonth)) {
      return { month: monthKey, mrrUsd: null, current: isCurrent };
    }

    // T = snapshot time for this month
    const T = isCurrent
      ? now
      : new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)); // last ms of month

    let payingCount = 0;

    // All shops that have events
    for (const [shopDomain, shopEvents] of eventsByShop) {
      // Exclusion: prefer store doc, fall back to event.isTest
      const store = storeMap.get(shopDomain);
      if (store) {
        if (store.isTest || store.isInternal) continue;
      } else {
        // Deleted store: use event.isTest (first event's value)
        if (shopEvents[0] && shopEvents[0].isTest) continue;
      }

      const deduped = dedupeTransitions(shopEvents);
      const state = shopStateAt(deduped, T);

      if (state.plan === 'pro') {
        const inTrial = state.trialEndsAt && state.trialEndsAt > T;
        if (!inTrial) payingCount++;
      }
    }

    return { month: monthKey, mrrUsd: payingCount * PLAN_PRICE, current: isCurrent };
  });
}

// ── Activity ──────────────────────────────────────────────────────────────────

/**
 * computeActivity({ stores, events, range, now, tzOffsetMinutes })
 *
 * range: 'today' | 'week' | 'month'
 * Returns:
 *   { range, counts:{trials,paying,lost}, netMrrUsd,
 *     events:[{at, shopDomain, shopName, kind, label, amountUsd}] }
 *   events newest-first, max 200.
 */
function computeActivity({ stores, events, range = 'week', now = new Date(), tzOffsetMinutes = 330 }) {
  const eventsByShop = groupEventsByShop(events);
  const storeMap = new Map(stores.map(s => [s.shopDomain, s]));

  const rangeStart = _rangeStart(range, now, tzOffsetMinutes);

  const activityEvents = [];

  for (const [shopDomain, shopEvents] of eventsByShop) {
    const store = storeMap.get(shopDomain);
    // Exclusion: prefer store doc, fall back to event.isTest
    if (store) {
      if (store.isTest || store.isInternal) continue;
    } else {
      if (shopEvents[0] && shopEvents[0].isTest) continue;
    }

    const shopName = store ? (store.shopName || shopDomain) : shopDomain;
    const deduped = dedupeTransitions(shopEvents);

    for (let i = 0; i < deduped.length; i++) {
      const ev = deduped[i];
      const evAt = new Date(ev.occurredAt);

      if (ev.eventType === 'activated') {
        // ── trial start event ─────────────────────────────────────────────
        // Only count if within range AND the store was not already Pro before this event.
        if (evAt >= rangeStart && evAt <= now) {
          // State just before this event
          const prevDeduped = deduped.slice(0, i);
          const prevState = shopStateAt(prevDeduped, evAt);
          if (prevState.plan !== 'pro') {
            activityEvents.push({
              at: evAt,
              shopDomain,
              shopName,
              kind: 'trial',
              label: 'Trial started',
              amountUsd: 0,
            });
          }
        }

        // ── paying conversion (derived, no stored event) ──────────────────
        // trialEndsAt falls in range, store still Pro at trialEndsAt, no
        // 'ended' event before trialEndsAt.
        if (ev.trialEndsAt) {
          const trialEnd = new Date(ev.trialEndsAt);
          if (trialEnd >= rangeStart && trialEnd <= now) {
            // Check no ended/uninstalled event before trialEnd
            const endedBefore = deduped.find(e =>
              (e.eventType === 'ended' || e.eventType === 'uninstalled') &&
              new Date(e.occurredAt) <= trialEnd
            );
            if (!endedBefore) {
              activityEvents.push({
                at: trialEnd,
                shopDomain,
                shopName,
                kind: 'paying',
                label: 'Trial converted',
                amountUsd: PLAN_PRICE,
              });
            }
          }
        }
      } else if (ev.eventType === 'ended' || ev.eventType === 'uninstalled') {
        // ── lost event ────────────────────────────────────────────────────
        // Only if store was Pro before this event (i.e., previous state is Pro)
        if (evAt >= rangeStart && evAt <= now) {
          const prevDeduped = deduped.slice(0, i);
          const prevState = shopStateAt(prevDeduped, evAt);
          if (prevState.plan === 'pro') {
            // Was the store paying or in trial at this point?
            const wasPaying = prevState.trialEndsAt
              ? prevState.trialEndsAt <= evAt
              : true; // no trialEndsAt = paying
            activityEvents.push({
              at: evAt,
              shopDomain,
              shopName,
              kind: 'lost',
              label: ev.eventType === 'uninstalled' ? 'Uninstalled' : 'Cancelled',
              amountUsd: wasPaying ? -PLAN_PRICE : 0,
            });
          }
        }
      }
      // baseline: never counted as a purchase or activity event
    }
  }

  // Sort newest-first, cap at 200
  activityEvents.sort((a, b) => b.at - a.at);
  const capped = activityEvents.slice(0, 200);

  const counts = { trials: 0, paying: 0, lost: 0 };
  let netMrrUsd = 0;
  for (const e of capped) {
    if (e.kind === 'trial')  counts.trials++;
    if (e.kind === 'paying') counts.paying++;
    if (e.kind === 'lost')   counts.lost++;
    netMrrUsd += e.amountUsd;
  }

  return { range, counts, netMrrUsd, events: capped };
}

function _rangeStart(range, now, tzOffsetMinutes) {
  if (range === 'today') {
    // Start of "today" in the given timezone
    const localMs = now.getTime() + (tzOffsetMinutes ?? 330) * 60000;
    const localNow = new Date(localMs);
    const startLocal = new Date(Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate()
    ));
    return new Date(startLocal.getTime() - (tzOffsetMinutes ?? 330) * 60000);
  }
  if (range === 'week')  return new Date(now.getTime() - 7  * MS_PER_DAY);
  if (range === 'month') return new Date(now.getTime() - 30 * MS_PER_DAY);
  return new Date(now.getTime() - 7 * MS_PER_DAY);
}

// ── Stores by group ───────────────────────────────────────────────────────────

/**
 * computeStoresGroup({ stores, events, group, now, page, limit })
 *
 * group: 'paying' | 'trial' | 'lapsed' | 'excluded'
 * page, limit: pagination (0-indexed page)
 *
 * Returns: { total, page, rows }
 *
 * For excluded stores:
 *   date field = reason text (isTest → "Test subscription", isInternal → "Internal")
 *
 * For lapsed: includes all stores in the lapsed window (up to 30 days).
 */
function computeStoresGroup({ stores, events, group, now = new Date(), page = 0, limit = 25 }) {
  const eventsByShop = groupEventsByShop(events);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);

  const rows = [];

  for (const store of stores) {
    const shopEvents = dedupeTransitions(eventsByShop.get(store.shopDomain) || []);

    if (group === 'excluded') {
      if (!store.isTest && !store.isInternal) continue;
      rows.push({
        shopDomain:  store.shopDomain,
        shopName:    store.shopName || store.shopDomain,
        status:      store.isInternal ? 'Internal' : 'Test subscription',
        date:        store.isInternal ? 'Internal' : 'Test subscription',
        valueUsd:    0,
        isTest:      !!store.isTest,
        isInternal:  !!store.isInternal,
        approx:      false,
      });
      continue;
    }

    if (store.isTest || store.isInternal) continue;

    if (store.plan === 'pro') {
      let latestActivated = null;
      for (let i = shopEvents.length - 1; i >= 0; i--) {
        const e = shopEvents[i];
        if (e.eventType === 'activated' || e.eventType === 'baseline') {
          latestActivated = e; break;
        }
      }

      let inTrial = false, trialEndsAt = null, activeSince = null, approxFlag = false;

      if (latestActivated) {
        if (latestActivated.eventType === 'activated') {
          trialEndsAt = latestActivated.trialEndsAt ? new Date(latestActivated.trialEndsAt) : null;
          inTrial = trialEndsAt ? trialEndsAt > now : false;
          activeSince = new Date(latestActivated.occurredAt);
        } else {
          // baseline
          const since = latestActivated.approxSince ? new Date(latestActivated.approxSince) : null;
          trialEndsAt = since ? new Date(since.getTime() + TRIAL_MS) : null;
          inTrial = trialEndsAt ? trialEndsAt > now : false;
          activeSince = since;
          approxFlag = true;
        }
      } else {
        // No events — use planUpdatedAt (approx)
        activeSince = store.planUpdatedAt ? new Date(store.planUpdatedAt) : null;
        trialEndsAt = activeSince ? new Date(activeSince.getTime() + TRIAL_MS) : null;
        inTrial = trialEndsAt ? trialEndsAt > now : false;
        approxFlag = true;
      }

      const statusLabel = _storeStatusLabel(store);

      if (group === 'paying' && !inTrial) {
        rows.push({
          shopDomain: store.shopDomain,
          shopName:   store.shopName || store.shopDomain,
          status:     statusLabel,
          date:       activeSince,
          valueUsd:   PLAN_PRICE,
          isTest:     !!store.isTest,
          isInternal: !!store.isInternal,
          approx:     approxFlag,
        });
      } else if (group === 'trial' && inTrial) {
        rows.push({
          shopDomain: store.shopDomain,
          shopName:   store.shopName || store.shopDomain,
          status:     statusLabel,
          date:       trialEndsAt,
          valueUsd:   0,
          isTest:     !!store.isTest,
          isInternal: !!store.isInternal,
          approx:     approxFlag,
        });
      }
    } else if (group === 'lapsed') {
      // Free, latest non-baseline event is 'ended', within 30 days
      const nonBaseline = shopEvents.filter(e => e.eventType !== 'baseline');
      const latest = nonBaseline[nonBaseline.length - 1];
      if (!latest || latest.eventType !== 'ended') continue;
      const endedAt = new Date(latest.occurredAt);
      if (endedAt <= thirtyDaysAgo) continue;
      rows.push({
        shopDomain: store.shopDomain,
        shopName:   store.shopName || store.shopDomain,
        status:     _storeStatusLabel(store),
        date:       endedAt,
        valueUsd:   0,
        isTest:     false,
        isInternal: false,
        approx:     false,
      });
    }
  }

  const total = rows.length;
  const pageRows = rows.slice(page * limit, (page + 1) * limit);

  return { total, page, rows: pageRows };
}

function _storeStatusLabel(store) {
  if (store.isInternal) return 'Internal';
  if (store.isTest)     return 'Test subscription';
  if (store.plan === 'pro') {
    const s = (store.subscriptionStatus || '').toUpperCase();
    if (s === 'ACTIVE')    return 'Active';
    if (s === 'FROZEN')    return 'Frozen';
    if (s === 'CANCELLED') return 'Cancelled';
    if (s === 'EXPIRED')   return 'Expired';
    if (s === 'DECLINED')  return 'Declined';
    return 'In trial';
  }
  // Free
  const s = (store.subscriptionStatus || '').toUpperCase();
  if (s === 'CANCELLED') return 'Cancelled';
  if (s === 'FROZEN')    return 'Frozen';
  if (s === 'EXPIRED')   return 'Expired';
  if (s === 'DECLINED')  return 'Declined';
  return 'Free';
}

module.exports = {
  computeSummary,
  computeActivity,
  computeStoresGroup,
  // Exported for test isolation
  _rangeStart,
  _storeStatusLabel,
  dedupeTransitions,
  shopStateAt,
};
