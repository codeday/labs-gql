import { PrismaClient, Event, Mentor } from "@prisma/client";
import Container from "typedi";
import {
  getSlackClientForEvent
} from "../../slack";
import { Context } from '../../context';
import { makeDebug, PickNonNullable } from "../../utils";

const DEBUG = makeDebug('activities:tasks:slackInviteChannels');

interface SlackInviteChannelsArgs {
  user: string
  partnerCode?: string
}

export const SCHEMA = {
  type: 'object',
  required: ['user'],
  properties: {
    user: {
      type: 'string',
      title: 'User ID'
    },
    partnerCode: {
      type: 'string',
      title: 'Partner Code (Optional)',
    },
  }
};

export default async function slackInviteChannels({ auth }: Context, args: Partial<SlackInviteChannelsArgs> | undefined): Promise<void> {
  if (!args || !args.user) throw new Error(`Must specify user in arguments.`);

  const prisma = Container.get(PrismaClient);
  const event = await prisma.event.findFirstOrThrow({
    where: {
      id: auth.eventId!,
      slackWorkspaceId: { not: null },
      slackWorkspaceAccessToken: { not: null },
    },
    rejectOnNotFound: true,
  }) as PickNonNullable<Event, 'slackWorkspaceId' | 'slackWorkspaceAccessToken' | 'slackMentorChannelId'>;

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
    try {
      await slack.conversations.invite({ channel: project.slackChannelId!, users: args.user });
    } catch (ex) { }
  }

  if (event.slackMentorChannelId && !args.partnerCode) {
    DEBUG(`Inviting ${args.user} to mentor channel (${event.slackMentorChannelId})`);
    await slack.conversations.invite({
      channel: event.slackMentorChannelId!,
      users: args.user,
    });
  }
}