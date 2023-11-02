import { PrismaClient, ProjectStatus, StudentStatus } from '@prisma/client';
import { flatten } from '../../utils';
import { MentorStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string> {
  return `matchMentorTeamBio`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const mentors = await prisma.mentor.findMany({
    where: {
      status: MentorStatus.ACCEPTED,
      eventId: event.id,
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          students: { some: { status: StudentStatus.ACCEPTED } },
        },
      },
      event: { matchComplete: true },
    },
    include: {
      projects: {
        where: {
          status: ProjectStatus.MATCHED,
          students: { some: { status: StudentStatus.ACCEPTED } },
        },
        include: { students: { where: { status: StudentStatus.ACCEPTED } } },
      },
    },
  });
  return flatten(mentors.map((mentor) => mentor.projects.map((project): EmailContext => ({ project, mentor }))));
}
