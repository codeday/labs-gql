import { MentorStatus, PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { DateTime } from 'luxon';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string | null> {
  return `studentSlackReminder`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const past = DateTime.now().minus({ days: 5 }).toJSDate();
  const farPast = DateTime.now().minus({ days: 10 }).toJSDate();
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.ACCEPTED,
      slackId: null,
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          mentors: { some: { status: MentorStatus.ACCEPTED } },
        },
      },
      event: { matchComplete: true, id: event.id },
      emailsSent: { some: { emailId: 'studentSlack', createdAt: { lt: past, gt: farPast } } },
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
