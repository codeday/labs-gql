import { PrismaClient } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string | null> {
  return `studentOffer`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.OFFERED,
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
