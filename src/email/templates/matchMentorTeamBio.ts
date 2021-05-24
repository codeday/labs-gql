import { PrismaClient, ProjectStatus, StudentStatus } from '@prisma/client';
import { flatten } from '../../utils';
import { MentorStatus } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string> {
  return `matchMentorTeamBio`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const mentors = await prisma.mentor.findMany({
    where: {
      status: MentorStatus.ACCEPTED,
      projects: {
        some: {
          status: ProjectStatus.MATCHED,
          students: { some: { status: StudentStatus.ACCEPTED } },
        },
      },
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
