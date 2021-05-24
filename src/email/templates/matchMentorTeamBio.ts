import { PrismaClient, ProjectStatus } from '@prisma/client';
import { flatten } from '../../utils';
import { MentorStatus } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string> {
  return `matchMentorTeamBio`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const mentors = await prisma.mentor.findMany({
    where: { status: MentorStatus.ACCEPTED },
    include: { projects: { where: { status: ProjectStatus.MATCHED }, include: { students: true } } },
  });
  return flatten(mentors.map((mentor) => mentor.projects.map((project): EmailContext => ({ project, mentor }))));
}
