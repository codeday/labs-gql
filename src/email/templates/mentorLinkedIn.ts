import { MentorStatus, PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';
import { DateTime } from 'luxon';

export const ALLOW_INACTIVE = true;

export async function getId(): Promise<string | null> {
  return `mentorLinkedIn`;
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
      event: { matchComplete: true, id: event.id, startsAt: { lte: DateTime.local().minus({ days: 15 }).toJSDate() } },
    },
  });

  return mentors
    .map((mentor): EmailContext => ({
      mentor,
    }));
}
