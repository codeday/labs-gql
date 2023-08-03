import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { projectToSlackChannelName } from "./format";
import { ConversationsListResponse } from "@slack/web-api";
import { SlackMentorInfo, SlackEventWithProjects } from "./types";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

export async function linkExistingSlackChannels(
  event: SlackEventWithProjects<SlackMentorInfo>
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);

  const searchChannels = Object.fromEntries(
    event.projects
      .filter(p => !p.slackChannelId)
      .map(p => [projectToSlackChannelName(p), p.id]),
  );

  const allChannels = await slack.paginate(
    'conversations.list',
    { exclude_archived: true },
    (p: ConversationsListResponse) => !p.response_metadata?.next_cursor,
    (accum: Channel[] | undefined, page: ConversationsListResponse) => [
      ...(accum || []),
      ...(page.channels || [])
    ],
  );

  const matchingChannels = allChannels
    .filter(c => c.name_normalized && c.name_normalized in searchChannels);

  // Link each existing channel to projects
  for (const channel of matchingChannels) {
    await prisma.project.updateMany({
      where: { id: searchChannels[channel.name_normalized!] },
      data: { slackChannelId: channel.id },
    });
  }
}