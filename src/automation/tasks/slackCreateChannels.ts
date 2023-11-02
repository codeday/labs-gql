import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import {
  SlackEventWithProjects,
  SlackMentorInfo,
  SlackStudentInfo,
  createSlackChannels,
  slackEventInfoSelect,
} from "../../slack";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks:slackCreateChannels');

export default async function slackCreateChannels(): Promise<void> {
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
    DEBUG(`Creating Slack for ${event.id}.`);
    try {
      await createSlackChannels(event);
    } catch (ex) {
      DEBUG(ex);
    }
  }
}