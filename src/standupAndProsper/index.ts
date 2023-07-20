import Container from "typedi";
import { EventWithStandupAndProsper, getClientForEvent } from "./StandupAndProsper";
import { Event, MentorStatus, Prisma, PrismaClient, Project, ProjectStatus, StandupResult, StandupThread, Student, StudentStatus } from "@prisma/client";
import { PickNonNullable, groupBy } from "../utils";
import { DateTime } from "luxon";

type ProjectWithStandups = PickNonNullable<Project, 'standupId' | 'id'>
  & {
    students: PickNonNullable<Student, 'slackId' | 'id'>[],
    standupThreads: PickNonNullable<StandupThread, 'id'>[],
    standupResults: PickNonNullable<StandupResult, 'threadId' | 'studentId'>[],
    event: EventWithStandupAndProsper & Pick<Event, 'id'>,
  };

type EventWithProjectChannel = EventWithStandupAndProsper
  & { projects: PickNonNullable<Project, 'id' | 'slackChannelId'>[] };

async function syncStandups(event: EventWithProjectChannel) {
  const prisma = Container.get(PrismaClient);
  const sap = getClientForEvent(event);
  const standups = await sap.getStandups();

  const slackChannelsToUpdate = Object.fromEntries(
    event.projects
      .map(p => [p.slackChannelId, p.id])
  );

  console.log(`Searching for standups for ${slackChannelsToUpdate.length} channels.`);

  for (const { channel, standupId } of standups) {
    if (channel in slackChannelsToUpdate) {
      console.log(`Found standup for project ${slackChannelsToUpdate[channel]!}.`);
      await prisma.project.update({
        where: { id: slackChannelsToUpdate[channel]! },
        data: { standupId },
      });
    }
  }
}

async function syncProjectStandup(project: ProjectWithStandups) {
  const prisma = Container.get(PrismaClient);
  const sap = getClientForEvent(project.event);
  const threads = await sap.getStandupThreads(project.standupId);

  const previousDbThreads = project.standupThreads.map(t => t.id);

  const studentIdsBySlackId = Object.fromEntries(
    project.students
      .map(s => [s.slackId, s.id])
  );

  const previousSubmissionThreadIds = Object.fromEntries(
    Object.entries(
      groupBy(
        project.standupResults,
        r => r.studentId
      )
    )
    .map(([k, v]) => [k, v.map(r => r.threadId)])
  );

  await prisma.standupThread.createMany({
    data: threads
        .filter(t => !previousDbThreads.includes(t.threadId))
        .map(t => ({
          id: t.threadId,
          dueAt: DateTime.fromISO(t.scheduledDate).toJSDate(),
          eventId: project.event.id,
          projectId: project.id,
        })),
    });

  const allCreates = [];
  for (const thread of threads) {
    // Create responses
    const responses = await thread.responses
      .flatMap(({ users, ...r }) => users
        .map(u => ({ ...r, ...u }))
      );
    const creates: Prisma.StandupResultCreateManyInput[] = Object.values(
      groupBy(responses, r => r.userId))
        .flatMap(responses => ({
          ...responses[0],
          text: responses.map(r => `${r.question.text}\n${r.text}`).join(`\n\n`),
        }))
        .filter(r => (
          (r.userId in studentIdsBySlackId)
          && !(previousSubmissionThreadIds[studentIdsBySlackId[r.userId]] || []).includes(thread.threadId)
        ))
        .map(r => ({
          threadId: thread.threadId,
          text: r.text,
          eventId: project.event.id,
          projectId: project.id,
          studentId: studentIdsBySlackId[r.userId]
        })
    );

    allCreates.push(...creates);
  }

  if (allCreates.length > 0) {
    console.log(`Tracking ${allCreates.length} new standups for ${project.id}.`);
    await prisma.standupResult.createMany({ data: allCreates });
  }
}

export async function syncStandupAndProsperStandups() {
  const prisma = Container.get(PrismaClient);

  const eventProjects = await prisma.event.findMany({
    where: {
      standupAndProsperToken: { not: null },
      slackWorkspaceId: { not: null },
      isActive: true,
    },
    select: {
      standupAndProsperToken: true,
      slackWorkspaceId: true,
      projects: {
        where: { slackChannelId: { not: null }, standupId: null },
        select: {
          id: true,
          slackChannelId: true,
          standupId: true,
        },
      }
    },
  }) as EventWithProjectChannel[];

  for (const event of eventProjects) {
    try {
      await syncStandups(event);
    } catch (ex) {
      console.error(ex);
    }
  }
}

export async function syncStandupAndProsper() {
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
        select: { standupAndProsperToken: true, slackWorkspaceId: true },
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

  for (const project of activeProjectsWithStandups) {
    try {
      await syncProjectStandup(project);
      await new Promise(r => setTimeout(r, 2000));
    } catch (ex) {
      console.error(ex);
    }
  }
}