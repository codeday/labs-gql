import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { makeDebug } from "../../utils/makeDebug";

const DEBUG = makeDebug('automation:tasks:eventDeactivate');

export const JOBSPEC = '0 3 * * *';

const GRACE_PERIOD_WEEKS = 4;
// Retirement window (weeks) used for student-bearing events whose max student
// week is falsy (null/0). Preserved verbatim from the original implementation so
// the deactivation timing of such events is unchanged.
const STUDENT_FALLBACK_WEEKS = 2;

/**
 * Most automated functions check `isActive` to make sure they're not operating
 * on students from older batches of events. This function automatically marks
 * events as inactive a few weeks after the last student leaves — and, for the
 * previously-uncovered case of an active event that never had any students
 * (e.g. an empty cloned event), a few weeks after `startsAt`.
 */
export default async function eventDeactivate() {
  const prisma = Container.get(PrismaClient);
  const now = DateTime.now();

  // Mark events inactive after all students are over. The candidate set is
  // iterated over `events` (every active event, including those with zero
  // students) rather than over the `student.groupBy` output, because `groupBy`
  // only emits rows for events that have ≥1 student and would otherwise leave
  // empty active events structurally unreachable by the only deactivation path.
  const [events, eventsMaxWeeks] = await Promise.all([
    prisma.event.findMany({
      where: { isActive: true },
      select: { id: true, startsAt: true, defaultWeeks: true },
    }),
    prisma.student.groupBy({
      _max: { weeks: true },
      by: ['eventId'],
      where: { event: { isActive: true } },
    }),
  ]);

  const expiredEventIds = selectExpiredEventIds(events, eventsMaxWeeks, now);

  if (expiredEventIds.length > 0) {
    DEBUG(`Deactivating events: ${expiredEventIds}`);
    await prisma.event.updateMany({
      where: { id: { in: expiredEventIds } },
      data: { isActive: false },
    });
  }
}

/** Shape of an active `Event` row as selected by `eventDeactivate`. */
export interface ActiveEventRow {
  id: string;
  startsAt: Date;
  defaultWeeks: number;
}

/** Shape of a `student.groupBy` row as selected by `eventDeactivate`. */
export interface StudentMaxWeeksRow {
  eventId: string;
  _max: { weeks: number | null };
}

/**
 * Pure selection of which active events have aged past their retirement window.
 *
 * - Student-bearing events keep the original window of
 *   `startsAt + (maxWeeks || STUDENT_FALLBACK_WEEKS) + GRACE_PERIOD_WEEKS`, so
 *   their deactivation timing is byte-for-byte unchanged (in particular, the
 *   `|| 2` fallback is NOT widened to `defaultWeeks`).
 * - Events that have never had a student (no `Student` row, hence no `groupBy`
 *   row) are retired via `startsAt + defaultWeeks + GRACE_PERIOD_WEEKS` instead
 *   of being kept active forever. `defaultWeeks` is a non-nullable `Int` in the
 *   schema, so no further fallback is required.
 */
export function selectExpiredEventIds(
  events: ActiveEventRow[],
  studentMaxWeeks: StudentMaxWeeksRow[],
  now: DateTime,
): string[] {
  const maxWeeksByEventId = Object.fromEntries(
    studentMaxWeeks.map(e => [e.eventId, e._max.weeks]),
  );

  return events
    .filter(e => {
      if (e.id in maxWeeksByEventId) {
        const expiresAt = DateTime.fromJSDate(e.startsAt)
          .plus({ weeks: (maxWeeksByEventId[e.id] || STUDENT_FALLBACK_WEEKS) + GRACE_PERIOD_WEEKS });
        return now > expiresAt;
      }
      const expiresAt = DateTime.fromJSDate(e.startsAt)
        .plus({ weeks: e.defaultWeeks + GRACE_PERIOD_WEEKS });
      return now > expiresAt;
    })
    .map(e => e.id);
}
