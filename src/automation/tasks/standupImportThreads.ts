import { MentorStatus, PrismaClient, ProjectStatus, StudentStatus } from "@prisma/client";
import Container from "typedi";
import { projectImportStandupThreads } from "../../standupAndProsper";
import { ProjectWithStandups } from "../../standupAndProsper/types";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks:standupImportThreads');

export const JOBSPEC = '5 * * * *';

export default async function standupImportThreads() {
  const prisma = Container.get(PrismaClient);

  const activeProjectsWithStandups = await prisma.project.findMany({
    where: {
      status: ProjectStatus.MATCHED,
      event: {
        isActive: true,
        standupAndProsperToken: { not: null },
        slackWorkspaceId: { not: null },
      },
      standupId: { not: null },
      students: { some: { slackId: { not: null }, status: StudentStatus.ACCEPTED } },
      mentors: { some: { status: MentorStatus.ACCEPTED } },
    },
    select: {
      id: true,
      event: {
        select: { id: true, standupAndProsperToken: true, slackWorkspaceId: true },
      },
      standupId: true,
      standupThreads: {
        select: { id: true },
      },
      standupResults: {
        select: { threadId: true, studentId: true }
      },
      students: {
        where: { slackId: { not: null }, status: StudentStatus.ACCEPTED },
        select: {
          id: true,
          slackId: true,
        },
      },
    }
  }) as ProjectWithStandups[];

  DEBUG(`Checking for standup updates in ${activeProjectsWithStandups.length} projects.`);
  for (const project of activeProjectsWithStandups) {
    try {
      await projectImportStandupThreads(project);
      // Pause so we don't hit the ratelimit
      await new Promise(r => setTimeout(r, 2000));
    } catch (ex) {
      DEBUG(ex);
    }
  }
}