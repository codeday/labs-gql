import { PrismaClient } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string | null> {
  return `studentInterview`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.TRACK_INTERVIEW,
      eventId: event.id,
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
