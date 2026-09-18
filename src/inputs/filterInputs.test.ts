/**
 * Offline unit tests for the GtLtEq -> Prisma `IntFilter` translation and the filter
 * inputs that embed it (ProjectFilterInput.studentWeeks, MentorFilterInput.studentWeeks,
 * StudentFilterInput.weeks).
 *
 * Regression coverage for: "GraphQL equality filter on student weeks crashes projects
 * query" -- GtLtEq.eq must be translated to Prisma's IntFilter.equals, and the filter
 * inputs must call GtLtEq.toQuery() rather than passing the raw instance straight into
 * Prisma (which sent an `eq` key that IntFilter rejects).
 *
 * The shape/behavior tests are fully offline. The Prisma runtime-validation probes at
 * the bottom instantiate a real PrismaClient WITHOUT a database: Prisma validates the
 * `where` input against its generated schema BEFORE attempting any connection, so the
 * buggy `{ eq: N }` shape raises PrismaClientValidationError here regardless of
 * DATABASE_URL, while the fixed `{ equals: N }` shape passes validation (and only then
 * fails at the connection step, which we treat as success). A negative-control probe
 * asserting the old shape IS rejected proves the probes can actually detect the bug.
 *
 * Run with:
 *   npx tsx src/inputs/filterInputs.test.ts
 *   (or: npx ts-node src/inputs/filterInputs.test.ts)
 */
import 'reflect-metadata';
import { PrismaClient, Prisma } from '@prisma/client';
import { ProjectStatus, Track, StudentStatus } from '../enums';
import { GtLtEq } from './GtLtEq';
import { ProjectFilterInput } from './ProjectFilterInput';
import { MentorFilterInput } from './MentorFilterInput';
import { StudentFilterInput } from './StudentFilterInput';

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

function assertThrows(fn: () => unknown, messageFragment: string, label: string): void {
  try {
    fn();
    failures += 1;
    console.error(`FAILED: ${label} (expected an Error matching ${JSON.stringify(messageFragment)})`);
  } catch (e: any) {
    const msg = String((e && e.message) || e);
    if (messageFragment && !msg.includes(messageFragment)) {
      failures += 1;
      console.error(`FAILED: ${label} (threw, but message did not include ${JSON.stringify(messageFragment)}: ${msg})`);
    } else {
      console.log(`PASSED: ${label}`);
    }
  }
}

function gtLtEq(overrides: Partial<Pick<GtLtEq, 'gt' | 'gte' | 'lt' | 'lte' | 'eq'>> = {}): GtLtEq {
  return Object.assign(new GtLtEq(), overrides);
}
function projectFilter(overrides: Partial<ProjectFilterInput> = {}): ProjectFilterInput {
  return Object.assign(new ProjectFilterInput(), overrides);
}
function mentorFilter(overrides: Partial<MentorFilterInput> = {}): MentorFilterInput {
  return Object.assign(new MentorFilterInput(), overrides);
}
function studentFilter(overrides: Partial<StudentFilterInput> = {}): StudentFilterInput {
  return Object.assign(new StudentFilterInput(), overrides);
}

// Compile-time type guards: if any toQuery() return ever stops being assignable to the
// corresponding Prisma input, `npx tsc --skipLibCheck --noEmit` fails. (Inputs are
// non-empty so these don't throw at runtime.)
const _gtLtEqTypeCheck: Prisma.IntFilter = gtLtEq({ eq: 5 }).toQuery();
const _projectTypeCheck: Prisma.ProjectWhereInput = projectFilter({ studentWeeks: gtLtEq({ eq: 5 }) }).toQuery();
const _mentorTypeCheck: Prisma.MentorWhereInput = mentorFilter({ studentWeeks: gtLtEq({ eq: 5 }) }).toQuery();
const _studentTypeCheck: Prisma.StudentWhereInput = studentFilter({ weeks: gtLtEq({ eq: 5 }) }).toQuery();
void [_gtLtEqTypeCheck, _projectTypeCheck, _mentorTypeCheck, _studentTypeCheck];

// --- GtLtEq.toQuery() -----------------------------------------------------------------

(function testEqMapsToPrismaEqualsKey() {
  const q = gtLtEq({ eq: 5 }).toQuery();
  assertEqual(q, { equals: 5 }, 'GtLtEq.toQuery() emits `equals` (not `eq`) for equality');
  assert(!JSON.stringify(q).includes('"eq"'), 'GtLtEq.toQuery() result contains no `eq` key');
})();

(function testRangeKeysArePreserved() {
  assertEqual(gtLtEq({ gt: 5 }).toQuery(), { gt: 5 }, 'GtLtEq.toQuery() preserves gt');
  assertEqual(gtLtEq({ gte: 5 }).toQuery(), { gte: 5 }, 'GtLtEq.toQuery() preserves gte');
  assertEqual(gtLtEq({ lt: 5 }).toQuery(), { lt: 5 }, 'GtLtEq.toQuery() preserves lt');
  assertEqual(gtLtEq({ lte: 5 }).toQuery(), { lte: 5 }, 'GtLtEq.toQuery() preserves lte');
})();

(function testRangeCombinations() {
  assertEqual(gtLtEq({ gt: 3, lt: 7 }).toQuery(), { gt: 3, lt: 7 }, 'GtLtEq.toQuery() supports gt+lt ranges');
  assertEqual(gtLtEq({ gte: 2, lte: 8 }).toQuery(), { gte: 2, lte: 8 }, 'GtLtEq.toQuery() supports gte+lte ranges');
})();

(function testGtLtEqValidationErrors() {
  assertThrows(() => gtLtEq().toQuery(), 'Specify GT', 'GtLtEq.toQuery() rejects an empty filter');
  assertThrows(() => gtLtEq({ gt: 1, gte: 2 }).toQuery(), 'Do not specify both gt and gte', 'GtLtEq.toQuery() rejects gt+gte');
  assertThrows(() => gtLtEq({ lt: 1, lte: 2 }).toQuery(), 'Do not specify both lt and lte', 'GtLtEq.toQuery() rejects lt+lte');
  assertThrows(() => gtLtEq({ eq: 5, gt: 3 }).toQuery(), 'Do not specify eq with others', 'GtLtEq.toQuery() rejects eq+gt');
  assertThrows(() => gtLtEq({ eq: 5, lt: 3 }).toQuery(), 'Do not specify eq with others', 'GtLtEq.toQuery() rejects eq+lt');
})();

// --- ProjectFilterInput.toQuery() -----------------------------------------------------

(function testProjectEqShape() {
  const q = projectFilter({ studentWeeks: gtLtEq({ eq: 5 }) }).toQuery();
  assertEqual(q, { students: { some: { weeks: { equals: 5 } } } }, 'ProjectFilterInput studentWeeks eq -> weeks.equals');
  assert(!JSON.stringify(q).includes('"eq"'), 'ProjectFilterInput studentWeeks eq result contains no `eq` key');
})();

(function testProjectRangeStillWorks() {
  const q = projectFilter({ studentWeeks: gtLtEq({ gt: 3, lte: 7 }) }).toQuery();
  assertEqual(q, { students: { some: { weeks: { gt: 3, lte: 7 } } } }, 'ProjectFilterInput studentWeeks range still works');
})();

(function testProjectAbsentStudentWeeks() {
  const q = projectFilter({}).toQuery();
  assert(!('students' in q), 'ProjectFilterInput omits students key when studentWeeks absent');
})();

(function testProjectOtherFieldsPassThrough() {
  const q = projectFilter({ id: 'p1', status: ProjectStatus.ACCEPTED, track: Track.INTERMEDIATE }).toQuery();
  assertEqual(q.id, 'p1', 'ProjectFilterInput passes id');
  assertEqual(q.status, ProjectStatus.ACCEPTED, 'ProjectFilterInput passes status');
  assertEqual(q.track, Track.INTERMEDIATE, 'ProjectFilterInput passes track');
})();

(function testProjectWeeksGteAndAssignedToManager() {
  const q = projectFilter({ weeksGte: 4, assignedToManager: 'mgr' }).toQuery();
  assert(!!q.mentors && 'some' in q.mentors, 'ProjectFilterInput builds mentors.some for weeksGte/assignedToManager');
  assertEqual(q.mentors!.some, { maxWeeks: { gte: 4 }, managerUsername: 'mgr' }, 'ProjectFilterInput mentors.some contents');
})();

(function testProjectEqWithRangeTightens() {
  assertThrows(
    () => projectFilter({ studentWeeks: gtLtEq({ eq: 5, gt: 3 }) }).toQuery(),
    'Do not specify eq with others',
    'ProjectFilterInput rejects eq+gt via GtLtEq validation (tightening, clearer error than a Prisma crash)',
  );
})();

// --- MentorFilterInput.toQuery() ------------------------------------------------------

(function testMentorEqShape() {
  const q = mentorFilter({ studentWeeks: gtLtEq({ eq: 5 }) }).toQuery();
  assertEqual(q.projects, { some: { students: { some: { weeks: { equals: 5 } } } } }, 'MentorFilterInput studentWeeks eq -> weeks.equals');
  assert(!JSON.stringify(q).includes('"eq"'), 'MentorFilterInput studentWeeks eq result contains no `eq` key');
})();

(function testMentorRangeStillWorks() {
  const q = mentorFilter({ studentWeeks: gtLtEq({ lt: 5 }) }).toQuery();
  assertEqual(q.projects, { some: { students: { some: { weeks: { lt: 5 } } } } }, 'MentorFilterInput studentWeeks range still works');
})();

(function testMentorProjectsUndefinedWhenNothingSet() {
  assertEqual(mentorFilter({}).toQuery().projects, undefined, 'MentorFilterInput projects undefined when nothing relevant set');
})();

(function testMentorTrackOnly() {
  const q = mentorFilter({ track: Track.ADVANCED }).toQuery();
  assertEqual(q.projects, { some: { track: Track.ADVANCED } }, 'MentorFilterInput track-only projects.some');
})();

(function testMentorWeeksGte() {
  assertEqual(mentorFilter({ weeksGte: 4 }).toQuery().maxWeeks, { gte: 4 }, 'MentorFilterInput weeksGte -> maxWeeks.gte');
})();

// --- StudentFilterInput.toQuery() -----------------------------------------------------

(function testStudentEqShape() {
  const q = studentFilter({ weeks: gtLtEq({ eq: 5 }) }).toQuery();
  assertEqual(q.weeks, { equals: 5 }, 'StudentFilterInput weeks eq -> weeks.equals');
  assert(!JSON.stringify(q.weeks).includes('"eq"'), 'StudentFilterInput weeks eq result contains no `eq` key');
})();

(function testStudentRangeStillWorks() {
  assertEqual(studentFilter({ weeks: gtLtEq({ gte: 5 }) }).toQuery().weeks, { gte: 5 }, 'StudentFilterInput weeks range still works');
})();

(function testStudentWeeksAbsent() {
  assertEqual(studentFilter({}).toQuery().weeks, undefined, 'StudentFilterInput weeks undefined when absent');
})();

(function testStudentOtherFieldsPassThrough() {
  const q = studentFilter({ inStatus: StudentStatus.ACCEPTED, partnerCode: 'CODE', track: Track.BEGINNER, id: 'stu-1' }).toQuery();
  assertEqual(q.status, StudentStatus.ACCEPTED, 'StudentFilterInput passes status');
  assertEqual(q.partnerCode, 'CODE', 'StudentFilterInput passes partnerCode');
  assertEqual(q.track, Track.BEGINNER, 'StudentFilterInput passes track');
  assertEqual(q.id, 'stu-1', 'StudentFilterInput passes id');
})();

(function testStudentEqWithLteTightens() {
  assertThrows(
    () => studentFilter({ weeks: gtLtEq({ eq: 5, lte: 3 }) }).toQuery(),
    'Do not specify eq with others',
    'StudentFilterInput rejects eq+lte via GtLtEq validation',
  );
})();

// --- Prisma runtime validation probes (no DB required) --------------------------------

async function probe(
  prisma: PrismaClient,
  model: 'project' | 'mentor' | 'student',
  where: unknown,
): Promise<{ validationError: boolean; message: string }> {
  try {
    const find = (prisma as any)[model].findMany({ where, take: 1 });
    await Promise.race([
      find,
      new Promise((_, reject) => setTimeout(() => reject(new Error('prisma-probe-timeout')), 5000)),
    ]);
    return { validationError: false, message: '' };
  } catch (e: any) {
    const message = String((e && e.message) || e).split('\n')[0];
    const validationError = e instanceof Prisma.PrismaClientValidationError || /Unknown arg/i.test(message);
    return { validationError, message };
  }
}

async function testNegativeControlBuggyShapeRejected(prisma: PrismaClient): Promise<void> {
  // The pre-fix shape { weeks: { eq: N } } MUST be rejected by Prisma's runtime `where`
  // validation. Prisma validates before connecting, so this throws without a database.
  // This proves the probes can actually detect the buggy shape (i.e. the tests above are
  // meaningful, not vacuously green).
  const result = await probe(prisma, 'project', { students: { some: { weeks: { eq: 5 } } } });
  if (!result.validationError) {
    failures += 1;
    console.error(`FAILED: Negative control -- buggy { weeks: { eq: 5 } } should be rejected by Prisma (got: ${result.message || 'accepted'})`);
  } else {
    console.log('PASSED: Negative control -- buggy { weeks: { eq: 5 } } is rejected by Prisma (probe can detect the bug)');
  }
}

async function testProjectFilterEqPassesPrismaValidation(prisma: PrismaClient): Promise<void> {
  const where = projectFilter({ studentWeeks: gtLtEq({ eq: 5 }) }).toQuery();
  const result = await probe(prisma, 'project', where);
  if (result.validationError) {
    failures += 1;
    console.error(`FAILED: ProjectFilterInput studentWeeks eq rejected by Prisma: ${result.message}`);
  } else {
    console.log('PASSED: ProjectFilterInput studentWeeks eq passes Prisma runtime validation');
  }
}

async function testMentorFilterEqPassesPrismaValidation(prisma: PrismaClient): Promise<void> {
  const where = mentorFilter({ studentWeeks: gtLtEq({ eq: 5 }) }).toQuery();
  const result = await probe(prisma, 'mentor', where);
  if (result.validationError) {
    failures += 1;
    console.error(`FAILED: MentorFilterInput studentWeeks eq rejected by Prisma: ${result.message}`);
  } else {
    console.log('PASSED: MentorFilterInput studentWeeks eq passes Prisma runtime validation');
  }
}

async function testStudentFilterEqPassesPrismaValidation(prisma: PrismaClient): Promise<void> {
  const where = studentFilter({ weeks: gtLtEq({ eq: 5 }) }).toQuery();
  const result = await probe(prisma, 'student', where);
  if (result.validationError) {
    failures += 1;
    console.error(`FAILED: StudentFilterInput weeks eq rejected by Prisma: ${result.message}`);
  } else {
    console.log('PASSED: StudentFilterInput weeks eq passes Prisma runtime validation');
  }
}

async function main(): Promise<void> {
  try {
    const prisma = new PrismaClient();
    try {
      await testNegativeControlBuggyShapeRejected(prisma);
      await testProjectFilterEqPassesPrismaValidation(prisma);
      await testMentorFilterEqPassesPrismaValidation(prisma);
      await testStudentFilterEqPassesPrismaValidation(prisma);
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  } catch (e: any) {
    // PrismaClient couldn't be instantiated (e.g. generated client unavailable). The
    // offline shape/behavior tests above already cover the fix; don't fail the suite just
    // because the optional live validation probes can't run.
    console.log(`NOTE: Skipped live Prisma validation probes (${String((e && e.message) || e).split('\n')[0]}). Offline shape + tsc tests cover the fix.`);
  }

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
