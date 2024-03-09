import { MentorStatus, PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { DateTime } from 'luxon';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string | null> {
  return `mentorScheduleReminder`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const past = DateTime.now().minus({ days: 3 }).toJSDate();
  const farPast = DateTime.now().minus({ days: 10 }).toJSDate();
  const mentors = await prisma.mentor.findMany({
    where: {
      status: MentorStatus.ACCEPTED,
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          students: { some: { status: StudentStatus.ACCEPTED } },
        },
      },
      event: { matchComplete: true, id: event.id },
      emailsSent: { some: { emailId: 'matchMentorTeamBio', createdAt: { lt: past, gt: farPast } } },
    },
  });
  return mentors.map((mentor): EmailContext => ({
    mentor,
  }));
}
