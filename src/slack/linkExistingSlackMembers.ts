import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { UsersListResponse } from "@slack/web-api";
import { Member } from "@slack/web-api/dist/response/UsersListResponse";
import { SlackEventWithProjects, SlackStudentInfo } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('slack:linkExistingSlackMembers');

export async function linkExistingSlackMembers(
  event: SlackEventWithProjects<SlackStudentInfo>
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);

  const searchMembers = Object.fromEntries(
    event.projects
      .flatMap(p => p.students)
      .map(s => [s.email, s])
  );

  const allMembers = await slack.paginate(
    'users.list',
    {},
    (p: UsersListResponse) => !p.response_metadata?.next_cursor,
    (accum: Member[] | undefined, page: UsersListResponse) => [
      ...(accum || []),
      ...(page.members || [])
    ],
  );

  const matchingMembers = allMembers
    .filter(m => m.profile?.email && m.profile.email in searchMembers);

  for (const member of matchingMembers) {
    await prisma.student.updateMany({
      where: { id: searchMembers[member.profile!.email!].id },
      data: { slackId: member.id! },
    });

    if (member.deleted) {
      DEBUG(`Warning, user ${member.profile!.email} is deactivated.`);
    }
  }
}