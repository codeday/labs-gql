import { WebClient } from '@slack/web-api';
import { ConversationsListResponse } from '@slack/web-api';
import { Channel } from '@slack/web-api/dist/response/ConversationsListResponse';

export async function findSlackChannelByName(
  slack: Pick<WebClient, 'paginate'>,
  channelName: string,
): Promise<Channel | undefined> {
  const normalizedName = channelName
    .trim()
    .toLowerCase()
    .replace(/^#/, '');

  const allChannels = await slack.paginate(
    'conversations.list',
    { exclude_archived: true },
    (page: ConversationsListResponse) => !page.response_metadata?.next_cursor,
    (accum: Channel[] | undefined, page: ConversationsListResponse) => [
      ...(accum || []),
      ...(page.channels || []),
    ],
  );

  return allChannels.find((channel) => (
    channel.name?.toLowerCase() === normalizedName
    || channel.name_normalized?.toLowerCase() === normalizedName
  ));
}

/**
 * Returns the channel ID to use for reporting: the already-configured ID if
 * one is set, otherwise looks up `channelName` in the workspace by name.
 */
export async function resolveSlackChannelId(
  slack: Pick<WebClient, 'paginate'>,
  configuredChannelId: string | null,
  channelName: string,
): Promise<string | null> {
  if (configuredChannelId) return configuredChannelId;

  const channel = await findSlackChannelByName(slack, channelName);
  return channel?.id ?? null;
}