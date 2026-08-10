export type ParticipationType = 'Mentor' | 'Student';
export type EventType = 'CodeDay Event' | 'Labs';

export interface Participation {
  interactionId: string;
  participationType: ParticipationType;
  eventType: EventType;
  event: string;
  email: string;
  givenName: string;
  surname: string;
  participatedAt: string | null;
}

/**
 * The five list-entry attribute values we sync, in a flat shape shared by both
 * "what the projection wants" and "what Attio currently has" so Stage D can diff them directly.
 */
export interface EntryFields {
  interactionId: string;
  participationType: ParticipationType;
  eventType: EventType;
  event: string;
  participatedAt: string | null;
}

export interface ExistingEntry {
  entryId: string;
  fields: EntryFields;
}

export interface DiffPlan {
  peopleToUpsert: { email: string; givenName: string; surname: string }[];
  entriesToCreate: Participation[];
  entriesToUpdate: { entryId: string; participation: Participation; changedFields: (keyof EntryFields)[] }[];
  unchangedCount: number;
}

export interface RowFailure {
  interactionId: string;
  stage: 'person-upsert' | 'entry-create' | 'entry-update';
  error: string;
}

export interface SyncOptions {
  dryRun: boolean;
  limit?: number;
}

export interface SyncSummary {
  dryRun: boolean;
  participationsProjected: number;
  rowsSkippedForBadEmail: number;
  badEmailInteractionIds: string[];
  peopleCreated: number;
  entriesCreated: number;
  entriesUpdated: number;
  entriesUnchanged: number;
  orphanEntriesSeen: number;
  rowsFailed: RowFailure[];
  skippedDueToLock: boolean;
}
