'use strict';

const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { onboardingState, setStep, completeOnboarding } = require('../utils/onboarding');

const router = express.Router();

/** GET /api/onboarding/:shopDomain -> { steps, doneCount, total, completed } */
router.get('/:shopDomain', requireAuth, requireStoreOwner, (req, res) => {
  res.json(onboardingState(req.store));
});

/** PUT /api/onboarding/:shopDomain/steps/:stepId  body { done: boolean } -> state */
router.put('/:shopDomain/steps/:stepId', requireAuth, requireStoreOwner, async (req, res) => {
  if (!req.body || typeof req.body.done !== 'boolean') {
    return res.status(400).json({ error: 'done must be true or false' });
  }
  try {
    return res.json(await setStep(req.store, String(req.params.stepId), req.body.done));
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[onboarding] step save failed:', err.message);
    return res.status(500).json({ error: 'Could not save this step' });
  }
});

/** POST /api/onboarding/:shopDomain/complete -> state (finished or skipped) */
router.post('/:shopDomain/complete', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    return res.json(await completeOnboarding(req.store));
  } catch (err) {
    console.error('[onboarding] complete failed:', err.message);
    return res.status(500).json({ error: 'Could not save' });
  }
});

module.exports = router;
