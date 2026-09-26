/**
 * Offline unit tests for the `partnerCode` filter in:
 *   - slackSendEmailResponseReminder
 *   - sendSlackOnboardingReminder
 *
 * Background: these tasks query `prisma.student.findMany`. The `Student` model has a
 * scalar `partnerCode` (and no `students` relation), so filtering via
 * `{ students: { some: { partnerCode } } }` is rejected by the Prisma client with
 * `PrismaClientValidationError: Unknown arg 'students' in where.students for type
 * StudentWhereInput`. The fix filters the scalar `partnerCode` at the root of
 * `where`, mirroring `src/resolvers/Student.ts`.
 *
 * These tests do two things:
 *   1. Exercise the actual task modules with a stubbed Prisma client (injected through
 *      the typedi `Container`) and capture the `where` object passed to
 *      `student.findMany`, asserting it filters the scalar `partnerCode` directly and
 *      never uses a `students` relation filter.
 *   2. Validate the captured `where` (plus a reconstructed baseline) against a real
 *      `PrismaClient`. Prisma validates `where` client-side before opening a database
 *      connection, so the fixed `where` passes validation (then fails only because no
 *      DB is reachable) while the original buggy `where` is still rejected with
 *      `PrismaClientValidationError`. No database is required.
 *
 * Run with:
 *   npx tsx src/activities/tasks/slackSendEmailResponseReminder.test.ts
 *   npx ts-node src/activities/tasks/slackSendEmailResponseReminder.test.ts
 */
import '../_testEnv'; // MUST be first: sets env vars required by src/config before the task import
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import slackSendEmailResponseReminder from './slackSendEmailResponseReminder';
import slackSendOnboardingReminder from './sendSlackOnboardingReminder';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`PASSED: ${message}`);
  } else {
    failures += 1;
    console.error(`FAILED: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const aj = JSON.stringify(actual);
  const ej = JSON.stringify(expected);
  if (aj !== ej) {
    failures += 1;
    console.error(`FAILED: ${message}\n  expected: ${ej}\n  actual:   ${aj}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

// A real PrismaClient whose query engine fails to connect (no DB) can emit an
// unhandled rejection on its engine stream. Record stray errors so they never crash
// the process; assert at the end that none of them are validation errors.
const stray: unknown[] = [];
process.on('unhandledRejection', (e) => { stray.push(e); });
process.on('uncaughtException', (e) => { stray.push(e); });

interface Captured {
  studentWheres: any[];
  eventWheres: any[];
}

const FAKE_EVENT = {
  id: 'event-1',
  name: 'Test Event',
  slackWorkspaceId: 'T0001',
  slackWorkspaceAccessToken: 'xoxb-test-token',
};

// A PrismaClient stand-in: records the `where` passed to each query and returns
// triggers that keep the tasks off the network (no students => no Slack postMessage).
function makeFakePrisma(captured: Captured): PrismaClient {
  const fake = {
    event: {
      findFirst: async (args: any) => {
        captured.eventWheres.push(args?.where);
        return FAKE_EVENT;
      },
    },
    student: {
      findMany: async (args: any) => {
        captured.studentWheres.push(args?.where);
        return [];
      },
    },
    $disconnect: async () => {},
  };
  return fake as unknown as PrismaClient;
}

function fakeContext(eventId = 'codeday-labs-2022'): any {
  return { auth: { eventId } };
}

// --- Real Prisma client, used only for client-side `where` validation (no DB) ---
function newRealPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: 'postgresql://test:test@localhost:5432/test' } },
  } as any);
}

interface ClassifyResult {
  name: string;
  message: string;
}

async function classifyWhere(where: object): Promise<ClassifyResult | null> {
  const prisma = newRealPrisma();
  try {
    await prisma.student.findMany({ where: where as any, select: { slackId: true } });
    return null;
  } catch (ex: any) {
    return { name: ex?.constructor?.name ?? 'Error', message: String(ex?.message ?? '') };
  } finally {
    try { await prisma.$disconnect(); } catch { /* ignore */ }
  }
}

function isValidationError(res: ClassifyResult | null): boolean {
  return res !== null && res.name === 'PrismaClientValidationError';
}

async function assertWhereValidatesPrisma(label: string, where: object): Promise<void> {
  const res = await classifyWhere(where);
  assert(!isValidationError(res), `${label}: where passes Prisma client-side validation (no PrismaClientValidationError)`);
  if (res) {
    assert(!/Unknown arg `students`/.test(res.message), `${label}: where does not produce 'Unknown arg students'`);
  }
}

// ===== Tests: slackSendEmailResponseReminder =====

async function testEmailReminderCapturesRootPartnerCodeFilter(): Promise<void> {
  const captured: Captured = { studentWheres: [], eventWheres: [] };
  Container.set(PrismaClient, makeFakePrisma(captured));
  await slackSendEmailResponseReminder(fakeContext(), { channel: 'C1', intro: 'hi', partnerCode: 'CODEY' });

  assertEqual(captured.studentWheres.length, 1, 'email reminder: prisma.student.findMany called once');
  const where: any = captured.studentWheres[0];

  assert(!('students' in where), 'email reminder: where does NOT use a `students` relation filter');
  assert('partnerCode' in where, 'email reminder: where filters on the scalar `partnerCode`');
  assertEqual(where.partnerCode, { equals: 'CODEY', mode: 'insensitive' }, 'email reminder: partnerCode is a case-insensitive scalar match');
  assertEqual(where.eventId, 'codeday-labs-2022', 'email reminder: eventId filter preserved');
  assertEqual(where.slackId, { not: null }, 'email reminder: slackId != null filter preserved');
  assertEqual(where.projectEmails, { none: {} }, 'email reminder: default projectEmails none-filter preserved');

  await assertWhereValidatesPrisma('email reminder (partnerCode)', where);
}

async function testEmailReminderOmitsPartnerCodeWhenNotProvided(): Promise<void> {
  const captured: Captured = { studentWheres: [], eventWheres: [] };
  Container.set(PrismaClient, makeFakePrisma(captured));
  await slackSendEmailResponseReminder(fakeContext('evt-2'), { channel: 'C1', intro: 'hi' });

  assertEqual(captured.studentWheres.length, 1, 'email reminder (no partnerCode): findMany called once');
  const where: any = captured.studentWheres[0];
  assert(!('students' in where), 'email reminder (no partnerCode): where does NOT use a `students` relation filter');
  assert(!('partnerCode' in where), 'email reminder (no partnerCode): where omits partnerCode filter');
  assertEqual(where.eventId, 'evt-2', 'email reminder (no partnerCode): eventId filter preserved');
  assertEqual(where.projectEmails, { none: {} }, 'email reminder (no partnerCode): default projectEmails none-filter preserved');

  await assertWhereValidatesPrisma('email reminder (no partnerCode)', where);
}

async function testEmailReminderCombinesEmailIdAndPartnerCode(): Promise<void> {
  const captured: Captured = { studentWheres: [], eventWheres: [] };
  Container.set(PrismaClient, makeFakePrisma(captured));
  await slackSendEmailResponseReminder(fakeContext(), { channel: 'C1', intro: 'hi', emailId: 'email-1', partnerCode: 'CODEY' });

  const where: any = captured.studentWheres[0];
  assert(!('students' in where), 'email reminder (emailId+partnerCode): where does NOT use a `students` relation filter');
  assertEqual(where.partnerCode, { equals: 'CODEY', mode: 'insensitive' }, 'email reminder (emailId+partnerCode): partnerCode filter');
  assertEqual(where.projectEmails, { none: { emailSent: { emailId: 'email-1' } } }, 'email reminder (emailId+partnerCode): projectEmails none-filter scoped to emailId');

  await assertWhereValidatesPrisma('email reminder (emailId+partnerCode)', where);
}

async function testEmailReminderRejectsMissingChannel(): Promise<void> {
  const captured: Captured = { studentWheres: [], eventWheres: [] };
  Container.set(PrismaClient, makeFakePrisma(captured));
  let threw = false;
  try {
    await slackSendEmailResponseReminder(fakeContext(), { intro: 'hi', partnerCode: 'CODEY' } as any);
  } catch {
    threw = true;
  }
  assert(threw, 'email reminder: throws when channel is missing (args validation intact)');
  assertEqual(captured.studentWheres.length, 0, 'email reminder: no student query issued when args validation fails');
}

// ===== Tests: sendSlackOnboardingReminder =====

async function testOnboardingReminderCapturesRootPartnerCodeFilter(): Promise<void> {
  const captured: Captured = { studentWheres: [], eventWheres: [] };
  Container.set(PrismaClient, makeFakePrisma(captured));
  await slackSendOnboardingReminder(fakeContext(), { channel: 'C1', intro: 'hi', min: 3, partnerCode: 'CODEY' });

  assertEqual(captured.studentWheres.length, 1, 'onboarding reminder: prisma.student.findMany called once');
  const where: any = captured.studentWheres[0];

  assert(!('students' in where), 'onboarding reminder: where does NOT use a `students` relation filter');
  assert('partnerCode' in where, 'onboarding reminder: where filters on the scalar `partnerCode`');
  assertEqual(where.partnerCode, { equals: 'CODEY', mode: 'insensitive' }, 'onboarding reminder: partnerCode is a case-insensitive scalar match');
  assertEqual(where.eventId, 'codeday-labs-2022', 'onboarding reminder: eventId filter preserved');
  assertEqual(where.slackId, { not: null }, 'onboarding reminder: slackId != null filter preserved');

  await assertWhereValidatesPrisma('onboarding reminder (partnerCode)', where);
}

async function testOnboardingReminderOmitsPartnerCodeWhenNotProvided(): Promise<void> {
  const captured: Captured = { studentWheres: [], eventWheres: [] };
  Container.set(PrismaClient, makeFakePrisma(captured));
  await slackSendOnboardingReminder(fakeContext('evt-3'), { channel: 'C1', intro: 'hi', min: 2 });

  assertEqual(captured.studentWheres.length, 1, 'onboarding reminder (no partnerCode): findMany called once');
  const where: any = captured.studentWheres[0];
  assert(!('students' in where), 'onboarding reminder (no partnerCode): where does NOT use a `students` relation filter');
  assert(!('partnerCode' in where), 'onboarding reminder (no partnerCode): where omits partnerCode filter');
  assertEqual(where.eventId, 'evt-3', 'onboarding reminder (no partnerCode): eventId filter preserved');

  await assertWhereValidatesPrisma('onboarding reminder (no partnerCode)', where);
}

// ===== Baseline: prove the harness still detects the original bug =====

async function testBaselineBuggyWhereStillRejectedByPrisma(): Promise<void> {
  // The exact fragment the bug report flags as invalid on `Student`:
  const buggyWhere = {
    eventId: 'codeday-labs-2022',
    slackId: { not: null },
    students: { some: { partnerCode: { equals: 'CODEY', mode: 'insensitive' } } },
  };
  const res = await classifyWhere(buggyWhere);
  assert(isValidationError(res), 'baseline: buggy `students: { some: ... }` where => PrismaClientValidationError');
  if (res) {
    assert(/Unknown arg `students`/.test(res.message), 'baseline: error message names Unknown arg `students`');
  }
}

async function testNoStrayValidationErrors(): Promise<void> {
  const strayValidation = stray.filter((e: any) => e?.constructor?.name === 'PrismaClientValidationError');
  assert(strayValidation.length === 0, 'no stray PrismaClientValidationError escaped the harness');
}

async function main(): Promise<void> {
  await testBaselineBuggyWhereStillRejectedByPrisma();
  await testEmailReminderCapturesRootPartnerCodeFilter();
  await testEmailReminderOmitsPartnerCodeWhenNotProvided();
  await testEmailReminderCombinesEmailIdAndPartnerCode();
  await testEmailReminderRejectsMissingChannel();
  await testOnboardingReminderCapturesRootPartnerCodeFilter();
  await testOnboardingReminderOmitsPartnerCodeWhenNotProvided();
  await testNoStrayValidationErrors();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

void main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
