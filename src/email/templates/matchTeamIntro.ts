import { MentorStatus, StudentStatus, PrismaClient } from '@prisma/client';
import { ProjectStatus } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string> {
  return `matchTeamIntro`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const projects = await prisma.project.findMany({
    where: {
      status: ProjectStatus.MATCHED,
      mentors: { some: { status: MentorStatus.ACCEPTED } },
      students: { some: { status: StudentStatus.ACCEPTED } },
    },
    include: {
      mentors: { where: { status: MentorStatus.ACCEPTED } },
      students: { where: { status: StudentStatus.ACCEPTED } },
    },
  });
  return projects.map((project): EmailContext => ({ project }));
}
