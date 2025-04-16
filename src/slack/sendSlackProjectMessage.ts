import { Event, Project } from "@prisma/client";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { SlackProjectWithEvent } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('slack:sendSlackProjectMessage');

export function canSendSlackProjectMessage(
    project: Pick<Project, 'slackChannelId'> & { event: null | Pick<Event, 'slackWorkspaceAccessToken' | 'slackWorkspaceId'> }
): project is SlackProjectWithEvent {
  return !!project.slackChannelId && !!project.event?.slackWorkspaceAccessToken && !!project.event.slackWorkspaceId;
}

export async function sendSlackProjectMessage(
    project: SlackProjectWithEvent, 
    message: string
) {
  DEBUG(`Sending Slack message to project channel ${project.slackChannelId}`);
  const slack = getSlackClientForEvent(project.event);
  await slack.chat.postMessage({
    channel: project.slackChannelId!,
    text: message,
  });
}