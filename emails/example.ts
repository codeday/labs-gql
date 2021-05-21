import { PrismaClient } from '@prisma/client';
import { ScheduledEmail } from './spec';

export async function getList(prisma: PrismaClient): Promise<ScheduledEmail[]> {
  const allMentors = await prisma.mentor.findMany({ include: { projects: true } });
  const allEmails = allMentors.map((mentor): ScheduledEmail => ({
    to: mentor,
  }));
  return [];
}
