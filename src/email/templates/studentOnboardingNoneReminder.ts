import { PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { DateTime } from 'luxon';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string | null> {
  return `studentOnboardingNoneReminder`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const yesterday = DateTime.now().minus({ days: 1 }).toJSDate();
  const students = await prisma.student.findMany({
    where: {
      emailsSent: { some: { emailId: 'studentOnboardingDue', createdAt: { lt: yesterday } } },
      status: StudentStatus.ACCEPTED,
      eventId: event.id,
      event: {
        matchComplete: true,
        startsAt: {
          lte: DateTime.local().minus({ days: 3 }).toJSDate(),
          gte: DateTime.local().minus({ weeks: 4 }).toJSDate(),
        },
      },
      tagTrainingSubmissions: { none: {} },
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          tags: {
            some: { trainingLink: { not: null } },
          },
        },
      },
    },
  });

  return students.map((student): EmailContext => ({
    student,
  }));
}
