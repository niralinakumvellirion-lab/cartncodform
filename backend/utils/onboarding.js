'use strict';

const Store = require('../models/Store');

/**
 * Setup checklist shown on the merchant's first open of the app, kept per store (not per browser).
 * Steps: embed (app embed on in the theme), voice, signals, storefront (look at the prompt on the store).
 * A tick or a finished checklist only counts when it happened on or after the current install, so a
 * reinstall shows the checklist again (same rule as the plan choice in utils/plans.needsPlanChoice).
 */
const STEP_IDS = Object.freeze(['embed', 'voice', 'signals', 'storefront']);

function belongsToThisInstall(store, when) {
  if (!when) return false;
  if (!store || !store.installedAt) return true;
  return new Date(when) >= new Date(store.installedAt);
}

/** -> { steps: { embed, voice, signals, storefront }, doneCount, total, completed } */
function onboardingState(store) {
  const ob = (store && store.onboarding) || {};
  const saved = Array.isArray(ob.steps) ? ob.steps : [];
  const steps = {};
  for (const id of STEP_IDS) {
    const s = saved.find((x) => x && x.id === id);
    steps[id] = !!(s && s.done && belongsToThisInstall(store, s.doneAt));
  }
  const doneCount = STEP_IDS.filter((id) => steps[id]).length;
  return { steps, doneCount, total: STEP_IDS.length, completed: belongsToThisInstall(store, ob.completedAt) };
}

/** Tick or untick one step. Unknown step -> throws (the route answers 400). Updates `store` in place. */
async function setStep(store, id, done) {
  if (!STEP_IDS.includes(id)) {
    const err = new Error('Unknown setup step');
    err.status = 400;
    throw err;
  }
  const kept = ((store.onboarding && store.onboarding.steps) || [])
    .filter((s) => s && s.id !== id && STEP_IDS.includes(s.id))
    .map((s) => ({ id: s.id, done: !!s.done, doneAt: s.doneAt || null }));
  const steps = [...kept, { id, done: !!done, doneAt: new Date() }];
  await Store.updateOne({ shopDomain: store.shopDomain }, { $set: { 'onboarding.steps': steps } });
  store.onboarding = { ...(store.onboarding && store.onboarding.toObject ? store.onboarding.toObject() : store.onboarding || {}), steps };
  return onboardingState(store);
}

/** The merchant finished or skipped the checklist. Updates `store` in place. */
async function completeOnboarding(store, now = new Date()) {
  await Store.updateOne({ shopDomain: store.shopDomain }, { $set: { 'onboarding.completedAt': now } });
  store.onboarding = { ...(store.onboarding && store.onboarding.toObject ? store.onboarding.toObject() : store.onboarding || {}), completedAt: now };
  return onboardingState(store);
}

module.exports = { STEP_IDS, onboardingState, setStep, completeOnboarding };
