import { syncElastic } from './sync';

export default function searchSyncHandler(): void {
  syncElastic();
  setInterval(syncElastic, 60000);
}

export * from './ElasticEntry';
export * from './sync';
