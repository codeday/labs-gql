import { PrismaClient, Event } from "@prisma/client";
import Container from "typedi";
import {
  getSlackClientForEvent
} from "../../slack";
import { Context } from '../../context';
import { makeDebug, PickNonNullable } from "../../utils";

const DEBUG = makeDebug('activities:tasks:slackCreateChannels');

interface SlackInviteChannelsArgs {
  user: string
  partnerCode?: string
}

export default async function slackInviteChannels({ auth }: Context, args: Partial<SlackInviteChannelsArgs> | undefined): Promise<void> {
  if (!args || !args.user) throw new Error(`Must specify user in arguments.`);
  
  const prisma = Container.get(PrismaClient);
  const event = await prisma.event.findFirst({
    where: {
      id: auth.eventId!,
      slackWorkspaceId: { not: null },
      slackWorkspaceAccessToken: { not: null },
    },
    rejectOnNotFound: true,
  }) as PickNonNullable<Event, 'slackWorkspaceId' | 'slackWorkspaceAccessToken'>;
  
  const projects = await prisma.project.findMany({
    where: {
      slackChannelId: { not: null },
      eventId: auth.eventId!,
      ...(args.partnerCode
          ? { students: { some: { partnerCode: { equals: args.partnerCode, mode: 'insensitive' } } } }
          : {}
        )
    },
    select: { slackChannelId: true },
  });
  
  const slack = getSlackClientForEvent(event);
  
  for (const project of projects) {
    DEBUG(`Inviting ${args.user} to ${project.slackChannelId}`);
    await slack.conversations.invite({ channel: project.slackChannelId!, users: args.user });
  } 
}