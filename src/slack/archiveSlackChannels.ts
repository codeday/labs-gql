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

  for (const project of event.projects.filter(p => p.slackChannelId)) {
      const slackChannel = await slack.conversations.info(
        { channel: project.slackChannelId! }
      );
      if (!slackChannel.ok || !slackChannel.channel?.name_normalized) return;

      DEBUG(`Joining ${slackChannel.channel.name_normalized}`);
      try {
        slack.conversations.join({ channel: project.slackChannelId! });
      } catch (ex) {
        DEBUG(ex);
      }

      const archivedName = slackChannel.channel.name_normalized
        + '-' + archiveExtension;

      DEBUG(`Renaming ${slackChannel.channel.name_normalized} as ${archivedName}`);
      try {
        await slack.conversations.rename({
          channel: project.slackChannelId!,
          name: archivedName,
        });
      } catch (ex) {
        DEBUG(ex);
      }

      DEBUG(`Archiving ${project.slackChannelId}`);
      try {
        await slack.conversations.archive({
          channel: project.slackChannelId!
        });
      } catch (ex) {
        DEBUG(ex);
      }
  }
}