import { URLSearchParams } from "url";
import fetch from "node-fetch";
import { PickNonNullable } from "../utils";
import { Event } from "@prisma/client";

export type EventWithStandupAndProsper =
  PickNonNullable<Event, 'standupAndProsperToken' | 'slackWorkspaceId'>;

export interface Standup {
  channel: string
  standupId: string
  time: string
  timezone: string
}

export interface StandupThread {
  threadId: string
  scheduledDate: string
  lastUpdated: string
  status: 'COMPLETED' | 'PENDING' | 'IN_PROGRESS'
  responses: {
    question: {
      text: string
    }
    users: {
      userId: string
      text: string
      lastUpdated: string
    }[]
  }[]
}

export class StandupAndPropser {
  token: string;
  teamId: string;

  constructor(token: string, teamId: string) {
    this.token = token;
    this.teamId = teamId;
  }

  async get<T = object>(path: string, queryString?: Record<string, string>): Promise<T> {
    const qs = (new URLSearchParams(queryString || {})).toString();
    const result = await fetch(
      `https://api.standup-and-prosper.com/v1/teams/${this.teamId}${path}?${qs}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
      },
    );

    return await result.json();
  }

  async getStandup(standupId: string): Promise<Standup> {
    return (await this.get<Standup>(`/standups/${standupId}`));
  }

  async getStandups(): Promise<Standup[]> {
    const result = (await this.get<{ standups: Standup[] }>('/standups'));
    if (!Array.isArray(result.standups)) throw new Error(`Expected array, got ${JSON.stringify(result)}`);
    return result.standups;
  }

  async getStandupThreads(standupId: string): Promise<StandupThread[]> {
    const result = (await this.get<{ threads: StandupThread[] }>(`/standups/${standupId}/threads`));
    if (!Array.isArray(result.threads)) throw new Error(`Expected array, got ${JSON.stringify(result)}`);
    return result.threads;
  }
}

export function getClientForEvent(
  event: EventWithStandupAndProsper
): StandupAndPropser {
  return new StandupAndPropser(event.standupAndProsperToken, event.slackWorkspaceId);
}