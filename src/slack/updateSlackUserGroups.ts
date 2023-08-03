import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { eventToChannelName } from "./format";
import { SlackEventWithProjects, SlackStudentInfo } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('slack:updateSlackUserGroups');

export async function updateSlackUserGroups(
  event: SlackEventWithProjects<SlackStudentInfo>
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);
  if (!event.slackUserGroupId) {
    const result = await slack.usergroups.create({
      name: event.name,
      handle: eventToChannelName(event),
    });
    await prisma.event.update({
      where: { id: event.id },
      data: { slackUserGroupId: result.usergroup!.id! },
    });
    event.slackUserGroupId = result.usergroup!.id!;
  }

  const ids = event.projects
    .flatMap(p => p.students)
    .filter(s => s.slackId)
    .map(s => s.slackId);

  DEBUG(`Updating group ${event.slackUserGroupId} with ${ids.length} members.`);
  
  await slack.usergroups.users.update({
    usergroup: event.slackUserGroupId,
    users: ids.join(','),
  });
}