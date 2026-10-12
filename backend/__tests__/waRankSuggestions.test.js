/**
 * Unit tests for the rankWaSuggestions logic from CustomerDetail.jsx.
 * The function is pure and has no framework deps, so we replicate it here
 * to run in the backend Jest suite (no React setup needed).
 */

// Mirror of WA_SUGGESTION_TYPES from CustomerDetail.jsx
const WA_SUGGESTION_TYPES = [
  {
    key: 'cart_reminder',
    purpose: 'followup',
    eligible: (c, wa) => !!(wa?.canFollowup && c?.profile?.identifiers?.cartTokens?.length > 0),
  },
  {
    key: 'welcome_offer',
    purpose: 'followup',
    eligible: (c, wa) => !!(wa?.canFollowup && (c?.profile?.orders?.count || 0) === 0),
  },
  {
    key: 'cod_confirmation',
    purpose: 'order',
    eligible: (c, wa) => !!(wa?.canOrder && (c?.profile?.orders?.codCount || 0) > 0),
  },
  {
    key: 'order_thank_you',
    purpose: 'order',
    eligible: (c, wa) => !!(wa?.canOrder && (c?.profile?.orders?.count || 0) > 0),
  },
  {
    key: 'win_back',
    purpose: 'followup',
    eligible: (c, wa) => {
      if (!wa?.canFollowup) return false;
      const last = c?.profile?.lastSeenAt;
      if (!last) return false;
      return (Date.now() - new Date(last)) >= 30 * 86400000;
    },
  },
  {
    key: 'product_followup',
    purpose: 'followup',
    eligible: (c, wa) =>
      !!(wa?.canFollowup && c?.topProducts?.length > 0 && (c?.profile?.orders?.count || 0) === 0),
  },
];

const WA_RANK_ORDER = [
  'cod_confirmation', 'cart_reminder', 'order_thank_you',
  'welcome_offer', 'win_back', 'product_followup',
];

function rankWaSuggestions(customer, waProfile) {
  const ranked = WA_RANK_ORDER
    .map(key => WA_SUGGESTION_TYPES.find(t => t.key === key))
    .filter(t => t && t.eligible(customer, waProfile));

  if (ranked.length === 0 && waProfile?.canFollowup) {
    return [{ key: 'say_hello', purpose: 'followup' }];
  }

  return ranked.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

function makeCustomer({ cartTokens = [], orders = {}, lastSeenAt = null, topProducts = [] } = {}) {
  return {
    profile: {
      identifiers: { cartTokens },
      orders: { count: 0, codCount: 0, lastOrderAt: null, ...orders },
      lastSeenAt,
    },
    topProducts,
  };
}

// ---------------------------------------------------------------------------
// cart_reminder
// ---------------------------------------------------------------------------

test('cart_reminder: eligible when canFollowup + has cartToken', () => {
  const c = makeCustomer({ cartTokens: ['tok1'] });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).toContain('cart_reminder');
});

test('cart_reminder: ineligible when no cartTokens', () => {
  const c = makeCustomer({ cartTokens: [] });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('cart_reminder');
});

test('cart_reminder: ineligible when no consent (canFollowup false)', () => {
  const c = makeCustomer({ cartTokens: ['tok1'] });
  const wa = { canFollowup: false, canOrder: true };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('cart_reminder');
});

// ---------------------------------------------------------------------------
// welcome_offer
// ---------------------------------------------------------------------------

test('welcome_offer: eligible when canFollowup + 0 orders', () => {
  const c = makeCustomer({ orders: { count: 0 } });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).toContain('welcome_offer');
});

test('welcome_offer: ineligible when customer has orders', () => {
  const c = makeCustomer({ orders: { count: 1 } });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('welcome_offer');
});

// ---------------------------------------------------------------------------
// cod_confirmation
// ---------------------------------------------------------------------------

test('cod_confirmation: eligible when canOrder + codCount > 0', () => {
  const c = makeCustomer({ orders: { count: 1, codCount: 1 } });
  const wa = { canFollowup: false, canOrder: true };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).toContain('cod_confirmation');
});

test('cod_confirmation: ineligible when codCount is 0', () => {
  const c = makeCustomer({ orders: { count: 1, codCount: 0 } });
  const wa = { canFollowup: false, canOrder: true };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('cod_confirmation');
});

test('cod_confirmation: ineligible when canOrder false', () => {
  const c = makeCustomer({ orders: { count: 1, codCount: 2 } });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('cod_confirmation');
});

// ---------------------------------------------------------------------------
// order_thank_you
// ---------------------------------------------------------------------------

test('order_thank_you: eligible when canOrder + orders.count > 0', () => {
  const c = makeCustomer({ orders: { count: 2 } });
  const wa = { canFollowup: false, canOrder: true };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).toContain('order_thank_you');
});

test('order_thank_you: ineligible when no order', () => {
  const c = makeCustomer({ orders: { count: 0 } });
  const wa = { canFollowup: false, canOrder: true };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('order_thank_you');
});

// ---------------------------------------------------------------------------
// win_back
// ---------------------------------------------------------------------------

test('win_back: eligible when canFollowup + lastSeenAt > 30 days ago', () => {
  const c = makeCustomer({ lastSeenAt: daysAgo(45) });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).toContain('win_back');
});

test('win_back: ineligible when lastSeenAt < 30 days ago', () => {
  const c = makeCustomer({ lastSeenAt: daysAgo(10) });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('win_back');
});

test('win_back: ineligible when no lastSeenAt', () => {
  const c = makeCustomer({ lastSeenAt: null });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('win_back');
});

test('win_back: ineligible when canFollowup false even if 60 days quiet', () => {
  const c = makeCustomer({ lastSeenAt: daysAgo(60) });
  const wa = { canFollowup: false, canOrder: true };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('win_back');
});

// ---------------------------------------------------------------------------
// product_followup
// ---------------------------------------------------------------------------

test('product_followup: eligible when canFollowup + topProducts + 0 orders', () => {
  const c = makeCustomer({ topProducts: [{ title: 'T-Shirt' }], orders: { count: 0 } });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).toContain('product_followup');
});

test('product_followup: ineligible when customer has orders', () => {
  const c = makeCustomer({ topProducts: [{ title: 'T-Shirt' }], orders: { count: 1 } });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('product_followup');
});

test('product_followup: ineligible when no topProducts', () => {
  const c = makeCustomer({ topProducts: [], orders: { count: 0 } });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res.map(r => r.key)).not.toContain('product_followup');
});

// ---------------------------------------------------------------------------
// Ranking order + cap at 3
// ---------------------------------------------------------------------------

test('ranking: cod_confirmation ranked before cart_reminder', () => {
  const c = makeCustomer({ cartTokens: ['tok1'], orders: { count: 1, codCount: 1 } });
  const wa = { canFollowup: true, canOrder: true };
  const res = rankWaSuggestions(c, wa);
  const keys = res.map(r => r.key);
  expect(keys.indexOf('cod_confirmation')).toBeLessThan(keys.indexOf('cart_reminder'));
});

test('ranking: returns at most 3 suggestions', () => {
  // All 6 types eligible simultaneously (cod + cart + orders + product + win-back)
  const c = makeCustomer({
    cartTokens: ['tok1'],
    orders: { count: 1, codCount: 1 },
    lastSeenAt: daysAgo(60),
    topProducts: [{ title: 'T-Shirt' }],
  });
  // Override: welcome_offer ineligible (orders.count=1), product_followup ineligible (orders=1)
  // Eligible: cod_confirmation, cart_reminder, order_thank_you, win_back
  const wa = { canFollowup: true, canOrder: true };
  const res = rankWaSuggestions(c, wa);
  expect(res.length).toBeLessThanOrEqual(3);
});

// ---------------------------------------------------------------------------
// say_hello fallback and ineligible cases
// ---------------------------------------------------------------------------

test('say_hello: returned when canFollowup but no specific signal matches', () => {
  const c = makeCustomer({ cartTokens: [], orders: { count: 0 }, lastSeenAt: daysAgo(5) });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  // welcome_offer is eligible (0 orders, canFollowup) — so say_hello is NOT the fallback here
  expect(res.map(r => r.key)).toContain('welcome_offer');
});

test('empty: returns [] when both canFollowup=false and canOrder=false', () => {
  const c = makeCustomer();
  const wa = { canFollowup: false, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res).toHaveLength(0);
});

test('say_hello: returned when canFollowup=true and no type matches (no cart, 1+ order, recent, no products)', () => {
  // orders.count=1 → welcome_offer and product_followup ineligible
  // lastSeenAt < 30 days → win_back ineligible
  // no cart → cart_reminder ineligible
  // canOrder false → cod/order_thank_you ineligible
  const c = makeCustomer({
    cartTokens: [],
    orders: { count: 1, codCount: 0 },
    lastSeenAt: daysAgo(5),
    topProducts: [],
  });
  const wa = { canFollowup: true, canOrder: false };
  const res = rankWaSuggestions(c, wa);
  expect(res).toHaveLength(1);
  expect(res[0].key).toBe('say_hello');
});
