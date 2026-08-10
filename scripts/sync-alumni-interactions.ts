/**
 * Manual entry point for the Attio alumni interactions sync.
 *
 * Calls the exact same runAlumniInteractionsSync() function the nightly automation task
 * (src/automation/tasks/syncAlumniInteractions.ts) uses, so manual testing and the scheduled
 * run can't drift apart.
 *
 * Defaults to a dry run (unlike the nightly job, which writes by default) — pass --live to
 * actually write. Pass --limit=N to truncate the projection for testing against a real
 * workspace without a full backfill.
 *
 * Run with:
 *   npx ts-node scripts/sync-alumni-interactions.ts [--live] [--limit=N]
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import { runAlumniInteractionsSync } from '../src/automation/tasks/syncAlumniInteractions';

// Only Prisma is needed here, so we register it directly rather than pulling in the full
// registerDi() graph (Elasticsearch, Linear, OpenAI, etc.) that this script doesn't touch.
function registerMinimalDi(): void {
  Container.set(PrismaClient, new PrismaClient());
}

function parseArgs(argv: string[]): { dryRun: boolean; limit?: number } {
  const live = argv.includes('--live');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : undefined;
  return { dryRun: !live, limit };
}

async function main(): Promise<void> {
  registerMinimalDi();
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  console.log(`Running alumni interactions sync (dryRun=${dryRun}${limit !== undefined ? `, limit=${limit}` : ''})...`);
  const summary = await runAlumniInteractionsSync({ dryRun, limit });
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
