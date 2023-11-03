import { PrismaClient, Event } from "@prisma/client";
import Container from "typedi";
import {
  getSlackClientForEvent
} from "../../slack";
import { Context } from '../../context';
import { makeDebug, PickNonNullable } from "../../utils";

const DEBUG = makeDebug('activities:tasks:slackCreateChannels');

interface SlackSendEmailResponseReminderArgs {
  channel: string
  intro: string
  emailId?: string
  partnerCode?: string
}

export default async function slackInviteChannels({ auth }: Context, args: Partial<SlackSendEmailResponseReminderArgs> | undefined): Promise<void> {
  if (!args || !args.channel) throw new Error(`Must specify channel in arguments.`);
  if (!args || !args.intro) throw new Error(`Must specify intro message in arguments.`);
  
  const prisma = Container.get(PrismaClient);
  const event = await prisma.event.findFirst({
    where: {
      id: auth.eventId!,
      slackWorkspaceId: { not: null },
      slackWorkspaceAccessToken: { not: null },
    },
    rejectOnNotFound: true,
  }) as PickNonNullable<Event, 'slackWorkspaceId' | 'slackWorkspaceAccessToken'>;

  const students = await prisma.student.findMany({
    where: {
      eventId: auth.eventId!,
      projectEmails: args.emailId
        ? { none: { emailSent: { emailId: args.emailId } } }
        : { none: {} },
      slackId: { not: null },
      ...(args.partnerCode
          ? { students: { some: { partnerCode: { equals: args.partnerCode, mode: 'insensitive' } } } }
          : {}
        )
    },
    select: { slackId: true }
  });
  
  const slack = getSlackClientForEvent(event);

  DEBUG(`Reminding ${students.length} students about ${args.emailId} email responses in ${args.channel}.`);
  if (students.length > 0) {
    await slack.chat.postMessage({
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${args.intro}\n` + students.map(s => `- <@${s.slackId}>`).join(`\n`),
        }
      }],
      channel: args.channel,
    });
  }
}