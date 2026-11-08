import { apiGet, apiSend } from '../../../lib/api';

/**
 * Setup checklist state, kept per store on the server (backend/utils/onboarding.js).
 * -> { steps: { embed, voice, signals, storefront }, doneCount, total, completed }
 */
const path = (shop) => `/api/onboarding/${encodeURIComponent(shop)}`;

export function getOnboarding(shop) {
  return apiGet(path(shop));
}

export function saveOnboardingStep(shop, stepId, done) {
  return apiSend(`${path(shop)}/steps/${encodeURIComponent(stepId)}`, 'PUT', { done: !!done });
}

export function completeOnboarding(shop) {
  return apiSend(`${path(shop)}/complete`, 'POST', {});
}
