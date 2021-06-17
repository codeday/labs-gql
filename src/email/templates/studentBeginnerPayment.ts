import { PrismaClient } from '@prisma/client';
import { StudentStatus, Track } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string | null> {
  return `studentBeginnerPayment`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.ACCEPTED,
      track: Track.BEGINNER,
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
