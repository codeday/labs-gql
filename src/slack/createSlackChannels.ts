import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { projectToSlackChannelName } from "./format";
import { SlackMentorInfo, SlackEventWithProjects, SlackStudentInfo } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('slack:createSlackChannels');

/**
 * Creates new Slack channels for all projects at an event, named after the mentor. 
 * @param event The event to sync with Slack.
 */
export async function createSlackChannels(
  event: SlackEventWithProjects<SlackMentorInfo & SlackStudentInfo>
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);

  for (const project of event.projects.filter(p => !p.slackChannelId)) {
    let id = null;
    let number = 0;
    while(!id && number < 3) {
      const name = projectToSlackChannelName(project)
        + (number === 0 ? '' : `-${number}`);
      DEBUG(`Attempting to create channel ${name}...`);
      try {
        const result = await slack.conversations.create(
          { is_private: false, name }
        );
        if (!result.ok || !result.channel?.id) throw Error();
        id = result.channel.id;
      } catch(ex) {}
      number++;
    }

    if (!id) continue;
    DEBUG(`... channel created!`);
    
    await prisma.project.update({
      where: { id },
      data: { slackChannelId: id },
    });

    const inviteIds = project.students
      .filter(s => s.slackId)
      .map(s => s.slackId);

    if (inviteIds.length > 0) {
      DEBUG(`Inviting ${inviteIds.length} students.`);
      await slack.conversations.invite({
        channel: id,
        users: inviteIds.join(','),
      });
    }
  }
}