/**
 * Offline unit tests for the Attio alumni interactions sync. No live DB or Attio access —
 * the HTTP layer is stubbed via createAttioClient's injectable fetchImpl.
 *
 * Run with:
 *   npx ts-node src/automation/tasks/syncAlumniInteractions.test.ts
 */
import 'reflect-metadata';
import fetch, { Response, Headers } from 'node-fetch';
import { buildDiffPlan } from '../../attio/sync/diff';
import { PersonNameStatus } from '../../attio/sync/readAttioState';
import { projectParticipations } from '../../attio/sync/projectParticipations';
import { readAttioState } from '../../attio/sync/readAttioState';
import { writeChanges } from '../../attio/sync/writeChanges';
import { createAttioClient, AttioApiError, AttioClient } from '../../attio/client';
import { Participation, ExistingEntry } from '../../attio/sync/types';
import { AttioListEntry, AttioPersonRecord } from '../../attio/types';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAILED: ${message}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

function participation(overrides: Partial<Participation> = {}): Participation {
  return {
    interactionId: 'p1',
    participationType: 'Mentor',
    eventType: 'Labs',
    event: 'CodeDay Labs Summer 2024',
    email: 'alice@example.com',
    givenName: 'Alice',
    surname: 'Smith',
    participatedAt: '2024-06-01',
    relatedPersonEmails: [],
    ...overrides,
  };
}

function existingEntryFor(p: Participation, entryId = 'entry-1'): ExistingEntry {
  return {
    entryId,
    fields: {
      interactionId: p.interactionId,
      participationType: p.participationType,
      eventType: p.eventType,
      event: p.event,
      participatedAt: p.participatedAt,
      relatedPersonEmails: p.relatedPersonEmails,
    },
  };
}

// --- Diff tests -------------------------------------------------------------------------

(function testEmptyPlanWhenMatching() {
  const p = participation();
  const entries = new Map([[p.interactionId, existingEntryFor(p)]]);
  const people = new Map([[p.email, 'person-1']]);
  const plan = buildDiffPlan([p], entries, people, new Map(), new Map());
  assertEqual(plan.entriesToCreate, [], 'No creates when Attio already matches the projection');
  assertEqual(plan.entriesToUpdate, [], 'No updates when Attio already matches the projection');
  assertEqual(plan.peopleToUpsert, [], 'No people to upsert when already known');
  assertEqual(plan.unchangedCount, 1, 'Matching row counted as unchanged');
})();

(function testMissingParticipationCreatedOnce() {
  const p = participation({ interactionId: 'missing-1' });
  const plan = buildDiffPlan([p], new Map(), new Map([[p.email, 'person-1']]), new Map(), new Map());
  assertEqual(plan.entriesToCreate.length, 1, 'Missing participation lands in entriesToCreate exactly once');
  assertEqual(plan.entriesToCreate[0].interactionId, 'missing-1', 'The created entry is the right one');
})();

(function testChangedFieldTriggersUpdateUnchangedDoesNot() {
  const changed = participation({ interactionId: 'c1', eventType: 'Labs' });
  const changedExisting = existingEntryFor(changed, 'entry-c1');
  changedExisting.fields.eventType = 'CodeDay Event';

  const unchanged = participation({ interactionId: 'u1' });
  const unchangedExisting = existingEntryFor(unchanged, 'entry-u1');

  const entries = new Map([
    [changed.interactionId, changedExisting],
    [unchanged.interactionId, unchangedExisting],
  ]);
  const people = new Map([[changed.email, 'person-1']]);

  const plan = buildDiffPlan([changed, unchanged], entries, people, new Map(), new Map());
  assertEqual(plan.entriesToUpdate.length, 1, 'Only the changed row lands in entriesToUpdate');
  assertEqual(plan.entriesToUpdate[0].entryId, 'entry-c1', 'The update targets the right entry');
  assertEqual(plan.entriesToUpdate[0].changedFields, ['eventType'], 'Only the changed field is listed');
  assertEqual(plan.unchangedCount, 1, 'The unchanged row is counted as unchanged, not updated');
})();

(function testBackfillDetectsMissingRelatedPeople() {
  // Simulates an entry created before the Related People attribute existed: Attio has an
  // empty related_people, but the projection now has one. This is what makes the backfill
  // "just happen" via the normal update path, with no separate backfill script needed.
  const p = participation({ interactionId: 'backfill-1', relatedPersonEmails: ['mentor@example.com'] });
  const existing = existingEntryFor(participation({ interactionId: 'backfill-1', relatedPersonEmails: [] }));
  const entries = new Map([[p.interactionId, existing]]);
  const people = new Map([[p.email, 'person-1']]);

  const plan = buildDiffPlan([p], entries, people, new Map(), new Map());
  assertEqual(plan.entriesToUpdate.length, 1, 'A pre-existing entry with no related_people is queued for update once the projection has one');
  assertEqual(plan.entriesToUpdate[0].changedFields, ['relatedPersonEmails'], 'Only relatedPersonEmails is flagged as changed');
})();

(function testMatchingRelatedPeopleIsNotAnUpdate() {
  const p = participation({ interactionId: 'stable-1', relatedPersonEmails: ['a@example.com', 'b@example.com'] });
  const entries = new Map([[p.interactionId, existingEntryFor(p)]]);
  const people = new Map([[p.email, 'person-1']]);

  const plan = buildDiffPlan([p], entries, people, new Map(), new Map());
  assertEqual(plan.entriesToUpdate, [], 'Identical related-people sets do not trigger an update');
  assertEqual(plan.unchangedCount, 1, 'The row is counted as unchanged');
})();

// --- Diff: fixing broken names on existing people ----------------------------------------

function nameStatus(hasFirstName: boolean, hasLastName: boolean): Map<string, PersonNameStatus> {
  return new Map([['person-1', { hasFirstName, hasLastName }]]);
}

(function testOnlyFirstNameIsQueuedForFix() {
  const p = participation({ email: 'alice@example.com' });
  const people = new Map([[p.email, 'person-1']]);
  const canonical = new Map([[p.email, { givenName: 'Alice', surname: 'Smith' }]]);

  const plan = buildDiffPlan([p], new Map(), people, nameStatus(true, false), canonical);
  assertEqual(plan.peopleToFixName, [{ email: 'alice@example.com', givenName: 'Alice', surname: 'Smith' }], 'A first-name-only person is queued for a name fix');
})();

(function testOnlyLastNameIsQueuedForFix() {
  const p = participation({ email: 'bob@example.com' });
  const people = new Map([[p.email, 'person-1']]);
  const canonical = new Map([[p.email, { givenName: 'Bob', surname: 'Jones' }]]);

  const plan = buildDiffPlan([p], new Map(), people, nameStatus(false, true), canonical);
  assertEqual(plan.peopleToFixName.length, 1, 'A last-name-only person is queued for a name fix');
})();

(function testNoNameAtAllIsQueuedForFix() {
  const p = participation({ email: 'carl@example.com' });
  const people = new Map([[p.email, 'person-1']]);
  const canonical = new Map([[p.email, { givenName: 'Carl', surname: 'Davis' }]]);

  const plan = buildDiffPlan([p], new Map(), people, nameStatus(false, false), canonical);
  assertEqual(plan.peopleToFixName.length, 1, 'A person with no name at all is queued for a name fix');
})();

(function testCompleteNameIsNotTouched() {
  const p = participation({ email: 'dana@example.com' });
  const people = new Map([[p.email, 'person-1']]);
  const canonical = new Map([[p.email, { givenName: 'Dana', surname: 'Lee' }]]);

  const plan = buildDiffPlan([p], new Map(), people, nameStatus(true, true), canonical);
  assertEqual(plan.peopleToFixName, [], 'A person who already has both names is never touched, to avoid clobbering manual corrections');
})();

(function testUnknownPersonIsNotQueuedForNameFix() {
  // Absent from peopleByEmail entirely — they'll get a full name via peopleToUpsert on
  // creation instead, so they shouldn't also show up here.
  const p = participation({ email: 'new@example.com' });
  const canonical = new Map([[p.email, { givenName: 'New', surname: 'Person' }]]);

  const plan = buildDiffPlan([p], new Map(), new Map(), new Map(), canonical);
  assertEqual(plan.peopleToFixName, [], 'A person not yet known to Attio is not queued for a name fix');
  assertEqual(plan.peopleToUpsert.length, 1, 'They are queued for creation instead, which sets a full name');
})();

// --- Stage B: bad email filtering --------------------------------------------------------

async function testBlankEmailExcluded(): Promise<void> {
  const fakePrisma = {
    $queryRaw: async () => ([
      {
        interactionId: 'good-1',
        participationType: 'Mentor',
        event: 'CodeDay Labs Summer 2024',
        email: '  Alice@Example.com  ',
        givenName: 'Alice',
        surname: 'Smith',
        participatedAt: new Date('2024-06-01T00:00:00Z'),
      },
      {
        interactionId: 'bad-1',
        participationType: 'Student',
        event: 'CodeDay Labs Summer 2024',
        email: '   ',
        givenName: 'Bob',
        surname: 'Jones',
        participatedAt: new Date('2024-06-01T00:00:00Z'),
      },
      {
        interactionId: 'bad-2',
        participationType: 'Student',
        event: 'CodeDay Labs Summer 2024',
        email: null,
        givenName: 'Carl',
        surname: 'Davis',
        participatedAt: new Date('2024-06-01T00:00:00Z'),
      },
    ]),
  };

  const { participations, badEmailInteractionIds } = await projectParticipations(fakePrisma as any);
  assertEqual(participations.length, 1, 'Only the row with a valid email is kept');
  assertEqual(participations[0].email, 'alice@example.com', 'Email is trimmed and lowercased');
  assertEqual(badEmailInteractionIds, ['bad-1', 'bad-2'], 'Blank/null emails are reported by interaction id');
}

// $queryRaw doesn't consistently return Date objects for timestamp columns across query
// engines/drivers — production hit this with a plain ISO string instead of a Date.
async function testParticipatedAtHandlesStringTimestampFromQueryRaw(): Promise<void> {
  const fakePrisma = {
    $queryRaw: async () => ([
      {
        interactionId: 'string-ts-1',
        participationType: 'Mentor',
        event: 'CodeDay Labs Summer 2024',
        email: 'dana@example.com',
        givenName: 'Dana',
        surname: 'Lee',
        participatedAt: '2024-06-01T00:00:00.000Z',
      },
    ]),
  };

  const { participations } = await projectParticipations(fakePrisma as any);
  assertEqual(participations.length, 1, 'The row is projected even when participatedAt is a string');
  assertEqual(participations[0].participatedAt, '2024-06-01', 'A string timestamp is normalized to a date-only string');
}

// array_agg over the Mentor<->Project<->Student join can come back as a real JS array or as
// a Postgres array-literal string, same caveat as participatedAt.
async function testRelatedPersonEmailsParsedFromArrayAndPgLiteral(): Promise<void> {
  const fakePrisma = {
    $queryRaw: async () => ([
      {
        interactionId: 'array-form',
        participationType: 'Mentor',
        event: 'CodeDay Labs Summer 2024',
        email: 'mentor1@example.com',
        givenName: 'M',
        surname: 'One',
        participatedAt: new Date('2024-06-01T00:00:00Z'),
        relatedPersonEmails: ['Student2@Example.com', 'student1@example.com', 'student1@example.com'],
      },
      {
        interactionId: 'string-form',
        participationType: 'Mentor',
        event: 'CodeDay Labs Summer 2024',
        email: 'mentor2@example.com',
        givenName: 'M',
        surname: 'Two',
        participatedAt: new Date('2024-06-01T00:00:00Z'),
        relatedPersonEmails: '{studentB@example.com,studentA@example.com}',
      },
      {
        interactionId: 'no-related',
        participationType: 'Mentor',
        event: 'CodeDay Labs Summer 2024',
        email: 'mentor3@example.com',
        givenName: 'M',
        surname: 'Three',
        participatedAt: new Date('2024-06-01T00:00:00Z'),
        relatedPersonEmails: '{}',
      },
    ]),
  };

  const { participations } = await projectParticipations(fakePrisma as any);
  const arrayForm = participations.find((p) => p.interactionId === 'array-form');
  const stringForm = participations.find((p) => p.interactionId === 'string-form');
  const noRelated = participations.find((p) => p.interactionId === 'no-related');

  assertEqual(
    arrayForm?.relatedPersonEmails,
    ['student1@example.com', 'student2@example.com'],
    'Array-form related emails are normalized, deduped, and sorted',
  );
  assertEqual(
    stringForm?.relatedPersonEmails,
    ['studenta@example.com', 'studentb@example.com'],
    'A Postgres array-literal string is parsed the same way as a real array',
  );
  assertEqual(noRelated?.relatedPersonEmails, [], 'An empty Postgres array literal yields an empty list, not a crash');
}

// The name-fix feature trusts whichever participation for an email is most recent — this
// verifies that selection, not just "first row wins".
async function testCanonicalNamePicksMostRecentParticipation(): Promise<void> {
  const fakePrisma = {
    $queryRaw: async () => ([
      {
        interactionId: 'old-row',
        participationType: 'Mentor',
        event: 'CodeDay Labs Summer 2022',
        email: 'alice@example.com',
        givenName: 'Al',
        surname: 'Smyth',
        participatedAt: new Date('2022-06-01T00:00:00Z'),
        relatedPersonEmails: [],
      },
      {
        interactionId: 'new-row',
        participationType: 'Mentor',
        event: 'CodeDay Labs Summer 2024',
        email: 'alice@example.com',
        givenName: 'Alice',
        surname: 'Smith',
        participatedAt: new Date('2024-06-01T00:00:00Z'),
        relatedPersonEmails: [],
      },
    ]),
  };

  const { canonicalNameByEmail } = await projectParticipations(fakePrisma as any);
  assertEqual(
    canonicalNameByEmail.get('alice@example.com'),
    { givenName: 'Alice', surname: 'Smith' },
    'The most recently-participated row wins, regardless of row order',
  );
}

// --- Stage C: multi-email person resolution -----------------------------------------------

async function testPersonResolvesFromAnyEmail(): Promise<void> {
  const person: AttioPersonRecord = {
    id: { workspace_id: 'w', object_id: 'o', record_id: 'person-multi' },
    created_at: '2024-01-01T00:00:00Z',
    values: {
      email_addresses: [
        { email_address: 'primary@example.com' },
        { email_address: 'secondary@example.com' },
        { email_address: 'Tertiary@Example.com' },
      ],
    },
  };
  const stubClient: AttioClient = {
    get: async () => { throw new Error('not used'); },
    read: (async (path: string) => {
      if (path.includes('/entries/query')) return { data: [] as AttioListEntry[] };
      return { data: [person] };
    }) as AttioClient['read'],
    write: async () => { throw new Error('not used'); },
  };

  const state = await readAttioState(stubClient, 'list-1');
  assertEqual(state.peopleByEmail.get('primary@example.com'), 'person-multi', 'Resolves from first email');
  assertEqual(state.peopleByEmail.get('secondary@example.com'), 'person-multi', 'Resolves from second email');
  assertEqual(state.peopleByEmail.get('tertiary@example.com'), 'person-multi', 'Resolves from third email (case-insensitively)');
}

async function testExistingRelatedPeopleResolvedFromRecordIds(): Promise<void> {
  const mentor: AttioPersonRecord = {
    id: { workspace_id: 'w', object_id: 'o', record_id: 'mentor-record' },
    created_at: '2024-01-01T00:00:00Z',
    values: { email_addresses: [{ email_address: 'mentor@example.com' }] },
  };
  const student: AttioPersonRecord = {
    id: { workspace_id: 'w', object_id: 'o', record_id: 'student-record' },
    created_at: '2024-01-01T00:00:00Z',
    values: { email_addresses: [{ email_address: 'student@example.com' }] },
  };
  const entry = {
    id: { workspace_id: 'w', list_id: 'list-1', entry_id: 'entry-1' },
    parent_record_id: 'mentor-record',
    parent_object: 'people',
    created_at: '2024-01-01T00:00:00Z',
    entry_values: {
      interaction_id: [{ value: 'm1', attribute_type: 'text' }],
      related_people: [{ target_object: 'people', target_record_id: 'student-record', attribute_type: 'record-reference' }],
    },
  } as AttioListEntry;

  const stubClient: AttioClient = {
    get: async () => { throw new Error('not used'); },
    read: (async (path: string) => {
      if (path.includes('/entries/query')) return { data: [entry] };
      return { data: [mentor, student] };
    }) as AttioClient['read'],
    write: async () => { throw new Error('not used'); },
  };

  const state = await readAttioState(stubClient, 'list-1');
  const existing = state.entriesByInteractionId.get('m1');
  assertEqual(
    existing?.fields.relatedPersonEmails,
    ['student@example.com'],
    "An existing entry's related_people record id resolves back to an email for diffing",
  );
}

// --- Stage E: uniqueness conflict, retry, and row-failure isolation -----------------------

function fakeClient(overrides: Partial<AttioClient>): AttioClient {
  return {
    get: async () => { throw new Error('not used'); },
    read: async () => { throw new Error('not used'); },
    write: async () => { throw new Error('not used'); },
    ...overrides,
  };
}

async function testUniquenessConflictTreatedAsSuccess(): Promise<void> {
  const p = participation({ interactionId: 'dup-1', email: 'known@example.com' });
  const client = fakeClient({
    write: (async (method: string) => {
      if (method === 'POST') {
        throw new AttioApiError(400, { message: 'conflict' }, 'invalid_request_error', 'uniqueness_conflict');
      }
      return {};
    }) as AttioClient['write'],
  });

  const result = await writeChanges(client, 'list-1', {
    peopleToUpsert: [], peopleToFixName: [], entriesToCreate: [p], entriesToUpdate: [], unchangedCount: 0,
  }, new Map([[p.email, 'person-1']]));

  assertEqual(result.rowsFailed, [], 'A uniqueness conflict on entry create is not a failure');
  assertEqual(result.entriesCreated, 0, 'A uniqueness conflict does not count as a new entry created');
}

async function testRelatedPeopleResolvedAtWriteTimeAndUnresolvableDropped(): Promise<void> {
  const p = participation({
    interactionId: 'rel-1',
    email: 'mentor@example.com',
    relatedPersonEmails: ['student-known@example.com', 'student-unknown@example.com'],
  });
  const captured: { entryValues: Record<string, unknown> | null } = { entryValues: null };
  const client = fakeClient({
    write: (async (method: string, path: string, body: unknown) => {
      if (method === 'POST' && path === '/v2/lists/list-1/entries') {
        captured.entryValues = (body as { data: { entry_values: Record<string, unknown> } }).data.entry_values;
      }
      return {};
    }) as AttioClient['write'],
  });

  const peopleByEmail = new Map([
    [p.email, 'person-mentor'],
    ['student-known@example.com', 'person-student-known'],
    // student-unknown@example.com deliberately absent, e.g. its own row had a bad email.
  ]);

  await writeChanges(client, 'list-1', {
    peopleToUpsert: [], peopleToFixName: [], entriesToCreate: [p], entriesToUpdate: [], unchangedCount: 0,
  }, peopleByEmail);

  assertEqual(
    captured.entryValues?.related_people,
    [{ target_object: 'people', target_record_id: 'person-student-known' }],
    'Only the resolvable related person is written; the unresolvable one is silently dropped, not a failure',
  );
}

async function testPeopleToFixNameIssuesPutWithNameAndCounts(): Promise<void> {
  const captured: { values: Record<string, unknown> | null } = { values: null };
  const client = fakeClient({
    write: (async (method: string, path: string, body: unknown) => {
      if (method === 'PUT' && path.includes('/objects/people/records')) {
        captured.values = (body as { data: { values: Record<string, unknown> } }).data.values;
      }
      return { data: { id: { record_id: 'person-1' } } };
    }) as AttioClient['write'],
  });

  const result = await writeChanges(client, 'list-1', {
    peopleToUpsert: [],
    peopleToFixName: [{ email: 'alice@example.com', givenName: 'Alice', surname: 'Smith' }],
    entriesToCreate: [],
    entriesToUpdate: [],
    unchangedCount: 0,
  }, new Map([['alice@example.com', 'person-1']]));

  assertEqual(result.peopleNameFixed, 1, 'The name fix is counted separately from peopleCreated');
  assertEqual(result.peopleCreated, 0, 'A name fix on an existing person is not counted as a person created');
  assertEqual(
    captured.values?.name,
    [{ first_name: 'Alice', last_name: 'Smith', full_name: 'Alice Smith' }],
    'The fix is written as a PUT with the corrected name',
  );
}

async function testSingleRowFailureDoesNotAbortRemainingPlan(): Promise<void> {
  const p1 = participation({ interactionId: 'fail-1', email: 'fail@example.com' });
  const p2 = participation({ interactionId: 'ok-1', email: 'ok@example.com' });
  let calls = 0;
  const client = fakeClient({
    write: (async (method: string, path: string) => {
      if (method === 'POST' && path.includes('/entries')) {
        calls += 1;
        if (path === '/v2/lists/list-1/entries' && calls === 1) {
          throw new AttioApiError(500, { message: 'boom' }, 'internal_error', 'unknown');
        }
      }
      return {};
    }) as AttioClient['write'],
  });

  const result = await writeChanges(client, 'list-1', {
    peopleToUpsert: [],
    peopleToFixName: [],
    entriesToCreate: [p1, p2],
    entriesToUpdate: [],
    unchangedCount: 0,
  }, new Map([[p1.email, 'person-1'], [p2.email, 'person-2']]));

  assertEqual(result.rowsFailed.length, 1, 'Exactly one row failure is recorded');
  assertEqual(result.rowsFailed[0].interactionId, 'fail-1', 'The failure is attributed to the right row');
  assertEqual(result.entriesCreated, 1, 'The remaining row still succeeds despite the earlier failure');
}

// --- HTTP client: 429 + Retry-After ---------------------------------------------------------

async function testRetryAfterDateIsRespected(): Promise<void> {
  let callCount = 0;
  // toUTCString() truncates to whole seconds, so use a large enough delta that the
  // rounding-down can't put retryAt in the past.
  const retryAt = new Date(Date.now() + 2000).toUTCString();
  const fetchStub = (async (_url: string) => {
    callCount += 1;
    if (callCount === 1) {
      return new Response('{"message":"rate limited"}', {
        status: 429,
        headers: new Headers({ 'retry-after': retryAt }),
      });
    }
    return new Response('{"ok":true}', { status: 200 });
  }) as unknown as typeof fetch;

  const client = createAttioClient('fake-token', fetchStub);
  const start = Date.now();
  const result = await client.write<{ ok: boolean }>('POST', '/v2/some/path', { a: 1 });
  const elapsed = Date.now() - start;

  assertEqual(callCount, 2, 'Client retries once after a 429');
  assertEqual(result, { ok: true }, 'The retried request eventually succeeds');
  assert(elapsed >= 800, 'The client actually waited for roughly the Retry-After duration');
}

// Note: the lock-held-skips-without-writing scenario (spec test #8) isn't covered here.
// runAlumniInteractionsSync() acquires the advisory lock via a plain prisma.$queryRaw call
// on the shared Container-managed PrismaClient, with no injection seam for stubbing it —
// exercising that path cleanly would need a real Postgres connection.

async function main(): Promise<void> {
  await testBlankEmailExcluded();
  await testParticipatedAtHandlesStringTimestampFromQueryRaw();
  await testRelatedPersonEmailsParsedFromArrayAndPgLiteral();
  await testCanonicalNamePicksMostRecentParticipation();
  await testPersonResolvesFromAnyEmail();
  await testExistingRelatedPeopleResolvedFromRecordIds();
  await testUniquenessConflictTreatedAsSuccess();
  await testRelatedPeopleResolvedAtWriteTimeAndUnresolvableDropped();
  await testPeopleToFixNameIssuesPutWithNameAndCounts();
  await testSingleRowFailureDoesNotAbortRemainingPlan();
  await testRetryAfterDateIsRespected();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
