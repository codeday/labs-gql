import { CronJob } from 'cron';
import config from '../config';
import { Context } from '../context';
import tasks, { TaskExport } from './tasks';
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

// Dispatches an activity from a given task registry, awaiting the (async) activity so that the
// caller only resolves once the work is complete and so that async rejections are caught rather
// than becoming unhandled rejections. Split out from `runActivity` so the dispatch logic can be
// exercised with a controlled task registry.
export async function dispatchActivity(
  name: string,
  context: Context,
  args: Object,
  registry: Record<string, TaskExport>,
): Promise<boolean> {
  if (name in registry) {
    DEBUG(`Running activity ${name}`);
    try {
      await registry[name].fn(context, args);
    } catch (ex) {
      DEBUG(`Error from activity ${name}:`)
      DEBUG(ex);
      return false;
    }
    DEBUG(`Activity ${name} completed.`)
    return true;
  }
  return false;
}

export async function runActivity(name: string, context: Context, args: Object): Promise<boolean> {
  return dispatchActivity(name, context, args, tasksByName);
}
