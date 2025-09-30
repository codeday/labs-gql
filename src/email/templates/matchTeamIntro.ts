import { MentorStatus, StudentStatus, PrismaClient } from '@prisma/client';
import { ProjectStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';
import { DateTime } from 'luxon';

export async function getId(): Promise<string> {
  return `matchTeamIntro`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const projects = await prisma.project.findMany({
    where: {
      eventId: event.id,
      status: ProjectStatus.MATCHED,
      mentors: { some: { status: MentorStatus.ACCEPTED } },
      students: { some: { status: StudentStatus.ACCEPTED } },
      event: { matchComplete: true },
    },
    include: {
      mentors: { where: { status: MentorStatus.ACCEPTED } },
      students: { where: { status: StudentStatus.ACCEPTED }, select: { timezone: true, timeManagementPlan: true } },
    },
  });

  // Helper types and functions for finding common student timeslots
  type Interval = { start: number; end: number };
  type Person = { timezone: string; timeManagementPlan?: Record<string, Interval[]> };

  function localIntervalToUtc(day: string, interval: Interval, tz: string) {
    const weekdays: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
    const baseDay = weekdays[day.toLowerCase()] ?? 1;
    const start = DateTime.fromObject(
      { year: 2024, month: 1, day: baseDay, hour: Math.floor(interval.start / 60), minute: interval.start % 60 },
      { zone: tz }
    ).toUTC();
    const end = DateTime.fromObject(
      { year: 2024, month: 1, day: baseDay, hour: Math.floor(interval.end / 60), minute: interval.end % 60 },
      { zone: tz }
    ).toUTC();
    return { start, end };
  }

  function intersectIntervals(lists: { start: DateTime; end: DateTime }[][]): { start: DateTime; end: DateTime }[] {
    if (!lists.length) return [];
    let result = lists[0];
    for (let i = 1; i < lists.length; i++) {
      const next: { start: DateTime; end: DateTime }[] = [];
      for (const a of result) {
        for (const b of lists[i]) {
          const start = a.start > b.start ? a.start : b.start;
          const end = a.end < b.end ? a.end : b.end;
          if (start < end) next.push({ start, end });
        }
      }
      result = next;
      if (!result.length) break;
    }
    return result;
  }

  function formatInterval(interval: { start: DateTime; end: DateTime }, tz: string) {
    return `${interval.start.setZone(tz).toFormat("h:mm a")} - ${interval.end.setZone(tz).toFormat("h:mm a")}`;
  }

  function findCommonTimeslots(students: Person[]): Record<string, Record<string, string[]>> {
    const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    const result: Record<string, Record<string, string[]>> = {};
    for (const day of days) {
      const intervalsUTCPerStudent = students.map(s =>
        (s.timeManagementPlan?.[day] ?? []).map(iv => localIntervalToUtc(day, iv, s.timezone))
      );
      const overlapUTC = intersectIntervals(intervalsUTCPerStudent);
      if (overlapUTC.length > 0) {
        result[day] = {};
        students.forEach(s => {
          result[day][s.timezone] = overlapUTC.map(iv => formatInterval(iv, s.timezone));
        });
      }
    }
    return result;
  }

  return projects.map((project: any) => {
    const studentsWithTimezone = project.students.filter((s: any) => s.timezone);
    const commonTimeslots = findCommonTimeslots(studentsWithTimezone);
    return {
      project,
      commonTimeslots: Object.keys(commonTimeslots).length ? commonTimeslots : undefined,
    };
  });
}
