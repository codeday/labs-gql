import { PrismaClient, ProjectStatus } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { DateTime } from 'luxon';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string | null> {
  return `studentOnboardingDue`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.ACCEPTED,
      eventId: event.id,
      event: {
        matchComplete: true,
        startsAt: {
          lte: DateTime.local().minus({ days: 3 }).toJSDate(),
          gte: DateTime.local().minus({ weeks: 4 }).toJSDate(),
        },
      },
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          tags: {
            some: { trainingLink: { not: null } },
          },
        },
      },
      trainingEntryResponses: { none: {} },
    },
    include: {
      projects: {
        where: {
          status: ProjectStatus.MATCHED,
          tags: {
            some: { trainingLink: { not: null } },
          },
        },
        select: {
          tags: { where: { trainingLink: { not: null } } },
        },
      },
      tagTrainingSubmissions: true,
    },
  });

  const studentsWithMissing = students.filter((student) => {
    const submittedTags = student.tagTrainingSubmissions.map((t) => t.id);
    const dueTags = student
      .projects
      .flatMap((p) => p.tags)
      .filter((t) => !submittedTags.includes(t.id));
    return dueTags.length > 0;
  });

  return studentsWithMissing.map((student): EmailContext => ({
    student,
  }));
}
