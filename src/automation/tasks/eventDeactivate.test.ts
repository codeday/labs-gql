/**
 * Offline unit tests for the eventDeactivate retirement logic. No live DB is
 * required — the deactivation candidate selection is a pure function over the
 * active-event rows and the student max-weeks grouping, exercised here with
 * in-memory fixtures. The orchestration test stubs the typedi Container's
 * PrismaClient so the default export can be driven end-to-end without a
 * database.
 *
 * `eventDeactivate` imports `makeDebug` directly from `../../utils/makeDebug`
 * (not the `../../utils` barrel) so that importing this module does not pull in
 * `src/config.ts` and its required env vars — mirroring the offline-testable
 * import style of `syncAlumniInteractions.ts`.
 *
 * Run with:
 *   npx ts-node src/automation/tasks/eventDeactivate.test.ts
 *   (or: npx tsx src/automation/tasks/eventDeactivate.test.ts)
 */
import 'reflect-metadata';
import { DateTime } from 'luxon';
import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import eventDeactivate, {
  selectExpiredEventIds,
  ActiveEventRow,
  StudentMaxWeeksRow,
} from './eventDeactivate';

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

const GRACE = 4;
const STUDENT_FALLBACK = 2;

function weeksAgo(weeks: number): Date {
  return DateTime.now().minus({ weeks }).toJSDate();
}
function weeksAhead(weeks: number): Date {
  return DateTime.now().plus({ weeks }).toJSDate();
}

function event(id: string, startsAt: Date, defaultWeeks = 4): ActiveEventRow {
  return { id, startsAt, defaultWeeks };
}
function group(eventId: string, weeks: number | null): StudentMaxWeeksRow {
  return { eventId, _max: { weeks } };
}

// --- The bug: empty active events must be reachable for deactivation ----------------------

function testEmptyEventIsDeactivatedAfterDefaultWeeksPlusGrace(): void {
  // An event with zero students. Before the fix it produced no groupBy row and
  // could never be deactivated. It should now expire after defaultWeeks + GRACE.
  const ev = event('empty', weeksAgo(4 + GRACE + 1), 4);
  const ids = selectExpiredEventIds([ev], [], DateTime.now());
  assertEqual(ids, ['empty'], 'Empty active event past defaultWeeks+grace is deactivated');
}

function testEmptyEventNotYetExpiredIsKeptActive(): void {
  const ev = event('empty-fresh', weeksAgo(4 + GRACE - 1), 4);
  const ids = selectExpiredEventIds([ev], [], DateTime.now());
  assertEqual(ids, [], 'Empty active event just shy of defaultWeeks+grace stays active');
}

function testEmptyEventExactlyAtBoundaryStaysActive(): void {
  // now > expiresAt is strict, so the instant of expiry is NOT yet expired. Use a
  // fixed `now` (rather than DateTime.now()) so the boundary is exact and not a
  // race between fixture creation and the helper's clock read.
  const now = DateTime.fromMillis(1_700_000_000_000);
  const startsAt = now.minus({ weeks: 4 + GRACE }).toJSDate();
  const ev = event('empty-boundary', startsAt, 4);
  assertEqual(
    selectExpiredEventIds([ev], [], now),
    [],
    'Empty active event exactly at the expiry boundary is not yet deactivated (strict >)',
  );
  // One millisecond later it crosses the boundary and becomes expired,
  // proving the comparison is a strict greater-than.
  assertEqual(
    selectExpiredEventIds([ev], [], now.plus({ milliseconds: 1 })),
    ['empty-boundary'],
    'Empty active event one ms past the expiry boundary is deactivated',
  );
}

function testEmptyEventUsesDefaultWeeksNotGlobalConstant(): void {
  // A clone whose source had defaultWeeks=8 must retire 8+GRACE weeks out, not
  // the schema default of 4 — i.e. defaultWeeks is read from the row, not hard-coded.
  const ev = event('empty-custom', weeksAgo(8 + GRACE + 1), 8);
  const ids = selectExpiredEventIds([ev], [], DateTime.now());
  assertEqual(ids, ['empty-custom'], 'Empty event with custom defaultWeeks retires at defaultWeeks+grace');

  const fresh = event('empty-custom-fresh', weeksAgo(8 + GRACE - 1), 8);
  assertEqual(
    selectExpiredEventIds([fresh], [], DateTime.now()),
    [],
    'Empty event with custom defaultWeeks is not prematurely retired by the schema-default window',
  );
}

function testEmptyEventInFutureNotDeactivated(): void {
  const ev = event('empty-future', weeksAhead(1), 4);
  const ids = selectExpiredEventIds([ev], [], DateTime.now());
  assertEqual(ids, [], 'Empty active event whose startsAt is in the future is not deactivated');
}

// --- Regression: student-bearing events keep their original window exactly ----------------

function testStudentBearingEventDeactivatedAfterMaxWeeksPlusGrace(): void {
  const ev = event('with-students', weeksAgo(6 + GRACE + 1), 4);
  const ids = selectExpiredEventIds([ev], [group('with-students', 6)], DateTime.now());
  assertEqual(ids, ['with-students'], 'Student-bearing event past maxWeeks+grace is deactivated');
}

function testStudentBearingEventNotYetExpiredIsKeptActive(): void {
  const ev = event('with-students-fresh', weeksAgo(6 + GRACE - 1), 4);
  const ids = selectExpiredEventIds([ev], [group('with-students-fresh', 6)], DateTime.now());
  assertEqual(ids, [], 'Student-bearing event just shy of maxWeeks+grace stays active');
}

function testStudentBearingNullMaxWeeksUses2FallbackNotDefaultWeeks(): void {
  // The original `e._max.weeks || 2` fallback MUST be preserved for the
  // student-bearing path. Widening it to defaultWeeks (4) would silently push
  // retirement out by 2 weeks and is the regression the fix must NOT introduce.
  const startsAt = weeksAgo(2 + GRACE + 1); // past the 2+GRACE window...
  const ev = event('null-weeks', startsAt, 4);
  const ids = selectExpiredEventIds([ev], [group('null-weeks', null)], DateTime.now());
  assertEqual(ids, ['null-weeks'], 'Student-bearing event with null maxWeeks retires at 2+grace (the original fallback)');

  // A row whose maxWeeks is null and defaultWeeks is large; at 2+GRACE+1 weeks old
  // it MUST already be expired under the preserved ||2 path. If the fallback
  // wrongly became defaultWeeks(12), it would NOT yet be expired here.
  const evLarge = event('null-weeks-large', startsAt, 12);
  assertEqual(
    selectExpiredEventIds([evLarge], [group('null-weeks-large', null)], DateTime.now()),
    ['null-weeks-large'],
    'Student-bearing null-weeks event is expired by the ||2 window even when defaultWeeks is large',
  );

  // A point between the 2+GRACE and 12+GRACE windows: the ||2 path (expires at
  // 2+GRACE) must fire, while a defaultWeeks path would NOT have expired yet.
  const startsAt3 = weeksAgo(4 + GRACE + 1);
  const evBetween = event('null-weeks-between', startsAt3, 12);
  assertEqual(
    selectExpiredEventIds([evBetween], [group('null-weeks-between', null)], DateTime.now()),
    ['null-weeks-between'],
    'Student-bearing null-weeks event expires via ||2 even between the 2+grace and defaultWeeks+grace windows',
  );
}

function testStudentBearingZeroMaxWeeksUses2Fallback(): void {
  // `|| 2` also covers the falsy `0` case, identical to null treatment.
  const ev = event('zero-weeks', weeksAgo(2 + GRACE + 1), 4);
  const ids = selectExpiredEventIds([ev], [group('zero-weeks', 0)], DateTime.now());
  assertEqual(ids, ['zero-weeks'], 'Student-bearing event with maxWeeks=0 retires at 2+grace (falsy, like null)');
}

function testStudentBearingEventExactlyAtBoundaryStaysActive(): void {
  // Fixed `now` for an exact boundary (see the empty-boundary test for rationale).
  const now = DateTime.fromMillis(1_700_000_000_000);
  const startsAt = now.minus({ weeks: 6 + GRACE }).toJSDate();
  const ev = event('students-boundary', startsAt, 4);
  assertEqual(
    selectExpiredEventIds([ev], [group('students-boundary', 6)], now),
    [],
    'Student-bearing event exactly at the expiry boundary is not yet deactivated (strict >)',
  );
  assertEqual(
    selectExpiredEventIds([ev], [group('students-boundary', 6)], now.plus({ milliseconds: 1 })),
    ['students-boundary'],
    'Student-bearing event one ms past the expiry boundary is deactivated',
  );
}

// --- Mixed scenarios: only the genuinely-expired set is deactivated -----------------------

function testMixedEventsDeactivateOnlyExpiredSubset(): void {
  const events = [
    event('empty-expired', weeksAgo(4 + GRACE + 1), 4),       // empty, expired
    event('empty-fresh', weeksAgo(1), 4),                    // empty, fresh
    event('students-expired', weeksAgo(6 + GRACE + 1), 4),   // students, expired
    event('students-fresh', weeksAgo(1), 4),                 // students, fresh
    event('empty-future', weeksAhead(2), 4),                 // empty, future start
  ];
  const groups = [
    group('students-expired', 6),
    group('students-fresh', 6),
  ];
  const ids = selectExpiredEventIds(events, groups, DateTime.now());
  assertEqual(
    ids.sort(),
    ['empty-expired', 'students-expired'].sort(),
    'Mixed batch deactivates only the expired subset, across both empty and student-bearing events',
  );
}

function testEmptyAndStudentBearingWithSameIdShapeDoesNotDoubleCount(): void {
  // An event appears in both `events` (once) and the group output (once): it must
  // be evaluated exactly once via the student-bearing branch, never the empty branch.
  const startsAt = weeksAgo(2 + GRACE + 1); // expires via ||2 (2+GRACE)
  const ev = event('both', startsAt, 12);   // defaultWeeks=12 would NOT yet expire at 2+GRACE+1
  const ids = selectExpiredEventIds([ev], [group('both', null)], DateTime.now());
  assertEqual(ids, ['both'], 'An event present in both inputs is retired via the student-bearing branch only');
}

// --- Edge cases --------------------------------------------------------------------------

function testNoActiveEventsDeactivatesNothing(): void {
  assertEqual(selectExpiredEventIds([], [], DateTime.now()), [], 'No active events yields no deactivations');
}

function testGroupForInactiveOrAbsentEventIsIgnoredWhenNotInEvents(): void {
  // A groupBy row whose event is not in the active `events` set (e.g. it became
  // inactive between the two queries, or the group is stale) must not cause any
  // deactivation — the candidate set is `events`, not the group output.
  const orphan = group('orphan', 99);
  assertEqual(
    selectExpiredEventIds([], [orphan], DateTime.now()),
    [],
    'A groupBy row with no matching active event is ignored',
  );
}

// --- Orchestration: the default export against a stubbed PrismaClient ---------------------

async function testOrchestrationDeactivatesEmptyAndStudentBearingEvents(): Promise<void> {
  const updateManyCalls: { in: string[] }[] = [];
  const findManyEvents: ActiveEventRow[] = [
    event('empty-clone', weeksAgo(4 + GRACE + 1), 4),
    event('with-students', weeksAgo(6 + GRACE + 1), 4),
    event('fresh', weeksAgo(1), 4),
  ];
  const studentGroups: StudentMaxWeeksRow[] = [group('with-students', 6)];

  const fakePrisma = {
    event: {
      findMany: async () => findManyEvents,
      updateMany: async (args: { where: { id: { in: string[] } }; data: { isActive: boolean } }) => {
        updateManyCalls.push({ in: args.where.id.in });
        return { count: args.where.id.in.length };
      },
    },
    student: {
      groupBy: async () => studentGroups,
    },
  };

  Container.set(PrismaClient, fakePrisma);
  await eventDeactivate();

  assertEqual(updateManyCalls.length, 1, 'Orchestration issues exactly one updateMany when events expire');
  assertEqual(
    updateManyCalls[0].in.sort(),
    ['empty-clone', 'with-students'].sort(),
    'Orchestration deactivates the union of expired empty and student-bearing events',
  );
}

async function testOrchestrationSkipsUpdateManyWhenNothingExpired(): Promise<void> {
  const updateManyCalls: { in: string[] }[] = [];
  const fakePrisma = {
    event: {
      findMany: async () => [event('fresh-empty', weeksAgo(1), 4)],
      updateMany: async (args: { where: { id: { in: string[] } }; data: { isActive: boolean } }) => {
        updateManyCalls.push({ in: args.where.id.in });
        return { count: 0 };
      },
    },
    student: {
      groupBy: async () => [],
    },
  };

  Container.set(PrismaClient, fakePrisma);
  await eventDeactivate();

  assertEqual(updateManyCalls.length, 0, 'Orchestration skips updateMany entirely when no event has expired');
}

async function main(): Promise<void> {
  testEmptyEventIsDeactivatedAfterDefaultWeeksPlusGrace();
  testEmptyEventNotYetExpiredIsKeptActive();
  testEmptyEventExactlyAtBoundaryStaysActive();
  testEmptyEventUsesDefaultWeeksNotGlobalConstant();
  testEmptyEventInFutureNotDeactivated();
  testStudentBearingEventDeactivatedAfterMaxWeeksPlusGrace();
  testStudentBearingEventNotYetExpiredIsKeptActive();
  testStudentBearingNullMaxWeeksUses2FallbackNotDefaultWeeks();
  testStudentBearingZeroMaxWeeksUses2Fallback();
  testStudentBearingEventExactlyAtBoundaryStaysActive();
  testMixedEventsDeactivateOnlyExpiredSubset();
  testEmptyAndStudentBearingWithSameIdShapeDoesNotDoubleCount();
  testNoActiveEventsDeactivatesNothing();
  testGroupForInactiveOrAbsentEventIsIgnoredWhenNotInEvents();
  await testOrchestrationDeactivatesEmptyAndStudentBearingEvents();
  await testOrchestrationSkipsUpdateManyWhenNothingExpired();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
