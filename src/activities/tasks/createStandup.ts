import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { Context } from '../../context';
import {
  SlackEventWithProjects,
  SlackMentorInfo,
  SlackStudentInfo,
  slackEventInfoSelect,
} from "../../slack";
import { EventWithStandupAndProsper, getClientForEvent } from "../../standupAndProsper/StandupAndProsper";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('activities:tasks:createStandup');

const DEFAULT_STANDUP = {
  type: 'SLACK',
  days: ['Monday', 'Wednesday', 'Friday'],
  time: '10:00:00',
  reportTime: '12:00:00',
  timezone: 'America/Los_Angeles',
  schedule: { type: 'WEEKLY' },
  questions: [
    { text: 'What did you do since last standup?' },
    { text: 'What will you do until next standup?' },
    { text: 'Is anything blocking you?' },
  ],
  groupBy: 'USER_SINGLE_MESSAGE',
  reportSortOrder: 'DISPLAY_NAME',
  allowEditsAfterCompletion: true,
  asThread: false,
  syncWithChannel: false,
  hideAnnouncements: false,
};

export default async function createStandup({ auth }: Context): Promise<void> {
  const prisma = Container.get(PrismaClient);

  const existing = await prisma.project.findMany({
    where: { event: { id: auth.eventId }, standupId: { not: null } },
    select: { id: true },
  });
  const existingStandupIds = new Set(existing.map((p: { id: string }) => p.id));

  const events = await prisma.event.findMany({
    where: {
      id: auth.eventId,
      slackWorkspaceAccessToken: { not: null },
      slackWorkspaceId: { not: null },
      standupAndProsperToken: { not: null },
    },
    select: { ...slackEventInfoSelect, standupAndProsperToken: true },
  }) as (SlackEventWithProjects<SlackMentorInfo & SlackStudentInfo> & EventWithStandupAndProsper)[];

  for (const event of events) {
    const client = getClientForEvent(event);

    for (const project of event.projects) {
      if (existingStandupIds.has(project.id)) {
        DEBUG(`Skipping project ${project.id} — standup already exists`);
        continue;
      }

      if (!project.slackChannelId) {
        DEBUG(`Skipping project ${project.id} — no Slack channel`);
        continue;
      }

      const users = project.students
        .filter((s) => s.slackId)
        .map((s) => ({ userId: s.slackId! }));

      if (users.length === 0) {
        DEBUG(`Skipping project ${project.id} — no eligible student Slack IDs`);
        continue;
      }

      const body = {
        ...DEFAULT_STANDUP,
        channel: project.slackChannelId,
        channelId: project.slackChannelId,
        users,
      };

      try {
        const result = await client.createStandup(body);
        if (result.standupId) {
          await prisma.project.update({
            where: { id: project.id },
            data: { standupId: result.standupId },
          });
        }
        DEBUG(`Created standup for project ${project.id} in channel ${project.slackChannelId}`);
      } catch (ex) {
        DEBUG(ex);
      }
    }
  }
}
