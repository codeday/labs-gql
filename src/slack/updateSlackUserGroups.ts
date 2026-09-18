import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { eventToChannelName } from "./format";
import { SlackEventWithProjects, SlackStudentInfo } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('slack:updateSlackUserGroups');

export async function updateSlackUserGroups(
  event: SlackEventWithProjects<SlackStudentInfo>,
  slack = getSlackClientForEvent(event),
): Promise<void> {
  const prisma = Container.get(PrismaClient);

  const ids = event.projects
    .flatMap(p => p.students)
    .filter(s => s.slackId)
    .map(s => s.slackId);

  if (ids.length > 0) {
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

    DEBUG(`Updating group ${event.slackUserGroupId} with ${ids.length} members.`);
    await slack.usergroups.users.update({
      usergroup: event.slackUserGroupId,
      users: ids.join(','),
    });
  } else if (event.slackUserGroupId) {
    DEBUG(`No accepted students with Slack IDs; disabling stale usergroup ${event.slackUserGroupId}.`);
    await slack.usergroups.disable({ usergroup: event.slackUserGroupId });
    await prisma.event.update({
      where: { id: event.id },
      data: { slackUserGroupId: null },
    });
    event.slackUserGroupId = null;
  } else {
    DEBUG(`No accepted students with Slack IDs and no existing usergroup; nothing to do.`);
  }
}