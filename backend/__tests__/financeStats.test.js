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
    // trialEnd = planUpdatedAt + TRIAL_DAYS. If 2 days ago + 7 days > now → trial
    const r = computeSummary({ stores: [s], events: [], now: NOW });
    expect(r.counts.trial + r.counts.paying).toBe(1);
    // 2 days into a 7-day trial → still in trial
    expect(r.counts.trial).toBe(1);
  });

  test('Pro store with no events, planUpdatedAt old enough → paying (approx)', () => {
    const planUpdatedAt = new Date(NOW.getTime() - 10 * MS);
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
    const approxSince = new Date(NOW.getTime() - 10 * MS); // trial long expired
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
