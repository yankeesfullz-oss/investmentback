const cron = require('node-cron');

const env = require('../config/env');
const { runAutomaticPayouts } = require('../services/payout.service');

let scheduledTask = null;

async function executeAutomaticPayoutRun(options = {}) {
  const summary = await runAutomaticPayouts(options);
  console.log('[automatic-payouts] run complete', summary);
  return summary;
}

function startAutomaticPayoutJob() {
  if (!env.autoPayoutsEnabled) {
    console.log('[automatic-payouts] disabled');
    return null;
  }

  if (scheduledTask) {
    return scheduledTask;
  }

  scheduledTask = cron.schedule(
    env.autoPayoutsCron,
    async () => {
      try {
        await executeAutomaticPayoutRun({ targetDate: new Date(), catchUp: true });
      } catch (error) {
        console.error('[automatic-payouts] scheduled run failed', error);
      }
    },
    {
      timezone: env.autoPayoutsTimezone,
    }
  );

  console.log(`[automatic-payouts] scheduled with cron "${env.autoPayoutsCron}" in ${env.autoPayoutsTimezone}`);

  if (env.autoPayoutsCatchUpOnStart) {
    void executeAutomaticPayoutRun({ targetDate: new Date(), catchUp: true }).catch((error) => {
      console.error('[automatic-payouts] startup catch-up failed', error);
    });
  }

  return scheduledTask;
}

module.exports = {
  executeAutomaticPayoutRun,
  startAutomaticPayoutJob,
};