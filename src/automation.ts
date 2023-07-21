import { CronJob } from 'cron';
import { sendEmails } from './email';
import { syncElastic } from './search';
import config from './config';
import { syncSlack } from './slack';
import { syncStandupAndProsper, syncStandupAndProsperStandups } from './standupAndProsper';
import { scoreStandups, syncAiPendingModels, syncAiTraining } from './openai';
import { updateActiveEvents } from './utils';
import e from 'express';

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

export const jobs = Object.fromEntries(
  [
    { spec: '0 3 * * *', fn: updateActiveEvents },
    { spec: '*/5 * * * *', fn: sendEmails, dis: config.email.disable },
    { spec: '* * * * *', fn: syncElastic, dis: config.elastic.disable },
    { spec: '0 * * * *', fn: syncSlack, dis: config.slack.disable },
    { spec: '5 * * * *', fn: syncStandupAndProsperStandups, dis: config.standupAndProsper.disable },
    { spec: '10 * * * *', fn: syncStandupAndProsper, dis: config.standupAndProsper.disable },
    { spec: '20 * * * *', fn: scoreStandups, dis: config.openAi.disable },
    { spec: '20 6 * * *', fn: syncAiTraining, dis: config.openAi.disable },
    { spec: '30 * * * *', fn: syncAiPendingModels, dis: config.openAi.disable },
  ].map(e => [e.fn.name, e])
);

export async function startAutomation() {
  if (config.secondaryRegion) {
    console.log(`Cronjob disabled -- app is running in a secondary region`);
  }

  Object.values(jobs)
    .filter(({ dis }) => typeof dis === 'undefined' || !dis)
    .forEach(({ spec, fn }) => new CronJob(spec, tryCrontab(fn), null, true));
}

export function runJob(name: string): boolean | Promise<any> {
  if (name in jobs) {
    return jobs[name].fn();
  }
  return false;
} 
