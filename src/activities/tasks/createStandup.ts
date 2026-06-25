import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { Context } from "../../context";
import {
  SlackEventWithProjects,
  SlackMentorInfo,
  SlackStudentInfo,
  getSlackClientForEvent,
  slackEventInfoSelect,
} from "../../slack";
import {
  EventWithStandupAndProsper,
  getClientForEvent,
} from "../../standupAndProsper/StandupAndProsper";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug("activities:tasks:createStandup");
const STANDUP_USER = "U026ZCTG0CB";

const DEFAULT_STANDUP = {
  admins: ["U024H3101", "U07ACCWHDSA"],
  days: ["Monday", "Wednesday", "Friday"],
  time: "20:00:00",
  reminders: [{ time: "10:00:00" }, { time: "18:00:00" }],
  timezone: "America/Los_Angeles",
  schedule: { type: "WEEKLY" },
  questions: [
    { text: "What did you do since last standup?" },
    { text: "What will you do until next standup?" },
    { text: "Is anything blocking you?" },
  ],
  groupBy: "USER_SINGLE_MESSAGE",
  reportSortOrder: "DISPLAY_NAME",
  allowEditsAfterCompletion: "EXTENDED",
  asThread: false,
  syncWithChannel: false,
  hideAnnouncements: true,
};

export default async function createStandup({ auth }: Context): Promise<void> {
  const prisma = Container.get(PrismaClient);

  DEBUG(`Starting createStandup for event ${auth.eventId}`);

  const event = (await prisma.event.findFirst({
    rejectOnNotFound: true,
    where: {
      id: auth.eventId,
      slackWorkspaceAccessToken: { not: null },
      slackWorkspaceId: { not: null },
      standupAndProsperToken: { not: null },
    },
    select: {
      ...slackEventInfoSelect,
      projects: {
        ...slackEventInfoSelect.projects,
        where: {
          ...slackEventInfoSelect.projects.where,
          standupId: null,
          slackChannelId: { not: null },
          students: {
            some: {
              slackId: { not: null },
            },
          },
        },
      },
      standupAndProsperToken: true,
    },
  })) as SlackEventWithProjects<SlackMentorInfo & SlackStudentInfo> &
    EventWithStandupAndProsper;

  DEBUG(
    `Loaded event ${auth.eventId} (slackWorkspaceId=${event.slackWorkspaceId}); found ${event.projects.length} candidate project(s) without a standup`,
  );

  if (event.projects.length === 0) {
    DEBUG(
      `No projects matched the filter (standupId=null, slackChannelId set, has student with slackId) for event ${auth.eventId} — nothing to do`,
    );
    return;
  }

  const client = getClientForEvent(event);
  const slack = getSlackClientForEvent(event);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const project of event.projects) {
    DEBUG(
      `Processing project ${project.id} (channel=${project.slackChannelId}, students=${project.students.length})`,
    );

    try {
      const inviteResult = await slack.conversations.invite({
        channel: project.slackChannelId!,
        users: STANDUP_USER,
      });
      DEBUG(
        `Invited standup bot ${STANDUP_USER} into channel ${project.slackChannelId} for project ${project.id} (ok=${inviteResult.ok})`,
      );
    } catch (ex) {
      DEBUG(
        `Slack invite of ${STANDUP_USER} into ${project.slackChannelId} for project ${project.id} failed (continuing — bot may already be present): %O`,
        ex,
      );
    }

    DEBUG(`Project ${project.id} students: %O`, project.students);
    const users = project.students
      .filter((s) => s.slackId)
      .map((s) => ({ userId: s.slackId! }));

    DEBUG(
      `Project ${project.id}: ${users.length}/${project.students.length} students have a slackId`,
    );

    if (users.length === 0) {
      DEBUG(`Skipping project ${project.id} — no eligible student Slack IDs`);
      skipped += 1;
      continue;
    }

    const payload = {
      ...DEFAULT_STANDUP,
      channel: project.slackChannelId,
      channelId: project.slackChannelId,
      users,
    };

    try {
      DEBUG(
        `Calling StandupAndProsper.createStandup for project ${project.id} with payload: %O`,
        payload,
      );
      const result = await client.createStandup(payload);
      DEBUG(
        `StandupAndProsper.createStandup response for project ${project.id}: %O`,
        result,
      );

      if (result.standupId) {
        await prisma.project.update({
          where: { id: project.id },
          data: { standupId: result.standupId },
        });
        DEBUG(
          `Created standup ${result.standupId} for project ${project.id} in channel ${project.slackChannelId}`,
        );
        created += 1;
      } else {
        DEBUG(
          `StandupAndProsper.createStandup returned no standupId for project ${project.id} — not persisting. Full response: %O`,
          result,
        );
        failed += 1;
      }
    } catch (ex) {
      DEBUG(
        `Exception creating standup for project ${project.id} in channel ${project.slackChannelId}: %O`,
        ex,
      );
      failed += 1;
    }
  }

  DEBUG(
    `createStandup finished for event ${auth.eventId}: created=${created}, skipped=${skipped}, failed=${failed}`,
  );
}
