import { AttioClient, AttioApiError } from '../client';
import {
  DiffPlan, EntryFields, Participation, RowFailure,
} from './types';
import { makeDebug } from '../../utils/makeDebug';

const DEBUG = makeDebug('attio:sync:writeChanges');

function isUniquenessConflict(ex: unknown): boolean {
  return ex instanceof AttioApiError && ex.status === 400 && ex.attioCode === 'uniqueness_conflict';
}

/**
 * relatedPersonEmails is resolved to Attio record ids here, at write time, using whatever
 * peopleByEmail map the caller currently has (updated after the people-upsert phase runs) —
 * that's the earliest point every valid participant, including ones on the "other side" of
 * a project, is guaranteed to have an Attio record. An email that still doesn't resolve (its
 * own row had a bad email, or its person-upsert failed) is silently dropped from the list
 * rather than failing this row — it's a best-effort auxiliary field, not the dedup key.
 */
function entryValuesFor(
  participation: Participation,
  fields: (keyof EntryFields)[],
  peopleByEmail: Map<string, string>,
): Record<string, unknown> {
  const all: Record<keyof EntryFields, Record<string, unknown>> = {
    interactionId: { interaction_id: participation.interactionId },
    participationType: { participation_type: participation.participationType },
    eventType: { event_type: participation.eventType },
    event: { event: participation.event },
    participatedAt: { participated_at: participation.participatedAt },
    relatedPersonEmails: {
      related_people: participation.relatedPersonEmails
        .map((email) => peopleByEmail.get(email))
        .filter((id): id is string => Boolean(id))
        .map((id) => ({ target_object: 'people', target_record_id: id })),
    },
  };
  return fields.reduce((acc: Record<string, unknown>, field) => ({ ...acc, ...all[field] }), {});
}

export interface WriteResult {
  peopleCreated: number;
  peopleNameFixed: number;
  entriesCreated: number;
  entriesUpdated: number;
  rowsFailed: RowFailure[];
  peopleByEmail: Map<string, string>;
}

async function upsertPersonNameValues(
  client: AttioClient,
  person: { email: string; givenName: string; surname: string },
  logContext: string,
): Promise<{ recordId: string }> {
  const { data } = await client.write<{ data: { id: { record_id: string } } }>(
    'PUT',
    `/v2/objects/people/records?matching_attribute=email_addresses`,
    {
      data: {
        values: {
          email_addresses: [{ email_address: person.email }],
          name: [{ first_name: person.givenName, last_name: person.surname, full_name: `${person.givenName} ${person.surname}` }],
        },
      },
    },
    logContext,
  );
  return { recordId: data.id.record_id };
}

/**
 * Stage E: people first (so parent records exist before entries reference them), then entry
 * creates, then entry updates. Individual row failures are collected, not thrown — the rest
 * of the plan still runs.
 */
export async function writeChanges(
  client: AttioClient,
  listId: string,
  plan: DiffPlan,
  peopleByEmail: Map<string, string>,
): Promise<WriteResult> {
  const rowsFailed: RowFailure[] = [];
  let peopleCreated = 0;
  let peopleNameFixed = 0;
  let entriesCreated = 0;
  let entriesUpdated = 0;
  const updatedPeopleByEmail = new Map(peopleByEmail);

  for (const person of plan.peopleToUpsert) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { recordId } = await upsertPersonNameValues(client, person, `person-upsert:${person.email}`);
      updatedPeopleByEmail.set(person.email, recordId);
      peopleCreated += 1;
    } catch (ex) {
      DEBUG(`Failed to upsert person ${person.email}:`, ex);
      rowsFailed.push({ interactionId: person.email, stage: 'person-upsert', error: (ex as Error).message });
    }
  }

  // Existing Attio people with a broken (incomplete) name, corrected from the most recent
  // Mentor/Student row for that email. This is the one case where we deliberately overwrite
  // name on someone who already exists — everywhere else that's avoided to not clobber
  // manual corrections, but an incomplete name can't be a deliberate correction.
  for (const person of plan.peopleToFixName) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await upsertPersonNameValues(client, person, `person-name-fix:${person.email}`);
      peopleNameFixed += 1;
    } catch (ex) {
      DEBUG(`Failed to fix name for ${person.email}:`, ex);
      rowsFailed.push({ interactionId: person.email, stage: 'person-upsert', error: (ex as Error).message });
    }
  }

  for (const participation of plan.entriesToCreate) {
    const parentRecordId = updatedPeopleByEmail.get(participation.email);
    if (!parentRecordId) {
      rowsFailed.push({
        interactionId: participation.interactionId,
        stage: 'entry-create',
        error: `No Attio person record for email ${participation.email} (person upsert must have failed).`,
      });
      // eslint-disable-next-line no-continue
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await client.write(
        'POST',
        `/v2/lists/${listId}/entries`,
        {
          data: {
            parent_object: 'people',
            parent_record_id: parentRecordId,
            entry_values: entryValuesFor(participation, [
              'interactionId', 'participationType', 'eventType', 'event', 'participatedAt', 'relatedPersonEmails',
            ], updatedPeopleByEmail),
          },
        },
        `entry-create:${participation.interactionId}`,
      );
      entriesCreated += 1;
    } catch (ex) {
      if (isUniquenessConflict(ex)) {
        // A prior run already inserted this participation — treat as success, not failure.
        DEBUG(`Entry for ${participation.interactionId} already exists (uniqueness_conflict), treating as success.`);
      } else {
        DEBUG(`Failed to create entry for ${participation.interactionId}:`, ex);
        rowsFailed.push({
          interactionId: participation.interactionId,
          stage: 'entry-create',
          error: (ex as Error).message,
        });
      }
    }
  }

  for (const update of plan.entriesToUpdate) {
    try {
      // related_people is the only multiselect attribute we sync. Attio's PATCH list-entry
      // endpoint appends multiselect values without removing existing ones, so a shrink (a
      // student rejected after their mentor's entry was already synced, dropped from the
      // projection by `AND s.status != 'REJECTED'`) would never take effect — the entry would
      // re-diff every run and never converge. PUT overwrites/removes multiselect values, so
      // route related_people through it. The other fields are single-value scalars where append
      // and overwrite are equivalent, but Attio's PUT docs only spell out multiselect behavior,
      // so scalars stay on PATCH (the method established for them). A row changing both kinds
      // of fields issues both writes; the entry is still counted as a single update.
      const scalarFields = update.changedFields.filter((f) => f !== 'relatedPersonEmails');
      const needsOverwrite = update.changedFields.includes('relatedPersonEmails');
      if (needsOverwrite) {
        // eslint-disable-next-line no-await-in-loop
        await client.write(
          'PUT',
          `/v2/lists/${listId}/entries/${update.entryId}`,
          { data: { entry_values: entryValuesFor(update.participation, ['relatedPersonEmails'], updatedPeopleByEmail) } },
          `entry-update:${update.participation.interactionId}`,
        );
      }
      if (scalarFields.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await client.write(
          'PATCH',
          `/v2/lists/${listId}/entries/${update.entryId}`,
          { data: { entry_values: entryValuesFor(update.participation, scalarFields, updatedPeopleByEmail) } },
          `entry-update:${update.participation.interactionId}`,
        );
      }
      entriesUpdated += 1;
    } catch (ex) {
      DEBUG(`Failed to update entry for ${update.participation.interactionId}:`, ex);
      rowsFailed.push({
        interactionId: update.participation.interactionId,
        stage: 'entry-update',
        error: (ex as Error).message,
      });
    }
  }

  return {
    peopleCreated, peopleNameFixed, entriesCreated, entriesUpdated, rowsFailed, peopleByEmail: updatedPeopleByEmail,
  };
}
