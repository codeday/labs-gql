/**
 * Regression tests for the bulk-email event-scoping bug in src/resolvers/emails.ts.
 *
 * Run with: npx tsx tests/testEmailsResolver.ts
 *
 * Background: `sendStudentEmail` / `sendMentorEmail` previously scoped their
 * Prisma `findMany` with `eventId: auth.eventId!`. The `!` is a compile-time
 * non-null assertion only; `AuthContext.eventId` is `string | undefined` at
 * runtime, and `AuthContext.validate()` deliberately sanctions ADMIN tokens
 * that carry no `evt` claim. Prisma treats an `undefined` value in a `where`
 * field as "do not filter on this field", so an evt-less ADMIN token silently
 * dropped the event filter and the query spanned every event in the deployment.
 *
 * The fix rejects a missing `eventId` at runtime before the query is built, and
 * passes `eventId: auth.eventId` (no `!`) into Prisma so it can never see
 * `undefined`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires, import/no-extraneous-dependencies */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sign } from 'jsonwebtoken';

// config.ts validates (and throws on) a long list of required env vars at
// import time. Set them BEFORE any module that transitively imports config.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.ELASTIC_URL = 'http://localhost:9200';
process.env.ELASTIC_INDEX = 'test';
process.env.AUTH_SECRET = 'test-secret';
process.env.AUTH_AUDIENCE = 'test-audience';
process.env.EMAIL_HOST = 'localhost';
process.env.EMAIL_PORT = '587';
process.env.EMAIL_USER = 'test';
process.env.EMAIL_PASS = 'test';
process.env.EMAIL_INBOUND_DOMAIN = 'test.local';
process.env.GEOCODIO_API_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_ORGANIZATION = 'test-org';
process.env.WEBHOOK_KEY = 'test-key';
process.env.BADGR_USERNAME = 'test';
process.env.BADGR_PASSWORD = 'test';
process.env.BADGR_ISSUER = 'test';
process.env.SHOPIFY_API_TOKEN = 'test';
process.env.SHOPIFY_API_KEY = 'test';
process.env.SHOPIFY_API_SECRET_KEY = 'test';
process.env.SHOPIFY_STORE_DOMAIN = 'test.myshopify.com';
process.env.LINEAR_API_KEY = 'test';
process.env.LINEAR_TEAM_ID = 'test';
process.env.LINEAR_PROBLEM_LABEL_ID = 'test';
process.env.METRICS_KEY = 'test';
process.env.PLACID_API_TOKEN = 'test';
process.env.ATTIO_API_TOKEN = 'test';
process.env.ATTIO_ALUMNI_LIST = 'test';

// type-graphql/typedi decorators rely on the reflect-metadata polyfill; load
// it before any module that defines a decorated class.
require('reflect-metadata');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthContext } = require('../src/context/auth/AuthContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthRole } = require('../src/context/auth/JwtToken');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Emails } = require('../src/resolvers/emails');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StudentStatus, MentorStatus } = require('../src/enums');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StudentFilterInput } = require('../src/inputs/StudentFilterInput');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MentorFilterInput } = require('../src/inputs/MentorFilterInput');

const AUTH_SECRET = process.env.AUTH_SECRET as string;
const AUTH_AUDIENCE = process.env.AUTH_AUDIENCE as string;
const EVENT_ID = 'event-1';
const OTHER_EVENT_ID = 'event-2';

function adminTokenWithEvent(eventId: string): string {
  return sign({ typ: AuthRole.ADMIN, evt: eventId }, AUTH_SECRET, {
    audience: AUTH_AUDIENCE,
    noTimestamp: true,
  });
}

function adminTokenWithoutEvent(): string {
  // An ADMIN token carrying no `evt` claim; AuthContext.validate() explicitly
  // permits this token class (the !this.isAdmin carve-out). This is the
  // sanctioned-but-dangerous caller the bug report describes.
  return sign({ typ: AuthRole.ADMIN }, AUTH_SECRET, {
    audience: AUTH_AUDIENCE,
    noTimestamp: true,
  });
}

interface FindManyCall {
  model: 'student' | 'mentor';
  args: any;
}

function makeEmails(captured: FindManyCall[], students: any[], mentors: any[]): {
  emails: any;
  findManyCalls: FindManyCall[];
  genericEmailSendCalls: { subjectStr: string, bodyStr: string, tos: any[] }[];
} {
  const findManyCalls = captured;
  const genericEmailSendCalls: { subjectStr: string, bodyStr: string, tos: any[] }[] = [];
  const fakePrisma = {
    student: {
      findMany: async (args: any) => {
        findManyCalls.push({ model: 'student', args });
        return students;
      },
    },
    mentor: {
      findMany: async (args: any) => {
        findManyCalls.push({ model: 'mentor', args });
        return mentors;
      },
    },
  };
  const fakeEmail = { sendMail: async (opts: any) => opts };
  const emails = new Emails();
  emails.prisma = fakePrisma as any;
  emails.email = fakeEmail as any;
  // Replace the fire-and-forget send with a synchronous spy so we can
  // deterministically assert the dryRun branch without racing detached IIFEs.
  emails.genericEmailSend = (subjectStr: string, bodyStr: string, tos: any[]) => {
    genericEmailSendCalls.push({ subjectStr, bodyStr, tos });
  };
  return { emails, findManyCalls, genericEmailSendCalls };
}

const sampleStudents = [
  { id: 's1', eventId: EVENT_ID, email: 's1@event.one', givenName: 'S', surname: 'One', projects: [] },
  { id: 's2', eventId: EVENT_ID, email: 's2@event.one', givenName: 'S', surname: 'Two', projects: [] },
];
const sampleMentors = [
  { id: 'm1', eventId: EVENT_ID, email: 'm1@event.one', givenName: 'M', surname: 'One', maxWeeks: 4, managerUsername: 'mgr', projects: [] },
];

test('precondition: an evt-less ADMIN token passes AuthContext.validate() and has eventId===undefined', () => {
  const auth = new AuthContext(adminTokenWithoutEvent());
  // Construction itself calling validate() is the proof; assert the shape too.
  assert.equal(auth.isAdmin, true);
  assert.equal(auth.eventId, undefined);
});

test('precondition: an ADMIN token with evt has the expected eventId', () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  assert.equal(auth.isAdmin, true);
  assert.equal(auth.eventId, EVENT_ID);
});

test('sendStudentEmail rejects an evt-less ADMIN token before hitting Prisma', async () => {
  const auth = new AuthContext(adminTokenWithoutEvent());
  const { emails, findManyCalls } = makeEmails([], sampleStudents, sampleMentors);
  const prior = findManyCalls.length;
  await assert.rejects(
    () => emails.sendStudentEmail({ auth }, 'subject', 'body', undefined, true),
    /event id/i,
  );
  assert.equal(findManyCalls.length, prior, 'prisma.student.findMany must NOT be called when eventId is missing');
});

test('sendMentorEmail rejects an evt-less ADMIN token before hitting Prisma', async () => {
  const auth = new AuthContext(adminTokenWithoutEvent());
  const { emails, findManyCalls } = makeEmails([], sampleStudents, sampleMentors);
  const prior = findManyCalls.length;
  await assert.rejects(
    () => emails.sendMentorEmail({ auth }, 'subject', 'body', undefined, true),
    /event id/i,
  );
  assert.equal(findManyCalls.length, prior, 'prisma.mentor.findMany must NOT be called when eventId is missing');
});

test('sendStudentEmail scopes the Prisma query by eventId (no undefined filter drop)', async () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  const { emails, findManyCalls } = makeEmails([], sampleStudents, sampleMentors);
  const count = await emails.sendStudentEmail({ auth }, 'subject', 'body', undefined, true);
  const studentCall = findManyCalls.find((c) => c.model === 'student');
  assert.ok(studentCall, 'prisma.student.findMany was called');
  assert.equal(studentCall.args.where.eventId, EVENT_ID);
  assert.notEqual(studentCall.args.where.eventId, undefined, 'eventId must not be undefined (Prisma would drop the filter)');
  assert.equal(Object.prototype.hasOwnProperty.call(studentCall.args.where, 'eventId'), true);
  assert.equal(count, sampleStudents.length);
});

test('sendMentorEmail scopes the Prisma query by eventId (no undefined filter drop)', async () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  const { emails, findManyCalls } = makeEmails([], sampleStudents, sampleMentors);
  const count = await emails.sendMentorEmail({ auth }, 'subject', 'body', undefined, true);
  const mentorCall = findManyCalls.find((c) => c.model === 'mentor');
  assert.ok(mentorCall, 'prisma.mentor.findMany was called');
  assert.equal(mentorCall.args.where.eventId, EVENT_ID);
  assert.notEqual(mentorCall.args.where.eventId, undefined, 'eventId must not be undefined (Prisma would drop the filter)');
  assert.equal(Object.prototype.hasOwnProperty.call(mentorCall.args.where, 'eventId'), true);
  assert.equal(count, sampleMentors.length);
});

test('sendStudentEmail default where (no filter) is { status: ACCEPTED } merged with eventId', async () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  const { emails, findManyCalls } = makeEmails([], sampleStudents, sampleMentors);
  await emails.sendStudentEmail({ auth }, 'subject', 'body', undefined, true);
  const { where } = findManyCalls.find((c) => c.model === 'student')!.args;
  assert.equal(where.status, StudentStatus.ACCEPTED);
  assert.equal(where.eventId, EVENT_ID);
});

test('sendMentorEmail default where (no filter) is { status: ACCEPTED } merged with eventId', async () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  const { emails, findManyCalls } = makeEmails([], sampleStudents, sampleMentors);
  await emails.sendMentorEmail({ auth }, 'subject', 'body', undefined, true);
  const { where } = findManyCalls.find((c) => c.model === 'mentor')!.args;
  assert.equal(where.status, MentorStatus.ACCEPTED);
  assert.equal(where.eventId, EVENT_ID);
});

test('sendStudentEmail merges a StudentFilterInput and still enforces eventId', async () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  const filter = new StudentFilterInput();
  filter.inStatus = StudentStatus.ACCEPTED;
  filter.givenName = 'S';
  const { emails, findManyCalls } = makeEmails([], sampleStudents, sampleMentors);
  await emails.sendStudentEmail({ auth }, 'subject', 'body', filter, true);
  const { where } = findManyCalls.find((c) => c.model === 'student')!.args;
  assert.equal(where.status, StudentStatus.ACCEPTED);
  assert.equal(where.givenName, 'S');
  assert.equal(where.eventId, EVENT_ID, 'eventId must remain present alongside a filter');
  assert.notEqual(where.eventId, undefined);
});

test('sendMentorEmail merges a MentorFilterInput and still enforces eventId', async () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  const filter = new MentorFilterInput();
  filter.inStatus = MentorStatus.ACCEPTED;
  filter.assignedToManager = 'mgr';
  const { emails, findManyCalls } = makeEmails([], sampleStudents, sampleMentors);
  await emails.sendMentorEmail({ auth }, 'subject', 'body', filter, true);
  const { where } = findManyCalls.find((c) => c.model === 'mentor')!.args;
  assert.equal(where.status, MentorStatus.ACCEPTED);
  assert.equal(where.managerUsername, 'mgr');
  assert.equal(where.eventId, EVENT_ID, 'eventId must remain present alongside a filter');
  assert.notEqual(where.eventId, undefined);
});

test('dryRun=true does not dispatch email (genericEmailSend not called)', async () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  const { emails, genericEmailSendCalls } = makeEmails([], sampleStudents, sampleMentors);
  await emails.sendStudentEmail({ auth }, 'subject {{givenName}}', 'body', undefined, true);
  assert.equal(genericEmailSendCalls.length, 0);
});

test('dryRun=false dispatches email exactly once for the scoped recipients', async () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  const { emails, genericEmailSendCalls } = makeEmails([], sampleStudents, sampleMentors);
  await emails.sendStudentEmail({ auth }, 'subject', 'body', undefined, false);
  assert.equal(genericEmailSendCalls.length, 1);
  assert.equal(genericEmailSendCalls[0].tos.length, sampleStudents.length);
});

test('the returned count reflects the scoped recipients, not a global cross-event set', async () => {
  const auth = new AuthContext(adminTokenWithEvent(EVENT_ID));
  // Even if the mock "database" contained records for other events, the
  // resolver only ever receives the scoped slice the (mocked) Prisma returns;
  // the guard ensures the where clause requested the slice by eventId.
  const scopedStudents = sampleStudents.filter((s) => s.eventId === EVENT_ID);
  const scopedMentors = sampleMentors.filter((m) => m.eventId === EVENT_ID);
  const { emails, findManyCalls } = makeEmails([], scopedStudents, scopedMentors);
  const sCount = await emails.sendStudentEmail({ auth }, 'subject', 'body', undefined, true);
  assert.equal(sCount, scopedStudents.length);
  assert.equal(findManyCalls.find((c) => c.model === 'student')!.args.where.eventId, EVENT_ID);
  const mCount = await emails.sendMentorEmail({ auth }, 'subject', 'body', undefined, true);
  assert.equal(mCount, scopedMentors.length);
  assert.equal(findManyCalls.find((c) => c.model === 'mentor')!.args.where.eventId, EVENT_ID);
});
