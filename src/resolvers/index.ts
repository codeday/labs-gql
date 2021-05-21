/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import fs from 'fs';

type ResolverListType = readonly [Function, ...Function[]];

export default <ResolverListType><unknown>fs.readdirSync(__dirname)
  .filter((n: string): boolean => n !== 'index.ts')
  .reduce(
    (accum: Function[], n: string): Function[] => [
      ...accum,
      ...<Function[]>Object.values(require(`./${n}`)),
    ],
    [],
  );
