/**
 * Offline unit tests for slackSendEmailResponseReminder. No live DB or Slack HTTP access —
 * PrismaClient is stubbed via the typedi Container and the exact `where` payload is
 * re-validated against the REAL generated Prisma client. Slack chat.postMessage is captured
 * via WebClient.prototype.apiCall stub.
 *
 * Run with:
 *   npx tsx src/activities/tasks/slackSendEmailResponseReminder.test.ts
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import Container from 'typedi';
import task from './slackSendEmailResponseReminder';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) { failures += 1; console.error(`FAILED: ${message}`); }
  else { console.log(`PASSED: ${message}`); }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures += 1; console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`); }
  else { console.log(`PASSED: ${message}`); }
}

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
    { slackId: true },
  );
  assertInvalidStudentWhere(r, 'NEGATIVE CONTROL (old buggy students:{some} shape)');
})();

// --- Positive control: plainly valid scalar partnerCode where passes validation ---------

(async function testPositiveControlScalarShapeValid() {
  const r = await validateStudentWhere(
    { eventId: 'e1', slackId: { not: null }, partnerCode: { equals: 'X', mode: 'insensitive' } },
    { slackId: true },
  );
  assertValidStudentWhere(r, 'POSITIVE CONTROL (scalar partnerCode shape)');
})();

async function testPartnerCodeFiltersOnScalarColumn(): Promise<void> {
  const calls: any[] = [];
  const posts: any[] = [];
  Container.set(PrismaClient, makeMockPrisma([{ slackId: 'E1' }, { slackId: 'E2' }], calls));
  const restore = patchSlackPosts(posts);

  let threw: any = null;
  try {
    await task(ctx, { channel: 'C1', intro: 'reply please', partnerCode: 'PARTNER1' });
  } catch (e: any) { threw = e; }
  assert(threw === null, `partnerCode branch did not throw (got ${threw && threw.message})`);
  const where = calls[0]?.where;
  assert(!!where && where.partnerCode && where.partnerCode.equals === 'PARTNER1', 'where filters on scalar partnerCode');
  assert(!!where && where.students === undefined, 'where has NO students relation key');
  assert(!!where && JSON.stringify(where.projectEmails) === JSON.stringify({ none: {} }), 'keeps projectEmails none filter when no emailId');
  const r = await validateStudentWhere(where, calls[0]?.select ?? { slackId: true });
  assertValidStudentWhere(r, 'captured where');
  assertEqual(posts.length, 1, 'posts one message');
  if (posts.length === 1) {
    const text = posts[0].args.blocks[0].text.text;
    assert(text.includes('<@E1>') && text.includes('<@E2>'), 'posts both matched students');
  }
  restore();
}

async function testNoPartnerCodeOmitsPartnerFilter(): Promise<void> {
  const calls: any[] = [];
  const posts: any[] = [];
  Container.set(PrismaClient, makeMockPrisma([], calls));
  const restore = patchSlackPosts(posts);
  await task(ctx, { channel: 'C1', intro: 'hi' });
  const where = calls[0]?.where;
  assert(!!where && where.partnerCode === undefined && where.students === undefined, 'no partnerCode / students filter when partnerCode omitted');
  assert(!!where && JSON.stringify(where.projectEmails) === JSON.stringify({ none: {} }), 'keeps projectEmails none filter when no emailId');
  assert(!!where && JSON.stringify(where.slackId) === JSON.stringify({ not: null }), 'keeps slackId not null filter');
  const r = await validateStudentWhere(where, calls[0]?.select);
  assertValidStudentWhere(r, 'no-partnerCode captured where');
  restore();
}

async function testEmailIdAppliesProjectEmailsNoneFilter(): Promise<void> {
  const calls: any[] = [];
  const posts: any[] = [];
  Container.set(PrismaClient, makeMockPrisma([], calls));
  const restore = patchSlackPosts(posts);
  await task(ctx, { channel: 'C1', intro: 'hi', emailId: 'MAIL1' });
  const where = calls[0]?.where;
  assertEqual(where?.projectEmails, { none: { emailSent: { emailId: 'MAIL1' } } }, 'applies projectEmails none{emailSent.emailId} when emailId set');
  const r = await validateStudentWhere(where, calls[0]?.select);
  assertValidStudentWhere(r, 'emailId captured where');
  restore();
}

async function testPostsNothingWhenEmpty(): Promise<void> {
  const posts: any[] = [];
  Container.set(PrismaClient, makeMockPrisma([], []));
  const restore = patchSlackPosts(posts);
  await task(ctx, { channel: 'C1', intro: 'hi', partnerCode: 'NOONE' });
  assertEqual(posts.length, 0, 'no Slack post when no students match');
  restore();
}

async function testRejectsOnMissingRequiredArgs(): Promise<void> {
  Container.set(PrismaClient, makeMockPrisma([], []));
  const restore = patchSlackPosts([]);
  let missingChannel: any = null;
  try { await task(ctx, { intro: 'hi' } as any); } catch (e: any) { missingChannel = e; }
  assert(!!missingChannel && /Must specify channel/.test(missingChannel.message), 'throws when channel missing');
  let missingIntro: any = null;
  try { await task(ctx, { channel: 'C1' } as any); } catch (e: any) { missingIntro = e; }
  assert(!!missingIntro && /Must specify intro/.test(missingIntro.message), 'throws when intro missing');
  restore();
}

async function main(): Promise<void> {
  await testPartnerCodeFiltersOnScalarColumn();
  await testNoPartnerCodeOmitsPartnerFilter();
  await testEmailIdAppliesProjectEmailsNoneFilter();
  await testPostsNothingWhenEmpty();
  await testRejectsOnMissingRequiredArgs();
  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
