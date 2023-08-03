import Container from "typedi";
import { getClientForEvent } from "./StandupAndProsper";
import { PrismaClient } from "@prisma/client";
import { EventWithProjectChannel } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('standupAndProsper:channelsLinkStandups')

export async function channelsLinkStandups(event: EventWithProjectChannel) {
  const prisma = Container.get(PrismaClient);
  const sap = getClientForEvent(event);
  const standups = await sap.getStandups();

  const slackChannelsToUpdate = Object.fromEntries(
    event.projects
      .map(p => [p.slackChannelId, p.id])
  );

  DEBUG(`Searching for standups for ${event.projects.length} channels.`);

  for (const { channel, standupId } of standups) {
    if (channel in slackChannelsToUpdate) {
      DEBUG(`Found standup for project ${slackChannelsToUpdate[channel]!}.`);
      await prisma.project.update({
        where: { id: slackChannelsToUpdate[channel]! },
        data: { standupId },
      });
    }
  }
}
