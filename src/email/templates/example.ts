import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { EmailContext } from '../spec';

export async function getId(): Promise<string> {
  return `test-${DateTime.local().toFormat('yyyy')}`; // We want to send this one once a calendar year.
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  const allMentors = await prisma.mentor.findMany({ include: { projects: true } });
  return [];
  /*
    return allMentors.map((mentor): EmailContext => ({
      mentor,
    }));
  */
}
