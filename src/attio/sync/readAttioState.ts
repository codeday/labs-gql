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

function entryToFields(entry: AttioListEntry): EntryFields | null {
  const interactionId = textValue(entry.entry_values, 'interaction_id');
  if (!interactionId) return null;
  return {
    interactionId,
    participationType: selectValue(entry.entry_values, 'participation_type') as ParticipationType,
    eventType: selectValue(entry.entry_values, 'event_type') as EventType,
    event: textValue(entry.entry_values, 'event') ?? '',
    participatedAt: textValue(entry.entry_values, 'participated_at'),
  };
}

export interface AttioState {
  entriesByInteractionId: Map<string, ExistingEntry>;
  peopleByEmail: Map<string, string>;
  orphanEntryCount: number;
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

  const entriesByInteractionId = new Map<string, ExistingEntry>();
  let orphanEntryCount = 0;
  for (const entry of entries) {
    const fields = entryToFields(entry);
    if (!fields) {
      orphanEntryCount += 1;
      DEBUG(`Orphan list entry with no interaction_id: ${entry.id.entry_id}`);
      // eslint-disable-next-line no-continue
      continue;
    }
    entriesByInteractionId.set(fields.interactionId, { entryId: entry.id.entry_id, fields });
  }

  const peopleByEmail = new Map<string, string>();
  for (const person of people) {
    const emailValues = (person.values.email_addresses ?? []) as { email_address?: string }[];
    for (const emailValue of emailValues) {
      const email = emailValue.email_address?.trim().toLowerCase();
      if (email) peopleByEmail.set(email, person.id.record_id);
    }
  }

  return { entriesByInteractionId, peopleByEmail, orphanEntryCount };
}
