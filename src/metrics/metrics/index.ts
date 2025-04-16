/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import fs from 'fs';
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('metrics');

type MetricImport = { default: () => Promise<string> };

const metrics = fs.readdirSync(__dirname)
  .filter(n => !['index.ts', 'index.js'].includes(n))
  .map(n => {
    const f = require(`./${n}`) as MetricImport;
    if (!f.default) throw new Error(`Metric ${n} does not include a default export.`);
    return f.default;
  });
export default metrics;

DEBUG(`Loaded ${metrics.length} metrics.`);