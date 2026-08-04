import { WebClient } from '@slack/web-api';

export async function resolveSlackChannelId(
  _slack: Pick<WebClient, 'paginate'>,
  configuredChannelId: string | null,
): Promise<string | null> {
  return configuredChannelId;
}