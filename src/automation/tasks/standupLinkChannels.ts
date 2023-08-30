import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { makeDebug } from "../../utils";
import { EventWithProjectChannel } from "../../standupAndProsper/types";
import { channelsLinkStandups } from "../../standupAndProsper";

const DEBUG = makeDebug('automation:tasks:standupLinkChannels');

export const JOBSPEC = '10 * * * *';

export default async function standupLinkChannels() {
  const prisma = Container.get(PrismaClient);

  const eventProjects = await prisma.event.findMany({
    where: {
      standupAndProsperToken: { not: null },
      slackWorkspaceId: { not: null },
      isActive: true,
    },
    select: {
      standupAndProsperToken: true,
      slackWorkspaceId: true,
      projects: {
        where: { slackChannelId: { not: null } },
        select: {
          id: true,
          slackChannelId: true,
          standupId: true,
        },
      }
    },
  }) as EventWithProjectChannel[];

  for (const event of eventProjects) {
    try {
      await channelsLinkStandups(event);
    } catch (ex) {
      DEBUG(ex);
    }
  }
}
