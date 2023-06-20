import { PrismaClient } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { DateTime } from 'luxon';

export async function getId(): Promise<string | null> {
  return `studentMatchPrefsReminder`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const yesterday = DateTime.now().minus({ days: 1 }).toJSDate();
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.ACCEPTED,
      event: { matchComplete: false, matchPreferenceSubmissionOpen: true },
      projectPreferences: { none: {} },
      projects: { none: {} },
      emailsSent: { some: { emailId: 'studentMatchPrefs', createdAt: { lt: yesterday } } },
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
