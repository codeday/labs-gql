import { MentorStatus, PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';
import { DateTime } from 'luxon';

export const ALLOW_INACTIVE = true;

export async function getId(): Promise<string | null> {
  return `mentorResume`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const mentors = await prisma.mentor.findMany({
    where: {
      status: MentorStatus.ACCEPTED,
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          students: { some: { status: MentorStatus.ACCEPTED } },
        },
      },
      event: { matchComplete: true, id: event.id, startsAt: { lte: DateTime.local().minus({ days: 21 }).toJSDate() } },
    },
    include: {
      event: { select: { startsAt: true } },
      projects: {
        select: { students: { select: { weeks: true } } },
      },
    },
  });

  return mentors
    .filter((mentor) => {
      const weeksSinceStart = DateTime
        .fromJSDate(mentor.event.startsAt)
        .diffNow('weeks')
        .weeks;
      return Math.floor(weeksSinceStart) >= Math.max(...mentor.projects.flatMap(p => p.students).map(s => s.weeks));
    })
    .map((mentor): EmailContext => ({
      mentor,
    }));
}
