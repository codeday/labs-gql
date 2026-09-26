import {
  Participation, DiffPlan, EntryFields, ExistingEntry,
} from './types';
import { PersonNameStatus } from './readAttioState';
import { makeDebug } from '../../utils/makeDebug';

const DEBUG = makeDebug('attio:sync:diff');

// Related people is intentionally excluded from COMPARABLE_FIELDS: the projection side
// (Participation) carries emails while the existing-entry side (EntryFields) carries Attio
// record ids, so the two live in different identity spaces and need a resolve-then-compare
// step (relatedPeopleDiffer below) rather than a direct value comparison.
const COMPARABLE_FIELDS: (keyof Participation & keyof EntryFields)[] = [
  'participationType', 'eventType', 'event', 'participatedAt',
];

function fieldsDiffer(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) !== JSON.stringify(b);
  return a !== b;
}

/**
 * Compares the projection's desired related-people emails against an existing entry's
 * related_people record ids in record-id space — the same space Stage E writes — so a
 * multi-email Attio person doesn't look like a change merely because Attio stored them under
 * a different email than the projection named.
 *
 * Each desired email is resolved to a record id via peopleByEmail (the forward map, which
 * holds every email of every person, so it identifies the right person no matter which of
 * their emails the projection used). An email whose person is being created this run (in
 * upsertEmails) has no record id yet — but an existing entry can only reference people
 * already in Attio, so any such email necessarily makes the desired set differ from the
 * existing one. Emails that resolve to neither (the person's own row had a bad email, an
 * upsert failed, etc.) are dropped, matching Stage E's write-time best-effort drop.
 */
function relatedPeopleDiffer(
  desiredEmails: string[],
  existingRecordIds: string[],
  peopleByEmail: Map<string, string>,
  upsertEmails: Set<string>,
): boolean {
  const desiredRecordIds = new Set<string>();
  for (const email of desiredEmails) {
    const recordId = peopleByEmail.get(email);
    if (recordId) {
      desiredRecordIds.add(recordId);
    } else if (upsertEmails.has(email)) {
      // A person not yet in Attio — the existing entry can't already reference them, so the
      // desired set genuinely differs. Return early; the resolved-record-id set is irrelevant.
      return true;
    }
    // else: unresolvable and not being created this run — dropped, as Stage E drops it.
  }
  const existingSet = new Set(existingRecordIds);
  if (desiredRecordIds.size !== existingSet.size) return true;
  for (const id of desiredRecordIds) {
    if (!existingSet.has(id)) return true;
  }
  return false;
}

function diffFields(
  desired: Participation,
  existing: EntryFields,
  peopleByEmail: Map<string, string>,
  upsertEmails: Set<string>,
): (keyof EntryFields)[] {
  const changed: (keyof EntryFields)[] = COMPARABLE_FIELDS.filter((field) => fieldsDiffer(desired[field], existing[field]));
  if (relatedPeopleDiffer(desired.relatedPersonEmails, existing.relatedPersonRecordIds, peopleByEmail, upsertEmails)) {
    changed.push('relatedPersonRecordIds');
  }
  return changed;
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

  // Emails of people who don't yet exist in Attio and will be created this run. Computed
  // before the per-participation loop because a related person's own participation row may
  // not have been visited yet when their email appears in someone else's relatedPersonEmails
  // — the diff needs the complete upsert set up front to recognize "this related person is
  // about to be created" as a genuine change rather than dropping them as unresolvable.
  const upsertEmails = new Set<string>();
  for (const p of participations) {
    if (!peopleByEmail.has(p.email)) upsertEmails.add(p.email);
  }

  for (const p of participations) {
    if (upsertEmails.has(p.email) && !peopleToUpsert.has(p.email)) {
      peopleToUpsert.set(p.email, { email: p.email, givenName: p.givenName, surname: p.surname });
    }

    const existing = entriesByInteractionId.get(p.interactionId);
    if (!existing) {
      entriesToCreate.push(p);
      // eslint-disable-next-line no-continue
      continue;
    }

    const changedFields = diffFields(p, existing.fields, peopleByEmail, upsertEmails);
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
