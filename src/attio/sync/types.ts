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
  // Normalized, sorted emails of the other side of this person's project(s): a student's
  // mentors, or a mentor's students. Resolved to Attio record ids only at write time.
  relatedPersonEmails: string[];
}

/**
 * The list-entry attribute values we sync, in a flat shape shared by both "what the
 * projection wants" and "what Attio currently has" so Stage D can diff them directly.
 * relatedPersonEmails is compared as emails on both sides (see readAttioState.ts) even
 * though Attio itself stores record references, so no record-id resolution is needed
 * until Stage E actually writes a change.
 */
export interface EntryFields {
  interactionId: string;
  participationType: ParticipationType;
  eventType: EventType;
  event: string;
  participatedAt: string | null;
  relatedPersonEmails: string[];
}

export interface ExistingEntry {
  entryId: string;
  fields: EntryFields;
}

export interface DiffPlan {
  peopleToUpsert: { email: string; givenName: string; surname: string }[];
  // Existing Attio people whose stored name is incomplete (missing a first name, a last
  // name, or both) — corrected using the most-recently-participated Mentor/Student row
  // for that email. Disjoint from peopleToUpsert: only people already known to Attio.
  peopleToFixName: { email: string; givenName: string; surname: string }[];
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
  peopleNameFixed: number;
  entriesCreated: number;
  entriesUpdated: number;
  entriesUnchanged: number;
  orphanEntriesSeen: number;
  rowsFailed: RowFailure[];
  skippedDueToLock: boolean;
}
