import { MentorStatus, PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';
import { DateTime } from 'luxon';

export const ALLOW_INACTIVE = true;

export async function getId(): Promise<string | null> {
  return `studentTAPostEvent`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.ACCEPTED,
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          mentors: { some: { status: MentorStatus.ACCEPTED } },
        },
      },
      event: { matchComplete: true, id: event.id, startsAt: { lte: DateTime.local().minus({ days: 30 }).toJSDate() } },
    },
    include: { event: { select: { startsAt: true } } },
  });

  return students
    .filter((student) => {
      const weeksSinceStart = DateTime
        .fromJSDate(student.event.startsAt)
        .diffNow('weeks')
        .weeks;
      return Math.floor(weeksSinceStart) >= (student.weeks + 1);
    })
    .map((student): EmailContext => ({
      student,
    }));
}
