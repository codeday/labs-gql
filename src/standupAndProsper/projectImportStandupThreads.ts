import { Prisma, PrismaClient } from "@prisma/client";
import Container from "typedi";
import { getClientForEvent } from "./StandupAndProsper";
import { groupBy } from "../utils";
import { DateTime } from "luxon";
import { ProjectWithStandups } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('standupAndProsper:projectImportStandupThreads');

export async function projectImportStandupThreads(project: ProjectWithStandups) {
  const prisma = Container.get(PrismaClient);
  const sap = getClientForEvent(project.event);
  const [standup, threads] = await Promise.all([
    sap.getStandup(project.standupId),
    sap.getStandupThreads(project.standupId)
  ]);

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
          dueAt: DateTime.fromISO(`${t.scheduledDate}T${standup.time}`, { zone: standup.timezone }).toJSDate(),
          eventId: project.event.id,
          projectId: project.id,
          sentMissingReminderSlack: false,
          sentMissingReminderEmail: false,
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
    DEBUG(`Tracking ${allCreates.length} new standups for ${project.id}.`);
    await prisma.standupResult.createMany({ data: allCreates });
  }
}