import { CronJob } from 'cron';
import config from '../config';
import { Context } from '../context';
import tasks from './tasks';
import { makeDebug } from "../utils";

const DEBUG = makeDebug('activities');

const tasksByName = Object.fromEntries(
  tasks.map(t => [t.name, t])
);

export function getActivities() {
  return tasks.map(t => t.name);
}

export function getActivitySchema(name: string): object | null {
  return tasksByName[name]?.schema || null;
}

export async function runActivity(name: string, context: Context, args: Object): Promise<boolean> {
  if (name in tasksByName) {
    DEBUG(`Running activity ${name}`);
    try {
      await tasksByName[name].fn(context, args);
    } catch (ex) {
      DEBUG(`Error from activity ${name}:`)
      DEBUG(ex);
      throw ex;
    }
    DEBUG(`Activity ${name} completed.`)
    return true;
  }
  return false;
} 
