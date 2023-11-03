import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import {
  SlackEventWithProjects,
  SlackMentorInfo,
  SlackStudentInfo,
  createSlackChannels,
  slackEventInfoSelect,
} from "../../slack";
import { Context } from '../../context';
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('activities:tasks:slackCreateChannels');

export default async function slackCreateChannels({ auth }: Context): Promise<void> {
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
    DEBUG(`Creating Slack for ${event.id}.`);
    try {
      await createSlackChannels(event);
    } catch (ex) {
      DEBUG(ex);
    }
  }
}