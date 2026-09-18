/**
 * Offline unit tests for the missing-standup reminder task. No live DB or Slack/SMTP
 * access — the prisma, sendSlackProjectMessage, and sendTemplateEmail collaborators are
 * injected via runStandupMissingReminderSend's dependency seam, mirroring the
 * projectParticipations(prisma) seam used by syncAlumniInteractions.test.ts.
 *
 * These tests pin the idempotency-flag invariants that are easy to silently regress:
 * the Slack flag must be flipped only after a successful send, a failed send must leave
 * it false so the next cron tick retries, and every "nothing to send" branch must still
 * close the flag out so a row is never re-fetched forever.
 *
 * Run with:
 *   npx tsx src/automation/tasks/standupMissingReminderSend.test.ts
 *   (or: npx ts-node --transpile-only src/automation/tasks/standupMissingReminderSend.test.ts)
 */
/* eslint-disable @typescript-eslint/no-var-requires, import/no-dynamic-require */
import 'reflect-metadata';
import type { StandupMissingReminderDeps } from './standupMissingReminderSend';

// The production module transitively imports src/config (via ../../email), which throws at
// load time if a long list of env vars is missing. Stub every required var so the module can
// be imported in a test environment with no real database/SMTP/Slack wired up. The module is
// loaded with `require` (below) AFTER this block so the stubs are in place first: top-level
// `import` declarations are hoisted above this statement block and would run too early.
const REQUIRED_ENV_VARS = [
  'DATABASE_URL', 'ELASTIC_URL', 'ELASTIC_INDEX', 'AUTH_SECRET', 'AUTH_AUDIENCE',
  'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_INBOUND_DOMAIN',
  'GEOCODIO_API_KEY', 'OPENAI_API_KEY', 'OPENAI_ORGANIZATION', 'WEBHOOK_KEY',
  'BADGR_USERNAME', 'BADGR_PASSWORD', 'BADGR_ISSUER', 'SHOPIFY_API_TOKEN',
  'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET_KEY', 'SHOPIFY_STORE_DOMAIN',
  'LINEAR_API_KEY', 'LINEAR_TEAM_ID', 'LINEAR_PROBLEM_LABEL_ID', 'METRICS_KEY',
  'PLACID_API_TOKEN', 'ATTIO_API_TOKEN', 'ATTIO_ALUMNI_LIST',
];
for (const k of REQUIRED_ENV_VARS) if (!process.env[k]) process.env[k] = `test-stub:${k}`;

const { runStandupMissingReminderSend } = require('./standupMissingReminderSend') as typeof import('./standupMissingReminderSend');

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAILED: ${message}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

// --- Fakes ----------------------------------------------------------------------------------

type TestStudent = {
  id: string; slackId: string | null; email: string; givenName: string;
  weeks: number; minHours: number;
  event: { id: string; name: string; emailSignature: string | null; title: string; defaultWeeks: number; startsAt: Date };
};
type TestProject = {
  slackChannelId: string | null;
  event: { slackWorkspaceAccessToken: string | null; slackWorkspaceId: string | null; name: string; startsAt: Date } | null;
  students: TestStudent[];
};
type TestRow = {
  id: string; projectId: string; dueAt: Date;
  sentMissingReminderSlack: boolean; sentMissingReminderEmail: boolean;
  results: { student: { id: string } }[];
  project: TestProject;
};

type UpdateCall = { id: string; data: Record<string, unknown> };

interface FakePrisma {
  standupThread: {
    findMany: (args?: unknown) => Promise<TestRow[]>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<TestRow>;
  };
}

function makeFakePrisma(rows: TestRow[], updates: UpdateCall[]): FakePrisma {
  return {
    standupThread: {
      findMany: async () => rows.filter(
        (r) => r.sentMissingReminderSlack === false || r.sentMissingReminderEmail === false
      ),
      update: async (args) => {
        updates.push({ id: args.where.id, data: { ...args.data } });
        const row = rows.find((r) => r.id === args.where.id)!;
        Object.assign(row, args.data);
        return row;
      },
    },
  };
}

type SlackCall = { channelId: string | null; message: string };

function makeSendSlack(behaviors: ('resolve' | 'reject')[], calls: SlackCall[]) {
  let i = 0;
  return async (project: { slackChannelId: string | null }, message: string) => {
    calls.push({ channelId: project.slackChannelId, message });
    const behavior = behaviors[i] ?? 'resolve';
    i += 1;
    if (behavior === 'reject') throw new Error('transient Slack chat.postMessage 5xx');
  };
}

function makeSendEmail(behaviors: ('resolve' | 'reject')[]) {
  let i = 0;
  return async (
    _template: string,
    _context: unknown,
    _subject: string,
    _to: TestStudent[],
  ) => {
    const behavior = behaviors[i] ?? 'resolve';
    i += 1;
    if (behavior === 'reject') throw new Error('transient SMTP failure');
  };
}

// Row factories -----------------------------------------------------------------------------

const EVENT_START = new Date('2025-09-01T00:00:00Z');
const DUE_AT = new Date('2025-09-01T00:00:00Z'); // == startsAt => weeksSinceStart === 0

function student(over: Partial<TestStudent> = {}): TestStudent {
  return {
    id: 'student-1',
    slackId: 'U123',
    email: 'student@example.com',
    givenName: 'Student',
    weeks: 5,
    minHours: 10,
    event: { id: 'evt-1', name: 'CodeDay Labs', emailSignature: null, title: 'Labs', defaultWeeks: 10, startsAt: EVENT_START },
    ...over,
  };
}

function row(over: Partial<TestRow> = {}): TestRow {
  return {
    id: 'standup-1',
    projectId: 'project-1',
    dueAt: DUE_AT,
    sentMissingReminderSlack: false,
    sentMissingReminderEmail: false,
    results: [],
    project: {
      slackChannelId: 'C123',
      event: { slackWorkspaceAccessToken: 'xoxb-token', slackWorkspaceId: 'T123', name: 'CodeDay Labs', startsAt: EVENT_START },
      students: [student()],
    },
    ...over,
  };
}

function depsWith(
  rows: TestRow[],
  updates: UpdateCall[],
  slackBehaviors: ('resolve' | 'reject')[],
  slackCalls: SlackCall[],
  emailBehaviors: ('resolve' | 'reject')[],
): StandupMissingReminderDeps {
  return {
    prisma: makeFakePrisma(rows, updates) as unknown as StandupMissingReminderDeps['prisma'],
    sendSlackProjectMessage: makeSendSlack(slackBehaviors, slackCalls) as StandupMissingReminderDeps['sendSlackProjectMessage'],
    sendTemplateEmail: makeSendEmail(emailBehaviors) as StandupMissingReminderDeps['sendTemplateEmail'],
  };
}

function slackFlagSetFor(updates: UpdateCall[], id: string): boolean {
  return updates.some((u) => u.id === id && u.data.sentMissingReminderSlack === true);
}
function combinedFlagUpdateFor(updates: UpdateCall[], id: string): boolean {
  return updates.some((u) => u.id === id && u.data.sentMissingReminderSlack === true && u.data.sentMissingReminderEmail === true);
}

// --- Tests ---------------------------------------------------------------------------------

// Core regression: a transient Slack send failure must NOT flip sentMissingReminderSlack to
// true. The flag must stay false so the next cron tick retries.
async function testSlackFailureLeavesFlagFalse(): Promise<void> {
  const rows = [row()];
  const updates: UpdateCall[] = [];
  const slackCalls: SlackCall[] = [];
  const deps = depsWith(rows, updates, ['reject'], slackCalls, ['resolve']);

  await runStandupMissingReminderSend(deps);

  assert(slackCalls.length === 1, 'Slack send was attempted exactly once');
  assert(!slackFlagSetFor(updates, 'standup-1'), 'Slack flag is NOT set when sendSlackProjectMessage throws (retry stays possible)');
  assert(rows[0].sentMissingReminderSlack === false, 'Row retains sentMissingReminderSlack=false after a failed Slack send');
}

// Happy path: successful Slack send marks sentMissingReminderSlack true (no duplicate sends
// on subsequent ticks since the OR filter excludes a fully-true row).
async function testSlackSuccessMarksFlagTrueOnce(): Promise<void> {
  const rows = [row()];
  const updates: UpdateCall[] = [];
  const slackCalls: SlackCall[] = [];
  const deps = depsWith(rows, updates, ['resolve'], slackCalls, ['resolve']);

  await runStandupMissingReminderSend(deps);

  assert(slackCalls.length === 1, 'Slack send called exactly once');
  assert(slackFlagSetFor(updates, 'standup-1'), 'Slack flag is set true after a successful send');
  assert(rows[0].sentMissingReminderSlack === true, 'Row reflects sentMissingReminderSlack=true');
}

// Ordering guarantee: the Slack flag update happens AFTER the send resolves, not before.
// This is the exact invariant the bug violated — a regression that moves the update earlier
// into "both flags up front" must turn this red.
async function testSlackFlagSetAfterSendNotBefore(): Promise<void> {
  const rows = [row()];
  const updates: UpdateCall[] = [];
  const slackCalls: SlackCall[] = [];
  const events: string[] = [];
  const slack = async (p: { slackChannelId: string | null }, m: string) => {
    events.push('slack-send-start');
    slackCalls.push({ channelId: p.slackChannelId, message: m });
    events.push('slack-send-end');
  };
  const prisma = makeFakePrisma(rows, updates);
  const origUpdate = prisma.standupThread.update.bind(prisma.standupThread);
  prisma.standupThread.update = async (args) => {
    events.push('update:' + Object.keys(args.data).join(','));
    return origUpdate(args);
  };
  const deps: StandupMissingReminderDeps = {
    prisma: prisma as unknown as StandupMissingReminderDeps['prisma'],
    sendSlackProjectMessage: slack as unknown as StandupMissingReminderDeps['sendSlackProjectMessage'],
    sendTemplateEmail: makeSendEmail(['resolve']) as StandupMissingReminderDeps['sendTemplateEmail'],
  };

  await runStandupMissingReminderSend(deps);

  const slackUpdateIdx = events.findIndex((e) => e === 'update:sentMissingReminderSlack');
  const slackSendEndIdx = events.findIndex((e) => e === 'slack-send-end');
  assert(slackUpdateIdx > slackSendEndIdx, 'Slack flag update is written AFTER sendSlackProjectMessage resolves (not before)');
}

// Batch isolation: a transient Slack failure on row N must not abort row N+1 in the same tick.
// A future refactor that removes the per-row try/catch would re-introduce this footgun.
async function testSlackFailureOnOneRowDoesNotAbortRestOfBatch(): Promise<void> {
  const rows = [
    row({ id: 'bad', project: { slackChannelId: 'C-bad', event: { slackWorkspaceAccessToken: 'xoxb', slackWorkspaceId: 'T', name: 'CodeDay Labs', startsAt: EVENT_START }, students: [student({ id: 's-bad', slackId: 'U-bad', email: 'bad@example.com' })] } }),
    row({ id: 'good', project: { slackChannelId: 'C-good', event: { slackWorkspaceAccessToken: 'xoxb', slackWorkspaceId: 'T', name: 'CodeDay Labs', startsAt: EVENT_START }, students: [student({ id: 's-good', slackId: 'U-good', email: 'good@example.com' })] } }),
  ];
  const updates: UpdateCall[] = [];
  const slackCalls: SlackCall[] = [];
  const deps = depsWith(rows, updates, ['reject', 'resolve'], slackCalls, ['resolve', 'resolve']);

  await runStandupMissingReminderSend(deps);

  assert(slackCalls.length === 2, 'Both rows attempt a Slack send in the same tick despite the first failing');
  assert(!slackFlagSetFor(updates, 'bad'), 'The failing row retains sentMissingReminderSlack=false (will be retried)');
  assert(slackFlagSetFor(updates, 'good'), 'The subsequent row still gets sentMissingReminderSlack=true in the same tick');
}

// End-to-end retry via the findMany OR filter: tick 1 fails (flag false), tick 2 re-selects
// the row and succeeds (flag true), tick 3 no longer selects it.
async function testRetrySucceedsOnNextTickAfterTransientFailure(): Promise<void> {
  const rows = [row()];
  const updates: UpdateCall[] = [];

  const slack1: SlackCall[] = [];
  await runStandupMissingReminderSend(depsWith(rows, updates, ['reject'], slack1, ['resolve']));
  assert(!slackFlagSetFor(updates, 'standup-1'), 'After tick 1 (failed send) sentMissingReminderSlack is still false');
  assert(rows[0].sentMissingReminderSlack === false, 'Row remains eligible for re-selection after a failed Slack send');

  const selectedAfterTick1 = rows.filter((r) => r.sentMissingReminderSlack === false || r.sentMissingReminderEmail === false);
  assert(selectedAfterTick1.length === 1, 'Row is re-selected by the OR filter after a failed Slack send');

  await runStandupMissingReminderSend(depsWith(rows, updates, ['resolve'], [], ['resolve']));
  assert(slackFlagSetFor(updates, 'standup-1'), 'After tick 2 (successful retry) sentMissingReminderSlack is set true');

  const selectedAfterTick2 = rows.filter((r) => r.sentMissingReminderSlack === false || r.sentMissingReminderEmail === false);
  assert(selectedAfterTick2.length === 0, 'Row is no longer re-selected once both idempotency flags are true');
}

// "Nothing to send" branches must still mark the flag true so a row is never re-fetched
// forever. Covers both no-Slack-integration-configured and no-connected-Slack-students.
async function testNothingToSendMarksFlagTrueToAvoidInfiniteRefetch(): Promise<void> {
  const noConfigRows = [row({ project: { slackChannelId: 'C123', event: { slackWorkspaceAccessToken: null, slackWorkspaceId: 'T123', name: 'CodeDay Labs', startsAt: EVENT_START }, students: [student({ slackId: 'U123' })] } })];
  const noConfigUpdates: UpdateCall[] = [];
  const noConfigSlack: SlackCall[] = [];
  await runStandupMissingReminderSend(depsWith(noConfigRows, noConfigUpdates, [], noConfigSlack, ['resolve']));
  assert(noConfigSlack.length === 0, 'No Slack send attempted when Slack is not configured');
  assert(slackFlagSetFor(noConfigUpdates, 'standup-1'), 'Flag marked true when Slack is not configured (avoids infinite re-fetch)');

  const noSlackIdRows = [row({ project: { slackChannelId: 'C123', event: { slackWorkspaceAccessToken: 'xoxb', slackWorkspaceId: 'T', name: 'CodeDay Labs', startsAt: EVENT_START }, students: [student({ slackId: null, email: 'noslack@example.com' })] } })];
  const noSlackIdUpdates: UpdateCall[] = [];
  const noSlackIdSlack: SlackCall[] = [];
  await runStandupMissingReminderSend(depsWith(noSlackIdRows, noSlackIdUpdates, [], noSlackIdSlack, ['resolve']));
  assert(noSlackIdSlack.length === 0, 'No Slack send attempted when no missing student has a slackId');
  assert(slackFlagSetFor(noSlackIdUpdates, 'standup-1'), 'Flag marked true when there is no connected-Slack recipient (avoids infinite re-fetch)');
}

// Zero-missing-students short-circuit: nothing to send at all. Both flags set true in one
// update; no sends; row excluded on the next tick.
async function testNoMissingStudentsSetsBothFlagsAndContinues(): Promise<void> {
  const s = student({ id: 'present-1' });
  const rows = [row({ results: [{ student: { id: 'present-1' } }], project: { slackChannelId: 'C123', event: { slackWorkspaceAccessToken: 'xoxb', slackWorkspaceId: 'T', name: 'CodeDay Labs', startsAt: EVENT_START }, students: [s] } })];
  const updates: UpdateCall[] = [];
  const slackCalls: SlackCall[] = [];
  const deps = depsWith(rows, updates, [], slackCalls, []);

  await runStandupMissingReminderSend(deps);

  assert(slackCalls.length === 0, 'No Slack send when no students missed');
  assert(combinedFlagUpdateFor(updates, 'standup-1'), 'Both flags set true in one update when no students missed');
  assert(rows[0].sentMissingReminderSlack === true && rows[0].sentMissingReminderEmail === true, 'Row excluded from future findMany once both flags are true');
  assert(rows.filter((r) => r.sentMissingReminderSlack === false || r.sentMissingReminderEmail === false).length === 0, 'Zero-missing row is not re-selected on the next tick');
}

// Email channel behavior is intentionally unchanged: the email flag is set regardless of
// email send success/failure (errors swallowed, no retry) — matching sendScheduledAnnouncements.
// Guards against an accidental "make email retry too" change that would diverge from the
// sibling task's accepted convention.
async function testEmailFailureStillMarksFlagTrue(): Promise<void> {
  const rows = [row()];
  const updates: UpdateCall[] = [];
  const slackCalls: SlackCall[] = [];
  const deps = depsWith(rows, updates, ['resolve'], slackCalls, ['reject']);

  await runStandupMissingReminderSend(deps);

  assert(emailFlagTrueByEmailState(rows[0]), 'Email flag set true even when the email send fails (unchanged email convention: no retry)');
}

function emailFlagTrueByEmailState(r: TestRow): boolean {
  return r.sentMissingReminderEmail === true;
}

// --- Runner --------------------------------------------------------------------------------

async function main(): Promise<void> {
  await testSlackFailureLeavesFlagFalse();
  await testSlackSuccessMarksFlagTrueOnce();
  await testSlackFlagSetAfterSendNotBefore();
  await testSlackFailureOnOneRowDoesNotAbortRestOfBatch();
  await testRetrySucceedsOnNextTickAfterTransientFailure();
  await testNothingToSendMarksFlagTrueToAvoidInfiniteRefetch();
  await testNoMissingStudentsSetsBothFlagsAndContinues();
  await testEmailFailureStillMarksFlagTrue();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
