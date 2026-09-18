/**
 * Offline unit tests for the assignGroups activity task. No live DB required —
 * the Prisma client is swapped out via typedi's Container for an in-memory fake
 * that honors the `include.students.where.status.notIn` filter like real Prisma.
 *
 * Run with:
 *   npx tsx src/activities/tasks/assignGroups.test.ts
 */
import 'reflect-metadata';
import { Container } from 'typedi';
import { PrismaClient, StudentStatus, ProjectStatus } from '@prisma/client';
import assignGroups from './assignGroups';

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

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const EVENT_ID = 'evt-test';

let seq = 0;
const uid = (p: string) => `${p}-${++seq}`;

type FakeStudent = { id: string; eventId: string; status: StudentStatus; givenName: string };
type FakeProject = {
  id: string;
  eventId: string;
  status: ProjectStatus;
  maxStudents: number;
  students: FakeStudent[];
};

let capturedProjectQuery: any;
let recordedUpdates: Record<string, string[]>;

function makeStudent(status: StudentStatus, givenName?: string): FakeStudent {
  return { id: uid('stu'), eventId: EVENT_ID, status, givenName: givenName ?? `Student-${seq}` };
}

function makeProject(students: FakeStudent[], maxStudents: number): FakeProject {
  return { id: uid('proj'), eventId: EVENT_ID, status: ProjectStatus.ACCEPTED, maxStudents, students: [...students] };
}

function buildFakePrisma(db: { projects: FakeProject[]; students: FakeStudent[] }): PrismaClient {
  capturedProjectQuery = null;
  recordedUpdates = {};

  const prisma = {
    project: {
      findMany: async (args: any) => {
        capturedProjectQuery = JSON.parse(JSON.stringify(args));
        let result = db.projects.filter(
          (p) =>
            (args.where?.eventId === undefined || p.eventId === args.where.eventId) &&
            (args.where?.status === undefined || p.status === args.where.status),
        );
        const notIn: StudentStatus[] = args.include?.students?.where?.status?.notIn ?? [];
        result = result.map((p) => {
          let s = p.students;
          if (notIn.length) {
            s = s.filter((st) => !notIn.includes(st.status));
          }
          return { ...p, students: s };
        });
        return result;
      },
      update: async (args: any) => {
        const projectId = args.where?.id;
        const connectIds: string[] = (args.data?.students?.connect ?? []).map((c: any) => c.id);
        recordedUpdates[projectId] = (recordedUpdates[projectId] ?? []).concat(connectIds);
        const project = db.projects.find((p) => p.id === projectId);
        for (const sid of connectIds) {
          const student = db.students.find((st) => st.id === sid);
          if (student && project && !project.students.some((ps) => ps.id === sid)) {
            project.students.push(student);
          }
        }
        return {};
      },
    },
    student: {
      findMany: async (args: any) => {
        let result = db.students.filter(
          (s) =>
            (args.where?.eventId === undefined || s.eventId === args.where.eventId) &&
            (args.where?.status === undefined || s.status === args.where.status),
        );
        if (args.where?.projects && 'none' in args.where.projects) {
          result = result.filter((s) => !db.projects.some((p) => p.students.some((ps) => ps.id === s.id)));
        }
        return result;
      },
    },
  };
  return prisma as unknown as PrismaClient;
}

function ctx(): any {
  return { auth: { eventId: EVENT_ID } };
}

function totalAssigned(): number {
  return Object.values(recordedUpdates).flat().length;
}

function resetSeq(): void {
  seq = 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Guards against reverting the capacity query to `include: { students: true }`.
async function testCapacityQueryExcludesTerminalStatuses(): Promise<void> {
  resetSeq();
  const db = {
    projects: [makeProject([makeStudent(StudentStatus.CANCELED)], 4)],
    students: [makeStudent(StudentStatus.ACCEPTED)],
  };
  Container.set(PrismaClient, buildFakePrisma(db));

  await assignGroups(ctx(), { algorithm: 'random' });

  assertEqual(
    capturedProjectQuery.include.students.where.status.notIn,
    [StudentStatus.CANCELED, StudentStatus.REJECTED],
    'project capacity query excludes CANCELED and REJECTED students from include.students',
  );
}

// Guards the core behavior: stale CANCELED/REJECTED join rows must not occupy a
// seat, so eligible candidates are placed into the freed capacity.
async function testStaleTerminalRowsDoNotReduceCapacity(): Promise<void> {
  resetSeq();
  // P maxStudents=4 holding 3 stale terminal rows (2 CANCELED + 1 REJECTED) + 1 active ACCEPTED.
  // Real remaining capacity is 4 - 1 = 3 (only the active student occupies a seat).
  // 3 eligible ACCEPTED candidates with no existing project should all be placed.
  const stale = [
    makeStudent(StudentStatus.CANCELED),
    makeStudent(StudentStatus.CANCELED),
    makeStudent(StudentStatus.REJECTED),
  ];
  const active = makeStudent(StudentStatus.ACCEPTED);
  const P = makeProject([...stale, active], 4);
  const candidates = [
    makeStudent(StudentStatus.ACCEPTED),
    makeStudent(StudentStatus.ACCEPTED),
    makeStudent(StudentStatus.ACCEPTED),
  ];
  const db = { projects: [P], students: [...stale, active, ...candidates] };
  Container.set(PrismaClient, buildFakePrisma(db));

  await assignGroups(ctx(), { algorithm: 'random' });

  const assigned = recordedUpdates[P.id] ?? [];
  assertEqual(assigned.length, candidates.length, 'all eligible candidates fill the seats freed by stale rows');
  assertEqual(totalAssigned(), candidates.length, 'no eligible student is left unassigned');
}

// Guards against "simplifying" the filter to `status: ACCEPTED`: a non-terminal
// connected student (e.g. OFFERED) still occupies a real seat, so the project
// must not be over-filled past `maxStudents` when that student later accepts.
async function testNonTerminalStudentsStillCountTowardCapacity(): Promise<void> {
  resetSeq();
  // P maxStudents=2 holds 1 OFFERED student. Remaining capacity = 2 - 1 = 1, so
  // only 1 of the 2 eligible ACCEPTED candidates fits.
  const offered = makeStudent(StudentStatus.OFFERED);
  const P = makeProject([offered], 2);
  const candidates = [makeStudent(StudentStatus.ACCEPTED), makeStudent(StudentStatus.ACCEPTED)];
  const db = { projects: [P], students: [offered, ...candidates] };
  Container.set(PrismaClient, buildFakePrisma(db));

  await assignGroups(ctx(), { algorithm: 'random' });

  const assigned = recordedUpdates[P.id] ?? [];
  assertEqual(assigned.length, 1, 'OFFERED occupies a seat; only 1 of 2 candidates fits (prevents overflow)');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await testCapacityQueryExcludesTerminalStatuses();
  await testStaleTerminalRowsDoNotReduceCapacity();
  await testNonTerminalStudentsStillCountTowardCapacity();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
