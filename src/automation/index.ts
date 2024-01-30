import { CronJob } from 'cron';
import config from '../config';
import tasks from './tasks';
import { makeDebug } from "../utils";

const DEBUG = makeDebug('automation');

const tasksByName = Object.fromEntries(
  tasks.map(t => [t.name, t])
);

export function getAutomations() {
  return tasks.map(t => t.name);
}

function tryCrontab(fn: Function) {
  return async () => {
    DEBUG(`Automation ${fn.name} starting.`);
    try {
      await fn();
    } catch (ex) {
      DEBUG(`Error from crontab ${fn.name}:`)
      DEBUG(ex);
    }
    DEBUG(`Crontab ${fn.name} exited.`);
  }
}

export async function startAutomation() {
  if (config.secondaryRegion) {
    DEBUG(`Running in secondary region ${process.env.FLY_REGION}, disabling automation.`);
    return;
  }

  tasks
    .filter(t => t.spec)
    .forEach(({ spec, fn, name }) => {
      DEBUG(`Registered task ${name} for ${spec}.`);
      new CronJob(spec!, tryCrontab(fn), null, true)
    })
}

export function runJob(name: string): boolean {
  if (name in tasksByName) {
    DEBUG(`Running oneshot job ${name}`);
    tasksByName[name].fn();
    DEBUG(`Job ${name} completed.`)
    return true;
  }
  return false;
} 
