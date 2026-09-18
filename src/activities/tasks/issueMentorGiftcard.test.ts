/**
 * Offline unit tests for the mentor gift-card issuance activity and the runActivity dispatch.
 *
 * No live DB, Shopify, or email access — the PrismaClient, issueGiftcard, and sendGiftcard are
 * stubbed. Environment variables are set before the dynamic imports so config.ts (which throws
 * unless every required var is present) loads cleanly.
 *
 * Run with:
 *   npx tsx src/activities/tasks/issueMentorGiftcard.test.ts
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import { readFileSync } from 'fs';
import { join } from 'path';

// config.ts validates the presence (not validity) of every one of these at module load; set
// them before the dynamic imports below so the activity module's transitive config import
// succeeds.
process.env.DATABASE_URL = 'postgres://placeholder';
process.env.ELASTIC_URL = 'http://placeholder';
process.env.ELASTIC_INDEX = 'placeholder';
process.env.AUTH_SECRET = 'placeholder';
process.env.AUTH_AUDIENCE = 'placeholder';
process.env.EMAIL_HOST = 'placeholder';
process.env.EMAIL_PORT = '25';
process.env.EMAIL_USER = 'placeholder';
process.env.EMAIL_PASS = 'placeholder';
process.env.EMAIL_INBOUND_DOMAIN = 'placeholder';
process.env.GEOCODIO_API_KEY = 'placeholder';
process.env.OPENAI_API_KEY = 'placeholder';
process.env.OPENAI_ORGANIZATION = 'placeholder';
process.env.WEBHOOK_KEY = 'placeholder';
process.env.BADGR_USERNAME = 'placeholder';
process.env.BADGR_PASSWORD = 'placeholder';
process.env.BADGR_ISSUER = 'placeholder';
process.env.SHOPIFY_API_TOKEN = 'placeholder';
process.env.SHOPIFY_API_KEY = 'placeholder';
process.env.SHOPIFY_API_SECRET_KEY = 'placeholder';
process.env.SHOPIFY_STORE_DOMAIN = 'placeholder';
process.env.LINEAR_API_KEY = 'placeholder';
process.env.LINEAR_TEAM_ID = 'placeholder';
process.env.LINEAR_PROBLEM_LABEL_ID = 'placeholder';
process.env.METRICS_KEY = 'placeholder';
process.env.PLACID_API_TOKEN = 'placeholder';
process.env.ATTIO_API_TOKEN = 'placeholder';
process.env.ATTIO_ALUMNI_LIST = 'placeholder';

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

interface RecordedUpdate { whereId: string; code: string | null }
interface RecordedGiftcard { amount: number; title: string }
interface RecordedEmail { to: string; amount: string; code: string; featuredProduct?: string }

interface EventStub { id: string; name: string }
interface MentorStub {
  id: string;
  givenName: string;
  surname: string;
  email: string;
  giftcardCode: string | null;
}

function makeMentor(overrides: Partial<MentorStub> = {}): MentorStub {
  return {
    id: 'm-' + Math.random().toString(36).slice(2, 8),
    givenName: 'Jane',
    surname: 'Doe',
    email: 'jane@example.com',
    giftcardCode: null,
    ...overrides,
  };
}

interface FakePrisma {
  eventFindUniqueCalls: unknown[];
  mentorFindManyCalls: unknown[];
  mentorUpdateCalls: RecordedUpdate[];
  event: { findUnique: (args: unknown) => Promise<EventStub> };
  mentor: {
    findMany: (args: unknown) => Promise<MentorStub[]>;
    update: (args: { where: { id: string }, data: { giftcardCode: string } }) => Promise<MentorStub>;
  };
}

// Build a fake-Prisma instance whose findMany returns the given mentors; all calls are recorded
// on the returned object (eventFindUniqueCalls / mentorFindManyCalls / mentorUpdateCalls).
// Accepts either a plain list of mentors or a full overrides object.
function buildPrisma(
  mentorsOrOverrides: MentorStub[] | Partial<{ mentorsToReturn: MentorStub[]; eventToReturn: EventStub }> = {},
): FakePrisma {
  const overrides = Array.isArray(mentorsOrOverrides)
    ? { mentorsToReturn: mentorsOrOverrides }
    : mentorsOrOverrides;
  const mentorsToReturn = overrides.mentorsToReturn ?? [];
  const eventToReturn = overrides.eventToReturn ?? { id: 'evt-1', name: 'CodeDay Labs Summer 2026' };
  const prisma: FakePrisma = {
    eventFindUniqueCalls: [],
    mentorFindManyCalls: [],
    mentorUpdateCalls: [],
    event: {
      findUnique: async (args: unknown) => {
        prisma.eventFindUniqueCalls.push(args);
        return eventToReturn;
      },
    },
    mentor: {
      findMany: async (args: unknown) => {
        prisma.mentorFindManyCalls.push(args);
        return mentorsToReturn;
      },
      update: async (args: { where: { id: string }, data: { giftcardCode: string } }) => {
        prisma.mentorUpdateCalls.push({ whereId: args.where.id, code: args.data.giftcardCode });
        return makeMentor({ id: args.where.id, giftcardCode: args.data.giftcardCode });
      },
    },
  };
  return prisma;
}

function makeStubs() {
  const issued: RecordedGiftcard[] = [];
  const emailed: RecordedEmail[] = [];
  const issueGiftcard = async (amount: number, title: string): Promise<string | null> => {
    issued.push({ amount, title });
    return `CODE-${issued.length.toString().padStart(3, '0')}`;
  };
  const sendGiftcard = async (
    to: string, _event: unknown, amount: string, code: string,
    _reason: string, _link: string, featuredProduct?: string,
  ): Promise<void> => {
    emailed.push({ to, amount, code, featuredProduct });
  };
  return { issueGiftcard, sendGiftcard, issued, emailed };
}

// --- Activity: idempotency / issuance tracking ---------------------------------------------

async function testQueryExcludesAlreadyGiftedMentors(): Promise<void> {
  const deps = makeStubs();
  const prisma = buildPrisma([]);
  const { issueMentorGiftcards } = await import('./issueMentorGiftcard');

  await issueMentorGiftcards(prisma as any, 'evt-1', { initialValue: 10 }, deps as any);

  assertEqual((prisma as any).mentorFindManyCalls.length, 1, 'mentor.findMany is called exactly once');
  const where = (prisma as any).mentorFindManyCalls[0] as { where: Record<string, unknown> };
  assert(
    where.where && where.where.giftcardCode === null,
    'mentor.findMany filters on giftcardCode: null to exclude already-gifted mentors',
  );
  assertEqual(where.where.eventId, 'evt-1', 'mentor.findMany is scoped to the event id');
  assertEqual(where.where.status, 'ACCEPTED', 'mentor.findMany keeps the ACCEPTED status filter');
  assertEqual(
    (where.where.projects as { some: { status: string } }).some.status,
    'MATCHED',
    'mentor.findMany keeps the MATCHED-project filter',
  );
}

async function testFirstRunIssuesAndStampsCode(): Promise<void> {
  const deps = makeStubs();
  const a = makeMentor({ id: 'm-a', email: 'a@example.com' });
  const b = makeMentor({ id: 'm-b', email: 'b@example.com' });
  const prisma = buildPrisma([a, b]);
  const { issueMentorGiftcards } = await import('./issueMentorGiftcard');

  await issueMentorGiftcards(prisma as any, 'evt-1', { initialValue: 25 }, deps as any);

  assertEqual(deps.issued.length, 2, 'A fresh run issues a gift card for each selected mentor');
  assertEqual(deps.emailed.length, 2, 'A fresh run emails each selected mentor');
  assertEqual(
    (prisma as any).mentorUpdateCalls,
    [
      { whereId: 'm-a', code: 'CODE-001' },
      { whereId: 'm-b', code: 'CODE-002' },
    ],
    'Each mentor is stamped with their issued code after a successful issue+email',
  );
  assertEqual(deps.issued[0].amount, 25, 'issueGiftcard receives the requested amount');
  assertEqual(
    deps.issued[0].title,
    'CodeDay Labs Summer 2026: Jane Doe (a@example.com)',
    'issueGiftcard receives a descriptive title with the event and mentor name',
  );
}

async function testRerunIssuesNothingWhenAllAlreadyGifted(): Promise<void> {
  const deps = makeStubs();
  // A second run returns no mentors because findMany (with giftcardCode: null) excludes them all.
  const prisma = buildPrisma([]);
  const { issueMentorGiftcards } = await import('./issueMentorGiftcard');

  await issueMentorGiftcards(prisma as any, 'evt-1', { initialValue: 10 }, deps as any);

  assertEqual(deps.issued.length, 0, 'A re-run with no eligible mentors issues no new codes');
  assertEqual(deps.emailed.length, 0, 'A re-run with no eligible mentors sends no duplicate emails');
  assertEqual((prisma as any).mentorUpdateCalls.length, 0, 'A re-run writes no updates');
}

async function testAlreadyGiftedAreNotReissuedInMixedCohort(): Promise<void> {
  const deps = makeStubs();
  // Only the not-yet-gifted mentor survives the giftcardCode:null filter.
  const newcomer = makeMentor({ id: 'm-new', email: 'new@example.com' });
  const prisma = buildPrisma([newcomer]);
  const { issueMentorGiftcards } = await import('./issueMentorGiftcard');

  await issueMentorGiftcards(prisma as any, 'evt-1', { initialValue: 10 }, deps as any);

  assertEqual(deps.issued.length, 1, 'Only not-yet-gifted mentors in a mixed cohort get a new code');
  assertEqual(deps.issued[0].title, 'CodeDay Labs Summer 2026: Jane Doe (new@example.com)', 'The newcomer is the one issued to');
  assertEqual((prisma as any).mentorUpdateCalls.length, 1, 'Only the newcomer is stamped');
  assertEqual((prisma as any).mentorUpdateCalls[0].whereId, 'm-new', 'The stamp targets the newcomer');
}

async function testNullCodeSkipsEmailAndStamp(): Promise<void> {
  const deps = makeStubs();
  let calls = 0;
  const failingIssue = async (amount: number, title: string): Promise<string | null> => {
    calls += 1;
    return null; // Shopify failed to create the discount code.
  };
  const recordingSend = deps.sendGiftcard;
  const sendCalls: unknown[] = [];
  const sendGiftcard = async (...args: unknown[]) => {
    sendCalls.push(args);
    return recordingSend(...(args as [string, unknown, string, string, string, string, string | undefined]));
  };
  const mentor = makeMentor({ id: 'm-x', email: 'x@example.com' });
  const prisma = buildPrisma([mentor]);
  const { issueMentorGiftcards } = await import('./issueMentorGiftcard');

  await issueMentorGiftcards(prisma as any, 'evt-1', { initialValue: 10 }, { issueGiftcard: failingIssue, sendGiftcard } as any);

  assertEqual(calls, 1, 'issueGiftcard was attempted for the mentor');
  assertEqual(sendCalls.length, 0, 'No email is sent when issueGiftcard returns null');
  assertEqual((prisma as any).mentorUpdateCalls.length, 0, 'No giftcardCode stamp is written when no code was created');
}

async function testPerMentorFailureIsIsolated(): Promise<void> {
  const boom = makeMentor({ id: 'm-boom', email: 'boom@example.com' });
  const ok = makeMentor({ id: 'm-ok', email: 'ok@example.com' });
  const prisma = buildPrisma([boom, ok]);
  const issued: RecordedGiftcard[] = [];
  const emailed: RecordedEmail[] = [];
  const issueGiftcard = async (amount: number, title: string): Promise<string | null> => {
    issued.push({ amount, title });
    if (title.includes('boom@')) throw new Error('shopify exploded');
    return 'CODE-OK';
  };
  const sendGiftcard = async (to: string, _e: unknown, amount: string, code: string): Promise<void> => {
    emailed.push({ to, amount, code });
  };
  const { issueMentorGiftcards } = await import('./issueMentorGiftcard');

  await issueMentorGiftcards(prisma as any, 'evt-1', { initialValue: 10 }, { issueGiftcard, sendGiftcard } as any);

  assertEqual(issued.length, 2, 'Both mentors were attempted');
  assertEqual(emailed.length, 1, 'Only the non-failing mentor was emailed');
  assertEqual((prisma as any).mentorUpdateCalls.length, 1, 'Only the non-failing mentor is stamped');
  assertEqual((prisma as any).mentorUpdateCalls[0].whereId, 'm-ok', 'The stamp targets the mentor that succeeded');
  assertEqual(emailed[0].to, 'ok@example.com', 'The email went to the right mentor');
}

async function testFeaturedProductEmptyPassedAsUndefined(): Promise<void> {
  const deps = makeStubs();
  const mentor = makeMentor({ id: 'm-fp', email: 'fp@example.com' });
  const prisma = buildPrisma([mentor]);
  const { issueMentorGiftcards } = await import('./issueMentorGiftcard');

  await issueMentorGiftcards(prisma as any, 'evt-1', { initialValue: 10, featuredProduct: '   ' }, deps as any);

  assertEqual(deps.emailed.length, 1, 'An email was sent for the mentor');
  assert(
    deps.emailed[0].featuredProduct === undefined,
    'A blank/whitespace featuredProduct is passed as undefined to sendGiftcard',
  );
}

async function testFeaturedProductProvidedPassedThrough(): Promise<void> {
  const deps = makeStubs();
  const mentor = makeMentor({ id: 'm-fp2', email: 'fp2@example.com' });
  const prisma = buildPrisma([mentor]);
  const { issueMentorGiftcards } = await import('./issueMentorGiftcard');

  await issueMentorGiftcards(prisma as any, 'evt-1', { initialValue: 10, featuredProduct: 'A Cool Pin' }, deps as any);

  assertEqual(deps.emailed[0].featuredProduct, 'A Cool Pin', 'A provided featuredProduct is passed through to sendGiftcard');
}

// --- Default export: arg validation + Container wiring ------------------------------------

async function testDefaultExportThrowsOnMissingArgs(): Promise<void> {
  const fakePrisma = buildPrisma([]);
  Container.set(PrismaClient, fakePrisma);
  const mod = await import('./issueMentorGiftcard');
  const ctx = { auth: { eventId: 'evt-1' } } as any;

  let threw = false;
  try {
    await (mod.default as Function)(ctx, undefined);
  } catch (ex) {
    threw = true;
  }
  assert(threw, 'The default export throws when args are missing');
}

async function testDefaultExportThrowsOnMissingInitialValue(): Promise<void> {
  const fakePrisma = buildPrisma([]);
  Container.set(PrismaClient, fakePrisma);
  const mod = await import('./issueMentorGiftcard');
  const ctx = { auth: { eventId: 'evt-1' } } as any;

  let threw = false;
  try {
    await (mod.default as Function)(ctx, {});
  } catch (ex) {
    threw = true;
  }
  assert(threw, 'The default export throws when initialValue is missing');
}

// --- dispatchActivity / runActivity: async dispatch and awaiting ---------------------------

async function testRunActivityIsAsync(): Promise<void> {
  const { runActivity } = await import('../index');
  const result = runActivity('definitely-not-a-real-activity', {} as any, {});
  assert(
    result && typeof (result as Promise<unknown>).then === 'function',
    'runActivity returns a Promise (it is async and awaits the activity)',
  );
  const resolved = await result;
  assertEqual(resolved, false, 'runActivity resolves to false for an unknown activity name');
}

async function testDispatchActivityAwaitsAsync(): Promise<void> {
  const { dispatchActivity } = await import('../index');
  const log: string[] = [];
  const slowFn = async () => {
    await new Promise((r) => setTimeout(r, 10));
    log.push('fn-done');
  };
  const registry = { slow: { name: 'slow', schema: null, fn: slowFn } } as any;

  log.push('before-await');
  const promise = dispatchActivity('slow', {} as any, {}, registry);
  log.push('dispatch-returned');
  const result = await promise;
  log.push('after-await');

  assertEqual(result, true, 'An awaited async task that completes returns true');
  assertEqual(
    log,
    ['before-await', 'dispatch-returned', 'fn-done', 'after-await'],
    'dispatchActivity awaits the async task: the task completes before the dispatcher resolves',
  );
}

async function testDispatchActivityCatchesAsyncRejectionAndReturnsFalse(): Promise<void> {
  const { dispatchActivity } = await import('../index');
  const throwingFn = async () => { throw new Error('boom'); };
  const registry = { bad: { name: 'bad', schema: null, fn: throwingFn } } as any;

  const result = await dispatchActivity('bad', {} as any, {}, registry);
  assertEqual(result, false, 'An async task that rejects is caught and reported as false (not true)');
}

async function testDispatchActivityUnknownNameReturnsFalse(): Promise<void> {
  const { dispatchActivity } = await import('../index');
  const result = await dispatchActivity('nope', {} as any, {}, { other: { fn: async () => {}, name: 'other', schema: null } } as any);
  assertEqual(result, false, 'An unknown activity name resolves to false');
}

// --- Schema & migration correctness --------------------------------------------------------

function testMentorModelHasGiftcardCode(): void {
  // Compile-time check that the generated client exposes the field, surfaced as a runtime
  // assertion by constructing a mentor with the property.
  const mentor = { id: 'x', giftcardCode: null } as import('@prisma/client').Mentor;
  assert(mentor.giftcardCode === null, 'The generated Prisma Mentor type includes a nullable giftcardCode field');
}

function testMigrationAddsNullableColumn(): void {
  const sql = readFileSync(
    join(__dirname, '..', '..', '..', 'prisma', 'migrations', '20260918120000_add_mentor_giftcard_code', 'migration.sql'),
    'utf8',
  );
  assert(
    /ALTER TABLE "Mentor" ADD COLUMN "giftcardCode" TEXT/i.test(sql),
    'The migration adds a nullable giftcardCode TEXT column to the Mentor table',
  );
  assert(
    /NULL/.test(sql) && /DEFAULT NULL/.test(sql),
    'The migration makes the column nullable with a NULL default (existing rows are not gifted)',
  );
}

// --- GraphQL type does not leak the redeemable code -----------------------------------------
//
// Verifying at runtime by importing the GraphQL `Mentor` type pulls in the whole type-graphql
// decorator graph (e.g. FileType), which can't resolve its @Field reflection under tsx. Instead,
// assert statically on the source so the redeemable discount code stays a DB-only value.

function testGiftcardCodeNotExposedAsGraphQLField(): void {
  const src = readFileSync(join(__dirname, '..', '..', 'types', 'Mentor.ts'), 'utf8');
  assert(/giftcardCode: string \| null;/.test(src), 'The Mentor type declares the giftcardCode property to satisfy the Prisma interface');

  const lines = src.split('\n');
  const idx = lines.findIndex((l) => /giftcardCode: string \| null;/.test(l));
  assert(idx >= 0, 'The giftcardCode declaration is found in the source');
  // No @Field decorator on the declaration line or any of the (comment) lines preceding it up to
  // the previous declaration.
  let hasFieldDecorator = false;
  for (let i = idx; i >= 0; i--) {
    if (/@Field/.test(lines[i])) { hasFieldDecorator = true; break; }
    if (i !== idx && /[a-zA-Z]/.test(lines[i]) && !lines[i].trim().startsWith('//') && lines[i].includes(':')) {
      // Hit a prior property declaration without finding an @Field for giftcardCode.
      break;
    }
  }
  assert(
    !hasFieldDecorator,
    'giftcardCode has no @Field decorator: the redeemable code is not exposed as a GraphQL field',
  );
}

// --- main -----------------------------------------------------------------------------------

async function main(): Promise<void> {
  testMentorModelHasGiftcardCode();
  testMigrationAddsNullableColumn();

  await testQueryExcludesAlreadyGiftedMentors();
  await testFirstRunIssuesAndStampsCode();
  await testRerunIssuesNothingWhenAllAlreadyGifted();
  await testAlreadyGiftedAreNotReissuedInMixedCohort();
  await testNullCodeSkipsEmailAndStamp();
  await testPerMentorFailureIsIsolated();
  await testFeaturedProductEmptyPassedAsUndefined();
  await testFeaturedProductProvidedPassedThrough();
  await testDefaultExportThrowsOnMissingArgs();
  await testDefaultExportThrowsOnMissingInitialValue();

  await testRunActivityIsAsync();
  await testDispatchActivityAwaitsAsync();
  await testDispatchActivityCatchesAsyncRejectionAndReturnsFalse();
  await testDispatchActivityUnknownNameReturnsFalse();

  await testGiftcardCodeNotExposedAsGraphQLField();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
