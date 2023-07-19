import { Event } from "@prisma/client";
import { PickNonNullable } from "../utils";
import { WebClient, retryPolicies } from "@slack/web-api";

export function getSlackClientForEvent(
  event: PickNonNullable<Event, 'slackWorkspaceAccessToken' | 'slackWorkspaceId'>
): WebClient {
  return new WebClient(
    event.slackWorkspaceAccessToken,
    {
      teamId: event.slackWorkspaceId,
      retryConfig: retryPolicies.tenRetriesInAboutThirtyMinutes,
    },
  );
}