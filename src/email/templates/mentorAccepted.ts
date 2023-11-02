import { PrismaClient } from '@prisma/client';
import { MentorStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string> {
  return `mentorAccepted`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const mentors = await prisma.mentor.findMany({
    where: { status: MentorStatus.ACCEPTED, eventId: event.id },
  });
  return mentors.map((mentor): EmailContext => ({
    mentor,
  }));
}
