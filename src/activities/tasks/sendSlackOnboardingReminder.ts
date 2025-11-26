import { PrismaClient, Event } from "@prisma/client";
import Container from "typedi";
import {
  getSlackClientForEvent
} from "../../slack";
import { Context } from '../../context';
import { makeDebug, PickNonNullable } from "../../utils";

const DEBUG = makeDebug('activities:tasks:slackSendOnboardingReminder');

interface SlackSendOnboardingReminderArgs {
  channel: string
  intro: string
  min: number | string
  partnerCode?: string
}

export const SCHEMA = {
  type: 'object',
  required: ['channel', 'intro', 'min'],
  properties: {
    channel: {
      type: 'string',
      title: 'Channel ID',
    },
    intro: {
      type: 'string',
      title: 'Message Intro',
    },
    min: {
      type: 'number',
      title: 'Minimum Number Expected',
    },
    partnerCode: {
      type: 'string',
      title: 'Partner Code (Optional)',
    },
  },
};

export default async function slackSendOnboardingReminder({ auth }: Context, args: Partial<SlackSendOnboardingReminderArgs> | undefined): Promise<void> {
  if (!args || !args.channel) throw new Error(`Must specify channel in arguments.`);
  if (!args || !args.intro) throw new Error(`Must specify intro message in arguments.`);
  if (!args || !args.min) throw new Error(`Must specify minimum number of onboarding assignments in arguments.`);

  if (typeof args.min === 'string') args.min = Number.parseInt(args.min);

  const prisma = Container.get(PrismaClient);
  const event = await prisma.event.findFirstOrThrow({
    where: {
      id: auth.eventId!,
      slackWorkspaceId: { not: null },
      slackWorkspaceAccessToken: { not: null },
    },
  }) as PickNonNullable<Event, 'slackWorkspaceId' | 'slackWorkspaceAccessToken' | 'name'>;

const students = await prisma.student.findMany({
  where: {
    eventId: auth.eventId!,
    slackId: { not: null },
    ...(args.partnerCode
      ? { students: { some: { partnerCode: { equals: args.partnerCode, mode: 'insensitive' } } } }
      : {}
    )
  },
  select: { slackId: true, tagTrainingSubmissions: { select: { id: true } } }
});
const filteredStudents = students.filter(s => !s.tagTrainingSubmissions || s.tagTrainingSubmissions.length < (args.min! as number));

const slack = getSlackClientForEvent(event);


DEBUG(`Reminding ${filteredStudents.length} students about 0-${args.min - 1} onboarding assignments in ${args.channel}.`);
if (filteredStudents.length > 0) {
  await slack.chat.postMessage({
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `[${event.name}]\n${args.intro}\n` + filteredStudents.map(s => `- <@${s.slackId}>`).join(`\n`),
      }
    }],
    channel: args.channel,
  });
}
}