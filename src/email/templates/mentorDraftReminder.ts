import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { ProjectStatus } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string | null> {
  return `mentorDraftReminder`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const mentors = await prisma.mentor.findMany({
    where: {
      projects: {
        some: {
          status: ProjectStatus.DRAFT,
          updatedAt: { lte: DateTime.local().minus({ days: 2 }).toJSDate() },
        },
      },
    },
  });
  return mentors.map((mentor): EmailContext => ({
    mentor,
  }));
}
