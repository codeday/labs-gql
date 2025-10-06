import { MentorStatus, StudentStatus, PrismaClient } from '@prisma/client';
import { ProjectStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';

export async function getId(): Promise<string> {
  return `matchTeamIntro`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const projects = await prisma.project.findMany({
    where: {
      eventId: event.id,
      status: ProjectStatus.MATCHED,
      mentors: { some: { status: MentorStatus.ACCEPTED } },
      students: { some: { status: StudentStatus.ACCEPTED } },
      event: { matchComplete: true },
    },
    include: {
      mentors: { where: { status: MentorStatus.ACCEPTED } },
      students: { where: { status: StudentStatus.ACCEPTED } },
    },
  });
  return projects.map((project): EmailContext => ({ project }));
}
