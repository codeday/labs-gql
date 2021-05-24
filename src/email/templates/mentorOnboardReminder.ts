import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { MentorStatus } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string | null> {
  return `mentorOnboardReminder-${DateTime.local().toFormat('WW-yyyy')}`; // Once per week
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const mentors = await prisma.mentor.findMany({
    where: {
      status: MentorStatus.APPLIED,
      createdAt: { // Send one reminder a week after the first week, but don't send to mentors for more than 3 weeks.
        lte: DateTime.local().minus({ week: 1 }).toJSDate(),
        gte: DateTime.local().minus({ week: 3, days: 1 }).toJSDate(),
      },
    },
  });
  return mentors.map((mentor): EmailContext => ({
    mentor,
  }));
}
