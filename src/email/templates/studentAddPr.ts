import { MentorStatus, PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';
import { DateTime } from 'luxon';

export const ALLOW_INACTIVE = true;

export async function getId(): Promise<string | null> {
  return `studentAddPr`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  console.log('STUDENT ADD PR')
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.ACCEPTED,
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          mentors: { some: { status: MentorStatus.ACCEPTED } },
          OR: [
            { prUrl: null },
            { prUrl: '' },
          ],
        },
      },
      event: { matchComplete: true, id: event.id, startsAt: { lte: DateTime.local().minus({ days: 30 }).toJSDate() } },
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
