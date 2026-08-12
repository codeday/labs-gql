import {
  Participation, DiffPlan, EntryFields, ExistingEntry,
} from './types';
import { PersonNameStatus } from './readAttioState';
import { makeDebug } from '../../utils/makeDebug';

const DEBUG = makeDebug('attio:sync:diff');

const COMPARABLE_FIELDS: (keyof EntryFields)[] = [
  'participationType', 'eventType', 'event', 'participatedAt', 'relatedPersonEmails',
];

function fieldsDiffer(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) !== JSON.stringify(b);
  return a !== b;
}

function diffFields(desired: Participation, existing: EntryFields): (keyof EntryFields)[] {
  return COMPARABLE_FIELDS.filter((field) => fieldsDiffer(desired[field], existing[field]));
}

/**
 * Stage D: pure in-memory comparison, no network calls. Field-by-field for updates so
 * a steady-state run (Attio already matches the projection) produces an empty plan.
 */
export function buildDiffPlan(
  participations: Participation[],
  entriesByInteractionId: Map<string, ExistingEntry>,
  peopleByEmail: Map<string, string>,
  personNameStatusByRecordId: Map<string, PersonNameStatus>,
  canonicalNameByEmail: Map<string, { givenName: string; surname: string }>,
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

  // Existing Attio people (not ones we're about to create — those get a full name for free)
  // whose stored name is missing a first name, a last name, or both.
  const peopleToFixName: DiffPlan['peopleToFixName'] = [];
  for (const [email, canonical] of canonicalNameByEmail) {
    const recordId = peopleByEmail.get(email);
    const status = recordId ? personNameStatusByRecordId.get(recordId) : undefined;
    const nameIsIncomplete = status && !(status.hasFirstName && status.hasLastName);
    if (nameIsIncomplete) {
      peopleToFixName.push({ email, givenName: canonical.givenName, surname: canonical.surname });
    }
  }

  const plan: DiffPlan = {
    peopleToUpsert: Array.from(peopleToUpsert.values()),
    peopleToFixName,
    entriesToCreate,
    entriesToUpdate,
    unchangedCount,
  };

  DEBUG(
    `Diff plan: ${plan.peopleToUpsert.length} people to upsert, ${plan.peopleToFixName.length} people to fix name for, `
    + `${plan.entriesToCreate.length} entries to create, ${plan.entriesToUpdate.length} entries to update, `
    + `${unchangedCount} entries unchanged.`,
  );

  return plan;
}
