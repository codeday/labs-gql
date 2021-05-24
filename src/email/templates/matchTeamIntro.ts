import { PrismaClient } from '@prisma/client';
import { ProjectStatus } from '../../enums';
import { EmailContext } from '../spec';

export async function getId(): Promise<string> {
  return `matchTeamIntro`;
}

export async function getList(prisma: PrismaClient): Promise<EmailContext[]> {
  const projects = await prisma.project.findMany({
    where: { status: ProjectStatus.MATCHED },
    include: { mentors: true, students: true },
  });
  return projects.map((project): EmailContext => ({ project }));
}
