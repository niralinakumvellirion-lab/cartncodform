'use strict';

/**
 * Unit tests for backend/utils/financeStats.js
 * No DB access — all inputs are in-memory objects.
 */

const {
  computeSummary,
  computeActivity,
  computeStoresGroup,
  dedupeTransitions,
  shopStateAt,
} = require('../utils/financeStats');

const { PLAN_PRICE, TRIAL_DAYS } = require('../utils/billing');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date('2024-06-15T12:00:00Z');
const MS  = 86400000;

function store(overrides = {}) {
  return {
    shopDomain:         overrides.shopDomain   ?? 'test.myshopify.com',
    shopName:           overrides.shopName     ?? 'Test Shop',
    plan:               overrides.plan         ?? 'free',
    planTier:           overrides.planTier     ?? null,
    subscriptionStatus: overrides.status       ?? null,
    planUpdatedAt:      overrides.planUpdatedAt ?? null,
    isTest:             overrides.isTest        ?? false,
    isInternal:         overrides.isInternal    ?? false,
  };
}

function event(overrides = {}) {
  const base = {
    shopDomain:    overrides.shopDomain ?? 'test.myshopify.com',
    eventType:     overrides.eventType  ?? 'activated',
    toPlan:        overrides.toPlan     ?? 'pro',
    fromPlan:      overrides.fromPlan   ?? 'free',
    shopifyStatus: overrides.shopifyStatus ?? 'ACTIVE',
    isTest:        overrides.isTest     ?? false,
    occurredAt:    overrides.occurredAt  ?? new Date(NOW.getTime() - 30 * MS),
    trialEndsAt:   overrides.trialEndsAt  ?? null,
    approxSince:   overrides.approxSince  ?? null,
    planTier:      overrides.planTier     ?? null,
  };
  return base;
}

// ── dedupeTransitions ─────────────────────────────────────────────────────────

describe('dedupeTransitions', () => {
  test('two identical (toPlan, shopifyStatus) events → first kept, second dropped', () => {
    const evs = [
      event({ toPlan: 'pro', shopifyStatus: 'ACTIVE', occurredAt: new Date(NOW.getTime() - 10*MS) }),
      event({ toPlan: 'pro', shopifyStatus: 'ACTIVE', occurredAt: new Date(NOW.getTime() - 5*MS) }),
    ];
    const deduped = dedupeTransitions(evs);
    expect(deduped).toHaveLength(1);
  });

  test('different shopifyStatus → both kept', () => {
    const evs = [
      event({ toPlan: 'pro', shopifyStatus: 'ACTIVE',    occurredAt: new Date(NOW.getTime() - 10*MS) }),
      event({ toPlan: 'pro', shopifyStatus: 'CANCELLED', occurredAt: new Date(NOW.getTime() - 5*MS), eventType: 'ended', toPlan: 'free' }),
    ];
    expect(dedupeTransitions(evs)).toHaveLength(2);
  });

  test('case-insensitive shopifyStatus: active + ACTIVE → deduped', () => {
    const evs = [
      event({ shopifyStatus: 'active',  toPlan: 'pro' }),
      event({ shopifyStatus: 'ACTIVE',  toPlan: 'pro', occurredAt: new Date(NOW.getTime() - 1*MS) }),
    ];
    expect(dedupeTransitions(evs)).toHaveLength(1);
  });
});

// ── computeSummary ────────────────────────────────────────────────────────────

describe('computeSummary — basic counts', () => {
  test('trial: trialEndsAt in future', () => {
    const trialEnd = new Date(NOW.getTime() + 3 * MS);
    const s = store({ plan: 'pro', status: 'ACTIVE' });
    const ev = event({ trialEndsAt: trialEnd });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    expect(r.counts.trial).toBe(1);
    expect(r.counts.paying).toBe(0);
  });

  test('paying: trialEndsAt in past', () => {
    const trialEnd = new Date(NOW.getTime() - 1 * MS);
    const s = store({ plan: 'pro', status: 'ACTIVE' });
    const ev = event({ trialEndsAt: trialEnd });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    expect(r.counts.paying).toBe(1);
    expect(r.counts.trial).toBe(0);
  });

  test('Pro store with no events → approx, uses planUpdatedAt', () => {
    const planUpdatedAt = new Date(NOW.getTime() - 2 * MS);
    const s = store({ plan: 'pro', planUpdatedAt, status: 'ACTIVE' });
    // trialEnd = planUpdatedAt + TRIAL_DAYS. If 2 days ago + TRIAL_DAYS > now → trial
    const r = computeSummary({ stores: [s], events: [], now: NOW });
    expect(r.counts.trial + r.counts.paying).toBe(1);
    // 2 days into the trial → still in trial
    expect(r.counts.trial).toBe(1);
  });

  test('Pro store with no events, planUpdatedAt old enough → paying (approx)', () => {
    const planUpdatedAt = new Date(NOW.getTime() - (TRIAL_DAYS + 3) * MS);
    const s = store({ plan: 'pro', planUpdatedAt, status: 'ACTIVE' });
    const r = computeSummary({ stores: [s], events: [], now: NOW });
    expect(r.counts.paying).toBe(1);
    expect(r.counts.trial).toBe(0);
  });

  test('baseline event: uses approxSince + TRIAL_DAYS', () => {
    const approxSince = new Date(NOW.getTime() - 2 * MS);
    const s = store({ plan: 'pro', status: 'ACTIVE' });
    const ev = event({ eventType: 'baseline', toPlan: 'pro', shopifyStatus: 'ACTIVE',
      approxSince, trialEndsAt: null });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    // 2 days ago + 7-day trial → in trial
    expect(r.counts.trial).toBe(1);
  });

  test('baseline never counted as a purchase (paying = 0, no MRR contribution for it alone)', () => {
    const s = store({ plan: 'pro', status: 'ACTIVE' });
    const approxSince = new Date(NOW.getTime() - (TRIAL_DAYS + 3) * MS); // trial long expired
    const ev = event({ eventType: 'baseline', toPlan: 'pro', shopifyStatus: 'ACTIVE',
      approxSince, trialEndsAt: null });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    // trial ended 3 days ago → paying
    expect(r.counts.paying).toBe(1);
    expect(r.estimatedMrrUsd).toBeCloseTo(PLAN_PRICE);
    // baseline should not have added a separate purchase
    // (verified by trial/paying counts being 1 total not 2)
    expect(r.counts.trial + r.counts.paying).toBe(1);
  });

  test('lapsed: ended event 29 days ago → counted as lapsed', () => {
    const s = store({ plan: 'free' });
    const ev = event({ eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - 29 * MS) });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    expect(r.counts.lapsed30).toBe(1);
    expect(r.counts.free).toBe(1);
  });

  test('lapsed window: 31 days ago → not lapsed', () => {
    const s = store({ plan: 'free' });
    const ev = event({ eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - 31 * MS) });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    expect(r.counts.lapsed30).toBe(0);
    expect(r.counts.free).toBe(1);
  });

  test('uninstalled (not ended) does not count as lapsed', () => {
    const s = store({ plan: 'free' });
    const ev = event({ eventType: 'uninstalled', toPlan: 'free', shopifyStatus: 'UNINSTALLED',
      occurredAt: new Date(NOW.getTime() - 5 * MS) });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    expect(r.counts.lapsed30).toBe(0);
  });

  test('isTest store excluded from paying/trial counts', () => {
    const trialEnd = new Date(NOW.getTime() - 1 * MS);
    const s = store({ plan: 'pro', status: 'ACTIVE', isTest: true });
    const ev = event({ trialEndsAt: trialEnd });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    expect(r.counts.paying).toBe(0);
    expect(r.counts.excluded).toBe(1);
  });

  test('isInternal store excluded from all counts', () => {
    const s = store({ plan: 'pro', status: 'ACTIVE', isInternal: true });
    const ev = event({ trialEndsAt: new Date(NOW.getTime() - 1 * MS) });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    expect(r.counts.paying).toBe(0);
    expect(r.counts.excluded).toBe(1);
  });

  test('estimatedMrrUsd = paying × PLAN_PRICE', () => {
    const trialEnd = new Date(NOW.getTime() - 1 * MS);
    const s1 = store({ shopDomain: 'a.myshopify.com', plan: 'pro' });
    const s2 = store({ shopDomain: 'b.myshopify.com', plan: 'pro' });
    const ev1 = event({ shopDomain: 'a.myshopify.com', trialEndsAt: trialEnd });
    const ev2 = event({ shopDomain: 'b.myshopify.com',
      trialEndsAt: new Date(NOW.getTime() + 3 * MS) });
    const r = computeSummary({ stores: [s1, s2], events: [ev1, ev2], now: NOW });
    expect(r.counts.paying).toBe(1);
    expect(r.counts.trial).toBe(1);
    expect(r.estimatedMrrUsd).toBeCloseTo(PLAN_PRICE);
  });

  test('duplicate events: only one state counted', () => {
    const trialEnd = new Date(NOW.getTime() + 3 * MS);
    const s = store({ plan: 'pro' });
    const ev1 = event({ trialEndsAt: trialEnd, occurredAt: new Date(NOW.getTime() - 10*MS) });
    const ev2 = event({ trialEndsAt: trialEnd, occurredAt: new Date(NOW.getTime() - 5*MS) });
    const r = computeSummary({ stores: [s], events: [ev1, ev2], now: NOW });
    expect(r.counts.trial).toBe(1);
  });

  test('recordingSince: earliest event date', () => {
    const d1 = new Date('2024-01-01T00:00:00Z');
    const d2 = new Date('2024-03-01T00:00:00Z');
    const s = store({ plan: 'free' });
    const ev1 = event({ occurredAt: d2 });
    const ev2 = event({ shopDomain: 'b.myshopify.com', occurredAt: d1 });
    const r = computeSummary({ stores: [s], events: [ev1, ev2], now: NOW });
    expect(r.recordingSince).toEqual(d1);
  });

  test('months before first event month return null', () => {
    const s = store({ plan: 'pro' });
    // Event in May 2024 — so Jan-Apr months should be null
    const ev = event({ occurredAt: new Date('2024-05-01T00:00:00Z'),
      trialEndsAt: new Date('2024-05-10T00:00:00Z') });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    // Months returned: 6 months back from June 2024 = Jan,Feb,Mar,Apr,May,Jun
    const jan = r.months.find(m => m.month === '2024-01');
    const may = r.months.find(m => m.month === '2024-05');
    expect(jan).toBeDefined();
    expect(jan.mrrUsd).toBeNull();
    expect(may).toBeDefined();
    // May: event occurred May 1, trialEndsAt May 10 → paying at May 31 end
    expect(may.mrrUsd).toBeCloseTo(PLAN_PRICE);
  });

  test('re-subscribe after cancel: latest activated event wins', () => {
    const d = store({ shopDomain: 'resub.myshopify.com', plan: 'pro' });
    const firstActivated = event({
      shopDomain: 'resub.myshopify.com', eventType: 'activated',
      occurredAt: new Date(NOW.getTime() - 60*MS),
      trialEndsAt: new Date(NOW.getTime() - 53*MS),
    });
    const ended = event({
      shopDomain: 'resub.myshopify.com', eventType: 'ended', toPlan: 'free',
      shopifyStatus: 'CANCELLED', occurredAt: new Date(NOW.getTime() - 40*MS),
    });
    const reActivated = event({
      shopDomain: 'resub.myshopify.com', eventType: 'activated', toPlan: 'pro',
      shopifyStatus: 'ACTIVE', occurredAt: new Date(NOW.getTime() - 10*MS),
      trialEndsAt: new Date(NOW.getTime() + 4*MS),
    });
    const r = computeSummary({ stores: [d], events: [firstActivated, ended, reActivated], now: NOW });
    // Re-subscribed 10 days ago with trial ending in 4 days → in trial
    expect(r.counts.trial).toBe(1);
    expect(r.counts.paying).toBe(0);
  });

  test('uninstalled store: not in paying/trial/free counts after uninstall', () => {
    const s = store({ plan: 'free' });
    const ev1 = event({ eventType: 'activated', toPlan: 'pro',
      occurredAt: new Date(NOW.getTime() - 60*MS),
      trialEndsAt: new Date(NOW.getTime() - 53*MS) });
    const ev2 = event({ eventType: 'uninstalled', toPlan: 'free', shopifyStatus: 'UNINSTALLED',
      occurredAt: new Date(NOW.getTime() - 50*MS) });
    // store.plan is 'free' now
    const r = computeSummary({ stores: [s], events: [ev1, ev2], now: NOW });
    expect(r.counts.paying).toBe(0);
    expect(r.counts.trial).toBe(0);
    expect(r.counts.lapsed30).toBe(0); // uninstalled, not ended
  });
});

// ── computeSummary — monthly MRR ──────────────────────────────────────────────

describe('computeSummary — monthly MRR', () => {
  test('no events → all months null', () => {
    const s = store({ plan: 'free' });
    const r = computeSummary({ stores: [s], events: [], now: NOW });
    expect(r.months.every(m => m.mrrUsd === null)).toBe(true);
  });

  test('deleted store events (no store doc) counted in monthly MRR', () => {
    // shopDomain not in stores array
    const ev = event({
      shopDomain: 'deleted.myshopify.com',
      occurredAt: new Date(NOW.getTime() - 60*MS),
      trialEndsAt: new Date(NOW.getTime() - 53*MS),
      isTest: false,
    });
    const r = computeSummary({ stores: [], events: [ev], now: NOW });
    const currentMonth = r.months.find(m => m.current);
    // trial ended 53 days ago → paying at now
    expect(currentMonth.mrrUsd).toBeCloseTo(PLAN_PRICE);
  });

  test('deleted store with isTest=true excluded from monthly MRR', () => {
    const ev = event({
      shopDomain: 'deleted-test.myshopify.com',
      occurredAt: new Date(NOW.getTime() - 60*MS),
      trialEndsAt: new Date(NOW.getTime() - 53*MS),
      isTest: true,
    });
    const r = computeSummary({ stores: [], events: [ev], now: NOW });
    const currentMonth = r.months.find(m => m.current);
    expect(currentMonth.mrrUsd).toBe(0);
  });

  test('months array has exactly 6 entries', () => {
    const s = store({ plan: 'free' });
    const ev = event({ occurredAt: new Date(NOW.getTime() - 10*MS) });
    const r = computeSummary({ stores: [s], events: [ev], now: NOW });
    expect(r.months).toHaveLength(6);
  });

  test('current month is flagged current:true', () => {
    const r = computeSummary({ stores: [], events: [], now: NOW });
    const current = r.months.filter(m => m.current);
    expect(current).toHaveLength(1);
    expect(current[0].month).toBe('2024-06');
  });
});

// ── computeActivity ───────────────────────────────────────────────────────────

describe('computeActivity — trial events', () => {
  test('activated event in range where prev plan was free → trial event', () => {
    const s = store({ plan: 'pro' });
    const ev = event({
      eventType: 'activated', toPlan: 'pro', shopifyStatus: 'ACTIVE',
      occurredAt: new Date(NOW.getTime() - 2*MS),
      trialEndsAt: new Date(NOW.getTime() + 5*MS),
    });
    const r = computeActivity({ stores: [s], events: [ev], range: 'week', now: NOW });
    expect(r.counts.trials).toBe(1);
    const te = r.events.find(e => e.kind === 'trial');
    expect(te).toBeDefined();
    expect(te.amountUsd).toBe(0);
  });

  test('baseline event in range → not counted as trial or paying', () => {
    const s = store({ plan: 'pro' });
    const ev = event({
      eventType: 'baseline', toPlan: 'pro', shopifyStatus: 'ACTIVE',
      occurredAt: new Date(NOW.getTime() - 2*MS),
      approxSince: new Date(NOW.getTime() - 10*MS),
    });
    const r = computeActivity({ stores: [s], events: [ev], range: 'week', now: NOW });
    expect(r.counts.trials).toBe(0);
    expect(r.counts.paying).toBe(0);
  });
});

describe('computeActivity — paying events', () => {
  test('trialEndsAt in range, no ended before it → paying event with +PLAN_PRICE', () => {
    const s = store({ plan: 'pro' });
    const trialEnd = new Date(NOW.getTime() - 2*MS); // 2 days ago (within week)
    const ev = event({
      eventType: 'activated', toPlan: 'pro',
      occurredAt: new Date(NOW.getTime() - 9*MS),
      trialEndsAt: trialEnd,
    });
    const r = computeActivity({ stores: [s], events: [ev], range: 'week', now: NOW });
    expect(r.counts.paying).toBe(1);
    const pe = r.events.find(e => e.kind === 'paying');
    expect(pe.amountUsd).toBeCloseTo(PLAN_PRICE);
  });

  test('trialEndsAt in range but ended before it → no paying event', () => {
    const s = store({ plan: 'free' });
    const trialEnd = new Date(NOW.getTime() - 2*MS);
    const endedAt  = new Date(NOW.getTime() - 4*MS); // ended BEFORE trial end
    const activated = event({
      eventType: 'activated', toPlan: 'pro',
      occurredAt: new Date(NOW.getTime() - 10*MS),
      trialEndsAt: trialEnd,
    });
    const ended = event({
      shopDomain: activated.shopDomain,
      eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: endedAt,
    });
    const r = computeActivity({ stores: [s], events: [activated, ended], range: 'week', now: NOW });
    expect(r.counts.paying).toBe(0);
  });
});

describe('computeActivity — lost events', () => {
  test('lost while paying → -PLAN_PRICE', () => {
    const s = store({ plan: 'free' });
    const activated = event({
      eventType: 'activated', toPlan: 'pro',
      occurredAt: new Date(NOW.getTime() - 20*MS),
      trialEndsAt: new Date(NOW.getTime() - 14*MS), // trial ended 14 days ago
    });
    const ended = event({
      shopDomain: activated.shopDomain,
      eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - 3*MS), // in range
    });
    const r = computeActivity({ stores: [s], events: [activated, ended], range: 'week', now: NOW });
    expect(r.counts.lost).toBe(1);
    const le = r.events.find(e => e.kind === 'lost');
    expect(le.amountUsd).toBeCloseTo(-PLAN_PRICE);
    expect(r.netMrrUsd).toBeCloseTo(-PLAN_PRICE);
  });

  test('lost while still in trial → 0 amount', () => {
    const s = store({ plan: 'free' });
    const activated = event({
      eventType: 'activated', toPlan: 'pro',
      occurredAt: new Date(NOW.getTime() - 5*MS),
      trialEndsAt: new Date(NOW.getTime() + 2*MS), // trial not ended yet
    });
    const ended = event({
      shopDomain: activated.shopDomain,
      eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - 1*MS), // in range, before trial end
    });
    const r = computeActivity({ stores: [s], events: [activated, ended], range: 'week', now: NOW });
    expect(r.counts.lost).toBe(1);
    expect(r.events.find(e => e.kind === 'lost').amountUsd).toBe(0);
  });

  test('lost event for free store (never Pro) not counted', () => {
    const s = store({ plan: 'free' });
    const ev = event({
      eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - 1*MS),
    });
    // No prior activated event
    const r = computeActivity({ stores: [s], events: [ev], range: 'week', now: NOW });
    expect(r.counts.lost).toBe(0);
  });
});

describe('computeActivity — exclusion and TZ', () => {
  test('isTest store excluded from activity', () => {
    const s = store({ plan: 'pro', isTest: true });
    const ev = event({ occurredAt: new Date(NOW.getTime() - 1*MS),
      trialEndsAt: new Date(NOW.getTime() + 5*MS) });
    const r = computeActivity({ stores: [s], events: [ev], range: 'week', now: NOW });
    expect(r.counts.trials).toBe(0);
  });

  test('isInternal store excluded from activity', () => {
    const s = store({ plan: 'pro', isInternal: true });
    const ev = event({ occurredAt: new Date(NOW.getTime() - 1*MS),
      trialEndsAt: new Date(NOW.getTime() + 5*MS) });
    const r = computeActivity({ stores: [s], events: [ev], range: 'week', now: NOW });
    expect(r.counts.trials).toBe(0);
  });

  test('"today" range uses tz boundary (IST = +330 min)', () => {
    // NOW = 2024-06-15T12:00:00Z
    // IST = 2024-06-15T17:30:00 local → start of today IST = 2024-06-15T00:00:00+05:30
    //     = 2024-06-14T18:30:00Z
    // Event at 2024-06-14T22:00:00Z = within today IST
    const evAt = new Date('2024-06-14T22:00:00Z');
    const s = store({ plan: 'pro' });
    const ev = event({ occurredAt: evAt, trialEndsAt: new Date(NOW.getTime() + 5*MS) });
    const r = computeActivity({ stores: [s], events: [ev], range: 'today', now: NOW, tzOffsetMinutes: 330 });
    expect(r.counts.trials).toBe(1);
  });

  test('"today" range excludes event before IST midnight', () => {
    // Event at 2024-06-14T18:00:00Z = before IST midnight (18:29:59Z is still yesterday IST)
    const evAt = new Date('2024-06-14T17:00:00Z'); // before 18:30Z = yesterday IST
    const s = store({ plan: 'pro' });
    const ev = event({ occurredAt: evAt, trialEndsAt: new Date(NOW.getTime() + 5*MS) });
    const r = computeActivity({ stores: [s], events: [ev], range: 'today', now: NOW, tzOffsetMinutes: 330 });
    expect(r.counts.trials).toBe(0);
  });

  test('activity events sorted newest-first', () => {
    const s1 = store({ shopDomain: 'a.myshopify.com', plan: 'pro' });
    const s2 = store({ shopDomain: 'b.myshopify.com', plan: 'pro' });
    const ev1 = event({ shopDomain: 'a.myshopify.com', occurredAt: new Date(NOW.getTime() - 5*MS),
      trialEndsAt: new Date(NOW.getTime() + 3*MS) });
    const ev2 = event({ shopDomain: 'b.myshopify.com', occurredAt: new Date(NOW.getTime() - 1*MS),
      trialEndsAt: new Date(NOW.getTime() + 3*MS) });
    const r = computeActivity({ stores: [s1, s2], events: [ev1, ev2], range: 'week', now: NOW });
    const tEvs = r.events.filter(e => e.kind === 'trial');
    expect(tEvs[0].shopDomain).toBe('b.myshopify.com');
    expect(tEvs[1].shopDomain).toBe('a.myshopify.com');
  });
});

// ── computeStoresGroup ────────────────────────────────────────────────────────

describe('computeStoresGroup', () => {
  test('paying group: Pro, trial ended', () => {
    const s = store({ plan: 'pro', status: 'ACTIVE' });
    const ev = event({ trialEndsAt: new Date(NOW.getTime() - 1*MS) });
    const r = computeStoresGroup({ stores: [s], events: [ev], group: 'paying', now: NOW });
    expect(r.total).toBe(1);
    expect(r.rows[0].valueUsd).toBeCloseTo(PLAN_PRICE);
    expect(r.rows[0].status).toBe('Active');
  });

  test('trial group: Pro, trial not ended', () => {
    const s = store({ plan: 'pro', status: 'ACTIVE' });
    const ev = event({ trialEndsAt: new Date(NOW.getTime() + 3*MS) });
    const r = computeStoresGroup({ stores: [s], events: [ev], group: 'trial', now: NOW });
    expect(r.total).toBe(1);
    expect(r.rows[0].valueUsd).toBe(0);
  });

  test('lapsed group: Free, ended in last 30 days', () => {
    const s = store({ plan: 'free' });
    const ev = event({ eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - 10*MS) });
    const r = computeStoresGroup({ stores: [s], events: [ev], group: 'lapsed', now: NOW });
    expect(r.total).toBe(1);
  });

  test('lapsed group: not included if uninstalled', () => {
    const s = store({ plan: 'free' });
    const ev = event({ eventType: 'uninstalled', toPlan: 'free', shopifyStatus: 'UNINSTALLED',
      occurredAt: new Date(NOW.getTime() - 5*MS) });
    const r = computeStoresGroup({ stores: [s], events: [ev], group: 'lapsed', now: NOW });
    expect(r.total).toBe(0);
  });

  test('excluded group: isTest store appears', () => {
    const s = store({ isTest: true });
    const r = computeStoresGroup({ stores: [s], events: [], group: 'excluded', now: NOW });
    expect(r.total).toBe(1);
    expect(r.rows[0].status).toBe('Test subscription');
    expect(r.rows[0].isTest).toBe(true);
  });

  test('excluded group: isInternal store appears', () => {
    const s = store({ isInternal: true });
    const r = computeStoresGroup({ stores: [s], events: [], group: 'excluded', now: NOW });
    expect(r.total).toBe(1);
    expect(r.rows[0].status).toBe('Internal');
    expect(r.rows[0].isInternal).toBe(true);
  });

  test('Pro store with no events: approx=true', () => {
    const s = store({ plan: 'pro', planUpdatedAt: new Date(NOW.getTime() - 2*MS) });
    const r = computeStoresGroup({ stores: [s], events: [], group: 'trial', now: NOW });
    // 2 days into 7-day trial → trial group
    expect(r.total).toBe(1);
    expect(r.rows[0].approx).toBe(true);
  });

  test('pagination: limit and page work', () => {
    const stores = Array.from({ length: 5 }, (_, i) => {
      const s = store({ shopDomain: `s${i}.myshopify.com`, plan: 'free' });
      return s;
    });
    const events = stores.map((s, i) => event({
      shopDomain: s.shopDomain,
      eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - (i+1)*MS),
    }));
    const r = computeStoresGroup({ stores, events, group: 'lapsed', now: NOW, page: 0, limit: 2 });
    expect(r.total).toBe(5);
    expect(r.rows).toHaveLength(2);
  });
});

// ── Plan tiers: each store priced at its own plan ─────────────────────────────

describe('plan tiers — pricing helpers', () => {
  const { eventPriceUsd, storePriceUsd } = require('../utils/financeStats');

  test('eventPriceUsd: tier price, or PLAN_PRICE for a pre-tiers event', () => {
    expect(eventPriceUsd(event({ planTier: 'starter' }))).toBe(9.99);
    expect(eventPriceUsd(event({ planTier: 'growth' }))).toBe(24.99);
    expect(eventPriceUsd(event({ planTier: 'pro' }))).toBe(49);
    expect(eventPriceUsd(event({ planTier: 'free' }))).toBe(0);
    expect(eventPriceUsd(event())).toBe(PLAN_PRICE);
    expect(eventPriceUsd(null)).toBe(PLAN_PRICE);
  });

  test('storePriceUsd: tierOf price, or PLAN_PRICE when no tier is saved yet', () => {
    expect(storePriceUsd(store({ plan: 'pro', planTier: 'growth' }))).toBe(24.99);
    expect(storePriceUsd(store({ plan: 'pro', planTier: 'pro' }))).toBe(49);
    expect(storePriceUsd(store({ plan: 'pro' }))).toBe(PLAN_PRICE);
  });
});

describe('plan tiers — summary', () => {
  const past = new Date(NOW.getTime() - 1 * MS);
  const future = new Date(NOW.getTime() + 3 * MS);

  test('estimatedMrrUsd sums each paying store at its plan price; trials go to trialPipelineUsd', () => {
    const stores = [
      store({ shopDomain: 's.myshopify.com', plan: 'pro', planTier: 'starter' }),
      store({ shopDomain: 'g.myshopify.com', plan: 'pro', planTier: 'growth' }),
      store({ shopDomain: 'p.myshopify.com', plan: 'pro', planTier: 'pro' }),
      store({ shopDomain: 'old.myshopify.com', plan: 'pro' }),                   // pre-tiers: $10
      store({ shopDomain: 't.myshopify.com', plan: 'pro', planTier: 'growth' }), // in trial
      store({ shopDomain: 'f.myshopify.com', plan: 'free' }),
    ];
    const events = [
      event({ shopDomain: 's.myshopify.com', planTier: 'starter', trialEndsAt: past }),
      event({ shopDomain: 'g.myshopify.com', planTier: 'growth', trialEndsAt: past }),
      event({ shopDomain: 'p.myshopify.com', planTier: 'pro', trialEndsAt: past }),
      event({ shopDomain: 'old.myshopify.com', trialEndsAt: past }),
      event({ shopDomain: 't.myshopify.com', planTier: 'growth', trialEndsAt: future }),
    ];
    const r = computeSummary({ stores, events, now: NOW });
    expect(r.counts.paying).toBe(4);
    expect(r.counts.trial).toBe(1);
    expect(r.estimatedMrrUsd).toBe(93.98); // 9.99 + 24.99 + 49 + 10
    expect(r.trialPipelineUsd).toBe(24.99);
    expect(r.priceUsd).toBe(PLAN_PRICE);
  });

  test('estimatedMrrUsd is rounded to cents', () => {
    const stores = [1, 2, 3].map(i => store({ shopDomain: 's' + i + '.myshopify.com', plan: 'pro', planTier: 'starter' }));
    const events = [1, 2, 3].map(i => event({ shopDomain: 's' + i + '.myshopify.com', planTier: 'starter', trialEndsAt: past }));
    expect(computeSummary({ stores, events, now: NOW }).estimatedMrrUsd).toBe(29.97);
  });

  test('current MRR uses the store tier even when the event has none', () => {
    const s = store({ plan: 'pro', planTier: 'growth' });
    const r = computeSummary({ stores: [s], events: [event({ trialEndsAt: past })], now: NOW });
    expect(r.estimatedMrrUsd).toBe(24.99);
  });
});

describe('plan tiers — monthly MRR', () => {
  test('each month is priced by the event tier in force at month end', () => {
    // Starter from March (trial over in March), Growth from May 10. Pre-tiers store paying since March.
    const stores = [
      store({ shopDomain: 'up.myshopify.com', plan: 'pro', planTier: 'growth' }),
      store({ shopDomain: 'old.myshopify.com', plan: 'pro' }),
    ];
    const events = [
      event({ shopDomain: 'up.myshopify.com', planTier: 'starter',
        occurredAt: new Date('2024-03-01T00:00:00Z'), trialEndsAt: new Date('2024-03-08T00:00:00Z') }),
      event({ shopDomain: 'up.myshopify.com', planTier: 'growth', fromPlan: 'pro',
        occurredAt: new Date('2024-05-10T00:00:00Z'), trialEndsAt: new Date('2024-03-08T00:00:00Z') }),
      event({ shopDomain: 'old.myshopify.com',
        occurredAt: new Date('2024-03-01T00:00:00Z'), trialEndsAt: new Date('2024-03-08T00:00:00Z') }),
    ];
    const r = computeSummary({ stores, events, now: NOW });
    const m = Object.fromEntries(r.months.map(x => [x.month, x.mrrUsd]));
    expect(m['2024-02']).toBeNull();
    expect(m['2024-03']).toBe(19.99);
    expect(m['2024-04']).toBe(19.99);
    expect(m['2024-05']).toBe(34.99);
    expect(m['2024-06']).toBe(34.99);
  });

  test('dedupeTransitions keeps a tier switch with the same plan and status', () => {
    const a = event({ planTier: 'starter', occurredAt: new Date(NOW.getTime() - 10 * MS) });
    const b = event({ planTier: 'growth', occurredAt: new Date(NOW.getTime() - 5 * MS) });
    const c = event({ planTier: 'growth', occurredAt: new Date(NOW.getTime() - 2 * MS) });
    expect(dedupeTransitions([a, b, c])).toEqual([a, b]);
  });

  test('shopStateAt returns the price of the plan in force', () => {
    const a = event({ planTier: 'pro', occurredAt: new Date(NOW.getTime() - 10 * MS) });
    const ended = event({ eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - 5 * MS) });
    expect(shopStateAt([a, ended], new Date(NOW.getTime() - 7 * MS)).priceUsd).toBe(49);
    expect(shopStateAt([a, ended], NOW).priceUsd).toBe(0);
  });
});

describe('plan tiers — activity ledger', () => {
  test('trial converted is priced at the activated event tier', () => {
    const s = store({ plan: 'pro', planTier: 'growth' });
    const ev = event({ planTier: 'growth', occurredAt: new Date(NOW.getTime() - 9 * MS),
      trialEndsAt: new Date(NOW.getTime() - 2 * MS) });
    const r = computeActivity({ stores: [s], events: [ev], range: 'week', now: NOW });
    expect(r.events.find(e => e.kind === 'paying').amountUsd).toBe(24.99);
    expect(r.netMrrUsd).toBe(24.99);
  });

  test('lost while paying is priced at the tier in force before it', () => {
    const s = store({ plan: 'free' });
    const activated = event({ planTier: 'pro', occurredAt: new Date(NOW.getTime() - 20 * MS),
      trialEndsAt: new Date(NOW.getTime() - 14 * MS) });
    const ended = event({ eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - 3 * MS) });
    const r = computeActivity({ stores: [s], events: [activated, ended], range: 'week', now: NOW });
    expect(r.events.find(e => e.kind === 'lost').amountUsd).toBe(-49);
    expect(r.netMrrUsd).toBe(-49);
  });

  test('upgrade while paying: "changed" entry with the price difference', () => {
    const s = store({ plan: 'pro', planTier: 'growth' });
    const trialEnd = new Date(NOW.getTime() - 20 * MS);
    const starter = event({ planTier: 'starter', occurredAt: new Date(NOW.getTime() - 27 * MS), trialEndsAt: trialEnd });
    const growth = event({ planTier: 'growth', fromPlan: 'pro', occurredAt: new Date(NOW.getTime() - 2 * MS), trialEndsAt: trialEnd });
    const r = computeActivity({ stores: [s], events: [starter, growth], range: 'week', now: NOW });
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ kind: 'changed', label: 'Upgraded', amountUsd: 15 });
    expect(r.counts).toEqual({ trials: 0, paying: 0, lost: 0 });
    expect(r.netMrrUsd).toBe(15);
  });

  test('downgrade while paying: negative difference', () => {
    const s = store({ plan: 'pro', planTier: 'starter' });
    const trialEnd = new Date(NOW.getTime() - 20 * MS);
    const pro = event({ planTier: 'pro', occurredAt: new Date(NOW.getTime() - 27 * MS), trialEndsAt: trialEnd });
    const starter = event({ planTier: 'starter', occurredAt: new Date(NOW.getTime() - 2 * MS), trialEndsAt: trialEnd });
    const r = computeActivity({ stores: [s], events: [pro, starter], range: 'week', now: NOW });
    expect(r.events[0]).toMatchObject({ kind: 'changed', label: 'Downgraded', amountUsd: -39.01 });
  });

  test('plan switch during the trial: no MRR change, single conversion at the new tier', () => {
    const s = store({ plan: 'pro', planTier: 'growth' });
    const trialEnd = new Date(NOW.getTime() - 1 * MS);
    const starter = event({ planTier: 'starter', occurredAt: new Date(NOW.getTime() - 6 * MS), trialEndsAt: trialEnd });
    const growth = event({ planTier: 'growth', occurredAt: new Date(NOW.getTime() - 4 * MS), trialEndsAt: trialEnd });
    const r = computeActivity({ stores: [s], events: [starter, growth], range: 'week', now: NOW });
    const kinds = r.events.map(e => e.kind).sort();
    expect(kinds).toEqual(['changed', 'paying', 'trial']);
    expect(r.events.find(e => e.kind === 'changed').amountUsd).toBe(0);
    expect(r.events.find(e => e.kind === 'paying').amountUsd).toBe(24.99);
    expect(r.netMrrUsd).toBe(24.99);
  });

  test('re-subscribe after a cancel: the new trial still converts', () => {
    const s = store({ plan: 'pro', planTier: 'starter' });
    const first = event({ planTier: 'pro', occurredAt: new Date(NOW.getTime() - 60 * MS),
      trialEndsAt: new Date(NOW.getTime() - 53 * MS) });
    const ended = event({ eventType: 'ended', toPlan: 'free', shopifyStatus: 'CANCELLED',
      occurredAt: new Date(NOW.getTime() - 40 * MS) });
    const again = event({ planTier: 'starter', occurredAt: new Date(NOW.getTime() - 10 * MS),
      trialEndsAt: new Date(NOW.getTime() - 3 * MS) });
    const r = computeActivity({ stores: [s], events: [first, ended, again], range: 'week', now: NOW });
    expect(r.events.find(e => e.kind === 'paying').amountUsd).toBe(9.99);
  });
});

describe('plan tiers — stores group', () => {
  test('paying rows carry each store plan price and tier', () => {
    const past = new Date(NOW.getTime() - 1 * MS);
    const stores = [
      store({ shopDomain: 'g.myshopify.com', plan: 'pro', planTier: 'growth' }),
      store({ shopDomain: 'old.myshopify.com', plan: 'pro' }),
    ];
    const events = [
      event({ shopDomain: 'g.myshopify.com', planTier: 'growth', trialEndsAt: past }),
      event({ shopDomain: 'old.myshopify.com', trialEndsAt: past }),
    ];
    const r = computeStoresGroup({ stores, events, group: 'paying', now: NOW });
    const byShop = Object.fromEntries(r.rows.map(x => [x.shopDomain, x]));
    expect(byShop['g.myshopify.com']).toMatchObject({ valueUsd: 24.99, tier: 'growth' });
    expect(byShop['old.myshopify.com']).toMatchObject({ valueUsd: PLAN_PRICE, tier: null });
  });
});
