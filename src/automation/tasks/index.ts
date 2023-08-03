/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import fs from 'fs';
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks');

type TaskImport = { default: Function, JOBSPEC: string | undefined };
export type TaskExport = { name: string, fn: Function, spec: string | undefined }

const allTasks = <TaskExport[]>fs.readdirSync(__dirname)
  .filter(n => !['index.ts', 'index.js'].includes(n))
  .map(n => {
    const f = require(`./${n}`) as TaskImport;
    if (!f.default) throw new Error(`Task ${n} does not include a default export.`);
    return {
      name: n.replace(/\.(ts|js)$/g, ''),
      fn: f.default,
      spec: f.JOBSPEC,
    };
  });
export default allTasks;

DEBUG(`Loaded ${allTasks.length} automation tasks.`);