/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import fs from 'fs';
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('activities:tasks');

type TaskImport = { default: Function };
export type TaskExport = { name: string, fn: Function }

const allTasks = <TaskExport[]>fs.readdirSync(__dirname)
  .filter(n => !['index.ts', 'index.js'].includes(n))
  .map(n => {
    const f = require(`./${n}`) as TaskImport;
    if (!f.default) throw new Error(`Task ${n} does not include a default export.`);
    return {
      name: n.replace(/\.(ts|js)$/g, ''),
      fn: f.default,
    };
  });
export default allTasks;

DEBUG(`Loaded ${allTasks.length} activity tasks.`);