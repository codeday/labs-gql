import { MentorStatus, PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { DateTime } from 'luxon';
import { PartialEvent } from '../loader';

export const ALLOW_INACTIVE = true;

export async function getId(): Promise<string | null> {
  return `studentPin`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.ACCEPTED,
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          mentors: { some: { status: MentorStatus.ACCEPTED } },
          AND: [
            { prUrl: { not: null } },
            { prUrl: { not: '' } },
          ],
        },
      },
      event: { matchComplete: true, id: event.id },
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
