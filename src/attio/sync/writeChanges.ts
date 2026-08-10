import { AttioClient, AttioApiError } from '../client';
import {
  DiffPlan, EntryFields, Participation, RowFailure,
} from './types';
import { makeDebug } from '../../utils/makeDebug';

const DEBUG = makeDebug('attio:sync:writeChanges');

function isUniquenessConflict(ex: unknown): boolean {
  return ex instanceof AttioApiError && ex.status === 400 && ex.attioCode === 'uniqueness_conflict';
}

function entryValuesFor(participation: Participation, fields: (keyof EntryFields)[]): Record<string, unknown> {
  const all: Record<keyof EntryFields, Record<string, unknown>> = {
    interactionId: { interaction_id: participation.interactionId },
    participationType: { participation_type: participation.participationType },
    eventType: { event_type: participation.eventType },
    event: { event: participation.event },
    participatedAt: { participated_at: participation.participatedAt },
  };
  return fields.reduce((acc: Record<string, unknown>, field) => ({ ...acc, ...all[field] }), {});
}

export interface WriteResult {
  peopleCreated: number;
  entriesCreated: number;
  entriesUpdated: number;
  rowsFailed: RowFailure[];
  peopleByEmail: Map<string, string>;
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
  let entriesCreated = 0;
  let entriesUpdated = 0;
  const updatedPeopleByEmail = new Map(peopleByEmail);

  for (const person of plan.peopleToUpsert) {
    try {
      // eslint-disable-next-line no-await-in-loop
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
        `person-upsert:${person.email}`,
      );
      updatedPeopleByEmail.set(person.email, data.id.record_id);
      peopleCreated += 1;
    } catch (ex) {
      DEBUG(`Failed to upsert person ${person.email}:`, ex);
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
              'interactionId', 'participationType', 'eventType', 'event', 'participatedAt',
            ]),
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
      // eslint-disable-next-line no-await-in-loop
      await client.write(
        'PATCH',
        `/v2/lists/${listId}/entries/${update.entryId}`,
        { data: { entry_values: entryValuesFor(update.participation, update.changedFields) } },
        `entry-update:${update.participation.interactionId}`,
      );
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
    peopleCreated, entriesCreated, entriesUpdated, rowsFailed, peopleByEmail: updatedPeopleByEmail,
  };
}
