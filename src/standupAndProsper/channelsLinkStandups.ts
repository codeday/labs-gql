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
      .filter(p => !p.standupId)
      .map(p => [p.slackChannelId, p.id])
  );

  DEBUG(`Searching for standups for ${Object.keys(slackChannelsToUpdate).length} channels.`);

  for (const { channel, standupId } of standups) {
    if (channel in slackChannelsToUpdate) {
      DEBUG(`Found standup for project ${slackChannelsToUpdate[channel]!}.`);
      await prisma.project.update({
        where: { id: slackChannelsToUpdate[channel]! },
        data: { standupId },
      });
    }
  }

  const standupIds = standups.map(s => s.standupId);
  const slackChannelsToCheck = Object.fromEntries(
    event.projects
      .filter(p => p.standupId)
      .map(p => [p.standupId, p.id])
  );

  DEBUG(`Validating standups for ${Object.keys(slackChannelsToCheck).length} channels.`);

  for (const standupId in slackChannelsToCheck) {
    if (!standupIds.includes(standupId)) {
      DEBUG(`Removed standup [${standupId}] for project ${slackChannelsToCheck[standupId!]}.`);
      await prisma.project.update({
        where: { id: slackChannelsToCheck[standupId!] },
        data: { standupId: null },
      });
    }
  }
}
