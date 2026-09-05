const express = require('express');
const router = express.Router();
const AutomationRule = require('../models/AutomationRule');
const ScheduledJob = require('../models/ScheduledJob');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');

/**
 * GET /api/automation/:shopDomain/rules
 * List all automation rules for a store.
 */
router.get('/:shopDomain/rules', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const rules = await AutomationRule.find({ shopDomain }).sort({ createdAt: -1 });
    return res.json(rules);
  } catch (err) {
    console.error('[automation] GET rules error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

/**
 * POST /api/automation/:shopDomain/rules
 * Create a new automation rule.
 * Body: { name, trigger, steps: [{ delayMinutes, title, body, imageSource }] }
 */
router.post('/:shopDomain/rules', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const { name, trigger, steps } = req.body;

    const VALID_TRIGGERS = ['browse_abandon', 'cart_abandon', 'checkout_abandon', 'back_in_interest'];

    if (!name || !trigger || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'name, trigger, and at least one step are required' });
    }
    if (!VALID_TRIGGERS.includes(trigger)) {
      return res.status(400).json({ error: `trigger must be one of: ${VALID_TRIGGERS.join(', ')}` });
    }
    if (trigger !== 'cart_abandon') {
      return res.status(400).json({ error: 'Only cart_abandon is currently supported. Other triggers are coming soon.' });
    }

    for (const step of steps) {
      if (!step.delayMinutes || step.delayMinutes < 1) {
        return res.status(400).json({ error: 'Each step needs delayMinutes >= 1' });
      }
      if (!step.title || !step.body) {
        return res.status(400).json({ error: 'Each step needs a title and body' });
      }
    }

    const rule = await AutomationRule.create({
      shopDomain,
      name: name.trim(),
      trigger,
      steps: steps.map(s => ({
        delayMinutes: Number(s.delayMinutes),
        channel: 'push',
        title: s.title.trim(),
        body: s.body.trim(),
        imageSource: s.imageSource === 'none' ? 'none' : 'product',
      })),
      active: true,
    });

    return res.status(201).json(rule);
  } catch (err) {
    console.error('[automation] POST rule error:', err.message);
    return res.status(500).json({ error: 'Failed to create rule' });
  }
});

/**
 * PATCH /api/automation/:shopDomain/rules/:ruleId
 * Update a rule (name, steps, active status).
 */
router.patch('/:shopDomain/rules/:ruleId', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const { ruleId } = req.params;
    const { name, steps, active } = req.body;

    const rule = await AutomationRule.findOne({ _id: ruleId, shopDomain });
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    if (name !== undefined && name !== null) rule.name = name.trim();
    if (active !== undefined) {
      rule.active = !!active;
      if (!rule.active) {
        const result = await ScheduledJob.updateMany(
          { ruleId: rule._id, status: 'pending' },
          { status: 'cancelled' }
        );
        if (result.modifiedCount > 0) {
          console.log(`[automation] Cancelled ${result.modifiedCount} pending job(s) for disabled rule "${rule.name}"`);
        }
      }
    }
    if (Array.isArray(steps)) {
      if (steps.length === 0) {
        return res.status(400).json({ error: 'At least one step is required' });
      }
      for (const step of steps) {
        if (!step.delayMinutes || step.delayMinutes < 1) {
          return res.status(400).json({ error: 'Each step needs delayMinutes >= 1' });
        }
        if (!step.title || !step.body) {
          return res.status(400).json({ error: 'Each step needs a title and body' });
        }
      }
      rule.steps = steps.map(s => ({
        delayMinutes: Number(s.delayMinutes),
        channel: 'push',
        title: s.title.trim(),
        body: s.body.trim(),
        imageSource: s.imageSource === 'none' ? 'none' : 'product',
      }));
    }

    await rule.save();
    return res.json(rule);
  } catch (err) {
    console.error('[automation] PATCH rule error:', err.message);
    return res.status(500).json({ error: 'Failed to update rule' });
  }
});

/**
 * DELETE /api/automation/:shopDomain/rules/:ruleId
 */
router.delete('/:shopDomain/rules/:ruleId', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const { ruleId } = req.params;

    const result = await AutomationRule.findOneAndDelete({ _id: ruleId, shopDomain });
    if (!result) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const cancelResult = await ScheduledJob.updateMany(
      { ruleId: result._id, status: 'pending' },
      { status: 'cancelled' }
    );
    if (cancelResult.modifiedCount > 0) {
      console.log(`[automation] Cancelled ${cancelResult.modifiedCount} pending job(s) for deleted rule "${result.name}"`);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[automation] DELETE rule error:', err.message);
    return res.status(500).json({ error: 'Failed to delete rule' });
  }
});

module.exports = router;
