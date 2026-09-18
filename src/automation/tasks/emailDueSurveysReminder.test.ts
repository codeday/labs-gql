/**
 * Offline unit tests for the survey due/overdue reminder cron task.
 *
 * No live DB or SMTP connection: the PrismaClient and the nodemailer transporter are
 * stubbed through the typedi Container, and the email template loader is stubbed so the
 * test does not touch disk. The stubbed template's rendered `text` is intentionally
 * tagged with `<templateName>|<occurrenceId>|<recipientEmail>` so each test can observe
 * which reminder template (surveyDue.md vs surveyOverdue.md) was used for each recipient.
 *
 * Run with:
 *   npx ts-node src/automation/tasks/emailDueSurveysReminder.test.ts
 *   (or) npx tsx src/automation/tasks/emailDueSurveysReminder.test.ts
 */
import 'reflect-metadata';
import { Container } from 'typedi';
import { PersonType, PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { Transporter } from 'nodemailer';

// The task imports `../../email` and `../../utils`, both of which transitively load
// `src/config.ts` (which throws without a full env). Stub both in the require cache
// BEFORE the task module loads so the test runs fully offline: email.getTemplate is
// replaced with a function that tags the rendered text with `<tpl>|<occId>|<email>`
// so each test can observe which reminder template was used for each recipient, and
// utils.makeDebug is forwarded from the real leaf module (no config dependency).
const TaskModule = require('module');
const utilsPath = require.resolve('../../utils');
const utilsStub = new TaskModule(utilsPath);
utilsStub.loaded = true;
utilsStub.exports = { makeDebug: require('../../utils/makeDebug').makeDebug };
require.cache[utilsPath] = utilsStub;

const emailPath = require.resolve('../../email');
const emailStub = new TaskModule(emailPath);
emailStub.loaded = true;
emailStub.exports = {
  getTemplate: async (name: string) => (ctx: any) =>
    `${name}|${ctx.surveyOccurence.id}|${ctx.to.email}`,
};
require.cache[emailPath] = emailStub;

const emailDueSurveysReminder: () => Promise<void> = require('./emailDueSurveysReminder').default;

type Arm = 'DUE' | 'OVERDUE';
interface Occ {
  id: string;
  sentVisibleReminder: boolean;
  sentOverdueReminder: boolean;
  visibleAt: Date;
  dueAt: Date;
  survey: {
    id: string;
    name: string;
    personType: PersonType;
    eventId: string;
    event: { id: string; name: string; emailSignature: string };
  };
  targets: Target[];
}
interface Target { id: string; email: string; givenName: string; surname: string; }

interface SendRecord {
  tpl: string;
  arm: Arm;
  occId: string;
  email: string;
  flagVisibleAtSend: boolean;
  flagOverdueAtSend: boolean;
  succeeded: boolean;
}
interface UpdateRecord { occId: string; field: 'sentVisibleReminder' | 'sentOverdueReminder'; }

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) { failures += 1; console.error(`FAILED: ${message}`); }
  else console.log(`PASSED: ${message}`);
}
function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures += 1; console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`); }
  else console.log(`PASSED: ${message}`);
}

function target(email: string): Target {
  const local = email.split('@')[0];
  return { id: `t-${local}`, email, givenName: local, surname: 'Tester' };
}

function makeOcc(opts: {
  id: string;
  visibleAt: DateTime;
  dueAt: DateTime;
  targets: Target[];
  sentVisibleReminder?: boolean;
  sentOverdueReminder?: boolean;
  personType?: PersonType;
}): Occ {
  const t = opts.personType ?? PersonType.STUDENT;
  return {
    id: opts.id,
    sentVisibleReminder: opts.sentVisibleReminder ?? false,
    sentOverdueReminder: opts.sentOverdueReminder ?? false,
    visibleAt: opts.visibleAt.toJSDate(),
    dueAt: opts.dueAt.toJSDate(),
    survey: {
      id: `survey-${opts.id}`,
      name: `Survey ${opts.id}`,
      personType: t,
      eventId: 'event-1',
      event: { id: 'event-1', name: 'Test Event', emailSignature: '-- Test' },
    },
    targets: opts.targets,
  };
}

interface Harness {
  simNow: DateTime;
  occurrences: Occ[];
  sends: SendRecord[];
  updates: UpdateRecord[];
  trace: string[];
  failEmails: Set<string>;
  setEmailFailing(email: string, failing: boolean): void;
  tick(): Promise<void>;
  advance(ms: number): void;
  sendsFor(occId: string, arm?: Arm): SendRecord[];
  received(occId: string, email: string, arm?: Arm): number;
}

function setup(initialSimNow: DateTime): Harness {
  Container.reset();
  const h: Harness = {
    simNow: initialSimNow,
    occurrences: [],
    sends: [],
    updates: [],
    trace: [],
    failEmails: new Set(),
    setEmailFailing(email, failing) {
      if (failing) h.failEmails.add(email);
      else h.failEmails.delete(email);
    },
    async tick() { await emailDueSurveysReminder(); },
    advance(ms) { h.simNow = h.simNow.plus({ milliseconds: ms }); },
    sendsFor(occId, arm) {
      return h.sends.filter((s) => s.occId === occId && (arm ? s.arm === arm : true));
    },
    received(occId, email, arm) {
      return h.sends.filter((s) =>
        s.occId === occId && s.email === email && s.succeeded && (arm ? s.arm === arm : true)
      ).length;
    },
  };

  const targetsByOccId = () => {
    const map: Record<string, Target[]> = {};
    for (const o of h.occurrences) map[o.id] = o.targets;
    return map;
  };

  const fakePrisma = {
    surveyOccurence: {
      findMany: async () => {
        const now = h.simNow.toJSDate();
        const winStart = h.simNow.minus({ days: 6 }).toJSDate();
        return h.occurrences.filter((o) =>
          (!o.sentVisibleReminder && o.visibleAt < now && o.visibleAt > winStart) ||
          (!o.sentOverdueReminder && o.dueAt < now && o.dueAt > winStart)
        );
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const o = h.occurrences.find((x) => x.id === args.where.id)!;
        if (args.data.sentVisibleReminder !== undefined) {
          o.sentVisibleReminder = Boolean(args.data.sentVisibleReminder);
          h.updates.push({ occId: o.id, field: 'sentVisibleReminder' });
          h.trace.push(`update:${o.id}:sentVisibleReminder`);
        }
        if (args.data.sentOverdueReminder !== undefined) {
          o.sentOverdueReminder = Boolean(args.data.sentOverdueReminder);
          h.updates.push({ occId: o.id, field: 'sentOverdueReminder' });
          h.trace.push(`update:${o.id}:sentOverdueReminder`);
        }
        return o;
      },
    },
    mentor: {
      findMany: async (args: any) => targetsByOccId()[args.where.authoredSurveyResponses.none.surveyOccurenceId] ?? [],
    },
    student: {
      findMany: async (args: any) => targetsByOccId()[args.where.authoredSurveyResponses.none.surveyOccurenceId] ?? [],
    },
  };

  const fakeEmail: Transporter = ({
    sendMail: async (opts: any) => {
      const [tpl, occId, email] = String(opts.text).split('|');
      const o = h.occurrences.find((x) => x.id === occId)!;
      const arm: Arm = tpl === 'surveyOverdue.md' ? 'OVERDUE' : 'DUE';
      h.trace.push(`send:${occId}:${email}`);
      if (h.failEmails.has(email)) {
        h.sends.push({
          tpl, arm, occId, email,
          flagVisibleAtSend: o.sentVisibleReminder,
          flagOverdueAtSend: o.sentOverdueReminder,
          succeeded: false,
        });
        throw new Error(`SMTP 550 Recipient address rejected: ${email}`);
      }
      h.sends.push({
        tpl, arm, occId, email,
        flagVisibleAtSend: o.sentVisibleReminder,
        flagOverdueAtSend: o.sentOverdueReminder,
        succeeded: true,
      });
    },
  } as unknown as Transporter);

  Container.set(PrismaClient, fakePrisma);
  Container.set('email', fakeEmail);
  return h;
}

function assertUpdateAfterSends(h: Harness, occId: string): void {
  const sendIdxs = h.trace.map((e, i) => e.startsWith(`send:${occId}:`) ? i : -1).filter((i) => i >= 0);
  const updateIdxs = h.trace.map((e, i) => e.startsWith(`update:${occId}:`) ? i : -1).filter((i) => i >= 0);
  assert(sendIdxs.length > 0 || updateIdxs.length > 0, `update for ${occId} happens; trace has events`);
  if (updateIdxs.length === 0) return;
  const lastSend = sendIdxs.length ? Math.max(...sendIdxs) : -1;
  const firstUpdate = Math.min(...updateIdxs);
  assert(firstUpdate > lastSend,
    `update for ${occId} occurs AFTER all its sends (update idx ${firstUpdate} > last send idx ${lastSend}); trace=${JSON.stringify(h.trace)}`);
}

// ---------------------------------------------------------------------------
// Test 1: Visible arm — a failing recipient does not abort the rest of the
// cohort; the flag is set only after sending, with the DUE flag still false
// at send time.
// ---------------------------------------------------------------------------
async function testVisibleArmContinuesPastFailingRecipient(): Promise<void> {
  const now = DateTime.fromISO('2024-06-10T12:00:00Z');
  const h = setup(now);
  const occ = makeOcc({
    id: 'v1',
    visibleAt: now.minus({ days: 1 }),
    dueAt: now.plus({ days: 2 }),
    targets: [target('a@example.com'), target('b@example.com'), target('c@example.com')],
  });
  h.occurrences.push(occ);
  h.setEmailFailing('b@example.com', true);

  await h.tick();

  assertEqual(h.sends.map((s) => s.email), ['a@example.com', 'b@example.com', 'c@example.com'],
    'Visible arm: all three recipients attempted (b@ failure does not abort the cohort)');
  assertEqual(h.sends.every((s) => s.arm === 'DUE'), true, 'Visible arm uses the surveyDue template');
  assertEqual(h.sends.map((s) => s.flagVisibleAtSend), [false, false, false],
    'sentVisibleReminder is still false at every send (flag is no longer set before sending)');
  assertEqual(h.updates, [{ occId: 'v1', field: 'sentVisibleReminder' }],
    'visible reminder marked exactly once after at least one successful send');
  assertEqual(occ.sentVisibleReminder, true, 'occurrence persisted sentVisibleReminder=true');
  assertEqual(h.received('v1', 'a@example.com', 'DUE'), 1, 'deliverable recipient a received the due email');
  assertEqual(h.received('v1', 'c@example.com', 'DUE'), 1, 'tail recipient c still received the due email');
  assertEqual(h.received('v1', 'b@example.com', 'DUE'), 0, 'failing recipient b received nothing (send threw)');
  assertUpdateAfterSends(h, 'v1');
}

// ---------------------------------------------------------------------------
// Test 2: Visible arm — when EVERY send fails, the flag is NOT set, so the
// occurrence is re-selected on the next tick and retried (and, being still in
// the visible window, will not be denied the due reminder before overdue).
// ---------------------------------------------------------------------------
async function testVisibleArmAllFailNotMarkedAndRetried(): Promise<void> {
  const now = DateTime.fromISO('2024-06-10T12:00:00Z');
  const h = setup(now);
  const occ = makeOcc({
    id: 'v2',
    visibleAt: now.minus({ days: 1 }),
    dueAt: now.plus({ days: 2 }),
    targets: [target('a@example.com'), target('b@example.com')],
  });
  h.occurrences.push(occ);
  h.setEmailFailing('a@example.com', true);
  h.setEmailFailing('b@example.com', true);

  await h.tick();
  assertEqual(h.updates, [], 'Visible arm all-fail: not marked (no successful send)');
  assertEqual(occ.sentVisibleReminder, false, 'flag stays false so the occurrence is re-selectable');

  h.advance(5 * 60 * 1000);
  h.setEmailFailing('a@example.com', false);
  await h.tick();

  assertEqual(h.received('v2', 'a@example.com', 'DUE'), 1,
    'Recipient a was retried on the next tick and delivered once the transient failure cleared');
  assertEqual(h.updates, [{ occId: 'v2', field: 'sentVisibleReminder' }],
    'visible reminder marked once a retry delivered at least one email');
  assertEqual(occ.sentVisibleReminder, true, 'flag persisted after the successful retry');
}

// ---------------------------------------------------------------------------
// Test 3 (CORE durable-loss case): Overdue arm — a transient failure on a
// non-last recipient leaves sentOverdueReminder=false, so the occurrence is
// re-selected on the next tick and the cohort is retried. Nobody who could
// receive the reminder is permanently denied it. (Under the bug, the flag was
// set before sending and the occurrence was never re-selected.)
// ---------------------------------------------------------------------------
async function testOverdueArmTransientFailureRetriesNoPermanentLoss(): Promise<void> {
  const now = DateTime.fromISO('2024-06-10T12:00:00Z');
  const h = setup(now);
  const occ = makeOcc({
    id: 'o1',
    visibleAt: now.minus({ days: 5 }),
    dueAt: now.minus({ day: 1 }),
    sentVisibleReminder: true,
    sentOverdueReminder: false,
    targets: [target('a@example.com'), target('b@example.com'), target('c@example.com')],
  });
  h.occurrences.push(occ);
  h.setEmailFailing('b@example.com', true);

  await h.tick();
  assertEqual(h.sends.map((s) => s.email), ['a@example.com', 'b@example.com', 'c@example.com'],
    'Overdue arm: all three attempted (b@ failure does not abort the cohort)');
  assertEqual(h.sends.every((s) => s.arm === 'OVERDUE'), true, 'Overdue arm uses the surveyOverdue template');
  assertEqual(h.sends.map((s) => s.flagOverdueAtSend), [false, false, false],
    'sentOverdueReminder is still false at every send (the durable-loss bug was a pre-send flag set)');
  assertEqual(h.updates, [], 'Overdue arm partial failure: NOT marked (transient failures retry on the next tick)');
  assertEqual(occ.sentOverdueReminder, false, 'flag stays false so the overdue occurrence is re-selectable next tick');
  assertUpdateAfterSends(h, 'o1');

  h.advance(5 * 60 * 1000);
  h.setEmailFailing('b@example.com', false);
  await h.tick();

  assertEqual(h.sendsFor('o1', 'OVERDUE').map((s) => s.email),
    ['a@example.com', 'b@example.com', 'c@example.com', 'a@example.com', 'b@example.com', 'c@example.com'],
    'Overdue arm retried the whole cohort on tick 2 (accepted duplicate cost for already-delivered recipients)');
  assertEqual(h.updates, [{ occId: 'o1', field: 'sentOverdueReminder' }],
    'overdue reminder marked once every send succeeded');
  assertEqual(occ.sentOverdueReminder, true, 'flag persisted after the fully-successful retry');

  for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
    assert(h.received('o1', email, 'OVERDUE') >= 1,
      `Overdue arm: ${email} received at least one overdue reminder (no permanent loss for deliverable recipients)`);
  }
}

// ---------------------------------------------------------------------------
// Test 4: Overdue arm with a PERMANENTLY bad address — the per-recipient
// try/catch still delivers to the deliverable tail; the occurrence is NOT
// marked (so it keeps retrying). The duplicate cost to already-delivered
// recipients is the documented, bounded, accepted tradeoff (per the bug
// report: per-recipient delivery tracking is out of scope).
// ---------------------------------------------------------------------------
async function testOverdueArmPersistentBadAddressTailStillDelivered(): Promise<void> {
  const now = DateTime.fromISO('2024-06-10T12:00:00Z');
  const h = setup(now);
  const occ = makeOcc({
    id: 'o2',
    visibleAt: now.minus({ days: 5 }),
    dueAt: now.minus({ day: 1 }),
    sentVisibleReminder: true,
    sentOverdueReminder: false,
    targets: [target('a@example.com'), target('bad@example.com'), target('c@example.com')],
  });
  h.occurrences.push(occ);
  h.setEmailFailing('bad@example.com', true);

  await h.tick();
  h.advance(5 * 60 * 1000);
  await h.tick();

  assert(h.received('o2', 'a@example.com', 'OVERDUE') >= 1,
    'Persistent bad address: deliverable recipient a still got the overdue reminder');
  assert(h.received('o2', 'c@example.com', 'OVERDUE') >= 1,
    'Persistent bad address: tail recipient c still got the overdue reminder (not permanently dropped)');
  assertEqual(h.received('o2', 'bad@example.com', 'OVERDUE'), 0,
    'The genuinely bad address received nothing under any retry');
  assertEqual(occ.sentOverdueReminder, false,
    'Overdue occurrence stays unmarked while a recipient keeps failing (keeps retrying next tick)');
}

// ---------------------------------------------------------------------------
// Test 5: An occurrence with no outstanding recipients is still marked on both
// arms, so it is not re-queried every 5 minutes for the rest of its window.
// (Guards against a regression to perpetual re-query churn.)
// ---------------------------------------------------------------------------
async function testNoTargetsMarksOnBothArms(): Promise<void> {
  const now = DateTime.fromISO('2024-06-10T12:00:00Z');
  const h = setup(now);
  const v = makeOcc({ id: 'v-empty', visibleAt: now.minus({ days: 1 }), dueAt: now.plus({ days: 2 }), targets: [] });
  const o = makeOcc({
    id: 'o-empty', visibleAt: now.minus({ days: 5 }), dueAt: now.minus({ day: 1 }),
    sentVisibleReminder: true, targets: [],
  });
  h.occurrences.push(v, o);

  await h.tick();

  assertEqual(h.sends, [], 'No sendMail calls when there are no targets');
  assertEqual(h.updates.map((u) => u.field).sort(), ['sentOverdueReminder', 'sentVisibleReminder'],
    'Both arms mark their flag even with zero targets (no re-query churn)');
  assertEqual(v.sentVisibleReminder, true, 'empty visible occurrence marked sentVisibleReminder');
  assertEqual(o.sentOverdueReminder, true, 'empty overdue occurrence marked sentOverdueReminder');
}

// ---------------------------------------------------------------------------
// Test 6: Visible arm mark-on-at-least-one avoids unbounded duplicates: once
// at least one recipient is delivered, the occurrence is marked and is NOT
// re-selected while still in the (pre-due) visible window, so a recipient does
// not receive the due reminder every 5 minutes for a week.
// ---------------------------------------------------------------------------
async function testVisibleArmMarkOnAnyAvoidsWindowDuplicates(): Promise<void> {
  const now = DateTime.fromISO('2024-06-10T12:00:00Z');
  const h = setup(now);
  const occ = makeOcc({
    id: 'v3',
    visibleAt: now.minus({ days: 1 }),
    dueAt: now.plus({ days: 2 }),
    targets: [target('a@example.com'), target('b@example.com')],
  });
  h.occurrences.push(occ);
  h.setEmailFailing('b@example.com', true);

  await h.tick();
  assertEqual(occ.sentVisibleReminder, true, 'visible reminder marked after a@ succeeded (mark-on-any)');
  const tick1Attempts = h.sendsFor('v3').length;

  h.advance(5 * 60 * 1000);
  await h.tick();
  assertEqual(h.sendsFor('v3').length, tick1Attempts,
    'No re-send during the visible window once marked (attempt count did not grow on tick 2)');
  assertEqual(h.received('v3', 'a@example.com', 'DUE'), 1,
    'Deliverable recipient received the due email exactly once across both ticks');
}

// ---------------------------------------------------------------------------
// Test 7: A send failure inside one occurrence does not abort the rest of the
// batch — later occurrences in the same findMany result are still processed.
// (Under the bug the throw propagated out of the outer for-of.)
// ---------------------------------------------------------------------------
async function testCrossOccurrenceFailureDoesNotAbortBatch(): Promise<void> {
  const now = DateTime.fromISO('2024-06-10T12:00:00Z');
  const h = setup(now);
  const a = makeOcc({
    id: 'A', visibleAt: now.minus({ days: 1 }), dueAt: now.plus({ days: 2 }),
    targets: [target('ax@example.com')],
  });
  const b = makeOcc({
    id: 'B', visibleAt: now.minus({ days: 1 }), dueAt: now.plus({ days: 2 }),
    targets: [target('bx@example.com')],
  });
  h.occurrences.push(a, b);
  h.setEmailFailing('ax@example.com', true);

  await h.tick();

  assertEqual(h.sends.map((s) => s.occId), ['A', 'B'],
    'Both occurrences in the batch were processed even though occurrence A threw on every send');
  assertEqual(b.sentVisibleReminder, true, 'occurrence B (after the throwing occurrence A) was still marked');
  assertEqual(a.sentVisibleReminder, false, 'occurrence A (all sends failed) was correctly NOT marked');
  assertUpdateAfterSends(h, 'B');
}

// ---------------------------------------------------------------------------
// Test 8: Global invariant — across a mixed batch, every reminder-sent flag
// update happens only AFTER its occurrence's send loop, never before.
// ---------------------------------------------------------------------------
async function testInvariantFlagUpdateAlwaysAfterSends(): Promise<void> {
  const now = DateTime.fromISO('2024-06-10T12:00:00Z');
  const h = setup(now);
  const v = makeOcc({
    id: 'inv-v', visibleAt: now.minus({ days: 1 }), dueAt: now.plus({ days: 2 }),
    targets: [target('a@example.com'), target('b@example.com')],
  });
  const o = makeOcc({
    id: 'inv-o', visibleAt: now.minus({ days: 5 }), dueAt: now.minus({ day: 1 }),
    sentVisibleReminder: true, targets: [target('c@example.com'), target('d@example.com')],
  });
  h.occurrences.push(v, o);
  h.setEmailFailing('b@example.com', true);
  h.setEmailFailing('d@example.com', true);

  await h.tick();

  assertUpdateAfterSends(h, 'inv-v');
  assertUpdateAfterSends(h, 'inv-o');
  assertEqual(h.sends.filter((s) => s.occId === 'inv-o' && s.flagOverdueAtSend).length, 0,
    'No overdue send observed a pre-set sentOverdueReminder flag');
  assertEqual(h.sends.filter((s) => s.occId === 'inv-v' && s.flagVisibleAtSend).length, 0,
    'No due send observed a pre-set sentVisibleReminder flag');
}

async function main(): Promise<void> {
  await testVisibleArmContinuesPastFailingRecipient();
  await testVisibleArmAllFailNotMarkedAndRetried();
  await testOverdueArmTransientFailureRetriesNoPermanentLoss();
  await testOverdueArmPersistentBadAddressTailStillDelivered();
  await testNoTargetsMarksOnBothArms();
  await testVisibleArmMarkOnAnyAvoidsWindowDuplicates();
  await testCrossOccurrenceFailureDoesNotAbortBatch();
  await testInvariantFlagUpdateAlwaysAfterSends();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
