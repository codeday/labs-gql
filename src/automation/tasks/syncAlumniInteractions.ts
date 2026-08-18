import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import config from '../../config';
import { createAttioClient } from '../../attio/client';
import { projectParticipations } from '../../attio/sync/projectParticipations';
import { readAttioState } from '../../attio/sync/readAttioState';
import { buildDiffPlan } from '../../attio/sync/diff';
import { writeChanges } from '../../attio/sync/writeChanges';
import { SyncOptions, SyncSummary } from '../../attio/sync/types';
import { makeDebug } from '../../utils/makeDebug';

const DEBUG = makeDebug('automation:tasks:syncAlumniInteractions');

const LOCK_KEY_NAME = 'sync-alumni-interactions';

// A steady-state night writes a few dozen entries at most. This sits well above normal
// cohort-onboarding bursts (dozens to low hundreds) so it won't fire on an ordinary night,
// but low enough to catch a duplication bug long before it reaches backfill scale (~17,000).
// The one known case where this alert is *expected* to fire is the initial manual backfill
// itself — that's a real, large, one-time event, not a false positive.
const ENTRIES_CREATED_ALERT_THRESHOLD = 1000;

// Run nightly at 2 AM Pacific Time
export const JOBSPEC = '0 2 * * *';

function emptySummary(dryRun: boolean, skippedDueToLock: boolean): SyncSummary {
  return {
    dryRun,
    participationsProjected: 0,
    rowsSkippedForBadEmail: 0,
    badEmailInteractionIds: [],
    peopleCreated: 0,
    peopleNameFixed: 0,
    entriesCreated: 0,
    entriesUpdated: 0,
    entriesUnchanged: 0,
    orphanEntriesSeen: 0,
    rowsFailed: [],
    skippedDueToLock,
  };
}

export async function runAlumniInteractionsSync(options: SyncOptions): Promise<SyncSummary> {
  const apiToken = config.attio.apiToken;
  const listId = config.attio.alumniListId;
  const prisma = Container.get(PrismaClient);

  const [{ locked }] = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(hashtext(${LOCK_KEY_NAME})) AS locked
  `;

  if (!locked) {
    DEBUG('Another instance holds the sync-alumni-interactions lock, skipping this run.');
    return emptySummary(options.dryRun, true);
  }

  DEBUG('Acquired advisory lock, starting sync.');

  try {
    // Stage B: project source rows.
    const { participations, badEmailInteractionIds, canonicalNameByEmail } = await projectParticipations(
      prisma,
      options.limit,
    );
    DEBUG(`Projected ${participations.length} participations (${badEmailInteractionIds.length} skipped for bad email).`);

    // Stage C: full bulk reads, both complete before any write.
    const client = createAttioClient(apiToken);
    const {
      entriesByInteractionId, peopleByEmail, personNameStatusByRecordId, orphanEntryCount,
    } = await readAttioState(client, listId);
    DEBUG(`Read ${entriesByInteractionId.size} existing entries, ${peopleByEmail.size} known emails, ${orphanEntryCount} orphan entries.`);

    // Stage D: pure in-memory diff.
    const plan = buildDiffPlan(
      participations,
      entriesByInteractionId,
      peopleByEmail,
      personNameStatusByRecordId,
      canonicalNameByEmail,
    );
    DEBUG(
      `Plan: ${plan.peopleToUpsert.length} people to upsert, ${plan.peopleToFixName.length} people to fix name for, `
      + `${plan.entriesToCreate.length} entries to create, ${plan.entriesToUpdate.length} entries to update, `
      + `${plan.unchangedCount} unchanged.`,
    );

    if (options.dryRun) {
      return {
        dryRun: true,
        participationsProjected: participations.length,
        rowsSkippedForBadEmail: badEmailInteractionIds.length,
        badEmailInteractionIds,
        peopleCreated: 0,
        peopleNameFixed: 0,
        entriesCreated: 0,
        entriesUpdated: 0,
        entriesUnchanged: plan.unchangedCount,
        orphanEntriesSeen: orphanEntryCount,
        rowsFailed: [],
        skippedDueToLock: false,
      };
    }

    // Stage E: writes, in order (people, then entry creates, then entry updates).
    const {
      peopleCreated, peopleNameFixed, entriesCreated, entriesUpdated, rowsFailed,
    } = await writeChanges(client, listId, plan, peopleByEmail);

    return {
      dryRun: false,
      participationsProjected: participations.length,
      rowsSkippedForBadEmail: badEmailInteractionIds.length,
      badEmailInteractionIds,
      peopleCreated,
      peopleNameFixed,
      entriesCreated,
      entriesUpdated,
      entriesUnchanged: plan.unchangedCount,
      orphanEntriesSeen: orphanEntryCount,
      rowsFailed,
      skippedDueToLock: false,
    };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${LOCK_KEY_NAME}))`;
  }
}

export default async function syncAlumniInteractions(): Promise<void> {
  const summary = await runAlumniInteractionsSync({ dryRun: false });
  DEBUG('Sync summary:', JSON.stringify(summary));

  if (summary.rowsFailed.length > 0) {
    DEBUG(`ALERT: ${summary.rowsFailed.length} row(s) failed during alumni interactions sync.`, summary.rowsFailed);
  }
  if (summary.entriesCreated > ENTRIES_CREATED_ALERT_THRESHOLD) {
    DEBUG(
      `ALERT: alumni interactions sync created ${summary.entriesCreated} entries in one run `
      + `(threshold ${ENTRIES_CREATED_ALERT_THRESHOLD}) — verify this wasn't an unintended full re-sync.`,
    );
  }
  // No alert on a clean run with zero writes — that's the expected nightly outcome.
}
