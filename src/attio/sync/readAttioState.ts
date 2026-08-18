import { AttioClient } from '../client';
import { AttioListEntry, AttioPersonRecord } from '../types';
import { EntryFields, ExistingEntry, ParticipationType, EventType } from './types';
import { makeDebug } from '../../utils/makeDebug';

const DEBUG = makeDebug('attio:sync:readAttioState');

const PAGE_SIZE = 1000;

function firstValue(values: Record<string, unknown[]>, slug: string): unknown[] | undefined {
  const v = values[slug];
  return Array.isArray(v) && v.length > 0 ? v : undefined;
}

function textValue(values: Record<string, unknown[]>, slug: string): string | null {
  const v = firstValue(values, slug);
  const first = v?.[0] as { value?: string } | undefined;
  return first?.value ?? null;
}

function selectValue(values: Record<string, unknown[]>, slug: string): string | null {
  const v = firstValue(values, slug);
  const first = v?.[0] as { option?: { title?: string } } | undefined;
  return first?.option?.title ?? null;
}

function recordReferenceIds(values: Record<string, unknown[]>, slug: string): string[] {
  const v = values[slug];
  if (!Array.isArray(v)) return [];
  return (v as { target_record_id?: string }[])
    .map((ref) => ref.target_record_id)
    .filter((id): id is string => Boolean(id));
}

/**
 * relatedPersonEmails is compared as emails, not record ids (see types.ts), so an existing
 * entry's related_people record ids are resolved back to emails here using the same People
 * read this run already did — every id an entry can reference must belong to someone that
 * read turned up, since Attio has no other way to have created the reference.
 */
function entryToFields(entry: AttioListEntry, emailByRecordId: Map<string, string>): EntryFields | null {
  const interactionId = textValue(entry.entry_values, 'interaction_id');
  if (!interactionId) return null;

  const relatedPersonEmails = recordReferenceIds(entry.entry_values, 'related_people')
    .map((id) => emailByRecordId.get(id))
    .filter((email): email is string => Boolean(email))
    .sort();

  return {
    interactionId,
    participationType: selectValue(entry.entry_values, 'participation_type') as ParticipationType,
    eventType: selectValue(entry.entry_values, 'event_type') as EventType,
    event: textValue(entry.entry_values, 'event') ?? '',
    participatedAt: textValue(entry.entry_values, 'participated_at'),
    relatedPersonEmails,
  };
}

export interface PersonNameStatus {
  hasFirstName: boolean;
  hasLastName: boolean;
}

export interface AttioState {
  entriesByInteractionId: Map<string, ExistingEntry>;
  peopleByEmail: Map<string, string>;
  personNameStatusByRecordId: Map<string, PersonNameStatus>;
  orphanEntryCount: number;
}

function isNonBlank(s: string | undefined): boolean {
  return Boolean(s && s.trim());
}

async function fetchAllListEntries(client: AttioClient, listId: string): Promise<AttioListEntry[]> {
  const all: AttioListEntry[] = [];
  let offset = 0;
  let pageCount = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await client.read<{ data: AttioListEntry[] }>(`/v2/lists/${listId}/entries/query`, {
      limit: PAGE_SIZE,
      offset,
    });
    pageCount += 1;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  DEBUG(`Fetched ${all.length} list entries across ${pageCount} page(s).`);
  return all;
}

async function fetchAllPeople(client: AttioClient): Promise<AttioPersonRecord[]> {
  const all: AttioPersonRecord[] = [];
  let offset = 0;
  let pageCount = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await client.read<{ data: AttioPersonRecord[] }>('/v2/objects/people/records/query', {
      limit: PAGE_SIZE,
      offset,
    });
    pageCount += 1;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  DEBUG(`Fetched ${all.length} people records across ${pageCount} page(s).`);
  return all;
}

/**
 * Stage C: two full paginated reads, both completed before any write starts (both endpoints
 * use offset pagination, so writing mid-pagination would shift rows and skip records).
 */
export async function readAttioState(client: AttioClient, listId: string): Promise<AttioState> {
  const [entries, people] = await Promise.all([
    fetchAllListEntries(client, listId),
    fetchAllPeople(client),
  ]);

  const peopleByEmail = new Map<string, string>();
  const emailByRecordId = new Map<string, string>();
  const personNameStatusByRecordId = new Map<string, PersonNameStatus>();
  for (const person of people) {
    const emailValues = (person.values.email_addresses ?? []) as { email_address?: string }[];
    for (const emailValue of emailValues) {
      const email = emailValue.email_address?.trim().toLowerCase();
      if (email) {
        peopleByEmail.set(email, person.id.record_id);
        // Multiple emails can map to the same record id; any one of them is a fine reverse
        // lookup since we only use this to detect *which* people are already referenced.
        emailByRecordId.set(person.id.record_id, email);
      }
    }

    const nameValue = (person.values.name as { first_name?: string; last_name?: string }[] | undefined)?.[0];
    personNameStatusByRecordId.set(person.id.record_id, {
      hasFirstName: isNonBlank(nameValue?.first_name),
      hasLastName: isNonBlank(nameValue?.last_name),
    });
  }

  const entriesByInteractionId = new Map<string, ExistingEntry>();
  let orphanEntryCount = 0;
  for (const entry of entries) {
    const fields = entryToFields(entry, emailByRecordId);
    if (!fields) {
      orphanEntryCount += 1;
      DEBUG(`Orphan list entry with no interaction_id: ${entry.id.entry_id}`);
      // eslint-disable-next-line no-continue
      continue;
    }
    entriesByInteractionId.set(fields.interactionId, { entryId: entry.id.entry_id, fields });
  }

  return {
    entriesByInteractionId, peopleByEmail, personNameStatusByRecordId, orphanEntryCount,
  };
}
