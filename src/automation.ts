import { CronJob } from 'cron';
import { sendEmails } from './email';
import { syncElastic } from './search';
import config from './config';
import { syncSlack } from './slack';
import { syncStandupAndProsper, syncStandupAndProsperStandups } from './standupAndProsper';
import { updateActiveEvents } from './utils';

function tryCrontab(fn: () => Promise<any> | any) {
  return async () => {
    console.log(`Crontab ${fn.name} starting.`);
    try {
      await fn();
    } catch (ex) {
      console.error(`Error from crontab ${fn.name}:`)
      console.error(ex);
    }
    console.log(`Crontab ${fn.name} exited.`);
  }
}

export async function startAutomation() {
  if (config.secondaryRegion) {
    console.log(`Cronjob disabled -- app is running in a secondary region`);
  }

  const jobs = [
    { spec: '0 3 * * *', fn: updateActiveEvents },
    { spec: '*/5 * * * *', fn: sendEmails, dis: config.email.disable },
    { spec: '* * * * *', fn: syncElastic, dis: config.elastic.disable },
    { spec: '0 * * * *', fn: syncSlack, dis: config.slack.disable },
    { spec: '30 * * * *', fn: syncStandupAndProsperStandups, dis: config.standupAndProsper.disable },
    { spec: '45 * * * *', fn: syncStandupAndProsper, dis: config.standupAndProsper.disable },
  ];

  const enabledJobs = jobs
    .filter(({ dis }) => typeof dis === 'undefined' || !dis);

  // Run all jobs once at start, in order.
  for (const { fn } of enabledJobs) {
    await tryCrontab(fn)();
  }

  // Schedule all jobs to keep running.
  jobs.forEach(({ spec, fn }) => new CronJob(spec, tryCrontab(fn)));
}
