const Profile = require('../models/Profile');

/**
 * Identity resolution + profile upsert.
 *
 *   upsertProfile(shopDomain, identifiers, updates = {})
 *
 * `identifiers` may contain any subset of:
 *   { customerId, email, phone, sessionId, cartToken, pushToken }
 *   - sessionId  -> stored in identifiers.sessionIds (ccfSessionId, a stable UUID)
 *   - cartToken  -> stored in identifiers.cartTokens
 *   - pushToken  -> stored in identifiers.pushTokens (FCM token)
 *
 * `updates` may mix:
 *   - plain dot-notation fields   -> applied via $set   (e.g. 'lastSeenAt', 'channels.push.subscribed')
 *   - MongoDB update operators    -> merged at top level (e.g. { $inc: { 'orders.count': 1 } })
 *
 * Merge priority (highest first): customerId -> email -> phone -> cartToken -> sessionId -> pushToken
 *
 * Fire-and-forget from every ingest path. Never logs PII — only profileId + shopDomain.
 *
 * @returns {Promise<Profile|null>} the resolved profile, or null if no usable identifier was supplied.
 */

// Priority order + the array field each identifier maps to.
const PRIORITY = ['customerId', 'email', 'phone', 'cartToken', 'sessionId', 'pushToken'];
const ARRAY_FIELD = {
  email: 'emails',
  phone: 'phones',
  cartToken: 'cartTokens',
  sessionId: 'sessionIds',
  pushToken: 'pushTokens',
};

function cleanIdentifiers(identifiers = {}) {
  const out = {};
  for (const key of PRIORITY) {
    let val = identifiers[key];
    if (val == null) continue;
    val = String(val).trim();
    if (!val) continue;
    if (key === 'email') val = val.toLowerCase();
    out[key] = val;
  }
  return out;
}

// Split the `updates` param into a $set object and a bag of other operators.
function splitUpdates(updates = {}) {
  const set = {};
  const operators = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key.startsWith('$')) {
      operators[key] = { ...(operators[key] || {}), ...value };
    } else if (value !== undefined) {
      set[key] = value;
    }
  }
  return { set, operators };
}

// Build the $or clause (+ shopDomain) that finds every profile any provided
// identifier already points at.
function buildQuery(shopDomain, ids) {
  const or = [];
  for (const [key, val] of Object.entries(ids)) {
    if (key === 'customerId') {
      or.push({ 'identifiers.customerId': val });
    } else {
      or.push({ [`identifiers.${ARRAY_FIELD[key]}`]: val });
    }
  }
  return { shopDomain, $or: or };
}

// Rank a profile by the highest-priority identifier it already contains.
// Lower number = higher priority. PRIORITY.length = matches nothing.
function matchRank(profile, ids) {
  const pid = profile.identifiers || {};
  for (let i = 0; i < PRIORITY.length; i++) {
    const key = PRIORITY[i];
    const val = ids[key];
    if (!val) continue;
    if (key === 'customerId') {
      if (pid.customerId && pid.customerId === val) return i;
    } else {
      const arr = pid[ARRAY_FIELD[key]] || [];
      if (arr.includes(val)) return i;
    }
  }
  return PRIORITY.length;
}

// Derive stage from identity + order history, never downgrading.
const STAGE_RANK = { anonymous: 0, identified: 1, lapsed: 2, customer: 3 };
function nextStage(profile) {
  const pid = profile.identifiers || {};
  const hasCustomer = Boolean(pid.customerId) || (profile.orders && profile.orders.count > 0);
  const hasContact = (pid.emails && pid.emails.length > 0) || (pid.phones && pid.phones.length > 0);

  let candidate = 'anonymous';
  if (hasCustomer) candidate = 'customer';
  else if (hasContact) candidate = 'identified';

  const current = profile.stage || 'anonymous';
  return STAGE_RANK[candidate] > STAGE_RANK[current] ? candidate : current;
}

// Keep only the 20 most recent messages, newest first.
function capMessages(messages) {
  const list = Array.isArray(messages) ? messages.slice() : [];
  list.sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
  return list.slice(0, 20);
}

// $addToSet payload that adds every provided identifier value to its array.
function addToSetForIds(ids) {
  const add = {};
  for (const [key, val] of Object.entries(ids)) {
    if (key === 'customerId') continue; // scalar, handled separately
    add[`identifiers.${ARRAY_FIELD[key]}`] = val;
  }
  return add;
}

// Apply identifiers + updates to one existing profile, then fix up stage +
// messages cap in a second lightweight write. Returns the final doc.
async function applyToProfile(profileId, shopDomain, ids, updates, existingCustomerId) {
  const { set, operators } = splitUpdates(updates);

  const update = { ...operators };
  update.$set = { ...(operators.$set || {}), ...set, updatedAt: new Date() };

  // customerId is a scalar — only set it if the profile doesn't already have one.
  if (ids.customerId && !existingCustomerId) {
    update.$set['identifiers.customerId'] = ids.customerId;
  }

  const addToSet = addToSetForIds(ids);
  if (Object.keys(addToSet).length > 0) {
    update.$addToSet = { ...(operators.$addToSet || {}), ...addToSet };
  }

  let doc = await Profile.findOneAndUpdate({ _id: profileId, shopDomain }, update, { new: true });
  if (!doc) return null;

  const stage = nextStage(doc);
  const capped = capMessages(doc.messages);
  const needsMessageCap = Array.isArray(doc.messages) && doc.messages.length > capped.length;

  if (stage !== doc.stage || needsMessageCap) {
    doc = await Profile.findOneAndUpdate(
      { _id: profileId, shopDomain },
      { $set: { stage, messages: capped, updatedAt: new Date() } },
      { new: true }
    );
  }
  return doc;
}

async function upsertProfile(shopDomain, identifiers = {}, updates = {}) {
  try {
    const shop = String(shopDomain || '').trim().toLowerCase();
    const ids = cleanIdentifiers(identifiers);

    if (!shop || Object.keys(ids).length === 0) {
      // Nothing to resolve on — silently no-op (no PII, no id to log).
      return null;
    }

    const matches = await Profile.find(buildQuery(shop, ids));

    // ---- 0 matches: create fresh, then apply updates ----
    if (matches.length === 0) {
      const seed = { shopDomain: shop, identifiers: {} };
      if (ids.customerId) seed.identifiers.customerId = ids.customerId;
      for (const [key, val] of Object.entries(ids)) {
        if (key === 'customerId') continue;
        seed.identifiers[ARRAY_FIELD[key]] = [val];
      }
      const created = await Profile.create(seed);
      const result = await applyToProfile(created._id, shop, ids, updates, ids.customerId || null);
      console.log(`[profile] created ${result?._id} for ${shop}`);
      return result;
    }

    // ---- 1 match: add new identifiers + apply updates ----
    if (matches.length === 1) {
      const p = matches[0];
      const result = await applyToProfile(
        p._id,
        shop,
        ids,
        updates,
        p.identifiers && p.identifiers.customerId
      );
      return result;
    }

    // ---- multiple matches: merge into the highest-priority profile ----
    const ranked = matches
      .map((p) => ({ p, rank: matchRank(p, ids) }))
      .sort((a, b) => a.rank - b.rank || new Date(a.p.createdAt || 0) - new Date(b.p.createdAt || 0));

    const winner = ranked[0].p;
    const losers = ranked.slice(1).map((r) => r.p);

    // Collect identifier values from every loser.
    const mergedArrays = { emails: [], phones: [], sessionIds: [], cartTokens: [], pushTokens: [] };
    let mergedCustomerId = (winner.identifiers && winner.identifiers.customerId) || null;
    let mergedMessages = Array.isArray(winner.messages) ? winner.messages.slice() : [];

    for (const loser of losers) {
      const lid = loser.identifiers || {};
      for (const arrKey of Object.keys(mergedArrays)) {
        if (Array.isArray(lid[arrKey])) mergedArrays[arrKey].push(...lid[arrKey]);
      }
      if (!mergedCustomerId && lid.customerId) mergedCustomerId = lid.customerId;
      if (Array.isArray(loser.messages)) mergedMessages.push(...loser.messages);
    }

    const mergeUpdate = { $addToSet: {}, $set: { updatedAt: new Date() } };
    for (const [arrKey, vals] of Object.entries(mergedArrays)) {
      if (vals.length > 0) mergeUpdate.$addToSet[`identifiers.${arrKey}`] = { $each: vals };
    }
    if (mergedCustomerId && !(winner.identifiers && winner.identifiers.customerId)) {
      mergeUpdate.$set['identifiers.customerId'] = mergedCustomerId;
    }
    mergeUpdate.$set.messages = capMessages(mergedMessages);
    if (Object.keys(mergeUpdate.$addToSet).length === 0) delete mergeUpdate.$addToSet;

    await Profile.findOneAndUpdate({ _id: winner._id, shopDomain: shop }, mergeUpdate);
    await Profile.deleteMany({ _id: { $in: losers.map((l) => l._id) } });
    console.log(`[profile] merged ${losers.length} profile(s) into ${winner._id} for ${shop}`);

    // Re-apply this call's own identifiers + updates onto the winner.
    const result = await applyToProfile(
      winner._id,
      shop,
      ids,
      updates,
      mergedCustomerId
    );
    return result;
  } catch (err) {
    console.error('[profile] upsertProfile error:', err.message);
    return null;
  }
}

module.exports = { upsertProfile };
