import { PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { DateTime } from 'luxon';

export async function getId(): Promise<string | null> {
  return `studentOnboardingNoneReminder`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const yesterday = DateTime.now().minus({ days: 1 }).toJSDate();
  const students = await prisma.student.findMany({
    where: {
      emailsSent: { some: { emailId: 'studentOnboardingDue', createdAt: { lt: yesterday } } },
      status: StudentStatus.ACCEPTED,
      event: {
        matchComplete: true,
        startsAt: {
          lte: DateTime.local().minus({ days: 3 }).toJSDate(),
          gte: DateTime.local().minus({ weeks: 4 }).toJSDate(),
        },
      },
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          tags: {
            some: { trainingLink: { not: null } },
          },
        },
      },
      tagTrainingSubmissions: { none: {} },
    },
  });

  return students.map((student): EmailContext => ({
    student,
  }));
}
