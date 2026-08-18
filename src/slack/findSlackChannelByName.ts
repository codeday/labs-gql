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

export async function resolveSlackChannelId(
  _slack: Pick<WebClient, 'paginate'>,
  configuredChannelId: string | null,
): Promise<string | null> {
  return configuredChannelId;
}