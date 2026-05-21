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
  type: "SLACK",
  days: ["Monday", "Wednesday", "Friday"],
  time: "10:00:00",
  reportTime: "12:00:00",
  timezone: "America/Los_Angeles",
  schedule: { type: "WEEKLY" },
  questions: [
    { text: "What did you do since last standup?" },
    { text: "What will you do until next standup?" },
    { text: "Is anything blocking you?" },
  ],
  groupBy: "USER_SINGLE_MESSAGE",
  reportSortOrder: "DISPLAY_NAME",
  allowEditsAfterCompletion: true,
  asThread: false,
  syncWithChannel: false,
  hideAnnouncements: false,
};

export default async function createStandup({ auth }: Context): Promise<void> {
  const prisma = Container.get(PrismaClient);

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

  const client = getClientForEvent(event);
  const slack = getSlackClientForEvent(event);

  for (const project of event.projects) {
    try {
      await slack.conversations.invite({
        channel: project.slackChannelId!,
        users: STANDUP_USER,
      });
    } catch (ex) {}

    DEBUG(project.students);
    const users = project.students
      .filter((s) => s.slackId)
      .map((s) => ({ userId: s.slackId! }));

    if (users.length === 0) {
      DEBUG(`Skipping project ${project.id} — no eligible student Slack IDs`);
      continue;
    }

    try {
      const result = await client.createStandup({
        ...DEFAULT_STANDUP,
        channel: project.slackChannelId,
        channelId: project.slackChannelId,
        users,
      });
      if (result.standupId) {
        await prisma.project.update({
          where: { id: project.id },
          data: { standupId: result.standupId },
        });
      }
      DEBUG(
        `Created standup for project ${project.id} in channel ${project.slackChannelId}`,
      );
    } catch (ex) {
      DEBUG(ex);
    }
  }
}
