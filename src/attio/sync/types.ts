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
 * The list-entry attribute values we sync, in a flat shape shared by "what the projection
 * wants" (Participation) and "what Attio currently has" (the existing entry) so Stage D
 * can diff them. relatedPeople is stored here as Attio record ids — the same identity space
 * Stage E writes — so Stage D resolves the projection's relatedPersonEmails to record ids
 * via peopleByEmail before comparing (see diff.ts). Comparing in record-id space (rather
 * than email-string space) means a multi-email Attio person doesn't spuriously diff just
 * because the projection named a different one of their emails than the one a last-wins
 * reverse map happened to pick.
 */
export interface EntryFields {
  interactionId: string;
  participationType: ParticipationType;
  eventType: EventType;
  event: string;
  participatedAt: string | null;
  relatedPersonRecordIds: string[];
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
