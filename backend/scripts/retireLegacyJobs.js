require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    const ScheduledJob = require('../models/ScheduledJob');

    // Cancel all pending jobs that have a ruleId (legacy AutomationRule jobs).
    // Brain jobs have ruleId = null.
    const result = await ScheduledJob.updateMany(
      { status: 'pending', ruleId: { $type: 'objectId' } },
      { status: 'cancelled', reason: 'legacy_retired' }
    );

    console.log(`[retire] Cancelled ${result.modifiedCount} legacy pending jobs`);

    // Count remaining brain jobs.
    const brainJobs = await ScheduledJob.countDocuments({
      status: 'pending',
      ruleId: null,
      profileId: { $ne: null },
    });
    console.log(`[retire] Brain jobs still pending: ${brainJobs}`);

    await mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error('[retire] Error:', err.message);
    process.exit(1);
  });
