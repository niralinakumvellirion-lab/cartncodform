/**
 * Unit tests for backend/services/profileService.js -> upsertProfile.
 *
 * The Profile mongoose model is replaced with a small in-memory fake that
 * implements exactly the subset of the query/update API the service uses
 * (find / create / findOneAndUpdate / deleteMany / countDocuments, with
 * $set / $inc / $addToSet + $each and dot-notation paths).
 */

jest.mock('../models/Profile', () => {
  let store = [];
  let idc = 1;

  const clone = (o) => JSON.parse(JSON.stringify(o));

  const getPath = (doc, path) =>
    path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);

  const setPath = (doc, path, val) => {
    const keys = path.split('.');
    let o = doc;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = val;
  };

  const matchesClause = (doc, clause) => {
    const [path, val] = Object.entries(clause)[0];
    const cur = getPath(doc, path);
    return Array.isArray(cur) ? cur.includes(val) : cur === val;
  };

  const Profile = {
    __store: () => store,
    __reset: () => {
      store = [];
      idc = 1;
    },

    find: jest.fn(async (query) =>
      store
        .filter((d) => d.shopDomain === query.shopDomain)
        .filter((d) => !query.$or || query.$or.some((c) => matchesClause(d, c)))
        .map(clone)
    ),

    create: jest.fn(async (seed) => {
      const doc = {
        _id: 'p' + idc++,
        shopDomain: seed.shopDomain,
        identifiers: {
          customerId: seed.identifiers?.customerId ?? null,
          emails: seed.identifiers?.emails ?? [],
          phones: seed.identifiers?.phones ?? [],
          sessionIds: seed.identifiers?.sessionIds ?? [],
          cartTokens: seed.identifiers?.cartTokens ?? [],
          pushTokens: seed.identifiers?.pushTokens ?? [],
        },
        channels: { push: {}, email: {} },
        stage: 'anonymous',
        interests: {},
        activeHours: [],
        orders: { count: 0, ltv: 0, lastOrderAt: null, codCount: 0, prepaidCount: 0 },
        messages: seed.messages ? clone(seed.messages) : [],
        suppressed: false,
        lastSeenAt: null,
        createdAt: seed.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.push(doc);
      return clone(doc);
    }),

    findOneAndUpdate: jest.fn(async (filter, update) => {
      const doc = store.find(
        (d) => d._id === filter._id && d.shopDomain === filter.shopDomain
      );
      if (!doc) return null;
      if (update.$set) {
        for (const [p, v] of Object.entries(update.$set)) setPath(doc, p, v);
      }
      if (update.$inc) {
        for (const [p, v] of Object.entries(update.$inc)) {
          setPath(doc, p, (getPath(doc, p) || 0) + v);
        }
      }
      if (update.$addToSet) {
        for (const [p, v] of Object.entries(update.$addToSet)) {
          const arr = getPath(doc, p) || [];
          const vals = v && v.$each ? v.$each : [v];
          for (const x of vals) if (!arr.includes(x)) arr.push(x);
          setPath(doc, p, arr);
        }
      }
      return clone(doc);
    }),

    deleteMany: jest.fn(async (filter) => {
      const ids = filter._id?.$in || [];
      const before = store.length;
      store = store.filter((d) => !ids.includes(d._id));
      return { deletedCount: before - store.length };
    }),

    countDocuments: jest.fn(async () => store.length),
  };

  return Profile;
});

const Profile = require('../models/Profile');
const { upsertProfile } = require('../services/profileService');

const SHOP = 'demo.myshopify.com';

function seedProfile(over = {}) {
  const store = Profile.__store();
  const doc = {
    _id: over._id || 'seed' + (store.length + 1),
    shopDomain: over.shopDomain || SHOP,
    identifiers: {
      customerId: null,
      emails: [],
      phones: [],
      sessionIds: [],
      cartTokens: [],
      pushTokens: [],
      ...(over.identifiers || {}),
    },
    channels: { push: {}, email: {} },
    stage: over.stage || 'anonymous',
    interests: {},
    activeHours: [],
    orders: {
      count: 0,
      ltv: 0,
      lastOrderAt: null,
      codCount: 0,
      prepaidCount: 0,
      ...(over.orders || {}),
    },
    messages: over.messages || [],
    suppressed: false,
    lastSeenAt: null,
    createdAt: over.createdAt || new Date('2026-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.push(doc);
  return doc;
}

const msgs = (n, offsetDays = 0) =>
  Array.from({ length: n }, (_, i) => ({
    channel: 'push',
    type: 'cart_abandon',
    sentAt: new Date(2026, 0, offsetDays + i + 1).toISOString(),
    outcome: 'sent',
  }));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  Profile.__reset();
  jest.clearAllMocks();
});

describe('upsertProfile — creation', () => {
  test('1. creates a new profile when no match exists', async () => {
    const result = await upsertProfile(SHOP, { cartToken: 'c1' }, { lastSeenAt: new Date() });

    expect(result).toBeTruthy();
    expect(Profile.__store()).toHaveLength(1);
    expect(result.identifiers.cartTokens).toContain('c1');
    expect(Profile.create).toHaveBeenCalledTimes(1);
  });

  test('no-op (returns null) when no usable identifier is supplied', async () => {
    const result = await upsertProfile(SHOP, { email: null, phone: '' }, {});
    expect(result).toBeNull();
    expect(Profile.find).not.toHaveBeenCalled();
    expect(Profile.create).not.toHaveBeenCalled();
  });
});

describe('upsertProfile — single match', () => {
  test('2. returns the existing profile when cartToken matches', async () => {
    const p = seedProfile({ identifiers: { cartTokens: ['c1'] } });

    const result = await upsertProfile(SHOP, { cartToken: 'c1' }, {});

    expect(result._id).toBe(p._id);
    expect(Profile.__store()).toHaveLength(1);
    expect(Profile.create).not.toHaveBeenCalled();
  });

  test('3. returns the existing profile when email matches (case-insensitive)', async () => {
    const p = seedProfile({ identifiers: { emails: ['a@b.com'] } });

    const result = await upsertProfile(SHOP, { email: 'A@B.com' }, {});

    expect(result._id).toBe(p._id);
    expect(Profile.__store()).toHaveLength(1);
    expect(result.identifiers.emails).toEqual(['a@b.com']);
  });
});

describe('upsertProfile — merge', () => {
  test('4. merges two profiles when identifiers overlap; lower-priority is deleted', async () => {
    const p1 = seedProfile({ _id: 'P1', identifiers: { cartTokens: ['c1'] } });
    seedProfile({ _id: 'P2', identifiers: { pushTokens: ['t1'] } });

    const result = await upsertProfile(SHOP, { cartToken: 'c1', pushToken: 't1' }, {});

    expect(Profile.__store()).toHaveLength(1);
    expect(result._id).toBe(p1._id); // cartToken outranks pushToken
    expect(result.identifiers.cartTokens).toContain('c1');
    expect(result.identifiers.pushTokens).toContain('t1');
  });

  test('5. customerId takes priority over email during merge', async () => {
    seedProfile({ _id: 'P_EMAIL', identifiers: { emails: ['x@y.com'] } });
    const pCust = seedProfile({ _id: 'P_CUST', identifiers: { customerId: 'cust1' } });

    const result = await upsertProfile(
      SHOP,
      { email: 'x@y.com', customerId: 'cust1' },
      {}
    );

    expect(Profile.__store()).toHaveLength(1);
    expect(result._id).toBe(pCust._id);
    expect(result.identifiers.emails).toContain('x@y.com');
    expect(result.identifiers.customerId).toBe('cust1');
  });

  test('10. messages[] is capped at 20 (most recent first) after merge', async () => {
    seedProfile({ _id: 'M1', identifiers: { cartTokens: ['x'] }, messages: msgs(15, 0) });
    seedProfile({ _id: 'M2', identifiers: { pushTokens: ['t'] }, messages: msgs(10, 40) });

    const result = await upsertProfile(SHOP, { cartToken: 'x', pushToken: 't' }, {});

    expect(result.messages).toHaveLength(20);
    const times = result.messages.map((m) => new Date(m.sentAt).getTime());
    const sortedDesc = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sortedDesc);
  });
});

describe('upsertProfile — stage derivation', () => {
  test('6. stage = "customer" when customerId is present', async () => {
    const result = await upsertProfile(SHOP, { customerId: 'c99' }, {});
    expect(result.stage).toBe('customer');
  });

  test('7. stage = "identified" when email present and no customerId', async () => {
    const result = await upsertProfile(SHOP, { email: 'e@e.com' }, {});
    expect(result.stage).toBe('identified');
  });

  test('8. stage = "anonymous" when only a pushToken is present', async () => {
    const result = await upsertProfile(SHOP, { pushToken: 'tk' }, {});
    expect(result.stage).toBe('anonymous');
  });

  test('9. never downgrades stage — "customer" stays "customer" after merge', async () => {
    seedProfile({
      _id: 'C1',
      stage: 'customer',
      identifiers: { customerId: 'c1', cartTokens: ['x'] },
    });
    seedProfile({ _id: 'A1', stage: 'anonymous', identifiers: { pushTokens: ['t'] } });

    // Note: customerId is NOT passed on this call.
    const result = await upsertProfile(SHOP, { cartToken: 'x', pushToken: 't' }, {});

    expect(Profile.__store()).toHaveLength(1);
    expect(result.stage).toBe('customer');
  });

  test('orders.count > 0 also yields stage "customer"', async () => {
    seedProfile({ _id: 'O1', identifiers: { phones: ['+9199'] }, orders: { count: 2 } });
    const result = await upsertProfile(SHOP, { phone: '+9199' }, { lastSeenAt: new Date() });
    expect(result.stage).toBe('customer');
  });
});

describe('upsertProfile — updates param', () => {
  test('applies $inc operators and dot-notation $set together', async () => {
    seedProfile({ _id: 'U1', identifiers: { customerId: 'cX' }, orders: { count: 1, ltv: 100 } });

    const result = await upsertProfile(
      SHOP,
      { customerId: 'cX' },
      { $inc: { 'orders.count': 1, 'orders.ltv': 250 }, 'orders.lastOrderAt': new Date().toISOString() }
    );

    expect(result.orders.count).toBe(2);
    expect(result.orders.ltv).toBe(350);
    expect(result.orders.lastOrderAt).toBeTruthy();
  });
});
