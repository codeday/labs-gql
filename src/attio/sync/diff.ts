import {
  Participation, DiffPlan, EntryFields, ExistingEntry,
} from './types';
import { makeDebug } from '../../utils/makeDebug';

const DEBUG = makeDebug('attio:sync:diff');

const COMPARABLE_FIELDS: (keyof EntryFields)[] = [
  'participationType', 'eventType', 'event', 'participatedAt',
];

function diffFields(desired: Participation, existing: EntryFields): (keyof EntryFields)[] {
  return COMPARABLE_FIELDS.filter((field) => desired[field] !== existing[field]);
}

/**
 * Stage D: pure in-memory comparison, no network calls. Field-by-field for updates so
 * a steady-state run (Attio already matches the projection) produces an empty plan.
 */
export function buildDiffPlan(
  participations: Participation[],
  entriesByInteractionId: Map<string, ExistingEntry>,
  peopleByEmail: Map<string, string>,
): DiffPlan {
  const peopleToUpsert = new Map<string, { email: string; givenName: string; surname: string }>();
  const entriesToCreate: Participation[] = [];
  const entriesToUpdate: DiffPlan['entriesToUpdate'] = [];
  let unchangedCount = 0;

  for (const p of participations) {
    if (!peopleByEmail.has(p.email) && !peopleToUpsert.has(p.email)) {
      peopleToUpsert.set(p.email, { email: p.email, givenName: p.givenName, surname: p.surname });
    }

    const existing = entriesByInteractionId.get(p.interactionId);
    if (!existing) {
      entriesToCreate.push(p);
      // eslint-disable-next-line no-continue
      continue;
    }

    const changedFields = diffFields(p, existing.fields);
    if (changedFields.length > 0) {
      entriesToUpdate.push({ entryId: existing.entryId, participation: p, changedFields });
    } else {
      unchangedCount += 1;
    }
  }

  const plan: DiffPlan = {
    peopleToUpsert: Array.from(peopleToUpsert.values()),
    entriesToCreate,
    entriesToUpdate,
    unchangedCount,
  };

  DEBUG(
    `Diff plan: ${plan.peopleToUpsert.length} people to upsert, ${plan.entriesToCreate.length} entries to create, `
    + `${plan.entriesToUpdate.length} entries to update, ${unchangedCount} entries unchanged.`,
  );

  return plan;
}
