import { PrismaClient } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { DateTime } from 'luxon';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string | null> {
  return `studentMatchPrefsReminder2`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const yesterday = DateTime.now().minus({ days: 1 }).toJSDate();
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.ACCEPTED,
      event: { matchComplete: false, matchPreferenceSubmissionOpen: true },
      projectPreferences: { none: {} },
      projects: { none: {} },
      emailsSent: { some: { emailId: 'studentMatchPrefsReminder', createdAt: { lt: yesterday } } },
      eventId: event.id,
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
