import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { Context } from '../../context';
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

const DEBUG = makeDebug('activities:tasks:slackArchive');

export default async function slackArchive({ auth }: Context): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const activeEvents = await prisma.event.findMany({
      where: {
        id: auth.eventId,
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