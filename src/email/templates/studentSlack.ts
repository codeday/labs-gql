import { MentorStatus, PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { DateTime } from 'luxon';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string | null> {
  return `studentSlack`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const past = DateTime.now().minus({ days: 2 }).toJSDate();
  const farPast = DateTime.now().minus({ days: 10 }).toJSDate();
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.ACCEPTED,
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          mentors: { some: { status: MentorStatus.ACCEPTED } },
          emailsSent: { some: { emailId: 'matchTeamIntro', createdAt: { lt: past, gt: farPast } } },
        },
      },
      event: { matchComplete: true, id: event.id },
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
