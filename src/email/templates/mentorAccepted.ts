import { PrismaClient } from '@prisma/client';
import { MentorStatus } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string> {
  return `mentorAccepted`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const mentors = await prisma.mentor.findMany({
    where: { status: MentorStatus.ACCEPTED },
  });
  return mentors.map((mentor): EmailContext => ({
    mentor,
  }));
}
