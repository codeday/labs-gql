import { Mentor, Student } from "@prisma/client";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { SlackEventWithProjects } from "./types";
import { makeDebug } from "../utils";

const DEBUG = makeDebug('slack:addMissingSlackChannelMembers');

/**
 * Adds any newly joined students to their project Slack channels.
 * @param event The event to sync with Slack.
 */
export async function addMissingSlackChannelMembers(
  event: SlackEventWithProjects<{ students: Pick<Student, 'slackId'>[], mentors: Pick<Mentor, 'slackId'>[] }>
): Promise<void> {
  const slack = getSlackClientForEvent(event);

  if (event.slackMentorChannelId) {
    const mentorIds = event.projects.flatMap(p => p.mentors).flatMap(m => m.slackId).filter(Boolean);
    DEBUG(`Adding ${mentorIds.length} mentors to slack mentor channel.`);
    await slack.conversations.invite({
      channel: event.slackMentorChannelId!,
      users: mentorIds.join(','),
    });
  }

  const eligibleProjects = event.projects
    .filter(p => (
      p.slackChannelId
      && ([...p.students, ...p.mentors].filter(s => s.slackId).length > 0)
    ));

  for (const project of eligibleProjects) {
    const inviteIds = [...project.students, ...project.mentors]
      .filter(s => s.slackId)
      .map(s => s.slackId);

    try {
      await slack.conversations.invite({
        channel: project.slackChannelId!,
        users: inviteIds.join(','),
      });
    } catch (ex) {}
  }
}