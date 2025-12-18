import { Mentor, Student } from "@prisma/client";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { SlackEventWithProjects } from "./types";
import { makeDebug } from "../utils";
import { notNullable } from "../utils";

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
    try {
      const mentorIds = event.projects.flatMap(p => p.mentors).flatMap(m => m.slackId).filter(notNullable);
      const existingMentors = await slack.conversations.members({
        channel: event.slackMentorChannelId!,
      });
      const existingMentorIds = (existingMentors?.members || []);
      const missingMentorIds = mentorIds.filter(id => !existingMentorIds.includes(id));
      if (missingMentorIds.length > 0) {
        DEBUG(`Adding ${mentorIds.length} mentors to slack mentor channel.`);
        await slack.conversations.invite({
          channel: event.slackMentorChannelId!,
          users: mentorIds.join(','),
        });
      }
    } catch (ex) {
      DEBUG(ex);
    }
  }

  const eligibleProjects = event.projects
    .filter(p => (
      p.slackChannelId
      && ([...p.students, ...p.mentors].filter(s => s.slackId).length > 0)
    ));

  DEBUG(`Checking for new members in ${eligibleProjects.length} eligible projects.`)

  for (const project of eligibleProjects) {
    const inviteIds = [...project.students, ...project.mentors]
      .map(s => s.slackId)
      .filter(notNullable);

    try {
      const existingMembers = await slack.conversations.members({
        channel: project.slackChannelId!,
      });
      const existingMemberIds = (existingMembers?.members || []);
      const missingIds = inviteIds.filter(id => !existingMemberIds.includes(id));
      if (missingIds.length === 0) continue;
      await slack.conversations.invite({
        channel: project.slackChannelId!,
        users: missingIds.join(','),
      });
    } catch (ex) {}
  }
}