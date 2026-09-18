// Run with: npx tsx tests/testStudentMatchPrefsSkipPreferences.ts
//
// Verifies the fix for the "Matching emails: manually-matched (skipPreferences)
// students receive preference-submission email chain" bug. Exercises the real
// `getList` exported by each of the three sibling templates
// (`studentMatchPrefs`, `studentMatchPrefsReminder`, `studentMatchPrefsReminder2`)
// against an in-memory mock PrismaClient, so no DATABASE_URL / Postgres is
// required. Mirrors the convention of `tests/testSlackReporting.ts`
// (node:test + node:assert/strict, injected fake as `any`).
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { StudentStatus } from '../src/enums';
import { getList as getListPrefs } from '../src/email/templates/studentMatchPrefs';
import { getList as getListReminder } from '../src/email/templates/studentMatchPrefsReminder';
import { getList as getListReminder2 } from '../src/email/templates/studentMatchPrefsReminder2';

// --- Minimal in-memory Prisma mock ----------------------------------------
// Models only the predicates used by the three templates' `where` clauses:
//   status, eventId, event.{matchComplete,matchPreferenceSubmissionOpen},
//   projectPreferences.none, projects.none, skipPreferences, emailsSent.some.

type MockStudent = {
  id: string;
  eventId: string;
  status: StudentStatus;
  skipPreferences: boolean;
  projectPreferences: { id: string }[];
  projects: { id: string }[];
};

type MockEvent = {
  id: string;
  matchComplete: boolean;
  matchPreferenceSubmissionOpen: boolean;
};

type MockEmailSent = {
  emailId: string;
  studentId: string;
  createdAt: Date;
};

type FindManyArgs = {
  where: Record<string, any>;
};

function createMockPrisma(opts: {
  students: MockStudent[];
  events: MockEvent[];
  emailsSent?: MockEmailSent[];
}): any {
  const emailsSent = opts.emailsSent ?? [];
  return {
    student: {
      findMany: async (args: FindManyArgs) => {
        const w = args.where ?? {};
        return opts.students.filter((s) => {
          if (w.status !== undefined && s.status !== w.status) return false;
          if (w.eventId !== undefined && s.eventId !== w.eventId) return false;
          if (w.skipPreferences !== undefined && s.skipPreferences !== w.skipPreferences) return false;
          if (w.event) {
            const ev = opts.events.find((e) => e.id === s.eventId);
            if (!ev) return false;
            if (w.event.matchComplete !== undefined && ev.matchComplete !== w.event.matchComplete) return false;
            if (w.event.matchPreferenceSubmissionOpen !== undefined
                && ev.matchPreferenceSubmissionOpen !== w.event.matchPreferenceSubmissionOpen) return false;
          }
          if (w.projectPreferences && 'none' in w.projectPreferences && s.projectPreferences.length > 0) return false;
          if (w.projects && 'none' in w.projects && s.projects.length > 0) return false;
          if (w.emailsSent && w.emailsSent.some) {
            const cond = w.emailsSent.some;
            const emailId = cond.emailId;
            const createdAt = cond.createdAt ?? {};
            const has = emailsSent.some((e) => {
              if (e.studentId !== s.id) return false;
              if (emailId !== undefined && e.emailId !== emailId) return false;
              if (createdAt.lt instanceof Date && e.createdAt >= createdAt.lt) return false;
              return true;
            });
            if (!has) return false;
          }
          return true;
        });
      },
    },
  };
}

// --- Shared fixture ---------------------------------------------------------
const EVENT_ID = 'event-1';
const OTHER_EVENT_ID = 'event-2';

const events: MockEvent[] = [
  { id: EVENT_ID, matchComplete: false, matchPreferenceSubmissionOpen: true },
  { id: OTHER_EVENT_ID, matchComplete: false, matchPreferenceSubmissionOpen: true },
];

// Student A: the bug population — flagged for manual matching, would have been
// included by the buggy `where` clause. Must be excluded by the fix.
const flaggedStudent: MockStudent = {
  id: 'A-flagged',
  eventId: EVENT_ID,
  status: StudentStatus.ACCEPTED,
  skipPreferences: true,
  projectPreferences: [],
  projects: [],
};

// Student B: the legitimate target population — accepted, no preferences
// submitted yet, no project, not flagged. Must be included.
const normalStudent: MockStudent = {
  id: 'B-normal',
  eventId: EVENT_ID,
  status: StudentStatus.ACCEPTED,
  skipPreferences: false,
  projectPreferences: [],
  projects: [],
};

// Student C: flagged AND already manually matched — must be excluded by
// `projects: { none: {} }` regardless of the skipPreferences filter.
const flaggedMatchedStudent: MockStudent = {
  id: 'C-flagged-matched',
  eventId: EVENT_ID,
  status: StudentStatus.ACCEPTED,
  skipPreferences: true,
  projectPreferences: [],
  projects: [{ id: 'proj-1' }],
};

// Student D: not flagged but not accepted — must be excluded by `status`.
const appliedStudent: MockStudent = {
  id: 'D-applied',
  eventId: EVENT_ID,
  status: StudentStatus.APPLIED,
  skipPreferences: false,
  projectPreferences: [],
  projects: [],
};

// Student E: not flagged but has already submitted preferences — must be
// excluded by `projectPreferences: { none: {} }`.
const submittedStudent: MockStudent = {
  id: 'E-submitted',
  eventId: EVENT_ID,
  status: StudentStatus.ACCEPTED,
  skipPreferences: false,
  projectPreferences: [{ id: 'pref-1' }],
  projects: [],
};

// Student F: not flagged but in a different event — must be excluded by
// `eventId`.
const otherEventStudent: MockStudent = {
  id: 'F-other-event',
  eventId: OTHER_EVENT_ID,
  status: StudentStatus.ACCEPTED,
  skipPreferences: false,
  projectPreferences: [],
  projects: [],
};

const baseStudents: MockStudent[] = [
  flaggedStudent,
  normalStudent,
  flaggedMatchedStudent,
  appliedStudent,
  submittedStudent,
  otherEventStudent,
];

const partialEvent = { id: EVENT_ID } as any;

// --- Tests for the initial email (studentMatchPrefs) ------------------------
test('studentMatchPrefs getList excludes skipPreferences:true students', async () => {
  const prisma = createMockPrisma({ students: baseStudents, events });
  const contexts = await getListPrefs(prisma as any, partialEvent);
  const ids = contexts.map((c) => c.student!.id);

  assert.ok(!ids.includes(flaggedStudent.id),
    `flagged student should be excluded, got: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes(normalStudent.id),
    `normal student should be included, got: ${JSON.stringify(ids)}`);
});

test('studentMatchPrefs getList still respects the other where predicates', async () => {
  const prisma = createMockPrisma({ students: baseStudents, events });
  const ids = (await getListPrefs(prisma as any, partialEvent)).map((c) => c.student!.id);

  assert.ok(!ids.includes(flaggedMatchedStudent.id), 'matched flagged student must be excluded by projects:none');
  assert.ok(!ids.includes(appliedStudent.id), 'non-ACCEPTED student must be excluded by status');
  assert.ok(!ids.includes(submittedStudent.id), 'student with preferences must be excluded by projectPreferences:none');
  assert.ok(!ids.includes(otherEventStudent.id), 'student in other event must be excluded by eventId');
});

// --- Tests for the first reminder (studentMatchPrefsReminder) --------------
test('studentMatchPrefsReminder getList excludes skipPreferences:true students', async () => {
  const NOW = new Date();
  const OLD = new Date(NOW.getTime() - 48 * 60 * 60 * 1000); // 48h ago
  const emailsSent: MockEmailSent[] = [
    { emailId: 'studentMatchPrefs', studentId: flaggedStudent.id, createdAt: OLD },
    { emailId: 'studentMatchPrefs', studentId: normalStudent.id, createdAt: OLD },
  ];
  const prisma = createMockPrisma({ students: baseStudents, events, emailsSent });
  const contexts = await getListReminder(prisma as any, partialEvent);
  const ids = contexts.map((c) => c.student!.id);

  assert.ok(!ids.includes(flaggedStudent.id),
    `flagged student must not receive reminder, got: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes(normalStudent.id),
    `normal student with prior studentMatchPrefs email must receive reminder, got: ${JSON.stringify(ids)}`);
});

test('studentMatchPrefsReminder getList does not advance flagged students down the chain', async () => {
  const NOW = new Date();
  const OLD = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
  // Even when a flagged student has a studentMatchPrefs EmailSent row older
  // than 24h (which would be the case if the first email was incorrectly sent
  // before the fix), the reminder must NOT be sent.
  const emailsSent: MockEmailSent[] = [
    { emailId: 'studentMatchPrefs', studentId: flaggedStudent.id, createdAt: OLD },
  ];
  const prisma = createMockPrisma({ students: [flaggedStudent, normalStudent], events, emailsSent });
  const ids = (await getListReminder(prisma as any, partialEvent)).map((c) => c.student!.id);

  assert.ok(!ids.includes(flaggedStudent.id),
    `flagged student must not progress to reminder even with prior first email, got: ${JSON.stringify(ids)}`);
});

// --- Tests for the second reminder (studentMatchPrefsReminder2) ------------
test('studentMatchPrefsReminder2 getList excludes skipPreferences:true students', async () => {
  const NOW = new Date();
  const OLD = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
  const emailsSent: MockEmailSent[] = [
    { emailId: 'studentMatchPrefsReminder', studentId: flaggedStudent.id, createdAt: OLD },
    { emailId: 'studentMatchPrefsReminder', studentId: normalStudent.id, createdAt: OLD },
  ];
  const prisma = createMockPrisma({ students: baseStudents, events, emailsSent });
  const contexts = await getListReminder2(prisma as any, partialEvent);
  const ids = contexts.map((c) => c.student!.id);

  assert.ok(!ids.includes(flaggedStudent.id),
    `flagged student must not receive reminder2, got: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes(normalStudent.id),
    `normal student with prior reminder must receive reminder2, got: ${JSON.stringify(ids)}`);
});

test('studentMatchPrefsReminder2 getList does not advance flagged students to the false-removal email', async () => {
  const NOW = new Date();
  const OLD = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
  const emailsSent: MockEmailSent[] = [
    { emailId: 'studentMatchPrefsReminder', studentId: flaggedStudent.id, createdAt: OLD },
  ];
  const prisma = createMockPrisma({ students: [flaggedStudent, normalStudent], events, emailsSent });
  const ids = (await getListReminder2(prisma as any, partialEvent)).map((c) => c.student!.id);

  assert.ok(!ids.includes(flaggedStudent.id),
    `flagged student must never receive the false "removed from program" reminder2, got: ${JSON.stringify(ids)}`);
});

// --- Regression guard: the where clause structurally contains the fix -------
test('studentMatchPrefs where clause contains skipPreferences: false', async () => {
  let captured: FindManyArgs | null = null;
  const prisma = {
    student: {
      findMany: async (args: FindManyArgs) => { captured = args; return []; },
    },
  } as any;
  await getListPrefs(prisma, partialEvent);
  assert.ok(captured, 'findMany was called');
  assert.equal(captured!.where.skipPreferences, false,
    `expected where.skipPreferences === false, got: ${JSON.stringify(captured!.where)}`);
  assert.equal(captured!.where.status, StudentStatus.ACCEPTED);
  assert.deepEqual(captured!.where.projectPreferences, { none: {} });
  assert.deepEqual(captured!.where.projects, { none: {} });
  assert.equal(captured!.where.eventId, EVENT_ID);
  assert.deepEqual(captured!.where.event, { matchComplete: false, matchPreferenceSubmissionOpen: true });
});

test('studentMatchPrefsReminder where clause contains skipPreferences: false', async () => {
  let captured: FindManyArgs | null = null;
  const prisma = {
    student: {
      findMany: async (args: FindManyArgs) => { captured = args; return []; },
    },
  } as any;
  await getListReminder(prisma, partialEvent);
  assert.ok(captured, 'findMany was called');
  assert.equal(captured!.where.skipPreferences, false,
    `expected where.skipPreferences === false, got: ${JSON.stringify(captured!.where)}`);
  assert.equal(captured!.where.emailsSent.some.emailId, 'studentMatchPrefs');
});

test('studentMatchPrefsReminder2 where clause contains skipPreferences: false', async () => {
  let captured: FindManyArgs | null = null;
  const prisma = {
    student: {
      findMany: async (args: FindManyArgs) => { captured = args; return []; },
    },
  } as any;
  await getListReminder2(prisma, partialEvent);
  assert.ok(captured, 'findMany was called');
  assert.equal(captured!.where.skipPreferences, false,
    `expected where.skipPreferences === false, got: ${JSON.stringify(captured!.where)}`);
  assert.equal(captured!.where.emailsSent.some.emailId, 'studentMatchPrefsReminder');
});
