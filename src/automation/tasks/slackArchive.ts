import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import {
  SlackEventWithProjects,
  SlackMentorInfo,
  SlackStudentInfo,
  archiveSlackChannels,
  linkExistingSlackChannels,
  linkExistingSlackMembers,
  slackEventInfoSelect,
  updateSlackUserGroups
} from "../../slack";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks:slackArchive');

export default async function slackArchive(): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const activeEvents = await prisma.event.findMany({
      where: {
        isActive: true,
        slackWorkspaceAccessToken: { not: null },
        slackWorkspaceId: { not: null },
      },
      select: slackEventInfoSelect,
    }) as SlackEventWithProjects<SlackMentorInfo & SlackStudentInfo>[];

  for (const event of activeEvents) {
    DEBUG(`Archiving Slack for ${event.id}.`);
    try {
      await archiveSlackChannels(event);
    } catch (ex) {
      DEBUG(ex);
    }
  }
}