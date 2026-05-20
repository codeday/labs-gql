import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { Context } from '../../context';
import {
  SlackEventWithProjects,
  SlackMentorInfo,
  SlackStudentInfo,
  slackEventInfoSelect,
} from "../../slack";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('activities:tasks:createStandup');

const STANDUP_API_BASE = 'https://api.standup-and-prosper.com/v1';
const EXCLUDED_SLACK_IDS = new Set(['U07ACCWHDSA']);

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
  const apiKey = process.env.STANDUP_API_KEY;
  if (!apiKey) throw new Error('STANDUP_API_KEY environment variable is not set');

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
    },
    select: slackEventInfoSelect,
  }) as SlackEventWithProjects<SlackMentorInfo & SlackStudentInfo>[];

  for (const event of events) {
    const teamId = event.slackWorkspaceId;

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
        .filter((s) => s.slackId && !EXCLUDED_SLACK_IDS.has(s.slackId))
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
        const res = await fetch(`${STANDUP_API_BASE}/teams/${teamId}/standups`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          DEBUG(`Failed for project ${project.id}: ${res.status} ${text}`);
        } else {
          const data = await res.json() as { id?: string };
          if (data.id) {
            await prisma.project.update({
              where: { id: project.id },
              data: { standupId: data.id },
            });
          }
          DEBUG(`Created standup for project ${project.id} in channel ${project.slackChannelId}`);
        }
      } catch (ex) {
        DEBUG(ex);
      }
    }
  }
}
