import { PrismaClient } from '@prisma/client';
import { MentorStatus } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string> {
  return `mentorOnboard`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const mentors = await prisma.mentor.findMany({
    where: { status: MentorStatus.APPLIED },
  });
  return mentors.map((mentor): EmailContext => ({
    mentor,
  }));
}
