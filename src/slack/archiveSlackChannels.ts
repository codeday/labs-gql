import { eventToChannelName } from "./format";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { SlackEventWithProjects } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('slack:archiveSlackChannels');

/**
 * Renames and archives all project channels for an event.
 * @param event The event to sync with Slack.
 */
export async function archiveSlackChannels(
  event: SlackEventWithProjects<{}>
): Promise<void> {
  const slack = getSlackClientForEvent(event);
  const archiveExtension = eventToChannelName(event);

  for (const slackChannelId of [...event.projects.filter(p => p.slackChannelId).map(p => p.slackChannelId!), event.slackMentorChannelId]) {
      const slackChannel = await slack.conversations.info(
        { channel: slackChannelId }
      );
      
      if (!slackChannel.ok || !slackChannel.channel?.name_normalized || slackChannel.channel.is_archived) continue;

      if (!slackChannel.channel.is_member) {
        DEBUG(`Joining ${slackChannel.channel.name_normalized}`);
        try {
          await slack.conversations.join({ channel: slackChannelId });
        } catch (ex) {
          DEBUG(ex);
        }
      }

      const archivedName = slackChannel.channel.name_normalized
        + '-' + archiveExtension;

      DEBUG(`Renaming ${slackChannel.channel.name_normalized} as ${archivedName}`);
      try {
        await slack.conversations.rename({
          channel: slackChannelId,
          name: archivedName,
        });
      } catch (ex) {
        DEBUG(ex);
      }

      DEBUG(`Archiving ${slackChannelId}`);
      try {
        await slack.conversations.archive({
          channel: slackChannelId
        });
      } catch (ex) {
        DEBUG(ex);
      }
  }
}