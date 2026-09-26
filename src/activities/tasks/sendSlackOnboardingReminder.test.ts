/**
 * Offline unit tests for sendSlackOnboardingReminder. No live DB or Slack HTTP access —
 * PrismaClient is stubbed via the typedi Container (the production seam) and the exact `where`
 * payload the activity builds is re-validated against the REAL generated Prisma client
 * (client-side validation throws before any DB contact for an invalid `where`).
 * Slack chat.postMessage is captured by stubbing WebClient.prototype.apiCall (the slack
 * module's `export function` is a non-configurable getter under tsx, so the export itself
 * cannot be monkeypatched — apiCall is the lowest-level seam all Slack methods funnel through).
 *
 * Run with:
 *   npx tsx src/activities/tasks/sendSlackOnboardingReminder.test.ts
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import Container from 'typedi';
import task from './sendSlackOnboardingReminder';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) { failures += 1; console.error(`FAILED: ${message}`); }
  else { console.log(`PASSED: ${message}`); }
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

// Real Prisma client used ONLY for client-side `where` validation. An invalid `where` throws
// PrismaClientValidationError before any DB contact. A valid `where` passes validation, then
// attempts a DB connection and throws PrismaClientInitializationError (no DB here) — that
// initialization error is the desired "validation SUCCEEDED" signal.
const realPrisma = new PrismaClient();

interface ValidationResult {
  threw: boolean;
  errClass: string;
  isValidationError: boolean;
  mentionsUnknownArgStudents: boolean;
}

async function validateStudentWhere(where: object, select: object): Promise<ValidationResult> {
  try {
    await realPrisma.student.findMany({ where: where as any, select: select as any });
    return { threw: false, errClass: '', isValidationError: false, mentionsUnknownArgStudents: false };
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    return {
      threw: true,
      errClass: e?.constructor?.name ?? '',
      isValidationError: /PrismaClientValidationError/.test(e?.constructor?.name ?? ''),
      mentionsUnknownArgStudents: /Unknown arg `students`/.test(msg),
    };
  }
}

function assertValidStudentWhere(r: ValidationResult, label: string): void {
  assert(!r.isValidationError, `${label}: real Prisma client did NOT throw PrismaClientValidationError (got ${r.errClass})`);
  assert(!r.mentionsUnknownArgStudents, `${label}: error must not mention "Unknown arg \`students\`"`);
}

function assertInvalidStudentWhere(r: ValidationResult, label: string): void {
  assert(r.threw, `${label}: real Prisma client threw (expected for the buggy shape)`);
  assert(r.isValidationError, `${label}: thrown error is PrismaClientValidationError (got ${r.errClass})`);
  assert(r.mentionsUnknownArgStudents, `${label}: error message mentions "Unknown arg \`students\`"`);
}

function slackConfiguredEvent() {
  return { id: 'evt-1', slackWorkspaceId: 'W', slackWorkspaceAccessToken: 'T', name: 'TestEvent' };
}

function makeMockPrisma(studentRows: any[], calls: any[]) {
  return {
    event: { findFirst: async () => slackConfiguredEvent() },
    student: {
      findMany: async (a: any) => {
        calls.push(a);
        return studentRows;
      },
    },
  } as any;
}

function patchSlackPosts(posts: any[]): () => void {
  const orig = WebClient.prototype.apiCall as any;
  WebClient.prototype.apiCall = async function (method: string, args?: any) {
    if (method === 'chat.postMessage') posts.push({ method, args });
    return { ok: true } as any;
  } as any;
  return () => { WebClient.prototype.apiCall = orig; };
}

const ctx = { auth: { eventId: 'evt-1' } } as any;

// --- Negative control: harness detects the OLD buggy where -----------------------------

(async function testNegativeControlOldBuggyShapeDetected() {
  const r = await validateStudentWhere(
    { eventId: 'e1', slackId: { not: null }, students: { some: { partnerCode: { equals: 'X', mode: 'insensitive' } } } },
    { slackId: true, tagTrainingSubmissions: { select: { id: true } } },
  );
  assertInvalidStudentWhere(r, 'NEGATIVE CONTROL (old buggy students:{some} shape)');
})();

// --- Positive control: plainly valid scalar partnerCode where passes validation ---------

(async function testPositiveControlScalarShapeValid() {
  const r = await validateStudentWhere(
    { eventId: 'e1', slackId: { not: null }, partnerCode: { equals: 'X', mode: 'insensitive' } },
    { slackId: true, tagTrainingSubmissions: { select: { id: true } } },
  );
  assertValidStudentWhere(r, 'POSITIVE CONTROL (scalar partnerCode shape)');
})();

// --- Activity behavior tests (async) ---------------------------------------------------

async function testPartnerCodeFiltersOnScalarColumn(): Promise<void> {
  const calls: any[] = [];
  const posts: any[] = [];
  Container.set(PrismaClient, makeMockPrisma([
    { slackId: 'S1', tagTrainingSubmissions: [] },
    { slackId: 'S2', tagTrainingSubmissions: [{ id: 't1' }, { id: 't2' }] },
  ], calls));
  const restore = patchSlackPosts(posts);

  let threw: any = null;
  try {
    await task(ctx, { channel: 'C1', intro: 'please', min: 2, partnerCode: 'PARTNER1' });
  } catch (e: any) { threw = e; }
  assert(threw === null, `partnerCode branch did not throw (got ${threw && threw.constructor.name})`);
  assertEqual(calls.length, 1, 'student.findMany called exactly once');
  const where = calls[0]?.where;
  assert(!!where && where.partnerCode && where.partnerCode.equals === 'PARTNER1' && where.partnerCode.mode === 'insensitive', 'where filters on scalar partnerCode (equals + insensitive)');
  assert(!!where && where.students === undefined, 'where has NO students relation key (the bug)');
  assert(!!where && where.eventId === 'evt-1', 'where filters on eventId');
  assertEqual(where?.slackId, { not: null }, 'where filters on slackId not null');
  const r = await validateStudentWhere(where, calls[0]?.select);
  assertValidStudentWhere(r, 'captured where');
  restore();
}

async function testNoPartnerCodeOmitsPartnerFilter(): Promise<void> {
  const calls: any[] = [];
  const posts: any[] = [];
  Container.set(PrismaClient, makeMockPrisma([], calls));
  const restore = patchSlackPosts(posts);
  await task(ctx, { channel: 'C1', intro: 'hi', min: 1 });
  const where = calls[0]?.where;
  assert(!!where && where.partnerCode === undefined && where.students === undefined, 'no partnerCode / students filter when partnerCode omitted');
  const r = await validateStudentWhere(where, calls[0]?.select);
  assertValidStudentWhere(r, 'no-partnerCode captured where');
  assertEqual(posts.length, 0, 'no Slack post when no qualifying students');
  restore();
}

async function testPostsMessageForQualifyingStudents(): Promise<void> {
  const calls: any[] = [];
  const posts: any[] = [];
  Container.set(PrismaClient, makeMockPrisma([
    { slackId: 'S1', tagTrainingSubmissions: [] },
    { slackId: 'S2', tagTrainingSubmissions: [{ id: 't1' }, { id: 't2' }] },
  ], calls));
  const restore = patchSlackPosts(posts);
  await task(ctx, { channel: 'C1', intro: 'please', min: 2, partnerCode: 'PARTNER1' });
  assertEqual(posts.length, 1, 'slack.chat.postMessage called once');
  if (posts.length === 1) {
    const text = posts[0].args.blocks[0].text.text;
    assert(text.includes('TestEvent'), 'posted text includes event name');
    assert(text.includes('please'), 'posted text includes intro');
    assert(text.includes('<@S1>'), 'posted text includes qualifying student S1 (<min submissions)');
    assert(!text.includes('<@S2>'), 'posted text excludes S2 (>= min submissions)');
    assertEqual(posts[0].args.channel, 'C1', 'posted to requested channel');
  }
  restore();
}

async function testPostsNothingWhenNoQualifyingStudents(): Promise<void> {
  const posts: any[] = [];
  Container.set(PrismaClient, makeMockPrisma([
    { slackId: 'S1', tagTrainingSubmissions: [{ id: 't1' }] },
  ], []));
  const restore = patchSlackPosts(posts);
  await task(ctx, { channel: 'C1', intro: 'hi', min: 1 });
  assertEqual(posts.length, 0, 'no Slack post when all students have >= min submissions');
  restore();
}

async function testPostsNothingWhenPartnerCodeMatchesNoStudents(): Promise<void> {
  const posts: any[] = [];
  Container.set(PrismaClient, makeMockPrisma([], []));
  const restore = patchSlackPosts(posts);
  await task(ctx, { channel: 'C1', intro: 'hi', min: 1, partnerCode: 'NOONE' });
  assertEqual(posts.length, 0, 'no Slack post when partnerCode matches no students');
  restore();
}

async function testRejectsOnMissingRequiredArgs(): Promise<void> {
  Container.set(PrismaClient, makeMockPrisma([], []));
  const restore = patchSlackPosts([]);
  let missingChannel: any = null;
  try { await task(ctx, { intro: 'hi', min: 1 } as any); } catch (e: any) { missingChannel = e; }
  assert(!!missingChannel && /Must specify channel/.test(missingChannel.message), 'throws when channel missing');
  let missingIntro: any = null;
  try { await task(ctx, { channel: 'C1', min: 1 } as any); } catch (e: any) { missingIntro = e; }
  assert(!!missingIntro && /Must specify intro/.test(missingIntro.message), 'throws when intro missing');
  let missingMin: any = null;
  try { await task(ctx, { channel: 'C1', intro: 'hi' } as any); } catch (e: any) { missingMin = e; }
  assert(!!missingMin && /Must specify minimum/.test(missingMin.message), 'throws when min missing');
  restore();
}

async function main(): Promise<void> {
  await testPartnerCodeFiltersOnScalarColumn();
  await testNoPartnerCodeOmitsPartnerFilter();
  await testPostsMessageForQualifyingStudents();
  await testPostsNothingWhenNoQualifyingStudents();
  await testPostsNothingWhenPartnerCodeMatchesNoStudents();
  await testRejectsOnMissingRequiredArgs();
  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
